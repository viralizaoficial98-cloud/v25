import { useRef, useState } from 'react';
import { FileUp, ShieldCheck } from 'lucide-react';
import { Alert } from '@/components/ui/misc';
import { Button } from '@/components/ui/button';
import { uploadProof } from '@/lib/api';
import { errorMessage } from '@/lib/errors';
import { formatBytes } from '@/lib/format';
import { validateProofFile } from '@/lib/validation';
import { cn } from '@/lib/cn';

export function ProofUpload({ code, token, onUploaded }: { code: string; token: string; onUploaded: () => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [drag, setDrag] = useState(false);

  const pick = async (f: File | undefined | null) => {
    setError(null);
    if (!f) return;
    const v = await validateProofFile(f);
    if (!v.ok) {
      setFile(null);
      setError(v.error);
      return;
    }
    setFile(f);
  };

  const submit = async () => {
    if (!file || busy) return;
    setBusy(true);
    setError(null);
    try {
      const v = await validateProofFile(file);
      if (!v.ok) {
        setError(v.error);
        return;
      }
      await uploadProof(code, token, file);
      setFile(null);
      onUploaded();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-[1.75rem] border border-fg/10 bg-paper-soft/70 p-6 md:p-8">
      <p className="eyebrow">Passo seguinte</p>
      <h3 className="mt-2 text-3xl font-semibold">Carregar comprovativo</h3>
      <p className="mt-2 text-sm text-fg/60">Depois de fazer a transferência, envie o comprovativo em PDF, JPG ou PNG (máx. 5 MB).</p>

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          void pick(e.dataTransfer.files?.[0]);
        }}
        className={cn(
          'mt-6 flex flex-col items-center justify-center rounded-2xl border-2 border-dashed px-6 py-10 text-center transition',
          drag ? 'border-gold bg-gold/10' : 'border-gold/25 bg-black/20',
        )}
      >
        <FileUp className="h-9 w-9 text-gold" aria-hidden />
        {file ? (
          <p className="mt-3 text-sm text-fg">
            <span className="font-semibold">{file.name}</span> <span className="text-fg/50">· {formatBytes(file.size)}</span>
          </p>
        ) : (
          <p className="mt-3 text-sm text-fg/60">Arraste o ficheiro para aqui ou</p>
        )}
        <Button variant="outline" size="sm" className="mt-4" onClick={() => input.current?.click()}>
          {file ? 'Escolher outro ficheiro' : 'Escolher ficheiro'}
        </Button>
        <input
          ref={input}
          type="file"
          accept="application/pdf,image/jpeg,image/png,.pdf,.jpg,.jpeg,.png"
          className="sr-only"
          aria-label="Ficheiro do comprovativo"
          onChange={(e) => {
            void pick(e.target.files?.[0]);
            e.target.value = '';
          }}
        />
      </div>

      {error && <Alert tone="bad" className="mt-4">{error}</Alert>}

      <Button size="lg" className="mt-6 w-full" disabled={!file} loading={busy} onClick={submit}>
        Enviar comprovativo
      </Button>
      <p className="mt-4 flex items-start gap-2 text-xs text-fg/50">
        <ShieldCheck className="h-4 w-4 shrink-0 text-gold" aria-hidden />
        O ficheiro é guardado de forma privada e apenas a equipa financeira o pode consultar. O envio do comprovativo não confirma o pagamento: a confirmação é feita manualmente após verificação bancária.
      </p>
    </div>
  );
}
