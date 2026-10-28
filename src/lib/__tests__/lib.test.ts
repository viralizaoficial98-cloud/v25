import { describe, expect, it } from 'vitest';
import { formatEventDate, formatEventTime, formatKz, fromLuandaInput, remainingUntil, toLuandaInput } from '../format';
import { normalizePhone, registrationSchema, validateProofFile, validateQuantities } from '../validation';
import { errorMessage } from '../errors';
import { toCsv } from '../csv';
import { orderPath, tokenFromHash } from '../orderAccess';
import { stepIndex } from '../status';

const EVENT = '2026-12-20T16:00:00+01:00';

describe('data do evento e contagem regressiva (Africa/Luanda)', () => {
  it('mostra 20 de Dezembro de 2026, 16h00', () => {
    expect(formatEventDate(EVENT)).toBe('20 de Dezembro de 2026');
    expect(formatEventTime(EVENT)).toBe('16h00');
  });
  it('16h00 em Luanda corresponde a 15h00 UTC', () => {
    const r = remainingUntil(EVENT, Date.parse('2026-12-20T14:59:00Z'));
    expect(r).toMatchObject({ days: 0, hours: 0, minutes: 1, seconds: 0, done: false });
  });
  it('termina no momento do evento', () => {
    expect(remainingUntil(EVENT, Date.parse('2026-12-20T15:00:00Z')).done).toBe(true);
  });
  it('converte datetime-local de Luanda nos dois sentidos', () => {
    expect(toLuandaInput('2026-12-20T15:00:00Z')).toBe('2026-12-20T16:00');
    expect(Date.parse(fromLuandaInput('2026-12-20T16:00')!)).toBe(Date.parse(EVENT));
  });
});

describe('formatação em Kz', () => {
  it('usa separador de milhares com espaço e sufixo Kz', () => {
    expect(formatKz(15000)).toBe('15 000 Kz');
    expect(formatKz('1250000.5')).toBe('1 250 000,5 Kz');
    expect(formatKz(null)).toBe('—');
  });
});

describe('validação da inscrição', () => {
  const base = {
    fullName: '  Maria   da Silva ',
    email: ' Maria@Exemplo.AO ',
    phoneCountry: 'AO',
    phone: '923 456 789',
    ticketTypeId: '8b7c6a1e-1111-4a2b-9c3d-123456789abc',
    quantity: 1,
    guestsTotal: 1,
    consent: true as const,
  };
  it('aceita dados válidos e normaliza', () => {
    const r = registrationSchema.parse(base);
    expect(r.fullName).toBe('Maria da Silva');
    expect(r.email).toBe('maria@exemplo.ao');
  });
  it('exige nome e apelido, email válido e consentimento', () => {
    const r = registrationSchema.safeParse({ ...base, fullName: 'Maria', email: 'x@y', consent: false });
    expect(r.success).toBe(false);
    const paths = r.success ? [] : r.error.issues.map((i) => i.path[0]);
    expect(paths).toEqual(expect.arrayContaining(['fullName', 'email', 'consent']));
  });
  it('telefone: Angola por omissão e internacionais', () => {
    expect(normalizePhone('923 456 789')).toBe('+244923456789');
    expect(normalizePhone('+351 912 345 678')).toBe('+351912345678');
    expect(normalizePhone('812345678')).toBeNull();
    expect(normalizePhone('12')).toBeNull();
  });
  it('limites de quantidade e convidados', () => {
    const t = { max_per_order: 4, available: 3, persons_per_ticket: 1 };
    expect(validateQuantities(5, 5, t).quantity).toMatch(/Máximo 4/);
    expect(validateQuantities(4, 4, t).quantity).toMatch(/Apenas 3/);
    expect(validateQuantities(2, 3, t).guestsTotal).toBeTruthy();
    expect(validateQuantities(2, 7, { ...t, persons_per_ticket: 4 })).toEqual({});
  });
});

describe('validação do comprovativo', () => {
  const file = (bytes: number[], name: string, size?: number) => {
    const f = new File([new Uint8Array(bytes)], name);
    if (size) Object.defineProperty(f, 'size', { value: size });
    return f;
  };
  it('reconhece PDF/JPG/PNG pelos bytes iniciais', async () => {
    expect(await validateProofFile(file([0x25, 0x50, 0x44, 0x46, 0x2d], 'a.pdf'))).toEqual({ ok: true, mime: 'application/pdf' });
    expect(await validateProofFile(file([0xff, 0xd8, 0xff, 0xe0], 'a.jpg'))).toEqual({ ok: true, mime: 'image/jpeg' });
    expect(await validateProofFile(file([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 'a.png'))).toEqual({ ok: true, mime: 'image/png' });
  });
  it('recusa ficheiros disfarçados, vazios ou grandes', async () => {
    expect((await validateProofFile(file([0x3c, 0x68, 0x74, 0x6d, 0x6c], 'falso.pdf'))).ok).toBe(false);
    expect((await validateProofFile(file([], 'vazio.pdf'))).ok).toBe(false);
    expect((await validateProofFile(file([0x25, 0x50, 0x44, 0x46], 'g.pdf', 6 * 1024 * 1024))).ok).toBe(false);
    // extensão diferente do conteúdo real
    expect((await validateProofFile(file([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 'talao.pdf'))).ok).toBe(false);
    expect((await validateProofFile(file([0x25, 0x50, 0x44, 0x46, 0x2d], 'talao.php'))).ok).toBe(false);
  });
});

describe('utilitários', () => {
  it('traduz códigos de erro do servidor', () => {
    expect(errorMessage({ message: 'ESGOTADO' })).toMatch(/não há lugares/);
    expect(errorMessage(new Error('qualquer coisa'))).toMatch(/erro inesperado/);
  });
  it('CSV protege contra injecção de fórmulas', () => {
    const csv = toCsv([{ a: '=HYPERLINK("x")', b: 'x;y' }], [{ key: 'a', label: 'A' }, { key: 'b', label: 'B' }]);
    expect(csv).toContain(`"'=HYPERLINK(""x"")"`);
    expect(csv).toContain('"x;y"');
  });
  it('token do pedido vai no fragmento (#), não na query', () => {
    expect(orderPath('V25-ABC234', 'tok_1')).toBe('/pedido/V25-ABC234#t=tok_1');
    expect(tokenFromHash('#t=tok_1')).toBe('tok_1');
    expect(tokenFromHash('#outra')).toBeNull();
  });
  it('progresso do pedido', () => {
    expect(stepIndex('aguardando_pagamento')).toBe(0);
    expect(stepIndex('em_analise')).toBe(2);
    expect(stepIndex('emitido')).toBe(4);
  });
});
