import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const ROOT = process.cwd();
const PUBLIC_DIR = path.join(ROOT, 'public');

const readSvg = async () => {
  const svgPath = path.join(PUBLIC_DIR, 'favicon.svg');
  return await fs.readFile(svgPath);
};

const renderPng = async (svgBuffer, outName, size, innerScale = 0.78) => {
  const inner = Math.max(1, Math.round(size * innerScale));
  const pad = Math.max(0, Math.floor((size - inner) / 2));

  const png = await sharp(svgBuffer, { density: 384 })
    .resize(inner, inner, { fit: 'contain' })
    .extend({
      top: pad,
      bottom: size - inner - pad,
      left: pad,
      right: size - inner - pad,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toBuffer();

  await fs.writeFile(path.join(PUBLIC_DIR, outName), png);
};

const main = async () => {
  const svg = await readSvg();

  await renderPng(svg, 'icon-192.png', 192);
  await renderPng(svg, 'icon-512.png', 512);
  await renderPng(svg, 'apple-touch-icon.png', 180);
  await renderPng(svg, 'favicon.png', 32, 0.9);

  console.log('OK: icons gerados em /public');
};

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
