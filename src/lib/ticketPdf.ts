import QRCode from 'qrcode';
import type { CustomerOrder, EventSettings } from './types';
import { formatEventDate, formatEventTime } from './format';

const GOLD: [number, number, number] = [201, 164, 92];
const GOLD_LIGHT: [number, number, number] = [232, 207, 142];
const CREAM: [number, number, number] = [244, 234, 216];
const INK: [number, number, number] = [11, 8, 6];
const MUTED: [number, number, number] = [170, 150, 120];

export function qrDataUrl(payload: string, size = 512) {
  return QRCode.toDataURL(payload, {
    errorCorrectionLevel: 'M',
    margin: 1,
    width: size,
    color: { dark: '#0b0806', light: '#ffffff' },
  });
}

/** PDF com um ingresso por página (210 × 99 mm). O QR contém apenas o código assinado. */
export async function downloadTicketsPdf(order: CustomerOrder, settings: EventSettings) {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: [99, 210] });
  const W = 210;
  const H = 99;
  const tickets = order.tickets.filter((t) => t.status !== 'anulado');

  for (let i = 0; i < tickets.length; i++) {
    const t = tickets[i];
    if (i > 0) doc.addPage([99, 210], 'landscape');
    doc.setFillColor(...INK);
    doc.rect(0, 0, W, H, 'F');
    doc.setDrawColor(...GOLD);
    doc.setLineWidth(0.6);
    doc.roundedRect(4, 4, W - 8, H - 8, 3, 3, 'S');
    doc.setLineWidth(0.2);
    doc.roundedRect(6, 6, W - 12, H - 12, 2, 2, 'S');
    // Separador picotado
    doc.setLineDashPattern([1.2, 1.2], 0);
    doc.line(146, 8, 146, H - 8);
    doc.setLineDashPattern([], 0);

    doc.setTextColor(...GOLD);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.text(settings.group_name.toUpperCase().replace('–', '-'), 14, 16, { charSpace: 1.2 });

    doc.setFont('times', 'bold');
    doc.setTextColor(...GOLD_LIGHT);
    doc.setFontSize(30);
    doc.text('V25', 14, 31);
    doc.setFontSize(16);
    doc.setTextColor(...CREAM);
    doc.text('O LEGADO', 37, 31);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(...MUTED);
    doc.text('25 Anos de Música, Fé, Amizade e História', 14, 37);

    const label = (x: number, y: number, k: string, v: string, w = 60) => {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(6.5);
      doc.setTextColor(...GOLD);
      doc.text(k.toUpperCase(), x, y, { charSpace: 0.6 });
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
      doc.setTextColor(...CREAM);
      doc.text(doc.splitTextToSize(v, w).slice(0, 2), x, y + 5);
    };
    label(14, 48, 'Participante', t.holder_name, 120);
    label(14, 62, 'Data', formatEventDate(settings.starts_at));
    label(60, 62, 'Hora', formatEventTime(settings.starts_at));
    label(90, 62, 'Categoria', `${order.ticket_type.name}${order.ticket_type.lot_label ? ` · ${order.ticket_type.lot_label}` : ''}`, 52);
    label(14, 76, 'Local', `${settings.venue} — ${settings.address}`, 125);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.5);
    doc.setTextColor(...MUTED);
    doc.text(`Pedido ${order.order_code} · Ingresso ${t.seq}/${order.quantity} · ${t.status === 'utilizado' ? 'JÁ UTILIZADO' : 'VÁLIDO'}`, 14, H - 11);

    const qr = await qrDataUrl(t.qr_payload, 600);
    doc.setFillColor(255, 255, 255);
    doc.roundedRect(154, 14, 46, 46, 2, 2, 'F');
    doc.addImage(qr, 'PNG', 156, 16, 42, 42);
    doc.setFont('courier', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(...GOLD_LIGHT);
    doc.text(t.ticket_code, 177, 68, { align: 'center' });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6);
    doc.setTextColor(...MUTED);
    doc.text(['Apresente este código à entrada.', 'Válido para uma única utilização.', 'Não partilhe este ingresso.'], 177, 75, {
      align: 'center',
    });
  }
  doc.setProperties({ title: `Ingressos ${order.order_code} — V25 O Legado`, author: settings.group_name });
  doc.save(`V25-ingressos-${order.order_code}.pdf`);
}
