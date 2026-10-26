// Utilitários partilhados pelos testes de integração da API.
import net from 'node:net';
import assert from 'node:assert/strict';

export const BASE = process.env.V25_BASE;

// ---------------------------------------------------------------- servidor SMTP de teste
export const mails = [];
let smtp;
export function stopSmtpSink() {
  smtp?.close();
}
export function startSmtpSink(port) {
  smtp = net.createServer((sock) => {
    let mode = 'cmd'; // cmd | data | auth_user | auth_pass
    let buf = '';
    let current = { from: '', to: [], raw: '' };
    sock.write('220 v25-teste ESMTP\r\n');
    sock.on('data', (chunk) => {
      buf += chunk.toString('latin1');
      for (;;) {
        if (mode === 'data') {
          const end = buf.indexOf('\r\n.\r\n');
          if (end < 0) return;
          current.raw = buf.slice(0, end);
          mails.push(current);
          current = { from: '', to: [], raw: '' };
          buf = buf.slice(end + 5);
          mode = 'cmd';
          sock.write('250 OK\r\n');
          continue;
        }
        const idx = buf.indexOf('\r\n');
        if (idx < 0) return;
        const line = buf.slice(0, idx);
        buf = buf.slice(idx + 2);
        if (mode === 'auth_user') { mode = 'auth_pass'; sock.write('334 UGFzc3dvcmQ6\r\n'); continue; }
        if (mode === 'auth_pass') { mode = 'cmd'; sock.write('235 Authentication successful\r\n'); continue; }
        const cmd = line.slice(0, 4).toUpperCase();
        if (cmd === 'EHLO') sock.write('250-v25-teste\r\n250-AUTH PLAIN LOGIN\r\n250 8BITMIME\r\n');
        else if (cmd === 'AUTH') {
          if (/^AUTH PLAIN \S+/i.test(line)) sock.write('235 Authentication successful\r\n');
          else if (/^AUTH LOGIN \S+/i.test(line)) { mode = 'auth_pass'; sock.write('334 UGFzc3dvcmQ6\r\n'); }
          else if (/^AUTH LOGIN/i.test(line)) { mode = 'auth_user'; sock.write('334 VXNlcm5hbWU6\r\n'); }
          else sock.write('504 Unsupported\r\n');
        } else if (cmd === 'MAIL') { current.from = line; sock.write('250 OK\r\n'); }
        else if (cmd === 'RCPT') { current.to.push(line.replace(/^RCPT TO:\s*<?|>$/gi, '')); sock.write('250 OK\r\n'); }
        else if (cmd === 'DATA') { mode = 'data'; sock.write('354 End data with <CR><LF>.<CR><LF>\r\n'); }
        else if (cmd === 'QUIT') { sock.write('221 Bye\r\n'); sock.end(); }
        else sock.write('250 OK\r\n');
      }
    });
    sock.on('error', () => {});
  });
  return new Promise((r) => smtp.listen(port, '127.0.0.1', r));
}

// ---------------------------------------------------------------- cliente HTTP com cookies
let ipSeq = 10;
export class Client {
  constructor(ip = `10.0.${Math.floor(ipSeq / 250)}.${(ipSeq++ % 250) + 1}`) {
    this.cookies = {};
    this.csrf = '';
    this.ip = ip;
  }
  async req(method, url, { json, form, headers = {}, csrf = true, origin } = {}) {
    const h = { 'X-Forwarded-For': this.ip, ...headers };
    const cookie = Object.entries(this.cookies).map(([k, v]) => `${k}=${v}`).join('; ');
    if (cookie) h.Cookie = cookie;
    if (csrf && this.csrf && method !== 'GET') h['X-CSRF-Token'] = this.csrf;
    if (origin) h.Origin = origin;
    let body;
    if (json !== undefined) { h['Content-Type'] = 'application/json'; body = JSON.stringify(json); }
    if (form) body = form;
    const r = await fetch(BASE + '/api' + url, { method, headers: h, body, redirect: 'manual' });
    this.lastSetCookie = r.headers.getSetCookie?.() ?? [];
    for (const c of this.lastSetCookie) {
      const [kv] = c.split(';');
      const [k, v] = kv.split('=');
      if (/expires=Thu, 01 Jan 1970|Max-Age=0/i.test(c) || v === '' || v === 'deleted') delete this.cookies[k];
      else this.cookies[k] = v;
    }
    const ct = r.headers.get('content-type') || '';
    const buf = Buffer.from(await r.arrayBuffer());
    const data = ct.includes('json') ? JSON.parse(buf.toString('utf8') || 'null') : buf;
    return { status: r.status, data, headers: r.headers };
  }
  get(u, o) { return this.req('GET', u, o); }
  post(u, json, o = {}) { return this.req('POST', u, { json, ...o }); }
  put(u, json, o = {}) { return this.req('PUT', u, { json, ...o }); }
  del(u, o) { return this.req('DELETE', u, o); }
  async session() {
    const r = await this.get('/auth/session');
    this.csrf = r.data.csrf_token;
    return r.data;
  }
  async login(email, password) {
    await this.session();
    const r = await this.post('/auth/login', { email, password });
    if (r.status === 200) this.csrf = r.data.csrf_token;
    return r;
  }
}

export const anon = () => new Client();
export const err = (r, code, status) => {
  assert.equal(r.data?.error, code, `esperado ${code}, recebido ${JSON.stringify(r.data)} (${r.status})`);
  if (status) assert.equal(r.status, status);
};


export const uploadForm = (buf, name, type, extra = {}) => {
  const f = new FormData();
  f.append('file', new Blob([buf], { type }), name);
  for (const [k, v] of Object.entries(extra)) f.append(k, v);
  return f;
};
