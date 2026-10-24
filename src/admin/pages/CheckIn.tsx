import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { Camera, CameraOff, CheckCircle2, Keyboard, ShieldAlert, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/misc';
import { requireSupabase } from '@/lib/supabase';
import { errorMessage } from '@/lib/errors';
import { formatDateTime } from '@/lib/format';
import { cn } from '@/lib/cn';
import type { CheckinResult } from '@/lib/types';
import { PageHeader, Panel, Toggle } from '../ui';

const RESULT_UI: Record<CheckinResult['result'], { title: string; cls: string; icon: typeof CheckCircle2 }> = {
  ok: { title: 'ENTRADA VALIDADA', cls: 'border-emerald-400/60 bg-emerald-500/15 text-emerald-100', icon: CheckCircle2 },
  valido: { title: 'INGRESSO VÁLIDO (não registado)', cls: 'border-sky-400/60 bg-sky-500/15 text-sky-100', icon: CheckCircle2 },
  ja_utilizado: { title: 'JÁ UTILIZADO', cls: 'border-amber-400/70 bg-amber-500/15 text-amber-100', icon: ShieldAlert },
  anulado: { title: 'INGRESSO ANULADO', cls: 'border-rose-400/70 bg-rose-500/15 text-rose-100', icon: XCircle },
  invalido: { title: 'INVÁLIDO', cls: 'border-rose-400/70 bg-rose-500/15 text-rose-100', icon: XCircle },
};

export default function CheckIn() {
  const sb = requireSupabase();
  const video = useRef<HTMLVideoElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const raf = useRef<number>(0);
  const lastScan = useRef<{ v: string; t: number }>({ v: '', t: 0 });
  const busyRef = useRef(false);
  const [camera, setCamera] = useState(false);
  const [camError, setCamError] = useState<string | null>(null);
  const [manual, setManual] = useState('');
  const [verifyOnly, setVerifyOnly] = useState(false);
  const [result, setResult] = useState<CheckinResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<(CheckinResult & { at: string })[]>([]);

  const validate = useCallback(
    async (input: string) => {
      if (busyRef.current || !input.trim()) return;
      busyRef.current = true;
      setError(null);
      try {
        const { data, error } = await sb.rpc('checkin_ticket', { p_input: input.trim(), p_commit: !verifyOnly });
        if (error) throw error;
        const r = data as CheckinResult;
        setResult(r);
        setHistory((h) => [{ ...r, at: new Date().toISOString() }, ...h].slice(0, 15));
        navigator.vibrate?.(r.result === 'ok' || r.result === 'valido' ? 80 : [60, 60, 60]);
      } catch (e) {
        setError(errorMessage(e));
      } finally {
        busyRef.current = false;
      }
    },
    [sb, verifyOnly],
  );

  const stop = useCallback(() => {
    cancelAnimationFrame(raf.current);
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
    setCamera(false);
  }, []);

  const start = async () => {
    setCamError(null);
    if (!navigator.mediaDevices?.getUserMedia) {
      setCamError('Este navegador não permite acesso à câmara (é necessário HTTPS). Use a introdução manual do código.');
      return;
    }
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
      stream.current = s;
      if (video.current) {
        video.current.srcObject = s;
        await video.current.play();
      }
      setCamera(true);
      const { default: jsQR } = await import('jsqr');
      const tick = () => {
        const v = video.current;
        const c = canvas.current;
        if (v && c && v.readyState === v.HAVE_ENOUGH_DATA) {
          const w = (c.width = Math.min(v.videoWidth, 720));
          const h = (c.height = Math.round((v.videoHeight / v.videoWidth) * w));
          const ctx = c.getContext('2d', { willReadFrequently: true })!;
          ctx.drawImage(v, 0, 0, w, h);
          const code = jsQR(ctx.getImageData(0, 0, w, h).data, w, h, { inversionAttempts: 'dontInvert' });
          const now = Date.now();
          // Evita validar o mesmo QR repetidamente enquanto está à frente da câmara
          if (code?.data && (code.data !== lastScan.current.v || now - lastScan.current.t > 4000)) {
            lastScan.current = { v: code.data, t: now };
            void validate(code.data);
          }
        }
        raf.current = requestAnimationFrame(tick);
      };
      raf.current = requestAnimationFrame(tick);
    } catch (e) {
      setCamError(e instanceof DOMException && e.name === 'NotAllowedError' ? 'Permissão da câmara recusada. Autorize nas definições do navegador ou use a introdução manual.' : 'Não foi possível iniciar a câmara.');
      stop();
    }
  };

  useEffect(() => stop, [stop]);

  const submitManual = (e: FormEvent) => {
    e.preventDefault();
    void validate(manual).then(() => setManual(''));
  };

  const ui = result ? RESULT_UI[result.result] : null;

  return (
    <div>
      <PageHeader title="Check-in" description="Leia o QR Code do ingresso ou introduza o código manualmente. Cada ingresso só pode entrar uma vez." />
      <div className="grid gap-6 lg:grid-cols-2">
        <Panel>
          <div className="relative aspect-[4/3] overflow-hidden rounded-xl bg-black">
            <video ref={video} playsInline muted className={cn('h-full w-full object-cover', !camera && 'hidden')} />
            {!camera && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-cream/50">
                <Camera className="h-10 w-10" />
                <p className="text-sm">Câmara desligada</p>
              </div>
            )}
            {camera && <div aria-hidden className="pointer-events-none absolute inset-[18%] rounded-2xl border-2 border-gold/80 shadow-[0_0_0_9999px_rgba(0,0,0,.35)]" />}
            <canvas ref={canvas} className="hidden" />
          </div>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            {camera ? (
              <Button variant="subtle" onClick={stop}><CameraOff className="h-4 w-4" /> Desligar câmara</Button>
            ) : (
              <Button onClick={start}><Camera className="h-4 w-4" /> Ligar câmara</Button>
            )}
            <Toggle checked={verifyOnly} onChange={setVerifyOnly} label="Apenas verificar (não registar entrada)" />
          </div>
          {camError && <Alert tone="warn" className="mt-4">{camError}</Alert>}
          <form onSubmit={submitManual} className="mt-5 flex gap-2">
            <label htmlFor="manual" className="sr-only">Código do ingresso</label>
            <div className="relative flex-1">
              <Keyboard className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-cream/40" />
              <input id="manual" className="admin-input pl-9 font-mono uppercase" placeholder="T-XXXXXXXX" value={manual} onChange={(e) => setManual(e.target.value)} autoComplete="off" />
            </div>
            <Button type="submit" variant="outline">Validar</Button>
          </form>
        </Panel>

        <div className="space-y-4">
          {error && <Alert tone="bad">{error}</Alert>}
          {result && ui ? (
            <div className={cn('rounded-2xl border-2 p-6', ui.cls)} role="status" aria-live="assertive">
              <ui.icon className="h-12 w-12" />
              <p className="mt-3 text-2xl font-bold tracking-wide">{ui.title}</p>
              {result.message && <p className="mt-1">{result.message}</p>}
              {result.holder_name && (
                <dl className="mt-4 space-y-1 text-sm">
                  <div><dt className="inline opacity-70">Participante: </dt><dd className="inline font-semibold">{result.holder_name}</dd></div>
                  <div><dt className="inline opacity-70">Categoria: </dt><dd className="inline">{result.ticket_type}{result.persons_per_ticket && result.persons_per_ticket > 1 ? ` (até ${result.persons_per_ticket} pessoas)` : ''}</dd></div>
                  <div><dt className="inline opacity-70">Ingresso: </dt><dd className="inline font-mono">{result.ticket_code} · {result.seq}/{result.order_quantity}</dd></div>
                  {result.result === 'ja_utilizado' && (
                    <div className="pt-2 font-semibold">
                      Entrada registada em {formatDateTime(result.checked_in_at)}{result.checked_in_by ? ` por ${result.checked_in_by}` : ''}.
                    </div>
                  )}
                </dl>
              )}
            </div>
          ) : (
            <Panel><p className="text-sm text-cream/50">Aguardando leitura…</p></Panel>
          )}
          {history.length > 0 && (
            <Panel title="Últimas leituras (esta sessão)">
              <ul className="space-y-1 text-xs">
                {history.map((h, i) => (
                  <li key={i} className="flex justify-between gap-2">
                    <span className="font-mono">{h.ticket_code ?? '—'}</span>
                    <span>{RESULT_UI[h.result].title}</span>
                    <span className="text-cream/45">{formatDateTime(h.at, { day: undefined, month: undefined, year: undefined, second: '2-digit' })}</span>
                  </li>
                ))}
              </ul>
            </Panel>
          )}
        </div>
      </div>
    </div>
  );
}
