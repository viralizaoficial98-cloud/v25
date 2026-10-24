// Gera variantes responsivas WebP/AVIF a partir das fotografias oficiais.
// Apenas redimensiona (sem recortes nem alterações de rosto/proporção).
import sharp from 'sharp';
import { readdir, mkdir } from 'node:fs/promises';
import path from 'node:path';

const SRC = 'assets/originals';
const OUT = 'public/images';
const WIDTHS = [480, 828, 1280, 1920];

await mkdir(OUT, { recursive: true });
const manifest = {};
for (const file of await readdir(SRC)) {
  if (!/\.(webp|jpe?g|png)$/i.test(file)) continue;
  const name = file.replace(/\.[^.]+$/, '');
  const img = sharp(path.join(SRC, file));
  const meta = await img.metadata();
  const widths = WIDTHS.filter((w) => w < meta.width).concat(meta.width);
  manifest[name] = { width: meta.width, height: meta.height, widths: [...new Set(widths)] };
  for (const w of manifest[name].widths) {
    const base = sharp(path.join(SRC, file)).resize({ width: w, withoutEnlargement: true });
    await base.clone().webp({ quality: 80 }).toFile(path.join(OUT, `${name}-${w}.webp`));
    await base.clone().avif({ quality: 55 }).toFile(path.join(OUT, `${name}-${w}.avif`));
  }
  // Placeholder desfocado minúsculo para carregamento progressivo
  const blur = await sharp(path.join(SRC, file)).resize({ width: 24 }).webp({ quality: 40 }).toBuffer();
  manifest[name].blur = `data:image/webp;base64,${blur.toString('base64')}`;
}
// Imagem Open Graph (1200x630, sem distorção: enquadramento "cover" centrado)
await sharp(path.join(SRC, 'vibes-grupo.webp'))
  .resize(1200, 630, { fit: 'cover', position: 'attention' })
  .jpeg({ quality: 82 })
  .toFile(path.join(OUT, 'og-v25.jpg'));

const { writeFile } = await import('node:fs/promises');
await writeFile('src/lib/images.generated.json', JSON.stringify(manifest, null, 2));
console.log('Imagens optimizadas:', Object.keys(manifest).join(', '));
