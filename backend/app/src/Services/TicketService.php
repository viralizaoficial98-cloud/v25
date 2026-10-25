<?php
declare(strict_types=1);

namespace App\Services;

use App\Support\Config;
use App\Support\Db;
use App\Support\Util;
use chillerlan\QRCode\Common\EccLevel;
use chillerlan\QRCode\Output\QROutputInterface;
use chillerlan\QRCode\QRCode;
use chillerlan\QRCode\QROptions;

final class TicketService
{
    /** Assinatura HMAC-SHA256 do código (22 caracteres base64url). O QR não contém dados pessoais. */
    public static function qrSignature(string $ticketCode): string
    {
        return substr(Util::b64url(hash_hmac('sha256', 'V25|' . $ticketCode, Config::appKey(), true)), 0, 22);
    }

    public static function qrPayload(string $ticketCode): string
    {
        return 'V25:' . $ticketCode . ':' . self::qrSignature($ticketCode);
    }

    /** Emite um ingresso por unidade (idempotente: UNIQUE(order_id, seq)). Chamar dentro da transacção de aprovação. */
    public static function issue(array $order, array $item, string $holderName): int
    {
        $n = 0;
        for ($i = 1; $i <= (int) $item['quantity']; $i++) {
            if (Db::value('SELECT 1 FROM tickets WHERE order_id = :o AND seq = :s', ['o' => $order['id'], 's' => $i])) {
                continue;
            }
            do {
                $code = 'T-' . Util::randomCode(8);
            } while (Db::value('SELECT 1 FROM tickets WHERE ticket_code = :c', ['c' => $code]));
            Db::insert('tickets', [
                'id' => Util::uuid(), 'order_id' => $order['id'], 'category_id' => $item['category_id'],
                'ticket_code' => $code, 'seq' => $i, 'holder_name' => $holderName,
            ]);
            $n++;
        }
        return $n;
    }

    public static function qrPng(string $payload, int $scale = 10): string
    {
        $options = new QROptions([
            'outputType' => QROutputInterface::GDIMAGE_PNG,
            'eccLevel' => EccLevel::M,
            'scale' => $scale,
            'quietzoneSize' => 1,
            'outputBase64' => false,
        ]);
        return (string) (new QRCode($options))->render($payload);
    }

    private static function cp(string $s): string
    {
        $r = @iconv('UTF-8', 'windows-1252//TRANSLIT', $s);
        return $r === false ? (string) mb_convert_encoding($s, 'Windows-1252', 'UTF-8') : $r;
    }

    /** PDF com um ingresso por página (210 × 99 mm), mesma identidade visual do site. */
    public static function pdf(array $order): string
    {
        $view = OrderService::customerView($order);
        $s = SettingsService::public();
        $tz = new \DateTimeZone('Africa/Luanda');
        $start = (new \DateTimeImmutable($s['starts_at']))->setTimezone($tz);
        $months = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
        $date = $start->format('j') . ' de ' . $months[(int) $start->format('n') - 1] . ' de ' . $start->format('Y');
        $time = $start->format('H') . 'h' . $start->format('i');

        $pdf = new \FPDF('L', 'mm', [99, 210]);
        $pdf->SetAutoPageBreak(false);
        $pdf->SetTitle(self::cp('Ingressos ' . $view['order_code'] . ' — V25 O Legado'));
        $pdf->SetAuthor(self::cp($s['group_name']));
        $tmpFiles = [];
        try {
            foreach ($view['tickets'] as $t) {
                if ($t['status'] === 'anulado') {
                    continue;
                }
                $pdf->AddPage();
                $pdf->SetFillColor(11, 8, 6);
                $pdf->Rect(0, 0, 210, 99, 'F');
                $pdf->SetDrawColor(201, 164, 92);
                $pdf->SetLineWidth(0.6);
                $pdf->Rect(4, 4, 202, 91);
                $pdf->SetLineWidth(0.2);
                $pdf->Rect(6, 6, 198, 87);
                for ($y = 8; $y < 91; $y += 2.4) {
                    $pdf->Line(146, $y, 146, $y + 1.2);
                }
                $pdf->SetTextColor(201, 164, 92);
                $pdf->SetFont('Helvetica', 'B', 8);
                $pdf->Text(14, 16, self::cp(mb_strtoupper(str_replace('–', '-', $s['group_name']))));
                $pdf->SetFont('Times', 'B', 30);
                $pdf->SetTextColor(232, 207, 142);
                $pdf->Text(14, 31, 'V25');
                $pdf->SetFont('Times', 'B', 16);
                $pdf->SetTextColor(244, 234, 216);
                $pdf->Text(37, 31, 'O LEGADO');
                $pdf->SetFont('Helvetica', '', 7.5);
                $pdf->SetTextColor(170, 150, 120);
                $pdf->Text(14, 37, self::cp($s['subtitle']));
                $label = function (float $x, float $y, string $k, string $v, float $w = 60) use ($pdf) {
                    $pdf->SetFont('Helvetica', 'B', 6.5);
                    $pdf->SetTextColor(201, 164, 92);
                    $pdf->Text($x, $y, self::cp(mb_strtoupper($k)));
                    $pdf->SetFont('Helvetica', '', 10);
                    $pdf->SetTextColor(244, 234, 216);
                    $pdf->SetXY($x - 1, $y + 1.2);
                    $pdf->MultiCell($w, 4.6, self::cp($v), 0, 'L');
                };
                $label(14, 48, 'Participante', $t['holder_name'], 125);
                $label(14, 62, 'Data', $date, 44);
                $label(60, 62, 'Hora', $time, 28);
                $label(90, 62, 'Categoria', $view['ticket_type']['name'] . ($view['ticket_type']['lot_label'] ? ' · ' . $view['ticket_type']['lot_label'] : ''), 52);
                $label(14, 76, 'Local', $s['venue'] . ' — ' . $s['address'], 128);
                $pdf->SetFont('Helvetica', '', 6.5);
                $pdf->SetTextColor(170, 150, 120);
                $pdf->Text(14, 88, self::cp(sprintf('Pedido %s · Ingresso %d/%d · %s', $view['order_code'], $t['seq'], $view['quantity'], $t['status'] === 'utilizado' ? 'JÁ UTILIZADO' : 'VÁLIDO')));

                $tmp = tempnam(Config::storagePath('tmp'), 'qr') ?: tempnam(sys_get_temp_dir(), 'qr');
                $png = $tmp . '.png';
                file_put_contents($png, self::qrPng($t['qr_payload'], 8));
                $tmpFiles[] = $tmp;
                $tmpFiles[] = $png;
                $pdf->SetFillColor(255, 255, 255);
                $pdf->Rect(154, 14, 46, 46, 'F');
                $pdf->Image($png, 156, 16, 42, 42, 'PNG');
                $pdf->SetFont('Courier', 'B', 11);
                $pdf->SetTextColor(232, 207, 142);
                $pdf->SetXY(150, 63);
                $pdf->Cell(54, 5, $t['ticket_code'], 0, 2, 'C');
                $pdf->SetFont('Helvetica', '', 6);
                $pdf->SetTextColor(170, 150, 120);
                foreach (['Apresente este código à entrada.', 'Válido para uma única utilização.', 'Não partilhe este ingresso.'] as $line) {
                    $pdf->Cell(54, 3, self::cp($line), 0, 2, 'C');
                }
            }
            return $pdf->Output('S');
        } finally {
            foreach ($tmpFiles as $f) {
                @unlink($f);
            }
        }
    }
}
