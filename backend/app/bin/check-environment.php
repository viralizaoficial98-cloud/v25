<?php
declare(strict_types=1);

// Verifica se o alojamento cumpre os requisitos: php bin/check-environment.php
require dirname(__DIR__) . '/bootstrap.php';

$fail = 0;
foreach (App\Support\Diagnostics::run() as $r) {
    $mark = $r['ok'] ? '[ OK ]' : ($r['required'] ? '[FALHA]' : '[AVISO]');
    if (!$r['ok'] && $r['required']) {
        $fail++;
    }
    printf("%-8s %-48s %s\n", $mark, $r['check'], $r['detail']);
}
echo $fail ? "\n$fail requisito(s) obrigatório(s) em falta.\n" : "\nAlojamento compatível.\n";
exit($fail ? 1 : 0);
