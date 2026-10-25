<?php
declare(strict_types=1);

namespace App\Services;

use App\Support\ApiError;
use App\Support\Audit;
use App\Support\Db;
use App\Support\Util;

/** CRUD dos conteúdos editáveis: linha do tempo, integrantes e FAQ. */
final class ContentService
{
    /** tabela => [campo => [tipo, max, obrigatório]] */
    private const SCHEMA = [
        'timeline' => ['table' => 'timeline_entries', 'image' => 'image_path', 'fields' => [
            'period_label' => ['text', 80, true], 'title' => ['text', 160, true], 'description' => ['text', 5000, false],
            'image_path' => ['image', 255, false], 'published' => ['bool', 0, false],
        ]],
        'members' => ['table' => 'members', 'image' => 'photo_path', 'fields' => [
            'name' => ['text', 120, true], 'voice' => ['text', 80, false], 'period_label' => ['text', 80, false], 'bio' => ['text', 5000, false],
            'photo_path' => ['image', 255, false], 'is_current' => ['bool', 0, false], 'published' => ['bool', 0, false],
        ]],
        'faqs' => ['table' => 'faqs', 'image' => null, 'fields' => [
            'question' => ['text', 255, true], 'answer' => ['text', 5000, true], 'category' => ['enum', 0, false], 'published' => ['bool', 0, false],
        ]],
    ];
    private const FAQ_CATEGORIES = ['geral', 'bilhetes', 'pagamentos', 'comprovativos', 'entradas', 'evento'];

    private static function def(string $type): array
    {
        return self::SCHEMA[$type] ?? throw new ApiError('NAO_ENCONTRADO', 404);
    }

    public static function present(string $type, array $r): array
    {
        $def = self::def($type);
        $out = ['id' => $r['id'], 'sort_order' => (int) $r['sort_order'], 'created_at' => Util::iso($r['created_at'])];
        foreach ($def['fields'] as $k => [$t]) {
            $out[$k] = $t === 'bool' ? (bool) $r[$k] : $r[$k];
        }
        return $out;
    }

    public static function listPublic(string $type): array
    {
        $def = self::def($type);
        return array_map(fn ($r) => self::present($type, $r), Db::all("SELECT * FROM {$def['table']} WHERE published = 1 ORDER BY sort_order, created_at"));
    }

    public static function listAdmin(string $type): array
    {
        $def = self::def($type);
        return array_map(fn ($r) => self::present($type, $r), Db::all("SELECT * FROM {$def['table']} ORDER BY sort_order, created_at"));
    }

    private static function clean(string $type, array $in, bool $partial): array
    {
        $row = [];
        foreach (self::def($type)['fields'] as $k => [$t, $max, $req]) {
            if (!array_key_exists($k, $in)) {
                if (!$partial && $req) {
                    throw new ApiError('CAMPO_OBRIGATORIO', 422, ['campo' => $k]);
                }
                continue;
            }
            $v = $in[$k];
            $row[$k] = match ($t) {
                'bool' => (bool) $v ? 1 : 0,
                'enum' => in_array($v, self::FAQ_CATEGORIES, true) ? $v : 'geral',
                'image' => ($v === null || $v === '') ? null : (preg_match('#^[a-z]+/[0-9a-f-]{36}\.(webp|jpg|png)$#', (string) $v) ? (string) $v : throw new ApiError('IMAGEM_INVALIDA', 422)),
                default => (function () use ($v, $max, $req, $k) {
                    $s = trim((string) $v);
                    if ($req && $s === '') throw new ApiError('CAMPO_OBRIGATORIO', 422, ['campo' => $k]);
                    if (mb_strlen($s) > $max) throw new ApiError('TEXTO_DEMASIADO_LONGO', 422, ['campo' => $k]);
                    return $s;
                })(),
            };
        }
        return $row;
    }

    public static function create(string $type, array $in): array
    {
        $def = self::def($type);
        $row = self::clean($type, $in, false) + ['id' => Util::uuid()];
        foreach (['description', 'bio'] as $text) {
            if (isset($def['fields'][$text]) && !isset($row[$text])) $row[$text] = '';
        }
        $row['sort_order'] = (int) Db::value("SELECT COALESCE(MAX(sort_order),0) + 10 FROM {$def['table']}");
        Db::insert($def['table'], $row);
        Audit::log("conteudo.$type.criado", $type, $row['id'], $row);
        return self::present($type, Db::one("SELECT * FROM {$def['table']} WHERE id = :id", ['id' => $row['id']]));
    }

    public static function update(string $type, string $id, array $in): array
    {
        $def = self::def($type);
        $cur = Db::one("SELECT * FROM {$def['table']} WHERE id = :id", ['id' => $id]) ?? throw new ApiError('NAO_ENCONTRADO', 404);
        $row = self::clean($type, $in, true);
        if (array_key_exists('sort_order', $in)) {
            $row['sort_order'] = (int) $in['sort_order'];
        }
        if ($row) {
            $sets = implode(', ', array_map(fn ($k) => "`$k` = :$k", array_keys($row)));
            Db::run("UPDATE {$def['table']} SET $sets WHERE id = :id", $row + ['id' => $id]);
            // Imagem substituída ou removida: apaga o ficheiro antigo
            $img = $def['image'];
            if ($img && array_key_exists($img, $row) && $cur[$img] && $cur[$img] !== $row[$img]) {
                MediaService::deleteFile($cur[$img]);
            }
            Audit::log("conteudo.$type.alterado", $type, $id, ['alteracoes' => $row]);
        }
        return self::present($type, Db::one("SELECT * FROM {$def['table']} WHERE id = :id", ['id' => $id]));
    }

    public static function delete(string $type, string $id): void
    {
        $def = self::def($type);
        $cur = Db::one("SELECT * FROM {$def['table']} WHERE id = :id", ['id' => $id]) ?? throw new ApiError('NAO_ENCONTRADO', 404);
        Db::run("DELETE FROM {$def['table']} WHERE id = :id", ['id' => $id]);
        if ($def['image']) {
            MediaService::deleteFile($cur[$def['image']]);
        }
        Audit::log("conteudo.$type.eliminado", $type, $id);
    }
}
