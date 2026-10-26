<?php
// Router para o servidor embutido do PHP (testes locais): imita o Apache do cPanel.
//   /api/*   → public/api/index.php
//   ficheiro → servido tal como está (dist/ do frontend ou uploads/)
//   resto    → index.html (fallback de rotas da SPA, como o .htaccess)
$uri = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
// No repositório a pasta privada é backend/app (no cPanel: ../../v25_app, resolvido por index.php)
if (!getenv('V25_APP_DIR')) {
    putenv('V25_APP_DIR=' . realpath(__DIR__ . '/../app'));
}
if (str_starts_with($uri, '/api/') || $uri === '/api') {
    require __DIR__ . '/../public/api/index.php';
    return true;
}
// /uploads/media/* → pasta MEDIA_PATH (no cPanel é public_html/uploads/media)
$media = getenv('V25_MEDIA_DIR') ?: __DIR__ . '/../public/uploads/media';
if (str_starts_with($uri, '/uploads/media/')) {
    $f = realpath($media . substr($uri, strlen('/uploads/media')));
    if ($f && is_file($f) && str_starts_with($f, realpath($media))) {
        header('Content-Type: ' . (mime_content_type($f) ?: 'application/octet-stream'));
        readfile($f);
        return true;
    }
    http_response_code(404);
    return true;
}
// Mesma Content-Security-Policy do public/.htaccess (validada nos testes E2E)
$csp = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: blob: https://i.ytimg.com; media-src 'self' blob:; frame-src https://www.youtube-nocookie.com https://player.vimeo.com; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'self'";
$docroot = getenv('V25_DOCROOT') ?: __DIR__ . '/../../dist';
$file = realpath($docroot . $uri);
if ($file && is_file($file) && str_starts_with($file, realpath($docroot))) {
    $types = ['js' => 'text/javascript', 'css' => 'text/css', 'svg' => 'image/svg+xml', 'avif' => 'image/avif', 'webp' => 'image/webp', 'webmanifest' => 'application/manifest+json', 'png' => 'image/png', 'jpg' => 'image/jpeg', 'html' => 'text/html', 'mp4' => 'video/mp4', 'pdf' => 'application/pdf'];
    $ext = pathinfo($file, PATHINFO_EXTENSION);
    header('Content-Type: ' . ($types[$ext] ?? 'application/octet-stream'));
    readfile($file);
    return true;
}
header('Content-Type: text/html; charset=utf-8');
header('Content-Security-Policy: ' . $csp);
readfile($docroot . '/index.html');
return true;
