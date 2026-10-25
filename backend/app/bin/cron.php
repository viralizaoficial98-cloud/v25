<?php
declare(strict_types=1);

// Tarefas periódicas (cPanel → Cron Jobs, a cada 2–5 minutos):
//   /usr/local/bin/php /home/renewangola/v25_app/bin/cron.php >/dev/null 2>&1
// 1) liberta reservas expiradas; 2) envia a fila de emails (se o SMTP estiver configurado).
require dirname(__DIR__) . '/bootstrap.php';

use App\Services\MailQueue;
use App\Services\OrderService;

$lock = fopen(App\Support\Config::storagePath('tmp') . '/cron.lock', 'c');
if ($lock === false || !flock($lock, LOCK_EX | LOCK_NB)) {
    exit(0); // execução anterior ainda a correr
}
$expired = OrderService::expireStale();
$mail = MailQueue::process(50);
$line = sprintf("[%s] expiradas=%d emails_enviados=%d falhas=%d%s\n", gmdate('c'), $expired, $mail['sent'], $mail['failed'], isset($mail['skipped']) ? ' (' . $mail['skipped'] . ')' : '');
if (in_array('-v', $argv, true)) {
    echo $line;
}
if ($expired || $mail['sent'] || $mail['failed']) {
    App\Support\Logger::info(trim($line));
}
