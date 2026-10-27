<?php
declare(strict_types=1);

namespace App\Services;

use App\Support\ApiError;
use App\Support\Audit;
use App\Support\Db;
use App\Support\Util;

/** Evento (tabela events) + configurações gerais (tabela settings), expostos como um único objecto. */
final class SettingsService
{
    public const EVENT_ID = 1;

    /** Campos da tabela events editáveis (nome → tipo) */
    private const EVENT_FIELDS = [
        'event_name' => 'name', 'subtitle' => 'subtitle', 'slogan' => 'slogan', 'group_name' => 'group_name',
        'venue' => 'venue', 'address' => 'address', 'maps_url' => 'maps_url', 'about_text' => 'about_text',
        'closing_message' => 'closing_message', 'sales_closed_message' => 'sales_closed_message',
    ];

    /** Chaves da tabela settings (texto livre, máx. caracteres) */
    private const SETTING_KEYS = [
        'bank_account_name' => 200, 'bank_name' => 120, 'bank_account_number' => 60, 'bank_iban' => 40, 'express_number' => 30,
        'payment_instructions' => 1000, 'contact_email' => 254, 'contact_phone' => 40, 'copyright_text' => 255,
        'credits_text' => 255, 'privacy_text' => 20000, 'terms_text' => 20000, 'email_sender_name' => 100, 'email_reply_to' => 254,
    ];

    private const SOCIALS = ['instagram', 'facebook', 'youtube', 'tiktok', 'spotify', 'whatsapp'];

    /** Só aparecem na etapa de pagamento de um pedido (nunca no site público). */
    private const PRIVATE_KEYS = ['bank_account_name', 'bank_name', 'bank_account_number', 'bank_iban', 'express_number', 'payment_instructions', 'payment_confirmed_at', 'payment_confirmed_by'];

    /** Campos que compõem as coordenadas de pagamento (a confirmação cobre exactamente estes valores). */
    private const PAYMENT_KEYS = ['bank_account_name', 'bank_name', 'bank_account_number', 'bank_iban', 'express_number'];

    /** Registo da validação administrativa dos dados de pagamento (JSON em settings). */
    private const CONFIRMATION_KEY = 'payment_details_confirmation';

    /** @return array<string,mixed> */
    public static function event(): array
    {
        $e = Db::one('SELECT * FROM events WHERE id = :id', ['id' => self::EVENT_ID]);
        if (!$e) {
            throw new \RuntimeException('Evento não configurado: importe o schema SQL.');
        }
        return $e;
    }

    /** @return array<string,string> */
    public static function settings(): array
    {
        $out = [];
        foreach (Db::all('SELECT setting_key, setting_value FROM settings') as $r) {
            $out[$r['setting_key']] = $r['setting_value'];
        }
        return $out;
    }

    /** Objecto usado pelo site público — sem dados bancários (só no pedido, etapa de pagamento). */
    public static function public(): array
    {
        return array_diff_key(self::full(), array_flip(self::PRIVATE_KEYS));
    }

    /** Objecto completo (painel e emails). */
    public static function full(): array
    {
        $e = self::event();
        $s = self::settings();
        $socials = json_decode($s['socials'] ?? '{}', true);
        $out = [
            'event_name' => $e['name'],
            'subtitle' => $e['subtitle'],
            'slogan' => $e['slogan'],
            'group_name' => $e['group_name'],
            'starts_at' => Util::iso($e['starts_at']),
            'timezone' => $e['timezone'],
            'venue' => $e['venue'],
            'address' => $e['address'],
            'maps_url' => $e['maps_url'],
            'about_text' => $e['about_text'],
            'closing_message' => $e['closing_message'],
            'sales_open' => (bool) $e['sales_open'],
            'sales_closed_message' => $e['sales_closed_message'],
            'capacity' => $e['capacity'] === null ? null : (int) $e['capacity'],
            'reservation_hours' => (int) $e['reservation_hours'],
            'socials' => is_array($socials) ? $socials : new \stdClass(),
        ];
        foreach (array_keys(self::SETTING_KEYS) as $k) {
            $out[$k] = $s[$k] ?? '';
        }
        $conf = self::confirmation($s);
        $out['payment_ready'] = $conf !== null;
        $out['payment_confirmed_at'] = $conf['at'] ?? null;
        $out['payment_confirmed_by'] = $conf['by'] ?? null;
        return $out;
    }

    private static function fingerprint(array $s): string
    {
        $vals = [];
        foreach (self::PAYMENT_KEYS as $k) {
            $vals[$k] = trim((string) ($s[$k] ?? ''));
        }
        return hash('sha256', (string) json_encode($vals, JSON_UNESCAPED_UNICODE));
    }

    /**
     * Validação em vigor, ou null. Só é válida se os dados actuais forem exactamente os que
     * foram confirmados: qualquer alteração às coordenadas anula a confirmação.
     */
    private static function confirmation(array $s): ?array
    {
        $c = json_decode((string) ($s[self::CONFIRMATION_KEY] ?? ''), true);
        if (!is_array($c) || !isset($c['fingerprint'], $c['at']) || !hash_equals((string) $c['fingerprint'], self::fingerprint($s))) {
            return null;
        }
        return self::hasPaymentData($s) ? $c : null;
    }

    private static function hasPaymentData(array $s): bool
    {
        $transfer = trim((string) ($s['bank_iban'] ?? '')) !== '' || trim((string) ($s['bank_account_number'] ?? '')) !== '';
        $express = trim((string) ($s['express_number'] ?? '')) !== '';
        return trim((string) ($s['bank_account_name'] ?? '')) !== '' && ($transfer || $express);
    }

    /** As coordenadas oficiais estão validadas pela organização? (condição para vender) */
    public static function paymentReady(): bool
    {
        return self::confirmation(self::settings()) !== null;
    }

    /**
     * Coordenadas para o comprador (página do pedido e emails). Sem validação administrativa
     * em vigor, não é devolvido nenhum dado bancário.
     */
    public static function paymentDetails(): array
    {
        $s = self::settings();
        $ready = self::confirmation($s) !== null;
        $v = fn (string $k) => $ready ? trim((string) ($s[$k] ?? '')) : '';
        return [
            'confirmed' => $ready,
            'account_name' => $v('bank_account_name'), 'bank_name' => $v('bank_name'), 'account_number' => $v('bank_account_number'),
            'iban' => $v('bank_iban'), 'express_number' => $v('express_number'),
            'instructions' => $ready ? (string) ($s['payment_instructions'] ?? '') : '',
        ];
    }

    /** O administrador confirma (ou retira a confirmação de) as coordenadas de pagamento actuais. */
    public static function confirmPayment(bool $confirm, array $user): array
    {
        $s = self::settings();
        if ($confirm) {
            if (!self::hasPaymentData($s)) {
                throw new ApiError('DADOS_PAGAMENTO_INCOMPLETOS', 422);
            }
            $value = (string) json_encode(['fingerprint' => self::fingerprint($s), 'at' => gmdate('Y-m-d\\TH:i:s\\Z'), 'by' => $user['email'] ?? ''], JSON_UNESCAPED_SLASHES);
        } else {
            $value = '';
        }
        self::put(self::CONFIRMATION_KEY, $value, (string) $user['id']);
        $audit = [];
        foreach (self::PAYMENT_KEYS as $k) {
            $audit[$k] = (string) ($s[$k] ?? '');
        }
        Audit::log($confirm ? 'pagamento.dados_confirmados' : 'pagamento.confirmacao_retirada', 'settings', (string) self::EVENT_ID, $audit);
        return self::full();
    }

    /** Actualização parcial pelo administrador (com auditoria antes/depois). */
    public static function update(array $in, string $userId): array
    {
        $before = self::full();
        Db::tx(function () use ($in, $userId) {
            $set = [];
            $params = ['id' => self::EVENT_ID];
            foreach (self::EVENT_FIELDS as $field => $col) {
                if (array_key_exists($field, $in)) {
                    $v = trim((string) $in[$field]);
                    $max = $col === 'about_text' ? 10000 : 500;
                    if (mb_strlen($v) > $max) {
                        throw new ApiError('TEXTO_DEMASIADO_LONGO', 422, ['campo' => $field]);
                    }
                    if (in_array($col, ['name', 'venue'], true) && $v === '') {
                        throw new ApiError('CAMPO_OBRIGATORIO', 422, ['campo' => $field]);
                    }
                    if ($col === 'maps_url' && $v !== '' && !preg_match('#^https://#', $v)) {
                        throw new ApiError('URL_INVALIDO', 422, ['campo' => $field]);
                    }
                    $set[] = "`$col` = :$col";
                    $params[$col] = $v;
                }
            }
            if (array_key_exists('starts_at', $in)) {
                $set[] = 'starts_at = :starts_at';
                $params['starts_at'] = Util::toDb((string) $in['starts_at']) ?? throw new ApiError('DATA_INVALIDA', 422);
            }
            if (array_key_exists('sales_open', $in)) {
                $set[] = 'sales_open = :sales_open';
                $params['sales_open'] = (bool) $in['sales_open'];
            }
            if (array_key_exists('capacity', $in)) {
                $c = $in['capacity'];
                if ($c !== null && $c !== '' && (!is_numeric($c) || (int) $c < 1)) {
                    throw new ApiError('VALOR_INVALIDO', 422, ['campo' => 'capacity']);
                }
                $set[] = 'capacity = :capacity';
                $params['capacity'] = ($c === null || $c === '') ? null : (int) $c;
            }
            if (array_key_exists('reservation_hours', $in)) {
                $h = (int) $in['reservation_hours'];
                if ($h < 1 || $h > 720) {
                    throw new ApiError('VALOR_INVALIDO', 422, ['campo' => 'reservation_hours']);
                }
                $set[] = 'reservation_hours = :reservation_hours';
                $params['reservation_hours'] = $h;
            }
            if ($set) {
                Db::run('UPDATE events SET ' . implode(', ', $set) . ' WHERE id = :id', $params);
            }
            foreach (self::SETTING_KEYS as $k => $max) {
                if (array_key_exists($k, $in)) {
                    $v = trim((string) $in[$k]);
                    if (mb_strlen($v) > $max) {
                        throw new ApiError('TEXTO_DEMASIADO_LONGO', 422, ['campo' => $k]);
                    }
                    self::put($k, $v, $userId);
                }
            }
            if (array_key_exists('socials', $in) && is_array($in['socials'])) {
                $clean = [];
                foreach (self::SOCIALS as $net) {
                    $url = trim((string) ($in['socials'][$net] ?? ''));
                    if ($url !== '' && preg_match('#^https?://#', $url) && strlen($url) <= 500) {
                        $clean[$net] = $url;
                    }
                }
                self::put('socials', (string) json_encode($clean ?: new \stdClass(), JSON_UNESCAPED_SLASHES), $userId);
            }
        });
        $after = self::full();
        $diff = [];
        foreach ($after as $k => $v) {
            if (($before[$k] ?? null) != $v) {
                $diff[$k] = ['antes' => $before[$k] ?? null, 'depois' => $v];
            }
        }
        if ($diff) {
            Audit::log('configuracoes.alteradas', 'settings', (string) self::EVENT_ID, $diff);
        }
        return $after;
    }

    private static function put(string $key, string $value, string $userId): void
    {
        Db::run(
            'INSERT INTO settings (setting_key, setting_value, updated_by) VALUES (:k, :v, :u)
             ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value), updated_by = VALUES(updated_by)',
            ['k' => $key, 'v' => $value, 'u' => $userId],
        );
    }
}
