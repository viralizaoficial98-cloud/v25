<?php
declare(strict_types=1);

namespace App\Services;

use App\Auth\Auth;
use App\Support\ApiError;
use App\Support\Audit;
use App\Support\Db;
use App\Support\Util;

/**
 * Gestão do website (CMS). Cada secção tem conteúdo em rascunho e publicado (JSON),
 * visibilidade, ordem e histórico. Os campos são validados por um esquema: só texto
 * simples (o site nunca interpreta HTML), links http(s)/relativos/âncoras e imagens
 * carregadas pelo próprio painel.
 */
final class SiteService
{
    /** tipos: text(max) | textarea(max) | link | image | bool | list(max itens) | items(campos) */
    private const SCHEMA = [
        'hero' => [
            'eyebrow' => ['text', 120], 'title' => ['text', 120], 'subtitle' => ['text', 200], 'description' => ['textarea', 600],
            'slogan' => ['text', 200], 'cta_primary' => ['link'], 'cta_secondary' => ['link'], 'image' => ['image'], 'image_alt' => ['text', 200],
            'show_countdown' => ['bool'],
        ],
        'about' => [
            'eyebrow' => ['text', 80], 'title' => ['text', 120], 'title_highlight' => ['text', 120], 'body' => ['textarea', 6000],
            'image' => ['image'], 'image_alt' => ['text', 200], 'pillars' => ['list', 8],
        ],
        'banner' => ['items' => ['items', 5, ['title' => ['text', 160], 'text' => ['textarea', 500], 'cta_label' => ['text', 60], 'cta_href' => ['href'], 'image' => ['image']]]],
        'tickets' => [
            'eyebrow' => ['text', 80], 'title' => ['text', 120], 'title_highlight' => ['text', 120], 'intro' => ['textarea', 800],
            'buy_label' => ['text', 40], 'vip_label' => ['text', 40], 'note' => ['textarea', 600],
        ],
        'event_info' => ['eyebrow' => ['text', 80], 'title' => ['text', 120], 'maps_label' => ['text', 40]],
        'history' => ['eyebrow' => ['text', 80], 'title' => ['text', 120], 'title_highlight' => ['text', 120], 'intro' => ['textarea', 600], 'empty_text' => ['textarea', 600]],
        'group' => ['eyebrow' => ['text', 80], 'title' => ['text', 120], 'title_highlight' => ['text', 120], 'intro' => ['textarea', 600]],
        'event_gallery' => ['eyebrow' => ['text', 80], 'title' => ['text', 120], 'title_highlight' => ['text', 120], 'intro' => ['textarea', 600], 'more_label' => ['text', 40]],
        'memories' => ['eyebrow' => ['text', 80], 'title' => ['text', 120], 'title_highlight' => ['text', 120], 'intro' => ['textarea', 600]],
        'faq' => ['eyebrow' => ['text', 80], 'title' => ['text', 120]],
        'footer' => ['closing_message' => ['text', 200], 'tagline' => ['text', 200], 'show_partner_logo' => ['bool'], 'partner_label' => ['text', 80]],
        'seo' => ['meta_title' => ['text', 70], 'meta_description' => ['textarea', 300], 'og_image' => ['image']],
    ];

    /** Secções públicas publicadas, por ordem (o site renderiza a partir daqui). */
    public static function published(): array
    {
        return self::load(false);
    }

    /** Pré-visualização: o mesmo formato, mas com os rascunhos (só para quem gere o site). */
    public static function preview(): array
    {
        return self::load(true);
    }

    private static function load(bool $draft): array
    {
        $out = [];
        foreach (Db::all('SELECT * FROM site_sections ORDER BY sort_order, section_key') as $r) {
            $out[] = [
                'key' => $r['section_key'],
                'enabled' => (bool) $r['enabled'],
                'sort_order' => (int) $r['sort_order'],
                'data' => self::decode($draft ? $r['draft_data'] : $r['published_data']),
            ];
        }
        return ['sections' => $out, 'preview' => $draft];
    }

    private static function decode(string $json): array
    {
        $d = json_decode($json, true);
        return is_array($d) ? $d : [];
    }

    public static function adminList(): array
    {
        return array_map(fn ($r) => [
            'key' => $r['section_key'], 'label' => $r['label'], 'sort_order' => (int) $r['sort_order'], 'enabled' => (bool) $r['enabled'],
            'has_draft' => (bool) $r['has_draft'], 'draft' => self::decode($r['draft_data']), 'published' => self::decode($r['published_data']),
            'published_at' => Util::iso($r['published_at']), 'updated_at' => Util::iso($r['updated_at']),
            'schema' => self::SCHEMA[$r['section_key']] ?? [],
        ], Db::all('SELECT * FROM site_sections ORDER BY sort_order, section_key'));
    }

    private static function section(string $key, bool $lock = false): array
    {
        if (!isset(self::SCHEMA[$key])) {
            throw new ApiError('NAO_ENCONTRADO', 404);
        }
        return Db::one('SELECT * FROM site_sections WHERE section_key = :k' . ($lock ? ' FOR UPDATE' : ''), ['k' => $key]) ?? throw new ApiError('NAO_ENCONTRADO', 404);
    }

    public static function validHref(string $v): bool
    {
        return $v === '' || (bool) preg_match('~^(https?://[^\s<>"\']+|/[^\s<>"\']*|#[A-Za-z0-9_-]+|mailto:[^\s<>"\']+|tel:\+?[0-9 ]+)$~', $v);
    }

    private static function cleanText(mixed $v, int $max, string $field): string
    {
        if (!is_scalar($v) && $v !== null) {
            throw new ApiError('VALOR_INVALIDO', 422, ['campo' => $field]);
        }
        // Texto simples: remove caracteres de controlo; o frontend nunca interpreta HTML
        $s = trim((string) preg_replace('/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/u', '', (string) $v));
        if (mb_strlen($s) > $max) {
            throw new ApiError('TEXTO_DEMASIADO_LONGO', 422, ['campo' => $field, 'max' => $max]);
        }
        return $s;
    }

    private static function cleanImage(mixed $v, string $field): string
    {
        $s = trim((string) ($v ?? ''));
        if ($s !== '' && !preg_match('#^[a-z]+/[0-9a-f-]{36}(-t)?\.(webp|jpg|png)$#', $s)) {
            throw new ApiError('IMAGEM_INVALIDA', 422, ['campo' => $field]);
        }
        return $s;
    }

    /** Valida e normaliza os dados de uma secção segundo o seu esquema. */
    public static function validate(string $key, array $data): array
    {
        $out = [];
        foreach (self::SCHEMA[$key] as $field => $def) {
            $v = $data[$field] ?? null;
            $out[$field] = match ($def[0]) {
                'text', 'textarea' => self::cleanText($v, $def[1], $field),
                'bool' => (bool) $v,
                'image' => self::cleanImage($v, $field),
                'href' => (function () use ($v, $field) {
                    $h = self::cleanText($v, 500, $field);
                    if (!self::validHref($h)) throw new ApiError('URL_INVALIDO', 422, ['campo' => $field]);
                    return $h;
                })(),
                'link' => (function () use ($v, $field) {
                    $v = is_array($v) ? $v : [];
                    $href = self::cleanText($v['href'] ?? '', 500, $field);
                    if (!self::validHref($href)) throw new ApiError('URL_INVALIDO', 422, ['campo' => $field]);
                    return ['label' => self::cleanText($v['label'] ?? '', 60, $field), 'href' => $href];
                })(),
                'list' => (function () use ($v, $def, $field) {
                    $items = array_values(array_filter(array_map(fn ($x) => self::cleanText($x, 120, $field), is_array($v) ? $v : []), fn ($x) => $x !== ''));
                    if (count($items) > $def[1]) throw new ApiError('VALOR_INVALIDO', 422, ['campo' => $field]);
                    return $items;
                })(),
                'items' => (function () use ($v, $def, $field) {
                    $rows = is_array($v) ? array_values($v) : [];
                    if (count($rows) > $def[1]) throw new ApiError('VALOR_INVALIDO', 422, ['campo' => $field]);
                    $clean = [];
                    foreach ($rows as $row) {
                        $row = is_array($row) ? $row : [];
                        $c = [];
                        foreach ($def[2] as $sub => $sd) {
                            $c[$sub] = match ($sd[0]) {
                                'image' => self::cleanImage($row[$sub] ?? '', "$field.$sub"),
                                'href' => (function () use ($row, $sub, $field) {
                                    $h = self::cleanText($row[$sub] ?? '', 500, "$field.$sub");
                                    if (!self::validHref($h)) throw new ApiError('URL_INVALIDO', 422, ['campo' => "$field.$sub"]);
                                    return $h;
                                })(),
                                default => self::cleanText($row[$sub] ?? '', $sd[1], "$field.$sub"),
                            };
                        }
                        $clean[] = $c;
                    }
                    return $clean;
                })(),
                default => null,
            };
        }
        return $out;
    }

    private static function revision(string $key, string $action, array $data): void
    {
        $u = Auth::user();
        Db::insert('site_revisions', [
            'section_key' => $key, 'action' => $action, 'data' => json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
            'user_id' => $u['id'] ?? null, 'user_email' => $u['email'] ?? null,
        ]);
    }

    /** Guarda rascunho (não altera o site público). Opcionalmente publica de seguida. */
    public static function saveDraft(string $key, array $data, bool $publish = false): array
    {
        $clean = self::validate($key, $data);
        Db::tx(function () use ($key, $clean, $publish) {
            self::section($key, true);
            $json = json_encode($clean, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
            Db::run('UPDATE site_sections SET draft_data = :d, has_draft = 1, updated_by = :u WHERE section_key = :k', ['d' => $json, 'u' => Auth::user()['id'] ?? null, 'k' => $key]);
            self::revision($key, 'rascunho', $clean);
            if ($publish) {
                self::publishLocked($key);
            }
        });
        Audit::log($publish ? 'site.publicado' : 'site.rascunho', 'site_section', $key);
        return self::adminSection($key);
    }

    public static function publish(string $key): array
    {
        Db::tx(function () use ($key) {
            self::section($key, true);
            self::publishLocked($key);
        });
        Audit::log('site.publicado', 'site_section', $key);
        return self::adminSection($key);
    }

    private static function publishLocked(string $key): void
    {
        $r = self::section($key);
        Db::run('UPDATE site_sections SET published_data = draft_data, has_draft = 0, published_at = UTC_TIMESTAMP(), updated_by = :u WHERE section_key = :k', ['u' => Auth::user()['id'] ?? null, 'k' => $key]);
        self::revision($key, 'publicado', self::decode($r['draft_data']));
    }

    /** Descarta o rascunho (volta ao conteúdo publicado). */
    public static function discardDraft(string $key): array
    {
        Db::run('UPDATE site_sections SET draft_data = published_data, has_draft = 0 WHERE section_key = :k', ['k' => self::section($key)['section_key']]);
        Audit::log('site.rascunho_descartado', 'site_section', $key);
        return self::adminSection($key);
    }

    public static function setEnabled(string $key, bool $enabled): array
    {
        self::section($key);
        Db::run('UPDATE site_sections SET enabled = :e, updated_by = :u WHERE section_key = :k', ['e' => $enabled, 'u' => Auth::user()['id'] ?? null, 'k' => $key]);
        self::revision($key, 'visibilidade', ['enabled' => $enabled]);
        Audit::log($enabled ? 'site.seccao_publicada' : 'site.seccao_ocultada', 'site_section', $key);
        return self::adminSection($key);
    }

    /** @param list<string> $keys nova ordem das secções */
    public static function reorder(array $keys): array
    {
        $known = array_column(Db::all('SELECT section_key FROM site_sections'), 'section_key');
        $keys = array_values(array_unique(array_filter($keys, fn ($k) => is_string($k) && in_array($k, $known, true))));
        Db::tx(function () use ($keys) {
            foreach ($keys as $i => $k) {
                Db::run('UPDATE site_sections SET sort_order = :o WHERE section_key = :k', ['o' => ($i + 1) * 10, 'k' => $k]);
            }
        });
        Audit::log('site.reordenado', 'site_section', null, ['ordem' => $keys]);
        return self::adminList();
    }

    public static function revisions(string $key): array
    {
        self::section($key);
        return array_map(fn ($r) => [
            'id' => (int) $r['id'], 'action' => $r['action'], 'data' => self::decode($r['data']), 'user_email' => $r['user_email'], 'created_at' => Util::iso($r['created_at']),
        ], Db::all('SELECT * FROM site_revisions WHERE section_key = :k ORDER BY id DESC LIMIT 50', ['k' => $key]));
    }

    /** Restaura uma revisão como rascunho (não publica automaticamente). */
    public static function restore(string $key, int $revisionId): array
    {
        $rev = Db::one('SELECT * FROM site_revisions WHERE id = :id AND section_key = :k', ['id' => $revisionId, 'k' => $key]) ?? throw new ApiError('NAO_ENCONTRADO', 404);
        if (!in_array($rev['action'], ['rascunho', 'publicado', 'restaurado'], true)) {
            throw new ApiError('VALOR_INVALIDO', 422);
        }
        $clean = self::validate($key, self::decode($rev['data']));
        Db::run('UPDATE site_sections SET draft_data = :d, has_draft = 1 WHERE section_key = :k', ['d' => json_encode($clean, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES), 'k' => $key]);
        self::revision($key, 'restaurado', $clean);
        Audit::log('site.revisao_restaurada', 'site_section', $key, ['revisao' => $revisionId]);
        return self::adminSection($key);
    }

    private static function adminSection(string $key): array
    {
        foreach (self::adminList() as $s) {
            if ($s['key'] === $key) {
                return $s;
            }
        }
        throw new ApiError('NAO_ENCONTRADO', 404);
    }
}
