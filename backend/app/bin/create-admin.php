<?php
declare(strict_types=1);

// Cria (ou repõe) um administrador pela consola: php bin/create-admin.php email@dominio "Nome"
// A palavra-passe é pedida de forma interactiva (não fica no histórico da shell).
require dirname(__DIR__) . '/bootstrap.php';

use App\Auth\Auth;
use App\Support\Db;
use App\Support\Util;

[$_, $email, $name] = $argv + [null, null, ''];
if (!$email || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
    fwrite(STDERR, "Uso: php bin/create-admin.php email@dominio \"Nome\"\n");
    exit(1);
}
$password = getenv('V25_ADMIN_PASSWORD') ?: '';
if ($password === '') {
    echo 'Palavra-passe (mín. 10 caracteres, letras e números): ';
    system('stty -echo 2>/dev/null');
    $password = trim((string) fgets(STDIN));
    system('stty echo 2>/dev/null');
    echo "\n";
}
try {
    Auth::validatePassword($password);
} catch (App\Support\ApiError $e) {
    fwrite(STDERR, "Palavra-passe fraca.\n");
    exit(1);
}
$email = strtolower($email);
$hash = password_hash($password, PASSWORD_DEFAULT);
if ($id = Db::value('SELECT id FROM users WHERE email = :e', ['e' => $email])) {
    Db::run("UPDATE users SET password_hash = :h, role_id = 'admin', active = 1, password_changed_at = UTC_TIMESTAMP(), failed_logins = 0, locked_until = NULL WHERE id = :id", ['h' => $hash, 'id' => $id]);
    echo "Administrador actualizado: $email\n";
} else {
    Db::insert('users', ['id' => Util::uuid(), 'email' => $email, 'full_name' => $name, 'password_hash' => $hash, 'role_id' => 'admin', 'active' => 1, 'password_changed_at' => Db::now()]);
    echo "Administrador criado: $email\n";
}
