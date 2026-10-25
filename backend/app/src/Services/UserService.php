<?php
declare(strict_types=1);

namespace App\Services;

use App\Auth\Auth;
use App\Support\ApiError;
use App\Support\Audit;
use App\Support\Db;
use App\Support\Util;

final class UserService
{
    private const ROLES = ['admin', 'financeiro', 'checkin'];

    public static function present(array $u): array
    {
        return [
            'user_id' => $u['id'], 'email' => $u['email'], 'full_name' => $u['full_name'], 'role' => $u['role_id'], 'active' => (bool) $u['active'],
            'has_password' => $u['password_hash'] !== null, 'last_login_at' => Util::iso($u['last_login_at']), 'created_at' => Util::iso($u['created_at']),
        ];
    }

    public static function list(): array
    {
        return array_map([self::class, 'present'], Db::all('SELECT * FROM users ORDER BY created_at'));
    }

    /** Cria utilizador. Sem palavra-passe → convite por email (link válido 72 h). */
    public static function create(array $in): array
    {
        $email = strtolower(trim((string) ($in['email'] ?? '')));
        $name = Util::normalizeName((string) ($in['full_name'] ?? ''));
        $role = (string) ($in['role'] ?? '');
        $password = (string) ($in['password'] ?? '');
        if (!filter_var($email, FILTER_VALIDATE_EMAIL)) throw new ApiError('EMAIL_INVALIDO', 422);
        if (!in_array($role, self::ROLES, true)) throw new ApiError('PERFIL_INVALIDO', 422);
        if (mb_strlen($name) > 120) throw new ApiError('TEXTO_DEMASIADO_LONGO', 422);
        if ($password !== '') Auth::validatePassword($password);
        if (Db::value('SELECT 1 FROM users WHERE email = :e', ['e' => $email])) throw new ApiError('UTILIZADOR_JA_EXISTE', 409);
        $id = Util::uuid();
        Db::insert('users', [
            'id' => $id, 'email' => $email, 'full_name' => $name, 'role_id' => $role, 'active' => 1,
            'password_hash' => $password !== '' ? password_hash($password, PASSWORD_DEFAULT) : null,
            'password_changed_at' => $password !== '' ? Db::now() : null,
        ]);
        if ($password === '') {
            Auth::issuePasswordToken($id, 'convite');
        }
        Audit::log('equipa.criado', 'user', $id, ['email' => $email, 'perfil' => $role, 'convite' => $password === '']);
        return self::present(Db::one('SELECT * FROM users WHERE id = :id', ['id' => $id]));
    }

    public static function update(string $id, array $in): array
    {
        $me = Auth::user();
        return Db::tx(function () use ($id, $in, $me) {
            $u = Db::one('SELECT * FROM users WHERE id = :id FOR UPDATE', ['id' => $id]) ?? throw new ApiError('UTILIZADOR_INEXISTENTE', 404);
            $role = array_key_exists('role', $in) ? (string) $in['role'] : $u['role_id'];
            $active = array_key_exists('active', $in) ? (bool) $in['active'] : (bool) $u['active'];
            if (!in_array($role, self::ROLES, true)) throw new ApiError('PERFIL_INVALIDO', 422);
            if ($id === ($me['id'] ?? null) && ($role !== 'admin' || !$active)) throw new ApiError('NAO_PODE_REMOVER_PROPRIO', 409);
            if ($u['role_id'] === 'admin' && ($role !== 'admin' || !$active)) {
                $admins = (int) Db::value("SELECT COUNT(*) FROM users WHERE role_id = 'admin' AND active = 1 AND id <> :id", ['id' => $id]);
                if ($admins === 0) throw new ApiError('ULTIMO_ADMINISTRADOR', 409);
            }
            $name = array_key_exists('full_name', $in) ? Util::normalizeName((string) $in['full_name']) : $u['full_name'];
            Db::run('UPDATE users SET role_id = :r, active = :a, full_name = :n WHERE id = :id', ['r' => $role, 'a' => $active, 'n' => mb_substr($name, 0, 120), 'id' => $id]);
            Audit::log('equipa.alterado', 'user', $id, ['email' => $u['email'], 'perfil' => [$u['role_id'], $role], 'activo' => [(bool) $u['active'], $active]]);
            return self::present(Db::one('SELECT * FROM users WHERE id = :id', ['id' => $id]));
        });
    }

    public static function sendReset(string $id): array
    {
        $u = Db::one('SELECT * FROM users WHERE id = :id', ['id' => $id]) ?? throw new ApiError('UTILIZADOR_INEXISTENTE', 404);
        Auth::issuePasswordToken($id, $u['password_hash'] === null ? 'convite' : 'reset');
        Audit::log('equipa.reset_enviado', 'user', $id, ['email' => $u['email']]);
        return ['ok' => true];
    }

    /** Primeiro administrador (instalação). Só funciona com SETUP_TOKEN e base sem utilizadores. */
    public static function setupFirstAdmin(string $setupToken, array $in): array
    {
        $expected = \App\Support\Env::get('SETUP_TOKEN', '');
        if ($expected === '' || strlen($expected) < 16 || !hash_equals($expected, $setupToken)) {
            throw new ApiError('SETUP_TOKEN_INVALIDO', 403);
        }
        $email = strtolower(trim((string) ($in['email'] ?? '')));
        $password = (string) ($in['password'] ?? '');
        if (!filter_var($email, FILTER_VALIDATE_EMAIL)) throw new ApiError('EMAIL_INVALIDO', 422);
        Auth::validatePassword($password);
        return Db::tx(function () use ($email, $password, $in) {
            if ((int) Db::value('SELECT COUNT(*) FROM users FOR UPDATE') > 0) {
                throw new ApiError('INSTALACAO_CONCLUIDA', 409);
            }
            $id = Util::uuid();
            Db::insert('users', [
                'id' => $id, 'email' => $email, 'full_name' => Util::normalizeName((string) ($in['full_name'] ?? '')), 'role_id' => 'admin',
                'active' => 1, 'password_hash' => password_hash($password, PASSWORD_DEFAULT), 'password_changed_at' => Db::now(),
            ]);
            Audit::log('instalacao.primeiro_admin', 'user', $id, ['email' => $email]);
            return ['ok' => true];
        });
    }

    public static function needsSetup(): bool
    {
        return (int) Db::value('SELECT COUNT(*) FROM users') === 0;
    }
}
