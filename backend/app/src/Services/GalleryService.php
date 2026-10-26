<?php
declare(strict_types=1);

namespace App\Services;

use App\Support\ApiError;
use App\Support\Audit;
use App\Support\Config;
use App\Support\Db;
use App\Support\Util;

/**
 * Galeria dos eventos: álbuns (evento, data, categoria, descrição, capa) com fotografias
 * (versão grande + miniatura WebP, sem recortes), vídeos carregados (MP4/WebM) e vídeos
 * por URL autorizado (YouTube/Vimeo).
 */
final class GalleryService
{
    private const MAX_IMAGE = 15 * 1024 * 1024;
    private const MAX_VIDEO = 50 * 1024 * 1024;
    private const MAX_PER_ALBUM = 500;

    // ------------------------------------------------------------------ apresentação
    private static function presentItem(array $i): array
    {
        return [
            'id' => $i['id'], 'kind' => $i['kind'], 'path' => $i['path'], 'thumb_path' => $i['thumb_path'], 'video_url' => $i['video_url'],
            'embed_url' => $i['video_url'] ? self::embedUrl($i['video_url']) : null,
            'width' => $i['width'] === null ? null : (int) $i['width'], 'height' => $i['height'] === null ? null : (int) $i['height'],
            'caption' => $i['caption'], 'alt_text' => $i['alt_text'], 'sort_order' => (int) $i['sort_order'],
        ];
    }

    private static function presentAlbum(array $a, bool $admin = false): array
    {
        $cover = $a['cover_item_id'] ? Db::one('SELECT * FROM gallery_items WHERE id = :id', ['id' => $a['cover_item_id']]) : null;
        $cover ??= Db::one("SELECT * FROM gallery_items WHERE album_id = :a AND kind = 'foto' ORDER BY sort_order, created_at LIMIT 1", ['a' => $a['id']]);
        $counts = Db::one("SELECT SUM(kind = 'foto') AS fotos, SUM(kind <> 'foto') AS videos FROM gallery_items WHERE album_id = :a", ['a' => $a['id']]);
        return [
            'id' => $a['id'], 'title' => $a['title'], 'slug' => $a['slug'], 'category' => $a['category'],
            'event_date' => $a['event_date'], 'year' => $a['event_date'] ? (int) substr((string) $a['event_date'], 0, 4) : null,
            'location' => $a['location'], 'description' => $a['description'],
            'cover' => $cover ? self::presentItem($cover) : null, 'cover_item_id' => $a['cover_item_id'],
            'photos' => (int) ($counts['fotos'] ?? 0), 'videos' => (int) ($counts['videos'] ?? 0),
        ] + ($admin ? ['published' => (bool) $a['published'], 'sort_order' => (int) $a['sort_order']] : []);
    }

    /** Só YouTube e Vimeo (URL autorizado), convertidos para o leitor incorporado oficial. */
    public static function embedUrl(string $url): ?string
    {
        if (preg_match('#^https://(?:www\.)?(?:youtube\.com/(?:watch\?(?:.*&)?v=|embed/|shorts/|live/)|youtu\.be/)([A-Za-z0-9_-]{11})#', $url, $m)) {
            return 'https://www.youtube-nocookie.com/embed/' . $m[1];
        }
        if (preg_match('~^https://(?:www\.)?vimeo\.com/(\d{6,12})(?:$|[/?#])~', $url, $m)) {
            return 'https://player.vimeo.com/video/' . $m[1];
        }
        return null;
    }

    // ------------------------------------------------------------------ público
    public static function listPublic(array $q): array
    {
        $where = ['published = 1'];
        $params = [];
        if (!empty($q['year']) && ctype_digit((string) $q['year'])) {
            $where[] = 'YEAR(event_date) = :y';
            $params['y'] = (int) $q['year'];
        }
        if (!empty($q['category'])) {
            $where[] = 'category = :c';
            $params['c'] = mb_substr((string) $q['category'], 0, 60);
        }
        $rows = Db::all('SELECT * FROM gallery_albums WHERE ' . implode(' AND ', $where) . ' ORDER BY sort_order, event_date DESC, created_at DESC', $params);
        return [
            'albums' => array_map(fn ($a) => self::presentAlbum($a), $rows),
            'years' => array_map('intval', array_column(Db::all('SELECT DISTINCT YEAR(event_date) AS y FROM gallery_albums WHERE published = 1 AND event_date IS NOT NULL ORDER BY y DESC'), 'y')),
            'categories' => array_column(Db::all("SELECT DISTINCT category FROM gallery_albums WHERE published = 1 AND category <> '' ORDER BY category"), 'category'),
        ];
    }

    public static function albumPublic(string $slug, int $offset, int $limit): array
    {
        $a = Db::one('SELECT * FROM gallery_albums WHERE slug = :s AND published = 1', ['s' => $slug]) ?? throw new ApiError('NAO_ENCONTRADO', 404);
        $limit = min(max($limit, 1), 60);
        $items = Db::all('SELECT * FROM gallery_items WHERE album_id = :a ORDER BY sort_order, created_at LIMIT :l OFFSET :o', ['a' => $a['id'], 'l' => $limit, 'o' => max(0, $offset)]);
        $total = (int) Db::value('SELECT COUNT(*) FROM gallery_items WHERE album_id = :a', ['a' => $a['id']]);
        return ['album' => self::presentAlbum($a), 'items' => array_map([self::class, 'presentItem'], $items), 'total' => $total];
    }

    // ------------------------------------------------------------------ admin: álbuns
    public static function listAdmin(): array
    {
        return array_map(fn ($a) => self::presentAlbum($a, true), Db::all('SELECT * FROM gallery_albums ORDER BY sort_order, event_date DESC, created_at DESC'));
    }

    public static function albumAdmin(string $id): array
    {
        $a = Db::one('SELECT * FROM gallery_albums WHERE id = :id', ['id' => $id]) ?? throw new ApiError('NAO_ENCONTRADO', 404);
        return ['album' => self::presentAlbum($a, true), 'items' => array_map([self::class, 'presentItem'], Db::all('SELECT * FROM gallery_items WHERE album_id = :a ORDER BY sort_order, created_at', ['a' => $id]))];
    }

    private static function cleanAlbum(array $in): array
    {
        $title = trim((string) ($in['title'] ?? ''));
        if (mb_strlen($title) < 2 || mb_strlen($title) > 160) {
            throw new ApiError('CAMPO_OBRIGATORIO', 422, ['campo' => 'title']);
        }
        $date = trim((string) ($in['event_date'] ?? ''));
        if ($date !== '' && (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $date) || !checkdate((int) substr($date, 5, 2), (int) substr($date, 8, 2), (int) substr($date, 0, 4)))) {
            throw new ApiError('DATA_INVALIDA', 422);
        }
        return [
            'title' => $title,
            'category' => mb_substr(trim((string) ($in['category'] ?? '')), 0, 60),
            'event_date' => $date !== '' ? $date : null,
            'location' => mb_substr(trim((string) ($in['location'] ?? '')), 0, 160),
            'description' => mb_substr(trim((string) ($in['description'] ?? '')), 0, 5000),
            'published' => (bool) ($in['published'] ?? false) ? 1 : 0,
            'sort_order' => (int) ($in['sort_order'] ?? 0),
        ];
    }

    private static function slug(string $title, ?string $exceptId = null): string
    {
        $base = strtolower(trim((string) preg_replace('/[^A-Za-z0-9]+/', '-', (string) iconv('UTF-8', 'ASCII//TRANSLIT', $title)), '-')) ?: 'album';
        $base = substr($base, 0, 160);
        $slug = $base;
        for ($i = 2; Db::value('SELECT 1 FROM gallery_albums WHERE slug = :s' . ($exceptId ? ' AND id <> :id' : ''), ['s' => $slug] + ($exceptId ? ['id' => $exceptId] : [])); $i++) {
            $slug = "$base-$i";
        }
        return $slug;
    }

    public static function createAlbum(array $in): array
    {
        $row = self::cleanAlbum($in) + ['id' => Util::uuid()];
        $row['slug'] = self::slug($row['title']);
        Db::insert('gallery_albums', $row);
        Audit::log('galeria.album_criado', 'gallery_album', $row['id'], ['titulo' => $row['title']]);
        return self::albumAdmin($row['id']);
    }

    public static function updateAlbum(string $id, array $in): array
    {
        $cur = Db::one('SELECT * FROM gallery_albums WHERE id = :id', ['id' => $id]) ?? throw new ApiError('NAO_ENCONTRADO', 404);
        // Actualização parcial: campos não enviados mantêm o valor actual
        $keep = array_intersect_key($cur, array_flip(['title', 'category', 'event_date', 'location', 'description', 'published', 'sort_order']));
        $row = self::cleanAlbum($in + $keep);
        if ($row['title'] !== $cur['title']) {
            $row['slug'] = self::slug($row['title'], $id);
        }
        if (array_key_exists('cover_item_id', $in)) {
            $cover = $in['cover_item_id'];
            if ($cover !== null && !Db::value('SELECT 1 FROM gallery_items WHERE id = :i AND album_id = :a', ['i' => (string) $cover, 'a' => $id])) {
                throw new ApiError('VALOR_INVALIDO', 422, ['campo' => 'cover_item_id']);
            }
            $row['cover_item_id'] = $cover;
        }
        $sets = implode(', ', array_map(fn ($k) => "`$k` = :$k", array_keys($row)));
        Db::run("UPDATE gallery_albums SET $sets WHERE id = :id", $row + ['id' => $id]);
        Audit::log('galeria.album_alterado', 'gallery_album', $id, array_diff_key($row, ['description' => 1]));
        return self::albumAdmin($id);
    }

    public static function deleteAlbum(string $id): void
    {
        $items = Db::all('SELECT path, thumb_path FROM gallery_items WHERE album_id = :a', ['a' => $id]);
        Db::run('UPDATE gallery_albums SET cover_item_id = NULL WHERE id = :id', ['id' => $id]);
        if (Db::run('DELETE FROM gallery_albums WHERE id = :id', ['id' => $id])->rowCount() === 0) {
            throw new ApiError('NAO_ENCONTRADO', 404);
        }
        foreach ($items as $i) {
            MediaService::deleteFile($i['path']);
            MediaService::deleteFile($i['thumb_path']);
        }
        Audit::log('galeria.album_eliminado', 'gallery_album', $id, ['ficheiros' => count($items)]);
    }

    // ------------------------------------------------------------------ admin: itens
    /** @return array{path:string,thumb_path:?string,width:?int,height:?int,kind:string} */
    private static function storeFile(array $file): array
    {
        if (($file['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK || !is_uploaded_file((string) ($file['tmp_name'] ?? ''))) {
            throw new ApiError(in_array($file['error'] ?? 0, [UPLOAD_ERR_INI_SIZE, UPLOAD_ERR_FORM_SIZE], true) ? 'FICHEIRO_DEMASIADO_GRANDE' : 'UPLOAD_INVALIDO', 422);
        }
        $tmp = (string) $file['tmp_name'];
        $mime = (new \finfo(FILEINFO_MIME_TYPE))->file($tmp) ?: '';
        $dir = Config::mediaPath() . '/galeria';
        if (!is_dir($dir) && !mkdir($dir, 0755, true) && !is_dir($dir)) {
            throw new \RuntimeException('Não foi possível criar a pasta da galeria');
        }
        $id = Util::uuid();
        if (in_array($mime, ['video/mp4', 'video/webm'], true)) {
            if (filesize($tmp) > self::MAX_VIDEO) {
                throw new ApiError('FICHEIRO_DEMASIADO_GRANDE', 413);
            }
            $rel = "galeria/$id." . ($mime === 'video/webm' ? 'webm' : 'mp4');
            if (!move_uploaded_file($tmp, Config::mediaPath() . '/' . $rel)) {
                throw new \RuntimeException('Falha ao guardar vídeo');
            }
            @chmod(Config::mediaPath() . '/' . $rel, 0644);
            return ['path' => $rel, 'thumb_path' => null, 'width' => null, 'height' => null, 'kind' => 'video'];
        }
        if (!in_array($mime, ['image/jpeg', 'image/png', 'image/webp'], true) || filesize($tmp) > self::MAX_IMAGE) {
            throw new ApiError(filesize($tmp) > self::MAX_IMAGE ? 'FICHEIRO_DEMASIADO_GRANDE' : 'FICHEIRO_TIPO_INVALIDO', 415);
        }
        $info = @getimagesize($tmp);
        if ($info === false || $info[0] * $info[1] > 60_000_000) {
            throw new ApiError('FICHEIRO_TIPO_INVALIDO', 415);
        }
        $src = match ($mime) {
            'image/jpeg' => @imagecreatefromjpeg($tmp),
            'image/png' => @imagecreatefrompng($tmp),
            default => function_exists('imagecreatefromwebp') ? @imagecreatefromwebp($tmp) : false,
        };
        if (!$src) {
            throw new ApiError('FICHEIRO_TIPO_INVALIDO', 415);
        }
        // Corrige a orientação EXIF das fotografias de telemóvel (sem recortar)
        if ($mime === 'image/jpeg' && function_exists('exif_read_data')) {
            $o = (int) (@exif_read_data($tmp)['Orientation'] ?? 1);
            $src = match ($o) { 3 => imagerotate($src, 180, 0), 6 => imagerotate($src, -90, 0), 8 => imagerotate($src, 90, 0), default => $src };
        }
        $ext = function_exists('imagewebp') ? 'webp' : 'jpg';
        $write = function (\GdImage $img, int $max, string $rel) use ($ext): array {
            [$w, $h] = [imagesx($img), imagesy($img)];
            $s = min(1, $max / max($w, $h));
            $nw = (int) round($w * $s);
            $nh = (int) round($h * $s);
            $dst = imagecreatetruecolor($nw, $nh);
            imagealphablending($dst, false);
            imagesavealpha($dst, true);
            imagecopyresampled($dst, $img, 0, 0, 0, 0, $nw, $nh, $w, $h);
            $path = Config::mediaPath() . '/' . $rel;
            $ok = $ext === 'webp' ? imagewebp($dst, $path, 82) : imagejpeg($dst, $path, 85);
            imagedestroy($dst);
            if (!$ok) {
                throw new \RuntimeException('Falha ao gravar imagem');
            }
            @chmod($path, 0644);
            return [$nw, $nh];
        };
        [$w, $h] = $write($src, 2000, "galeria/$id.$ext");
        $write($src, 640, "galeria/$id-t.$ext");
        imagedestroy($src);
        return ['path' => "galeria/$id.$ext", 'thumb_path' => "galeria/$id-t.$ext", 'width' => $w, 'height' => $h, 'kind' => 'foto'];
    }

    public static function upload(string $albumId, array $file, string $caption, string $alt): array
    {
        if (!Db::value('SELECT 1 FROM gallery_albums WHERE id = :id', ['id' => $albumId])) {
            throw new ApiError('NAO_ENCONTRADO', 404);
        }
        if ((int) Db::value('SELECT COUNT(*) FROM gallery_items WHERE album_id = :a', ['a' => $albumId]) >= self::MAX_PER_ALBUM) {
            throw new ApiError('LIMITE_ALBUM', 409);
        }
        $up = self::storeFile($file);
        $id = Util::uuid();
        try {
            Db::insert('gallery_items', [
                'id' => $id, 'album_id' => $albumId, 'kind' => $up['kind'], 'path' => $up['path'], 'thumb_path' => $up['thumb_path'],
                'width' => $up['width'], 'height' => $up['height'], 'caption' => mb_substr(trim($caption), 0, 500), 'alt_text' => mb_substr(trim($alt), 0, 255),
                'sort_order' => (int) Db::value('SELECT COALESCE(MAX(sort_order),0) + 10 FROM gallery_items WHERE album_id = :a', ['a' => $albumId]),
            ]);
        } catch (\Throwable $e) {
            MediaService::deleteFile($up['path']);
            MediaService::deleteFile($up['thumb_path']);
            throw $e;
        }
        Audit::log('galeria.ficheiro_carregado', 'gallery_item', $id, ['album' => $albumId, 'path' => $up['path']]);
        return self::presentItem(Db::one('SELECT * FROM gallery_items WHERE id = :id', ['id' => $id]));
    }

    public static function addVideoUrl(string $albumId, string $url, string $caption): array
    {
        if (!Db::value('SELECT 1 FROM gallery_albums WHERE id = :id', ['id' => $albumId])) {
            throw new ApiError('NAO_ENCONTRADO', 404);
        }
        $url = trim($url);
        if (strlen($url) > 500 || self::embedUrl($url) === null) {
            throw new ApiError('VIDEO_URL_NAO_AUTORIZADO', 422);
        }
        $id = Util::uuid();
        Db::insert('gallery_items', [
            'id' => $id, 'album_id' => $albumId, 'kind' => 'video_url', 'video_url' => $url, 'caption' => mb_substr(trim($caption), 0, 500),
            'sort_order' => (int) Db::value('SELECT COALESCE(MAX(sort_order),0) + 10 FROM gallery_items WHERE album_id = :a', ['a' => $albumId]),
        ]);
        Audit::log('galeria.video_url', 'gallery_item', $id, ['album' => $albumId, 'url' => $url]);
        return self::presentItem(Db::one('SELECT * FROM gallery_items WHERE id = :id', ['id' => $id]));
    }

    public static function updateItem(string $id, array $in): array
    {
        $cur = Db::one('SELECT * FROM gallery_items WHERE id = :id', ['id' => $id]) ?? throw new ApiError('NAO_ENCONTRADO', 404);
        $row = [];
        if (array_key_exists('caption', $in)) $row['caption'] = mb_substr(trim((string) $in['caption']), 0, 500);
        if (array_key_exists('alt_text', $in)) $row['alt_text'] = mb_substr(trim((string) $in['alt_text']), 0, 255);
        if ($row) {
            $sets = implode(', ', array_map(fn ($k) => "`$k` = :$k", array_keys($row)));
            Db::run("UPDATE gallery_items SET $sets WHERE id = :id", $row + ['id' => $id]);
        }
        return self::presentItem(Db::one('SELECT * FROM gallery_items WHERE id = :id', ['id' => $id]) ?? $cur);
    }

    /** Substitui o ficheiro de uma fotografia/vídeo mantendo legenda, ordem e capa. */
    public static function replaceFile(string $id, array $file): array
    {
        $cur = Db::one('SELECT * FROM gallery_items WHERE id = :id', ['id' => $id]) ?? throw new ApiError('NAO_ENCONTRADO', 404);
        if ($cur['kind'] === 'video_url') {
            throw new ApiError('ESTADO_INVALIDO', 409);
        }
        $up = self::storeFile($file);
        Db::run('UPDATE gallery_items SET kind = :k, path = :p, thumb_path = :t, width = :w, height = :h WHERE id = :id',
            ['k' => $up['kind'], 'p' => $up['path'], 't' => $up['thumb_path'], 'w' => $up['width'], 'h' => $up['height'], 'id' => $id]);
        MediaService::deleteFile($cur['path']);
        MediaService::deleteFile($cur['thumb_path']);
        Audit::log('galeria.ficheiro_substituido', 'gallery_item', $id, ['antes' => $cur['path'], 'depois' => $up['path']]);
        return self::presentItem(Db::one('SELECT * FROM gallery_items WHERE id = :id', ['id' => $id]));
    }

    public static function deleteItem(string $id): void
    {
        $cur = Db::one('SELECT * FROM gallery_items WHERE id = :id', ['id' => $id]) ?? throw new ApiError('NAO_ENCONTRADO', 404);
        Db::run('DELETE FROM gallery_items WHERE id = :id', ['id' => $id]); // a capa passa a NULL (FK ON DELETE SET NULL)
        MediaService::deleteFile($cur['path']);
        MediaService::deleteFile($cur['thumb_path']);
        Audit::log('galeria.ficheiro_eliminado', 'gallery_item', $id, ['album' => $cur['album_id'], 'path' => $cur['path']]);
    }

    /** @param list<string> $ids nova ordem dos itens do álbum */
    public static function reorder(string $albumId, array $ids): array
    {
        Db::tx(function () use ($albumId, $ids) {
            foreach (array_values($ids) as $i => $itemId) {
                Db::run('UPDATE gallery_items SET sort_order = :o WHERE id = :id AND album_id = :a', ['o' => ($i + 1) * 10, 'id' => (string) $itemId, 'a' => $albumId]);
            }
        });
        return self::albumAdmin($albumId);
    }
}
