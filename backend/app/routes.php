<?php
declare(strict_types=1);

use App\Auth\Auth;
use App\Http\Request;
use App\Http\Response;
use App\Http\Router;
use App\Services\AdminQueryService;
use App\Services\CheckinService;
use App\Services\ContentService;
use App\Services\MailQueue;
use App\Services\MediaService;
use App\Services\OrderService;
use App\Services\PaymentService;
use App\Services\ProofService;
use App\Services\ReportService;
use App\Services\SettingsService;
use App\Services\TicketCategoryService;
use App\Services\TicketService;
use App\Services\UserService;
use App\Services\GalleryService;
use App\Services\SiteService;
use App\Services\VipService;
use App\Support\ApiError;
use App\Support\Audit;
use App\Support\RateLimiter;
use App\Support\Util;

$r = new Router();
$id = static function (Request $q, string $key = 'id'): string {
    $v = $q->params[$key] ?? '';
    if (!Util::isUuid($v)) {
        throw new ApiError('NAO_ENCONTRADO', 404);
    }
    return $v;
};

// =============================================================================
// PÚBLICO
// =============================================================================
$r->get('/health', fn () => ['ok' => true, 'time' => gmdate('c')]);
$r->get('/public/settings', fn () => SettingsService::public());
$r->get('/public/ticket-types', fn () => TicketCategoryService::listPublic());
$r->get('/public/timeline', fn () => ContentService::listPublic('timeline'));
$r->get('/public/members', fn () => ContentService::listPublic('members'));
$r->get('/public/faqs', fn () => ContentService::listPublic('faqs'));
$r->get('/public/media', fn (Request $q) => MediaService::listPublic((string) ($q->query['section'] ?? 'memorias'), (int) ($q->query['offset'] ?? 0), (int) ($q->query['limit'] ?? 12)));

$r->post('/public/orders', fn (Request $q) => Response::json(OrderService::create($q), 201));
$r->get('/public/orders/{code}', function (Request $q) {
    OrderService::expireStale();
    return OrderService::customerView(OrderService::byToken($q));
});
$r->post('/public/orders/{code}/confirm', fn (Request $q) => OrderService::confirmReservation($q));
$r->post('/public/orders/{code}/cancel', fn (Request $q) => OrderService::cancelByCustomer($q));
$r->post('/public/orders/{code}/proofs', fn (Request $q) => Response::json(ProofService::upload($q), 201));
$r->get('/public/orders/{code}/tickets.pdf', function (Request $q) {
    $o = OrderService::byToken($q);
    if ($o['status'] !== 'emitido') {
        throw new ApiError('ESTADO_INVALIDO', 409);
    }
    RateLimiter::hit('pdf', $o['id'], 30, 3600);
    return Response::file(TicketService::pdf($o), 'application/pdf', 'V25-ingressos-' . $o['order_code'] . '.pdf');
});
$r->post('/public/access-request', fn (Request $q) => OrderService::requestAccess($q));
$r->post('/public/orders/{code}/payment-method', fn (Request $q) => OrderService::setPaymentMethod($q));

// Conteúdos do website (CMS) — apenas versão publicada
$r->get('/public/site', fn () => SiteService::published());

// Galeria dos eventos
$r->get('/public/gallery/albums', fn (Request $q) => GalleryService::listPublic($q->query));
$r->get('/public/gallery/albums/{slug}', fn (Request $q) => GalleryService::albumPublic((string) $q->params['slug'], (int) ($q->query['offset'] ?? 0), (int) ($q->query['limit'] ?? 24)));

// VIP por consulta
$r->post('/public/vip', fn (Request $q) => Response::json(VipService::create($q), 201));
$r->get('/public/vip/{code}', fn (Request $q) => VipService::customerView($q));
$r->post('/public/vip/{code}/accept', fn (Request $q) => Response::json(VipService::accept($q), 201));
$r->post('/public/vip/{code}/decline', fn (Request $q) => VipService::decline($q));

// =============================================================================
// AUTENTICAÇÃO
// =============================================================================
$r->get('/auth/session', function (Request $q) {
    Auth::start($q);
    $u = Auth::user();
    return [
        'user' => $u ? ['id' => $u['id'], 'email' => $u['email'], 'full_name' => $u['full_name']] : null,
        'role' => $u['role_id'] ?? null,
        'permissions' => Auth::permissions(),
        'csrf_token' => Auth::csrfToken(),
        'needs_setup' => UserService::needsSetup(),
    ];
});
$r->post('/auth/login', function (Request $q) {
    Auth::start($q);
    Auth::verifyCsrf($q);
    $u = Auth::login($q, $q->str('email', 254), (string) $q->input('password', ''));
    return ['user' => ['id' => $u['id'], 'email' => $u['email'], 'full_name' => $u['full_name']], 'role' => $u['role_id'], 'permissions' => Auth::permissions(), 'csrf_token' => Auth::csrfToken()];
});
$r->post('/auth/logout', function (Request $q) {
    Auth::start($q);
    Auth::verifyCsrf($q);
    Auth::logout();
    return ['ok' => true, 'csrf_token' => Auth::csrfToken()];
});
$r->post('/auth/forgot', function (Request $q) {
    Auth::start($q);
    Auth::verifyCsrf($q);
    RateLimiter::hit('forgot_ip', $q->ip(), 5, 900);
    $email = strtolower($q->str('email', 254));
    RateLimiter::hit('forgot_email', $email, 3, 3600);
    $u = \App\Support\Db::one('SELECT id, active, password_hash FROM users WHERE email = :e', ['e' => $email]);
    if ($u && $u['active']) {
        Auth::issuePasswordToken($u['id'], $u['password_hash'] === null ? 'convite' : 'reset');
    }
    return ['ok' => true]; // mesma resposta exista ou não a conta
});
$r->post('/auth/reset', function (Request $q) {
    Auth::start($q);
    Auth::verifyCsrf($q);
    RateLimiter::hit('reset_ip', $q->ip(), 10, 900);
    Auth::resetWithToken((string) $q->input('token', ''), (string) $q->input('password', ''));
    return ['ok' => true];
});
$r->post('/auth/password', function (Request $q) {
    $u = Auth::require($q);
    $row = \App\Support\Db::one('SELECT password_hash FROM users WHERE id = :id', ['id' => $u['id']]);
    if (!password_verify((string) $q->input('current_password', ''), (string) ($row['password_hash'] ?? ''))) {
        throw new ApiError('CREDENCIAIS_INVALIDAS', 401);
    }
    Auth::setPassword($u['id'], (string) $q->input('new_password', ''));
    Audit::log('auth.palavra_passe_alterada', 'user', $u['id']);
    return ['ok' => true, 'csrf_token' => Auth::csrfToken()];
});
// Diagnóstico do alojamento sem Terminal: só com o SETUP_TOKEN do .env (desactiva-se ao apagá-lo)
$r->post('/setup/check', function (Request $q) {
    RateLimiter::hit('setup_check', $q->ip(), 10, 3600);
    $expected = \App\Support\Env::get('SETUP_TOKEN', '');
    if ($expected === '' || strlen($expected) < 16 || !hash_equals($expected, (string) $q->input('setup_token', ''))) {
        throw new ApiError('SETUP_TOKEN_INVALIDO', 403);
    }
    $checks = \App\Support\Diagnostics::run();
    $checks[] = ['check' => 'Pedido recebido por HTTPS', 'ok' => $q->isHttps(), 'detail' => $q->isHttps() ? 'sim' : 'não — active o SSL (AutoSSL)', 'required' => false];
    return ['checks' => $checks];
});
$r->post('/setup/admin', function (Request $q) {
    Auth::start($q);
    Auth::verifyCsrf($q);
    RateLimiter::hit('setup', $q->ip(), 10, 3600);
    return UserService::setupFirstAdmin((string) $q->input('setup_token', ''), $q->json());
});

// =============================================================================
// PAINEL ADMINISTRATIVO
// =============================================================================
$r->get('/admin/dashboard', function (Request $q) {
    Auth::require($q, 'dashboard.view');
    return AdminQueryService::dashboard();
});

// Pedidos, participantes e pagamentos
$r->get('/admin/orders', function (Request $q) {
    Auth::require($q, 'orders.view');
    return AdminQueryService::listOrders($q->query);
});
$r->get('/admin/orders/{id}', function (Request $q) use ($id) {
    Auth::require($q, 'orders.view');
    return AdminQueryService::orderDetail($id($q));
});
$r->post('/admin/orders/{id}/review', function (Request $q) use ($id) {
    Auth::require($q, 'payments.review');
    return PaymentService::markInReview($id($q));
});
$r->post('/admin/orders/{id}/approve', function (Request $q) use ($id) {
    Auth::require($q, 'payments.review');
    return PaymentService::approve($id($q), $q->str('payment_reference', 80), $q->input('amount_confirmed'), $q->str('method', 20), $q->str('note', 500) ?: null);
});
$r->post('/admin/orders/{id}/reject', function (Request $q) use ($id) {
    Auth::require($q, 'payments.review');
    return PaymentService::reject($id($q), $q->str('reason', 600));
});
$r->post('/admin/orders/{id}/cancel', function (Request $q) use ($id) {
    Auth::require($q, 'orders.cancel');
    return PaymentService::cancel($id($q), $q->str('reason', 600));
});
$r->post('/admin/orders/{id}/resend', function (Request $q) use ($id) {
    Auth::require($q, 'tickets.resend');
    return PaymentService::resendTickets($id($q));
});
$r->post('/admin/orders/{id}/access-link', function (Request $q) use ($id) {
    Auth::require($q, 'tickets.resend');
    return PaymentService::accessLink($id($q));
});
$r->get('/admin/proofs/{id}/file', function (Request $q) use ($id) {
    Auth::require($q, 'payments.review');
    [$path, $p] = ProofService::file($id($q));
    return Response::stream($path, $p['mime_type'], 'comprovativo-' . substr($p['id'], 0, 8) . '.' . pathinfo($path, PATHINFO_EXTENSION));
});

// Check-in
$r->post('/admin/checkin', function (Request $q) {
    Auth::require($q, 'checkin.scan');
    return CheckinService::check($q->str('input', 200), (bool) $q->input('commit', true));
});

// Categorias de ingresso
$r->get('/admin/ticket-types/{id}/price-history', function (Request $q) use ($id) {
    Auth::require($q, 'ticket_types.manage');
    return TicketCategoryService::priceHistory($id($q));
});
$r->get('/admin/ticket-types', function (Request $q) {
    Auth::require($q, 'ticket_types.manage');
    return TicketCategoryService::listAdmin();
});
$r->post('/admin/ticket-types', function (Request $q) {
    Auth::require($q, 'ticket_types.manage');
    return Response::json(TicketCategoryService::create($q->json()), 201);
});
$r->put('/admin/ticket-types/{id}', function (Request $q) use ($id) {
    Auth::require($q, 'ticket_types.manage');
    return TicketCategoryService::update($id($q), $q->json());
});
$r->delete('/admin/ticket-types/{id}', function (Request $q) use ($id) {
    Auth::require($q, 'ticket_types.manage');
    TicketCategoryService::delete($id($q));
    return ['ok' => true];
});

$r->get('/admin/settings', function (Request $q) {
    Auth::require($q, 'settings.manage');
    return SettingsService::full();
});
// Validação administrativa das coordenadas de pagamento (condição para vender)
$r->post('/admin/settings/payment-confirmation', function (Request $q) {
    $u = Auth::require($q, 'settings.manage');
    return SettingsService::confirmPayment((bool) $q->input('confirm', false), $u);
});
// Configurações (vendas abertas/fechadas exige gestão de ingressos ou configurações)
$r->put('/admin/settings', function (Request $q) {
    $in = $q->json();
    $onlySales = array_keys($in) === ['sales_open'];
    $u = Auth::require($q);
    if (!Auth::can('settings.manage') && !($onlySales && Auth::can('ticket_types.manage'))) {
        throw new ApiError('SEM_PERMISSAO', 403);
    }
    return SettingsService::update($in, $u['id']);
});

// Conteúdos: timeline | members | faqs
foreach (['timeline', 'members', 'faqs'] as $type) {
    $r->get("/admin/content/$type", function (Request $q) use ($type) {
        Auth::require($q, 'content.manage');
        return ContentService::listAdmin($type);
    });
    $r->post("/admin/content/$type", function (Request $q) use ($type) {
        Auth::require($q, 'content.manage');
        return Response::json(ContentService::create($type, $q->json()), 201);
    });
    $r->put("/admin/content/$type/{id}", function (Request $q) use ($type, $id) {
        Auth::require($q, 'content.manage');
        return ContentService::update($type, $id($q), $q->json());
    });
    $r->delete("/admin/content/$type/{id}", function (Request $q) use ($type, $id) {
        Auth::require($q, 'content.manage');
        ContentService::delete($type, $id($q));
        return ['ok' => true];
    });
}

// Galeria e uploads de imagens
$r->get('/admin/media', function (Request $q) {
    Auth::require($q, 'content.manage');
    return MediaService::listAdmin((string) ($q->query['section'] ?? 'memorias'));
});
$r->post('/admin/media/upload', function (Request $q) {
    Auth::require($q, 'content.manage');
    return Response::json(MediaService::upload($q->files['file'] ?? [], (string) ($_POST['section'] ?? 'memorias'), trim((string) ($_POST['title'] ?? ''))), 201);
});
$r->post('/admin/media/youtube', function (Request $q) {
    Auth::require($q, 'content.manage');
    return Response::json(MediaService::addYoutube($q->str('url', 300), $q->str('section', 20), $q->str('title', 160)), 201);
});
$r->put('/admin/media/{id}', function (Request $q) use ($id) {
    Auth::require($q, 'content.manage');
    return MediaService::update($id($q), $q->json());
});
$r->delete('/admin/media/{id}', function (Request $q) use ($id) {
    Auth::require($q, 'content.manage');
    MediaService::delete($id($q));
    return ['ok' => true];
});
$r->post('/admin/uploads/image', function (Request $q) {
    Auth::require($q);
    $folder = (string) ($_POST['folder'] ?? '');
    $perm = match ($folder) { 'historia', 'integrantes' => 'content.manage', 'site' => 'site.manage', default => null };
    if ($perm === null || !Auth::can($perm)) {
        throw new ApiError('SEM_PERMISSAO', 403);
    }
    $up = MediaService::store($q->files['file'] ?? [], $folder, false);
    Audit::log('media.imagem_carregada', 'media', null, ['path' => $up['path']]);
    return Response::json($up, 201);
});

// Emails
$r->get('/admin/emails', function (Request $q) {
    Auth::require($q, 'emails.manage');
    return MailQueue::list();
});
$r->get('/admin/emails/status', function (Request $q) {
    Auth::require($q, 'emails.manage');
    return MailQueue::smtpStatus();
});
$r->post('/admin/emails/process', function (Request $q) {
    Auth::require($q, 'emails.manage');
    return MailQueue::process();
});
$r->post('/admin/emails/test', function (Request $q) {
    Auth::require($q, 'emails.manage');
    $to = strtolower($q->str('to', 254));
    if (!filter_var($to, FILTER_VALIDATE_EMAIL)) {
        throw new ApiError('EMAIL_INVALIDO', 422);
    }
    MailQueue::enqueue('teste_smtp', $to, null);
    Audit::log('email.teste', 'email_outbox', null, ['para' => $to]);
    return ['ok' => true];
});
$r->post('/admin/emails/reminders', function (Request $q) {
    Auth::require($q, 'emails.manage');
    return ['queued' => MailQueue::queueReminders()];
});
$r->post('/admin/emails/{eid}/retry', function (Request $q) {
    Auth::require($q, 'emails.manage');
    \App\Support\Db::run("UPDATE email_outbox SET status = 'pendente', last_error = NULL, attempts = 0 WHERE id = :id AND status IN ('falhou','cancelado')", ['id' => (int) $q->params['eid']]);
    return ['ok' => true];
});

// Relatórios
$r->get('/admin/reports/orders.csv', function (Request $q) {
    Auth::require($q, 'reports.view');
    return ReportService::orders($q->query);
});
$r->get('/admin/reports/vip.csv', function (Request $q) {
    Auth::require($q, 'vip.manage');
    return ReportService::vip();
});
$r->get('/admin/reports/tickets.csv', function (Request $q) {
    Auth::require($q, 'reports.view');
    return ReportService::tickets();
});
$r->get('/admin/reports/checkins.csv', function (Request $q) {
    Auth::require($q, 'reports.checkins');
    return ReportService::checkins();
});
$r->get('/admin/reports/summary', function (Request $q) {
    Auth::require($q, 'reports.view');
    return ReportService::summary($q->query);
});

// Utilizadores
$r->get('/admin/users', function (Request $q) {
    Auth::require($q, 'users.manage');
    return UserService::list();
});
$r->post('/admin/users', function (Request $q) {
    Auth::require($q, 'users.manage');
    return Response::json(UserService::create($q->json()), 201);
});
$r->put('/admin/users/{id}', function (Request $q) use ($id) {
    Auth::require($q, 'users.manage');
    return UserService::update($id($q), $q->json());
});
$r->post('/admin/users/{id}/reset', function (Request $q) use ($id) {
    Auth::require($q, 'users.manage');
    return UserService::sendReset($id($q));
});

// Gestão do website (CMS)
$r->get('/admin/site', function (Request $q) {
    Auth::require($q, 'site.manage');
    return SiteService::adminList();
});
$r->get('/admin/site/preview', function (Request $q) {
    Auth::require($q, 'site.manage');
    return SiteService::preview();
});
$r->put('/admin/site/order', function (Request $q) {
    Auth::require($q, 'site.manage');
    return SiteService::reorder((array) $q->input('keys', []));
});
$r->put('/admin/site/{key}', function (Request $q) {
    Auth::require($q, 'site.manage');
    return SiteService::saveDraft((string) $q->params['key'], (array) $q->input('data', []), (bool) $q->input('publish', false));
});
$r->post('/admin/site/{key}/publish', function (Request $q) {
    Auth::require($q, 'site.manage');
    return SiteService::publish((string) $q->params['key']);
});
$r->post('/admin/site/{key}/discard', function (Request $q) {
    Auth::require($q, 'site.manage');
    return SiteService::discardDraft((string) $q->params['key']);
});
$r->put('/admin/site/{key}/visibility', function (Request $q) {
    Auth::require($q, 'site.manage');
    return SiteService::setEnabled((string) $q->params['key'], (bool) $q->input('enabled', true));
});
$r->get('/admin/site/{key}/revisions', function (Request $q) {
    Auth::require($q, 'site.manage');
    return SiteService::revisions((string) $q->params['key']);
});
$r->post('/admin/site/{key}/restore', function (Request $q) {
    Auth::require($q, 'site.manage');
    return SiteService::restore((string) $q->params['key'], (int) $q->input('revision_id', 0));
});

// Galeria dos eventos
$r->get('/admin/gallery/albums', function (Request $q) {
    Auth::require($q, 'gallery.manage');
    return GalleryService::listAdmin();
});
$r->post('/admin/gallery/albums', function (Request $q) {
    Auth::require($q, 'gallery.manage');
    return Response::json(GalleryService::createAlbum($q->json()), 201);
});
$r->get('/admin/gallery/albums/{id}', function (Request $q) use ($id) {
    Auth::require($q, 'gallery.manage');
    return GalleryService::albumAdmin($id($q));
});
$r->put('/admin/gallery/albums/{id}', function (Request $q) use ($id) {
    Auth::require($q, 'gallery.manage');
    return GalleryService::updateAlbum($id($q), $q->json());
});
$r->delete('/admin/gallery/albums/{id}', function (Request $q) use ($id) {
    Auth::require($q, 'gallery.manage');
    GalleryService::deleteAlbum($id($q));
    return ['ok' => true];
});
$r->post('/admin/gallery/albums/{id}/items', function (Request $q) use ($id) {
    Auth::require($q, 'gallery.manage');
    return Response::json(GalleryService::upload($id($q), $q->files['file'] ?? [], (string) ($_POST['caption'] ?? ''), (string) ($_POST['alt_text'] ?? '')), 201);
});
$r->post('/admin/gallery/albums/{id}/videos', function (Request $q) use ($id) {
    Auth::require($q, 'gallery.manage');
    return Response::json(GalleryService::addVideoUrl($id($q), $q->str('url', 500), $q->str('caption', 500)), 201);
});
$r->put('/admin/gallery/albums/{id}/order', function (Request $q) use ($id) {
    Auth::require($q, 'gallery.manage');
    return GalleryService::reorder($id($q), (array) $q->input('ids', []));
});
$r->put('/admin/gallery/items/{id}', function (Request $q) use ($id) {
    Auth::require($q, 'gallery.manage');
    return GalleryService::updateItem($id($q), $q->json());
});
$r->post('/admin/gallery/items/{id}/replace', function (Request $q) use ($id) {
    Auth::require($q, 'gallery.manage');
    return GalleryService::replaceFile($id($q), $q->files['file'] ?? []);
});
$r->delete('/admin/gallery/items/{id}', function (Request $q) use ($id) {
    Auth::require($q, 'gallery.manage');
    GalleryService::deleteItem($id($q));
    return ['ok' => true];
});

// VIP
$r->get('/admin/vip', function (Request $q) {
    Auth::require($q, 'vip.manage');
    return VipService::adminList($q->query);
});
$r->get('/admin/vip/{id}', function (Request $q) use ($id) {
    Auth::require($q, 'vip.manage');
    return VipService::adminDetail($id($q));
});
$r->put('/admin/vip/{id}', function (Request $q) use ($id) {
    Auth::require($q, 'vip.manage');
    return VipService::update($id($q), $q->json());
});
$r->post('/admin/vip/{id}/proposals', function (Request $q) use ($id) {
    Auth::require($q, 'vip.manage');
    return Response::json(VipService::propose($id($q), $q->json()), 201);
});
$r->post('/admin/vip/{id}/access-link', function (Request $q) use ($id) {
    Auth::require($q, 'vip.manage');
    return VipService::accessLink($id($q));
});

// Auditoria
$r->get('/admin/audit', function (Request $q) {
    Auth::require($q, 'audit.view');
    return AdminQueryService::audit((int) ($q->query['page'] ?? 0));
});

return $r;
