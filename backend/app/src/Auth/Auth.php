<?php
declare(strict_types=1);

namespace App\Auth;

use App\Http\Request;
use App\Support\ApiError;
use App\Support\Audit;
use App\Support\Config;
use App\Support\Db;
use App\Support\Env;
use App\Support\RateLimiter;
use App\Support\Util;

/**
 * Autenticação por sessão PHP (cookie HttpOnly + Secure + SameSite=Lax), token CSRF
 * por sessão e permissões por perfil verificadas no servidor em cada pedido.
 */
final class Auth
{
    /** @var array<string,mixed>|null */
    private static ?array $user = null;
    /** @var list<string> */
    private static array $permissions = [];
    private static bool $started = false;
    // Hash fictício para tempo de resposta constante quando o email não existe
    private const DUMMY_HASH = '$2y$10$Wnyfnc..98x3kioFf/2b8Ovahn3CVcE9OrxZcjT4tRlc5WydfbzDe';

    public static function start(Request $req): void
    {
        if (self::$started) {
            return;
        }
        self::$started = true;
        if (PHP_SAPI === 'cli') { // scripts de consola (cron) não usam sessões
            return;
        }
        $dir = Config::storagePath('sessions');
        if (is_dir($dir) && is_writable($dir)) {
            session_save_path($dir);
        }
        $secureCfg = Env::get('SESSION_SECURE', 'auto');
        $secure = $secureCfg === 'auto' ? $req->isHttps() : Env::bool('SESSION_SECURE');
        ini_set('session.use_strict_mode', '1');
        ini_set('session.use_only_cookies', '1');
        ini_set('session.gc_maxlifetime', (string) (self::lifetime() + 300));
        session_name(Env::get('SESSION_NAME', 'v25_sess') ?? 'v25_sess');
        session_set_cookie_params([
            'lifetime' => 0,
            'path' => '/',
            'secure' => $secure,
            'httponly' => true,
            'samesite' => 'Lax',
        ]);
        session_start();
        self::loadUser();
    }

    private static function lifetime(): int
    {
        return Env::int('SESSION_LIFETIME_MINUTES', 120) * 60;
    }

    private static function loadUser(): void
    {
        $uid = $_SESSION['uid'] ?? null;
        if (!$uid) {
            return;
        }
        $idle = time() - (int) ($_SESSION['last'] ?? 0);
        $u = Db::one('SELECT id, email, full_name, role_id, active, password_changed_at FROM users WHERE id = :id', ['id' => $uid]);
        // Sessão inválida: utilizador removido/desactivado, inactividade ou palavra-passe alterada noutro lado
        if (!$u || !$u['active'] || $idle > self::lifetime() || ($u['password_changed_at'] ?? '') !== ($_SESSION['pwd_at'] ?? '')) {
            self::destroy();
            return;
        }
        $_SESSION['last'] = time();
        self::$user = $u;
        self::$permissions = array_column(Db::all('SELECT permission_id FROM role_permissions WHERE role_id = :r', ['r' => $u['role_id']]), 'permission_id');
    }

    /** @return array<string,mixed>|null */
    public static function user(): ?array
    {
        return self::$user;
    }

    /** @return list<string> */
    public static function permissions(): array
    {
        return self::$permissions;
    }

    public static function can(string $permission): bool
    {
        return self::$user !== null && in_array($permission, self::$permissions, true);
    }

    public static function csrfToken(): string
    {
        if (empty($_SESSION['csrf'])) {
            $_SESSION['csrf'] = Util::token();
        }
        return (string) $_SESSION['csrf'];
    }

    public static function verifyCsrf(Request $req): void
    {
        $sent = (string) ($req->header('x-csrf-token') ?? '');
        if ($sent === '' || empty($_SESSION['csrf']) || !hash_equals((string) $_SESSION['csrf'], $sent)) {
            throw new ApiError('CSRF_INVALIDO', 403); // 403 (não 419: o Apache converte códigos desconhecidos em 500)
        }
    }

    /** Exige sessão + permissão (+ CSRF em pedidos que alteram dados). */
    public static function require(Request $req, string ...$permissions): array
    {
        self::start($req);
        if (self::$user === null) {
            throw new ApiError('NAO_AUTENTICADO', 401);
        }
        if (!in_array($req->method, ['GET', 'HEAD'], true)) {
            self::verifyCsrf($req);
        }
        foreach ($permissions as $p) {
            if (!self::can($p)) {
                throw new ApiError('SEM_PERMISSAO', 403);
            }
        }
        return self::$user;
    }

    public static function login(Request $req, string $email, string $password): array
    {
        $email = strtolower(trim($email));
        RateLimiter::hit('login_ip', $req->ip(), 20, 900);
        $u = Db::one('SELECT * FROM users WHERE email = :e', ['e' => $email]);
        if ($u && $u['locked_until'] && strtotime($u['locked_until'] . ' UTC') > time()) {
            throw new ApiError('CONTA_BLOQUEADA', 429);
        }
        $ok = password_verify($password, $u['password_hash'] ?? self::DUMMY_HASH);
        if (!$u || !$ok || !$u['active'] || !$u['password_hash']) {
            if ($u) {
                $fails = (int) $u['failed_logins'] + 1;
                Db::run('UPDATE users SET failed_logins = :f, locked_until = :l WHERE id = :id', [
                    'f' => $fails >= 5 ? 0 : $fails,
                    'l' => $fails >= 5 ? gmdate('Y-m-d H:i:s', time() + 900) : null,
                    'id' => $u['id'],
                ]);
            }
            throw new ApiError('CREDENCIAIS_INVALIDAS', 401);
        }
        if (password_needs_rehash($u['password_hash'], PASSWORD_DEFAULT)) {
            Db::run('UPDATE users SET password_hash = :h WHERE id = :id', ['h' => password_hash($password, PASSWORD_DEFAULT), 'id' => $u['id']]);
        }
        Db::run('UPDATE users SET failed_logins = 0, locked_until = NULL, last_login_at = UTC_TIMESTAMP() WHERE id = :id', ['id' => $u['id']]);
        session_regenerate_id(true); // evita fixação de sessão
        $_SESSION = ['uid' => $u['id'], 'last' => time(), 'pwd_at' => $u['password_changed_at'] ?? '', 'csrf' => Util::token()];
        self::loadUser();
        Audit::log('auth.login', 'user', $u['id']);
        return self::$user ?? [];
    }

    public static function logout(): void
    {
        if (self::$user) {
            Audit::log('auth.logout', 'user', self::$user['id']);
        }
        self::destroy();
    }

    private static function destroy(): void
    {
        self::$user = null;
        self::$permissions = [];
        $_SESSION = [];
        if (session_status() === PHP_SESSION_ACTIVE) {
            $p = session_get_cookie_params();
            if (!headers_sent()) {
                setcookie(session_name(), '', ['expires' => time() - 3600, 'path' => $p['path'], 'secure' => $p['secure'], 'httponly' => true, 'samesite' => 'Lax']);
            }
            session_destroy();
            session_start();
            session_regenerate_id(true);
        }
    }

    public static function validatePassword(string $password): void
    {
        $len = mb_strlen($password);
        if ($len < 10 || $len > 200) {
            throw new ApiError('PALAVRA_PASSE_FRACA', 422);
        }
        if (!preg_match('/[A-Za-z]/', $password) || !preg_match('/\d/', $password)) {
            throw new ApiError('PALAVRA_PASSE_FRACA', 422);
        }
    }

    /** Define nova palavra-passe; invalida sessões abertas noutros dispositivos. */
    public static function setPassword(string $userId, string $password): void
    {
        self::validatePassword($password);
        $now = Db::now();
        Db::run('UPDATE users SET password_hash = :h, password_changed_at = :n, failed_logins = 0, locked_until = NULL WHERE id = :id', [
            'h' => password_hash($password, PASSWORD_DEFAULT),
            'n' => $now,
            'id' => $userId,
        ]);
        if (self::$user && self::$user['id'] === $userId) {
            $_SESSION['pwd_at'] = $now;
            session_regenerate_id(true);
        }
    }

    /** Cria token temporário (reset 1 h, convite 72 h) e coloca o email na fila. */
    public static function issuePasswordToken(string $userId, string $purpose): void
    {
        $token = Util::token();
        $hours = $purpose === 'convite' ? 72 : 1;
        Db::run('UPDATE password_resets SET used_at = UTC_TIMESTAMP() WHERE user_id = :u AND used_at IS NULL', ['u' => $userId]);
        Db::insert('password_resets', [
            'user_id' => $userId,
            'token_hash' => Util::sha256($token),
            'purpose' => $purpose,
            'expires_at' => gmdate('Y-m-d H:i:s', time() + $hours * 3600),
        ]);
        $email = (string) Db::value('SELECT email FROM users WHERE id = :id', ['id' => $userId]);
        \App\Services\MailQueue::enqueue($purpose === 'convite' ? 'convite_equipa' : 'recuperar_senha', $email, null, ['token' => $token], null, $userId);
    }

    public static function resetWithToken(string $token, string $password): void
    {
        self::validatePassword($password);
        Db::tx(function () use ($token, $password) {
            $row = Db::one('SELECT * FROM password_resets WHERE token_hash = :h FOR UPDATE', ['h' => Util::sha256($token)]);
            if (!$row || $row['used_at'] || strtotime($row['expires_at'] . ' UTC') < time()) {
                throw new ApiError('TOKEN_INVALIDO', 400);
            }
            Db::run('UPDATE password_resets SET used_at = UTC_TIMESTAMP() WHERE id = :id', ['id' => $row['id']]);
            self::setPassword($row['user_id'], $password);
        });
    }
}
