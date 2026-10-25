import QRCode from 'qrcode';

/** QR Code para mostrar no ecrã (o PDF dos ingressos é gerado pelo servidor). */
export function qrDataUrl(payload: string, size = 512) {
  return QRCode.toDataURL(payload, {
    errorCorrectionLevel: 'M',
    margin: 1,
    width: size,
    color: { dark: '#0b0806', light: '#ffffff' },
  });
}
