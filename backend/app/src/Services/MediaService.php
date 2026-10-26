<?php
declare(strict_types=1);

namespace App\Services;

use App\Support\ApiError;
use App\Support\Audit;
use App\Support\Config;
use App\Support\Db;
use App\Support\Util;

/**
 * Ficheiros públicos do site (galeria, fotografias da linha do tempo e integrantes) em
 * public_html/uploads/media. Imagens são re-codificadas com GD (remove metadados e
 * conteúdo embutido) apenas com redimensionamento — sem recortes.
 */
final class MediaService
{
    private const MAX_IMAGE = 15 * 1024 * 1024;
    private const MAX_VIDEO = 50 * 1024 * 1024;
    private const FOLDERS = ['memorias', 'grupo', 'historia', 'integrantes', 'site', 'galeria'];

    public static function url(?string $path): ?string
    {
        return $path ? Config::mediaUrl() . '/' . $path : null;
    }

    /** @return array{path:string,width:?int,height:?int,kind:string} */
    public static function store(array $file, string $folder, bool $allowVideo): array
    {
        if (!in_array($folder, self::FOLDERS, true)) {
            throw new ApiError('PASTA_INVALIDA', 422);
        }
        if (!is_array($file) || ($file['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK || !is_uploaded_file((string) $file['tmp_name'])) {
            throw new ApiError(in_array($file['error'] ?? 0, [UPLOAD_ERR_INI_SIZE, UPLOAD_ERR_FORM_SIZE], true) ? 'FICHEIRO_DEMASIADO_GRANDE' : 'UPLOAD_INVALIDO', 422);
        }
        $tmp = (string) $file['tmp_name'];
        $mime = (new \finfo(FILEINFO_MIME_TYPE))->file($tmp) ?: '';
        $dir = Config::mediaPath() . '/' . $folder;
        if (!is_dir($dir) && !mkdir($dir, 0755, true) && !is_dir($dir)) {
            throw new \RuntimeException('Não foi possível criar a pasta de media: ' . $dir);
        }
        $id = Util::uuid();

        if (in_array($mime, ['video/mp4', 'video/webm'], true)) {
            if (!$allowVideo) {
                throw new ApiError('FICHEIRO_TIPO_INVALIDO', 415);
            }
            if (filesize($tmp) > self::MAX_VIDEO) {
                throw new ApiError('FICHEIRO_DEMASIADO_GRANDE', 413);
            }
            $rel = "$folder/$id." . ($mime === 'video/webm' ? 'webm' : 'mp4');
            if (!move_uploaded_file($tmp, Config::mediaPath() . '/' . $rel)) {
                throw new \RuntimeException('Falha ao guardar vídeo');
            }
            @chmod(Config::mediaPath() . '/' . $rel, 0644);
            return ['path' => $rel, 'width' => null, 'height' => null, 'kind' => 'video'];
        }

        if (!in_array($mime, ['image/jpeg', 'image/png', 'image/webp'], true) || filesize($tmp) > self::MAX_IMAGE) {
            throw new ApiError(filesize($tmp) > self::MAX_IMAGE ? 'FICHEIRO_DEMASIADO_GRANDE' : 'FICHEIRO_TIPO_INVALIDO', 415);
        }
        $info = @getimagesize($tmp);
        if ($info === false || $info[0] < 1 || $info[1] < 1 || $info[0] * $info[1] > 60_000_000) {
            throw new ApiError('FICHEIRO_TIPO_INVALIDO', 415);
        }
        $src = match ($mime) {
            'image/jpeg' => @imagecreatefromjpeg($tmp),
            'image/png' => @imagecreatefrompng($tmp),
            'image/webp' => function_exists('imagecreatefromwebp') ? @imagecreatefromwebp($tmp) : false,
        };
        if (!$src) {
            throw new ApiError('FICHEIRO_TIPO_INVALIDO', 415);
        }
        [$w, $h] = [imagesx($src), imagesy($src)];
        $scale = min(1, 2400 / max($w, $h));
        $nw = (int) round($w * $scale);
        $nh = (int) round($h * $scale);
        $dst = imagecreatetruecolor($nw, $nh);
        imagealphablending($dst, false);
        imagesavealpha($dst, true);
        imagecopyresampled($dst, $src, 0, 0, 0, 0, $nw, $nh, $w, $h);
        $useWebp = function_exists('imagewebp');
        $rel = "$folder/$id." . ($useWebp ? 'webp' : 'jpg');
        $dest = Config::mediaPath() . '/' . $rel;
        $ok = $useWebp ? imagewebp($dst, $dest, 85) : imagejpeg($dst, $dest, 85);
        imagedestroy($src);
        imagedestroy($dst);
        if (!$ok) {
            throw new \RuntimeException('Falha ao gravar imagem');
        }
        @chmod($dest, 0644);
        return ['path' => $rel, 'width' => $nw, 'height' => $nh, 'kind' => 'foto'];
    }

    public static function deleteFile(?string $rel): void
    {
        if (!$rel || !preg_match('#^[a-z]+/[0-9a-f-]{36}(-t)?\.(webp|jpg|png|mp4|webm)$#', $rel)) {
            return;
        }
        $base = realpath(Config::mediaPath());
        $real = realpath(Config::mediaPath() . '/' . $rel);
        if ($base && $real && str_starts_with($real, $base . DIRECTORY_SEPARATOR)) {
            @unlink($real);
        }
    }

    public static function present(array $m): array
    {
        return [
            'id' => $m['id'], 'kind' => $m['kind'], 'section' => $m['section'], 'title' => $m['title'], 'caption' => $m['caption'],
            'storage_path' => $m['storage_path'], 'youtube_id' => $m['youtube_id'], 'width' => $m['width'] === null ? null : (int) $m['width'],
            'height' => $m['height'] === null ? null : (int) $m['height'], 'sort_order' => (int) $m['sort_order'], 'published' => (bool) $m['published'],
        ];
    }

    public static function listPublic(string $section, int $offset, int $limit): array
    {
        if (!in_array($section, ['grupo', 'memorias'], true)) {
            throw new ApiError('PEDIDO_INVALIDO', 422);
        }
        return array_map([self::class, 'present'], Db::all(
            'SELECT * FROM media_items WHERE published = 1 AND section = :s ORDER BY sort_order, created_at DESC LIMIT :l OFFSET :o',
            ['s' => $section, 'l' => min(max($limit, 1), 48), 'o' => max($offset, 0)],
        ));
    }

    public static function listAdmin(string $section): array
    {
        return array_map([self::class, 'present'], Db::all('SELECT * FROM media_items WHERE section = :s ORDER BY sort_order, created_at DESC', ['s' => $section]));
    }

    public static function upload(array $file, string $section, string $title): array
    {
        if (!in_array($section, ['grupo', 'memorias'], true)) {
            throw new ApiError('PEDIDO_INVALIDO', 422);
        }
        $up = self::store($file, $section, true);
        $id = Util::uuid();
        try {
            Db::insert('media_items', [
                'id' => $id, 'kind' => $up['kind'], 'section' => $section, 'title' => mb_substr($title, 0, 160), 'caption' => '',
                'storage_path' => $up['path'], 'width' => $up['width'], 'height' => $up['height'],
                'sort_order' => (int) Db::value('SELECT COALESCE(MAX(sort_order),0) + 10 FROM media_items WHERE section = :s', ['s' => $section]), 'published' => 0,
            ]);
        } catch (\Throwable $e) {
            self::deleteFile($up['path']);
            throw $e;
        }
        Audit::log('media.carregado', 'media', $id, ['path' => $up['path']]);
        return self::present(Db::one('SELECT * FROM media_items WHERE id = :id', ['id' => $id]));
    }

    public static function addYoutube(string $input, string $section, string $title): array
    {
        $s = trim($input);
        $yt = preg_match('/^[A-Za-z0-9_-]{11}$/', $s) ? $s
            : (preg_match('#(?:youtu\.be/|youtube(?:-nocookie)?\.com/(?:watch\?(?:.*&)?v=|embed/|shorts/|live/))([A-Za-z0-9_-]{11})#', $s, $m) ? $m[1] : null);
        if (!$yt || !in_array($section, ['grupo', 'memorias'], true)) {
            throw new ApiError('YOUTUBE_INVALIDO', 422);
        }
        $id = Util::uuid();
        Db::insert('media_items', ['id' => $id, 'kind' => 'youtube', 'section' => $section, 'title' => mb_substr($title, 0, 160), 'caption' => '', 'youtube_id' => $yt, 'published' => 0]);
        Audit::log('media.youtube', 'media', $id, ['youtube_id' => $yt]);
        return self::present(Db::one('SELECT * FROM media_items WHERE id = :id', ['id' => $id]));
    }

    public static function update(string $id, array $in): array
    {
        $m = Db::one('SELECT * FROM media_items WHERE id = :id', ['id' => $id]) ?? throw new ApiError('NAO_ENCONTRADO', 404);
        $row = [];
        if (array_key_exists('title', $in)) $row['title'] = mb_substr(trim((string) $in['title']), 0, 160);
        if (array_key_exists('caption', $in)) $row['caption'] = mb_substr(trim((string) $in['caption']), 0, 500);
        if (array_key_exists('sort_order', $in)) $row['sort_order'] = (int) $in['sort_order'];
        if (array_key_exists('published', $in)) $row['published'] = (bool) $in['published'] ? 1 : 0;
        if (array_key_exists('section', $in) && in_array($in['section'], ['grupo', 'memorias'], true)) $row['section'] = $in['section'];
        if ($row) {
            $sets = implode(', ', array_map(fn ($k) => "`$k` = :$k", array_keys($row)));
            Db::run("UPDATE media_items SET $sets WHERE id = :id", $row + ['id' => $id]);
            Audit::log('media.alterado', 'media', $id, $row);
        }
        return self::present(Db::one('SELECT * FROM media_items WHERE id = :id', ['id' => $id]) ?? $m);
    }

    public static function delete(string $id): void
    {
        $m = Db::one('SELECT * FROM media_items WHERE id = :id', ['id' => $id]) ?? throw new ApiError('NAO_ENCONTRADO', 404);
        Db::run('DELETE FROM media_items WHERE id = :id', ['id' => $id]);
        self::deleteFile($m['storage_path']);
        Audit::log('media.eliminado', 'media', $id, ['path' => $m['storage_path']]);
    }
}
