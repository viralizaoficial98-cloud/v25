<?php
declare(strict_types=1);

namespace App\Services;

use App\Support\ApiError;
use App\Support\Audit;
use App\Support\Db;
use App\Support\Util;

final class TicketCategoryService
{
    /** Categorias publicadas, com disponibilidade (site público). */
    public static function listPublic(): array
    {
        $e = SettingsService::event();
        $rows = Db::all('SELECT * FROM ticket_categories WHERE event_id = :e AND published = 1 ORDER BY sort_order, price_kz IS NULL, price_kz, name', ['e' => SettingsService::EVENT_ID]);
        $now = time();
        return array_map(static function (array $t) use ($e, $now) {
            $onSale = (bool) $e['sales_open'] && $t['price_kz'] !== null
                && ($t['sales_start'] === null || strtotime($t['sales_start'] . ' UTC') <= $now)
                && ($t['sales_end'] === null || strtotime($t['sales_end'] . ' UTC') > $now);
            return [
                'id' => $t['id'],
                'name' => $t['name'],
                'lot_label' => $t['lot_label'],
                'description' => $t['description'],
                'price_kz' => Util::money($t['price_kz']),
                'available' => max((int) $t['quantity_total'] - (int) $t['quantity_reserved'] - (int) $t['quantity_sold'], 0),
                'quantity_total' => (int) $t['quantity_total'],
                'max_per_order' => (int) $t['max_per_order'],
                'max_per_customer' => (int) $t['max_per_customer'],
                'persons_per_ticket' => (int) $t['persons_per_ticket'],
                'on_sale' => $onSale,
                'sales_start' => Util::iso($t['sales_start']),
                'sales_end' => Util::iso($t['sales_end']),
            ];
        }, $rows);
    }

    public static function listAdmin(): array
    {
        return array_map([self::class, 'present'], Db::all('SELECT * FROM ticket_categories WHERE event_id = :e ORDER BY sort_order, created_at', ['e' => SettingsService::EVENT_ID]));
    }

    public static function present(array $t): array
    {
        return [
            'id' => $t['id'], 'name' => $t['name'], 'lot_label' => $t['lot_label'], 'description' => $t['description'],
            'price_kz' => Util::money($t['price_kz']), 'quantity_total' => (int) $t['quantity_total'],
            'quantity_reserved' => (int) $t['quantity_reserved'], 'quantity_sold' => (int) $t['quantity_sold'],
            'max_per_order' => (int) $t['max_per_order'], 'max_per_customer' => (int) $t['max_per_customer'],
            'persons_per_ticket' => (int) $t['persons_per_ticket'], 'sales_start' => Util::iso($t['sales_start']),
            'sales_end' => Util::iso($t['sales_end']), 'published' => (bool) $t['published'], 'sort_order' => (int) $t['sort_order'],
            'created_at' => Util::iso($t['created_at']),
        ];
    }

    private static function validate(array $in): array
    {
        $name = Util::normalizeName((string) ($in['name'] ?? ''));
        if (mb_strlen($name) < 2 || mb_strlen($name) > 80) {
            throw new ApiError('NOME_INVALIDO', 422, ['campo' => 'name']);
        }
        $price = $in['price_kz'] ?? null;
        if ($price === '' || $price === null) {
            $price = null;
        } elseif (!is_numeric($price) || (float) $price <= 0 || (float) $price > 999999999) {
            throw new ApiError('PRECO_INVALIDO', 422);
        }
        $int = static function (string $k, int $min, int $max, int $def) use ($in): int {
            $v = $in[$k] ?? $def;
            if (!is_numeric($v) || (int) $v < $min || (int) $v > $max) {
                throw new ApiError('VALOR_INVALIDO', 422, ['campo' => $k]);
            }
            return (int) $v;
        };
        $published = (bool) ($in['published'] ?? false);
        if ($published && $price === null) {
            throw new ApiError('PRECO_OBRIGATORIO_PARA_PUBLICAR', 422);
        }
        $start = Util::toDb($in['sales_start'] ?? null);
        $end = Util::toDb($in['sales_end'] ?? null);
        if ($start && $end && $end <= $start) {
            throw new ApiError('PERIODO_INVALIDO', 422);
        }
        return [
            'name' => $name,
            'lot_label' => mb_substr(trim((string) ($in['lot_label'] ?? '')), 0, 60),
            'description' => mb_substr(trim((string) ($in['description'] ?? '')), 0, 2000),
            'price_kz' => $price === null ? null : number_format((float) $price, 2, '.', ''),
            'quantity_total' => $int('quantity_total', 0, 100000, 0),
            'max_per_order' => $int('max_per_order', 1, 100, 4),
            'max_per_customer' => $int('max_per_customer', 1, 500, 10),
            'persons_per_ticket' => $int('persons_per_ticket', 1, 50, 1),
            'sales_start' => $start,
            'sales_end' => $end,
            'published' => $published ? 1 : 0,
            'sort_order' => $int('sort_order', -100000, 100000, 0),
        ];
    }

    public static function create(array $in): array
    {
        $row = self::validate($in) + ['id' => Util::uuid(), 'event_id' => SettingsService::EVENT_ID];
        Db::insert('ticket_categories', $row);
        Audit::log('ingresso.criado', 'ticket_category', $row['id'], ['depois' => $row]);
        return self::present(Db::one('SELECT * FROM ticket_categories WHERE id = :id', ['id' => $row['id']]));
    }

    public static function update(string $id, array $in): array
    {
        $row = self::validate($in);
        return Db::tx(function () use ($id, $row) {
            $cur = Db::one('SELECT * FROM ticket_categories WHERE id = :id FOR UPDATE', ['id' => $id]) ?? throw new ApiError('NAO_ENCONTRADO', 404);
            if ($row['quantity_total'] < (int) $cur['quantity_reserved'] + (int) $cur['quantity_sold']) {
                throw new ApiError('STOCK_INFERIOR_AO_VENDIDO', 422);
            }
            $sets = implode(', ', array_map(fn ($k) => "`$k` = :$k", array_keys($row)));
            Db::run("UPDATE ticket_categories SET $sets WHERE id = :id", $row + ['id' => $id]);
            $after = Db::one('SELECT * FROM ticket_categories WHERE id = :id', ['id' => $id]);
            Audit::log('ingresso.alterado', 'ticket_category', $id, ['antes' => self::present($cur), 'depois' => self::present($after)]);
            return self::present($after);
        });
    }

    public static function delete(string $id): void
    {
        Db::tx(function () use ($id) {
            $cur = Db::one('SELECT * FROM ticket_categories WHERE id = :id FOR UPDATE', ['id' => $id]) ?? throw new ApiError('NAO_ENCONTRADO', 404);
            if (Db::value('SELECT 1 FROM order_items WHERE category_id = :id LIMIT 1', ['id' => $id])) {
                throw new ApiError('CATEGORIA_COM_PEDIDOS', 409);
            }
            Db::run('DELETE FROM ticket_categories WHERE id = :id', ['id' => $id]);
            Audit::log('ingresso.eliminado', 'ticket_category', $id, ['antes' => self::present($cur)]);
        });
    }
}
