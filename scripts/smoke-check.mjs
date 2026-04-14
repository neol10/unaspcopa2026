import { existsSync, statSync } from 'node:fs';
import { resolve } from 'node:path';

const requiredFiles = [
  'dist/index.html',
  'dist/manifest.webmanifest',
  'dist/registerSW.js',
  'dist/sw.js',
];

const missing = requiredFiles.filter((file) => !existsSync(resolve(process.cwd(), file)));

if (missing.length > 0) {
  console.error('Smoke check falhou. Arquivos ausentes:');
  for (const file of missing) {
    console.error(`- ${file}`);
  }
  process.exit(1);
}

const indexPath = resolve(process.cwd(), 'dist/index.html');
const indexSize = statSync(indexPath).size;
if (indexSize < 1024) {
  console.error('Smoke check falhou: dist/index.html parece invalido (muito pequeno).');
  process.exit(1);
}

console.log('Smoke check OK: build gerado com artefatos principais.');
