import { z } from 'zod';
import { parsePhoneNumberFromString, type CountryCode } from 'libphonenumber-js/min';
import { MAX_PROOF_BYTES, PROOF_MIME_TYPES } from './config';

/** Normaliza para E.164 (+244923456789) ou devolve null se inválido. Regras iguais às do backend. */
export function normalizePhone(raw: string, country: CountryCode = 'AO'): string | null {
  const p = parsePhoneNumberFromString(raw.trim(), country);
  if (!p || !p.isPossible()) return null;
  const e164 = p.number;
  if (!/^\+[1-9][0-9]{6,14}$/.test(e164)) return null;
  if (e164.startsWith('+244') && !/^\+244[29][0-9]{8}$/.test(e164)) return null;
  return e164;
}

export function normalizeName(raw: string) {
  return raw.trim().replace(/\s+/g, ' ');
}

export const registrationSchema = z
  .object({
    fullName: z
      .string()
      .transform(normalizeName)
      .refine((v) => v.length >= 3 && v.length <= 120, 'Indique o seu nome completo.')
      .refine((v) => /\p{L}.*\s.*\p{L}/u.test(v), 'Indique nome e apelido.'),
    email: z
      .string()
      .trim()
      .toLowerCase()
      .max(254, 'Email demasiado longo.')
      .regex(/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/, 'Indique um email válido.'),
    phoneCountry: z.string().length(2),
    phone: z.string().min(6, 'Indique o seu telefone.'),
    ticketTypeId: z.string().uuid('Escolha uma categoria de ingresso.'),
    quantity: z.number().int().min(1, 'Mínimo 1 ingresso.'),
    guestsTotal: z.number().int().min(1),
    consent: z.literal(true, { error: 'É necessário o seu consentimento para continuar.' }),
  })
  .superRefine((v, ctx) => {
    if (!normalizePhone(v.phone, v.phoneCountry as CountryCode)) {
      ctx.addIssue({ code: 'custom', path: ['phone'], message: 'Número de telefone inválido para o país escolhido.' });
    }
  });

export type RegistrationInput = z.input<typeof registrationSchema>;

/** Limites que dependem da categoria escolhida (espelham create_order). */
export function validateQuantities(
  quantity: number,
  guests: number,
  t: { max_per_order: number; available: number; persons_per_ticket: number },
): { quantity?: string; guestsTotal?: string } {
  const errors: { quantity?: string; guestsTotal?: string } = {};
  if (quantity < 1) errors.quantity = 'Mínimo 1 ingresso.';
  else if (quantity > t.max_per_order) errors.quantity = `Máximo ${t.max_per_order} por pedido.`;
  else if (quantity > t.available) errors.quantity = `Apenas ${t.available} disponíveis.`;
  if (guests < quantity || guests > quantity * t.persons_per_ticket) {
    errors.guestsTotal =
      t.persons_per_ticket === 1
        ? 'O número de convidados deve ser igual ao número de ingressos.'
        : `Entre ${quantity} e ${quantity * t.persons_per_ticket} convidados para ${quantity} ingresso(s).`;
  }
  return errors;
}

function readBytes(blob: Blob): Promise<ArrayBuffer> {
  if (typeof blob.arrayBuffer === 'function') return blob.arrayBuffer();
  // Navegadores antigos (e jsdom) sem Blob.arrayBuffer
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as ArrayBuffer);
    r.onerror = () => reject(r.error);
    r.readAsArrayBuffer(blob);
  });
}

/** Valida tipo (pelos bytes iniciais, não só pela extensão) e tamanho do comprovativo. */
export async function validateProofFile(file: File): Promise<{ ok: true; mime: (typeof PROOF_MIME_TYPES)[number] } | { ok: false; error: string }> {
  if (file.size === 0) return { ok: false, error: 'O ficheiro está vazio.' };
  if (file.size > MAX_PROOF_BYTES) return { ok: false, error: 'O ficheiro excede o limite de 5 MB.' };
  const head = new Uint8Array(await readBytes(file.slice(0, 8)));
  const is = (...sig: number[]) => sig.every((b, i) => head[i] === b);
  let mime: (typeof PROOF_MIME_TYPES)[number] | null = null;
  if (is(0x25, 0x50, 0x44, 0x46)) mime = 'application/pdf';
  else if (is(0xff, 0xd8, 0xff)) mime = 'image/jpeg';
  else if (is(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) mime = 'image/png';
  if (!mime) return { ok: false, error: 'Formato não aceite. Envie PDF, JPG ou PNG.' };
  return { ok: true, mime };
}
