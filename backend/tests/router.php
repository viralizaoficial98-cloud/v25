<?php
// Router para o servidor embutido do PHP (testes locais): imita o Apache do cPanel.
//   /api/*   → public/api/index.php
//   ficheiro → servido tal como está (dist/ do frontend ou uploads/)
//   resto    → index.html (fallback de rotas da SPA, como o .htaccess)
$uri = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
if (str_starts_with($uri, '/api/') || $uri === '/api') {
    require __DIR__ . '/../public/api/index.php';
    return true;
}
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
readfile($docroot . '/index.html');
return true;
