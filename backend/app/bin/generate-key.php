<?php
// Gera valores aleatórios para APP_KEY e SETUP_TOKEN (copiar para o .env).
echo 'APP_KEY=' . bin2hex(random_bytes(32)) . PHP_EOL;
echo 'SETUP_TOKEN=' . bin2hex(random_bytes(16)) . PHP_EOL;
