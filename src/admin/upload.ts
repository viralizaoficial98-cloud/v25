import { api } from '@/lib/http';
import { UserError } from '@/lib/errors';
import type { GalleryItem, MediaItem } from '@/lib/types';

/**
 * Reduz fotografias grandes no navegador antes do envio (apenas redimensiona, sem recortes).
 * O servidor volta a validar e re-codificar a imagem.
 */
async function shrinkImage(file: File): Promise<File> {
  if (typeof createImageBitmap !== 'function' || file.size < 1.5 * 1024 * 1024) return file;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, 2400 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/jpeg', 0.9));
    return blob ? new File([blob], file.name.replace(/\.[^.]+$/, '.jpg'), { type: 'image/jpeg' }) : file;
  } catch {
    return file;
  }
}

function checkFile(file: File, allowVideo: boolean) {
  if (file.type.startsWith('video/')) {
    if (!allowVideo || !['video/mp4', 'video/webm'].includes(file.type)) throw new UserError('Vídeo deve ser MP4 ou WebM.');
    if (file.size > 50 * 1024 * 1024) throw new UserError('Vídeo excede 50 MB. Para vídeos longos use o YouTube.');
    return;
  }
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw new UserError('Formato de imagem não suportado (JPG, PNG ou WebP).');
}

/** Galeria (secções "grupo" e "memorias"): cria o item em rascunho. */
export async function uploadMediaItem(file: File, section: MediaItem['section'], title: string): Promise<MediaItem> {
  checkFile(file, true);
  const form = new FormData();
  form.append('file', file.type.startsWith('image/') ? await shrinkImage(file) : file);
  form.append('section', section);
  form.append('title', title);
  return api<MediaItem>('/admin/media/upload', { form });
}

/** Imagem para linha do tempo / integrantes: devolve o caminho a guardar no conteúdo. */
export async function uploadImage(file: File, folder: 'historia' | 'integrantes' | 'site'): Promise<{ path: string; width: number; height: number }> {
  checkFile(file, false);
  const form = new FormData();
  form.append('file', await shrinkImage(file));
  form.append('folder', folder);
  return api('/admin/uploads/image', { form });
}

export function youtubeId(input: string): string | null {
  const s = input.trim();
  if (/^[A-Za-z0-9_-]{11}$/.test(s)) return s;
  const m = /(?:youtu\.be\/|youtube(?:-nocookie)?\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/))([A-Za-z0-9_-]{11})/.exec(s);
  return m ? m[1] : null;
}

/** Galeria dos eventos: envia uma fotografia (reduzida no navegador) ou um vídeo MP4/WebM para o álbum. */
export async function uploadGalleryFile(albumId: string, file: File, caption = '', altText = ''): Promise<GalleryItem> {
  checkFile(file, true);
  if (file.type.startsWith('image/') && file.size > 15 * 1024 * 1024) throw new UserError('Fotografia excede 15 MB.');
  const form = new FormData();
  form.append('file', file.type.startsWith('image/') ? await shrinkImage(file) : file);
  form.append('caption', caption);
  form.append('alt_text', altText);
  return api<GalleryItem>(`/admin/gallery/albums/${albumId}/items`, { form });
}

export async function replaceGalleryFile(itemId: string, file: File): Promise<GalleryItem> {
  checkFile(file, true);
  const form = new FormData();
  form.append('file', file.type.startsWith('image/') ? await shrinkImage(file) : file);
  return api<GalleryItem>(`/admin/gallery/items/${itemId}/replace`, { form });
}
