import { requireSupabase } from '@/lib/supabase';
import { UserError } from '@/lib/errors';

function uid() {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/**
 * Optimiza uma fotografia no navegador antes do envio: apenas redimensiona (máx. 2400 px
 * no lado maior, sem recortes nem alteração de proporções) e converte para WebP.
 */
async function optimizeImage(file: File): Promise<{ blob: Blob; width: number; height: number; type: string; ext: string }> {
  const bitmap = await createImageBitmap(file);
  const max = 2400;
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/webp', 0.85));
  if (blob && blob.type === 'image/webp') return { blob, width, height, type: 'image/webp', ext: 'webp' };
  // Navegadores sem codificador WebP: envia o original
  return { blob: file, width, height, type: file.type, ext: file.name.split('.').pop() || 'jpg' };
}

export async function uploadMedia(file: File, folder: string): Promise<{ path: string; width: number | null; height: number | null; kind: 'foto' | 'video' }> {
  const sb = requireSupabase();
  if (file.type.startsWith('video/')) {
    if (!['video/mp4', 'video/webm'].includes(file.type)) throw new UserError('Vídeo deve ser MP4 ou WebM.');
    if (file.size > 50 * 1024 * 1024) throw new UserError('Vídeo excede 50 MB. Para vídeos longos use o YouTube.');
    const path = `${folder}/${uid()}.${file.type === 'video/webm' ? 'webm' : 'mp4'}`;
    const { error } = await sb.storage.from('media').upload(path, file, { contentType: file.type, cacheControl: '31536000' });
    if (error) throw error;
    return { path, width: null, height: null, kind: 'video' };
  }
  if (!['image/jpeg', 'image/png', 'image/webp', 'image/avif'].includes(file.type)) throw new UserError('Formato de imagem não suportado.');
  const img = await optimizeImage(file);
  const path = `${folder}/${uid()}.${img.ext}`;
  const { error } = await sb.storage.from('media').upload(path, img.blob, { contentType: img.type, cacheControl: '31536000' });
  if (error) throw error;
  return { path, width: img.width, height: img.height, kind: 'foto' };
}

export async function removeMedia(path: string | null | undefined) {
  if (!path) return;
  await requireSupabase().storage.from('media').remove([path]);
}

export function youtubeId(input: string): string | null {
  const s = input.trim();
  if (/^[A-Za-z0-9_-]{11}$/.test(s)) return s;
  const m = /(?:youtu\.be\/|youtube(?:-nocookie)?\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/))([A-Za-z0-9_-]{11})/.exec(s);
  return m ? m[1] : null;
}
