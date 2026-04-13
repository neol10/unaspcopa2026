#!/usr/bin/env node
/**
 * Vincula fotos locais aos atletas no Supabase.
 * - Match pelo nome do arquivo (nome e sobrenome), ignorando acentos/pontuação e sufixos comuns.
 * - Faz upload para Storage (bucket: images, pasta: player-photos)
 * - Atualiza players.photo_url
 *
 * Requer uma credencial com permissão de update + storage.
 * Preferencialmente: SUPABASE_SERVICE_ROLE_KEY.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const BUCKET = 'images';
const FOLDER = 'player-photos';

const help = `\
Uso:
  node scripts/attach-player-photos.mjs --photosDir "C:\\caminho\\para\\fotos" [--division masculino|feminino] [--overwrite] [--dryRun]
  node scripts/attach-player-photos.mjs --pdfPath "C:\\caminho\\para\\carteirinhas.pdf" [--division masculino|feminino] [--overwrite] [--dryRun]

Env (obrigatório):
  SUPABASE_URL (ou VITE_SUPABASE_URL)
  SUPABASE_SERVICE_ROLE_KEY (ou SUPABASE_SERVICE_ROLE / SUPABASE_SERVICE_ROLE_KEY)

Opções:
  --photosDir   Pasta com as fotos (nome do arquivo = nome do atleta)
  --pdfPath     PDF com 1 pessoa por página (o nome é lido do texto do PDF; gera imagens temporárias)
  --division    Filtra atletas por divisão (se a coluna existir)
  --overwrite   Sobrescreve photo_url mesmo se já existir
  --dryRun      Não faz upload nem update (só simula e imprime relatório)
\nNotas:
  - Se a imagem for muito “larga” (ex.: carteirinha com texto), o script recorta automaticamente o lado esquerdo
    e gera uma foto quadrada (JPG) antes do upload.
`;

const parseArgs = (argv) => {
  const out = { photosDir: '', pdfPath: '', division: '', overwrite: false, dryRun: false };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--photosDir') out.photosDir = argv[i + 1] || '';
    if (a === '--pdfPath') out.pdfPath = argv[i + 1] || '';
    if (a === '--division') out.division = (argv[i + 1] || '').toLowerCase();
    if (a === '--overwrite') out.overwrite = true;
    if (a === '--dryRun') out.dryRun = true;
  }
  return out;
};

const normalizeKey = (value) => {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ');
};

const normalizePlayerKey = (name) => {
  return normalizeKey(name).replace(/[^a-z0-9]/g, '');
};

const stripCommonFileSuffixes = (base) => {
  // Remove padrões comuns: (1), (2), _1, - 1, copia, copy, etc.
  return String(base || '')
    .replace(/\s*\(\d+\)\s*$/g, '')
    .replace(/\s*[\-_]\s*\d+\s*$/g, '')
    .replace(/\s*\(copia\)\s*$/gi, '')
    .replace(/\s*\(copy\)\s*$/gi, '')
    .replace(/\s*[-_]?\s*copia\s*$/gi, '')
    .replace(/\s*[-_]?\s*copy\s*$/gi, '')
    .trim();
};

const normalizeFileKey = (fileName) => {
  const rawBase = String(fileName || '').replace(/\.[^.]+$/, '');
  const cleaned = stripCommonFileSuffixes(rawBase);
  return normalizeKey(cleaned).replace(/[^a-z0-9]/g, '');
};

const isImageExt = (ext) => {
  const e = ext.toLowerCase();
  return e === '.jpg' || e === '.jpeg' || e === '.png' || e === '.webp' || e === '.avif';
};

const guessContentType = (ext) => {
  const e = ext.toLowerCase();
  if (e === '.jpg' || e === '.jpeg') return 'image/jpeg';
  if (e === '.png') return 'image/png';
  if (e === '.webp') return 'image/webp';
  if (e === '.avif') return 'image/avif';
  return 'application/octet-stream';
};

const getSharp = async () => {
  try {
    const mod = await import('sharp');
    return mod.default || mod;
  } catch {
    return null;
  }
};

const transformForPlayerPhoto = async (inputBuffer, originalExt) => {
  const sharp = await getSharp();
  if (!sharp) {
    return {
      buffer: inputBuffer,
      ext: originalExt,
      contentType: guessContentType(originalExt),
    };
  }

  try {
    const img = sharp(inputBuffer, { failOn: 'none' }).rotate();
    const meta = await img.metadata();
    const width = Number(meta?.width || 0);
    const height = Number(meta?.height || 0);
    if (!width || !height) {
      return {
        buffer: inputBuffer,
        ext: originalExt,
        contentType: guessContentType(originalExt),
      };
    }

    const ratio = width / height;
    const isWideCard = ratio >= 1.35 && width >= 320;
    const target = 512;

    let pipeline = sharp(inputBuffer, { failOn: 'none' }).rotate();

    if (isWideCard) {
      // Carteirinha costuma ter retrato à esquerda e texto à direita.
      // Recorta a faixa esquerda (altura inteira), depois torna quadrado.
      const cropWidth = Math.max(1, Math.min(height, Math.round(width * 0.38)));
      pipeline = pipeline.extract({ left: 0, top: 0, width: cropWidth, height });
    }

    const outBuffer = await pipeline
      .resize(target, target, {
        fit: 'cover',
        position: isWideCard ? 'left' : 'attention',
      })
      .jpeg({ quality: 82, mozjpeg: true })
      .toBuffer();

    return { buffer: outBuffer, ext: '.jpg', contentType: 'image/jpeg' };
  } catch {
    return {
      buffer: inputBuffer,
      ext: originalExt,
      contentType: guessContentType(originalExt),
    };
  }
};

const listImagesRecursive = async (dir) => {
  const out = [];
  const walk = async (current) => {
    const entries = await fs.readdir(current, { withFileTypes: true });
    for (const ent of entries) {
      const full = path.join(current, ent.name);
      if (ent.isDirectory()) {
        await walk(full);
        continue;
      }
      const ext = path.extname(ent.name);
      if (!isImageExt(ext)) continue;
      const st = await fs.stat(full);
      out.push({
        fullPath: full,
        name: ent.name,
        size: st.size,
        ext,
      });
    }
  };
  await walk(dir);
  return out;
};

const sanitizeFileName = (value) => {
  return String(value || '')
    .trim()
    .replace(/[\\/:*?"<>|]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
};

const inferNameFromPdfPageText = (items) => {
  const list = Array.isArray(items) ? items : [];
  const rows = list
    .map((it) => {
      const str = String(it?.str || '').trim();
      const x = Number(it?.transform?.[4] ?? 0);
      const y = Number(it?.transform?.[5] ?? 0);
      return { str, x, y };
    })
    .filter((x) => x.str && x.str.length >= 3);

  if (!rows.length) return '';

  // pega o texto mais "no topo"; em empate, o mais à esquerda e com mais chars
  const maxY = Math.max(...rows.map((r) => r.y));
  const topBand = rows.filter((r) => Math.abs(r.y - maxY) <= 4);
  const candidates = (topBand.length ? topBand : rows)
    .sort((a, b) => {
      if (b.y !== a.y) return b.y - a.y;
      if (a.x !== b.x) return a.x - b.x;
      return (b.str.length || 0) - (a.str.length || 0);
    });

  // às vezes vem "Turma:" etc — tenta ficar com uma linha "parecida com nome"
  for (const c of candidates.slice(0, 10)) {
    if (/^(turma|ra|n[ºo]|data|idade|autoriza)/i.test(c.str)) continue;
    return c.str;
  }
  return candidates[0]?.str || '';
};

const extractImagesFromPdf = async (pdfPath) => {
  const abs = path.resolve(process.cwd(), pdfPath);
  const buf = await fs.readFile(abs);

  const [{ createCanvas }, pdfjs] = await Promise.all([
    import('@napi-rs/canvas').then((m) => ({ createCanvas: m.createCanvas })),
    import('pdfjs-dist/legacy/build/pdf.mjs').then((m) => m.default || m),
  ]);

  const loadingTask = pdfjs.getDocument({ data: buf, disableWorker: true });
  const pdf = await loadingTask.promise;

  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'copaunasp-photos-pdf-'));
  const scale = 2.0;

  let generated = 0;
  let unnamed = 0;

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum += 1) {
    const page = await pdf.getPage(pageNum);
    const viewport = page.getViewport({ scale });
    const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
    const ctx = canvas.getContext('2d');

    await page.render({ canvasContext: ctx, viewport }).promise;

    let name = '';
    try {
      const text = await page.getTextContent();
      name = inferNameFromPdfPageText(text?.items);
    } catch {
      // sem texto extraível
    }

    if (!name) {
      unnamed += 1;
      name = `pagina_${pageNum}`;
    }

    const fileName = sanitizeFileName(name) || `pagina_${pageNum}`;
    const outPath = path.join(tmpDir, `${fileName}.png`);
    const png = canvas.toBuffer('image/png');
    await fs.writeFile(outPath, png);
    generated += 1;
  }

  return { tmpDir, generated, unnamed };
};

const pickBestFileForKey = (files) => {
  // se houver duplicados pro mesmo nome, escolhe o maior (normalmente melhor qualidade)
  return [...files].sort((a, b) => (b.size || 0) - (a.size || 0))[0] || null;
};

const mustEnv = (names) => {
  for (const n of names) {
    const v = process.env[n];
    if (v) return v;
  }
  return '';
};

const main = async () => {
  const args = parseArgs(process.argv.slice(2));
  if (!args.photosDir && !args.pdfPath) {
    console.error(help);
    process.exit(1);
  }

  const supabaseUrl = mustEnv(['SUPABASE_URL', 'VITE_SUPABASE_URL']);
  const serviceKey = mustEnv(['SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_SERVICE_ROLE', 'SERVICE_ROLE_KEY']);
  if (!supabaseUrl || !serviceKey) {
    console.error('Faltando SUPABASE_URL e/ou SUPABASE_SERVICE_ROLE_KEY.');
    console.error(help);
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  let photosDir = '';
  let pdfTmp = null;
  if (args.pdfPath) {
    const extracted = await extractImagesFromPdf(args.pdfPath);
    pdfTmp = extracted;
    photosDir = extracted.tmpDir;
    console.log('PDF:', path.resolve(process.cwd(), args.pdfPath));
    console.log('Paginas geradas:', extracted.generated, '• Sem nome:', extracted.unnamed);
    console.log('Pasta temporaria:', photosDir);
  } else {
    photosDir = path.resolve(process.cwd(), args.photosDir);
  }

  const images = await listImagesRecursive(photosDir);
  if (!images.length) {
    console.error(`Nenhuma imagem encontrada em: ${photosDir}`);
    process.exit(1);
  }

  // Agrupa arquivos por chave
  const filesByKey = new Map();
  for (const f of images) {
    const key = normalizeFileKey(f.name);
    if (!key) continue;
    const arr = filesByKey.get(key) || [];
    arr.push(f);
    filesByKey.set(key, arr);
  }

  // Busca jogadores
  const baseSelect = 'id,name,photo_url,team_id';
  let players = [];

  const fetchPlayers = async () => {
    // tenta com division; se der erro, faz fallback
    if (args.division) {
      const withDiv = await supabase
        .from('players')
        .select(`${baseSelect},division`)
        .eq('division', args.division);
      if (!withDiv.error) return withDiv;

      // fallback: se não existe coluna division
      const fallback = await supabase.from('players').select(baseSelect);
      return fallback;
    }

    const res = await supabase.from('players').select(baseSelect);
    return res;
  };

  const playersRes = await fetchPlayers();
  if (playersRes.error) {
    console.error('Erro ao buscar atletas:', playersRes.error.message || playersRes.error);
    process.exit(1);
  }
  players = Array.isArray(playersRes.data) ? playersRes.data : [];

  const playersByKey = new Map();
  for (const p of players) {
    const key = normalizePlayerKey(p?.name);
    if (!key) continue;
    const arr = playersByKey.get(key) || [];
    arr.push(p);
    playersByKey.set(key, arr);
  }

  // Monta plano
  const plan = [];
  let ambiguousPlayers = 0;
  let noFile = 0;
  let alreadyHasPhoto = 0;

  for (const [key, plist] of playersByKey.entries()) {
    if (plist.length !== 1) {
      ambiguousPlayers += 1;
      continue;
    }
    const player = plist[0];
    const fileCandidates = filesByKey.get(key) || [];
    if (!fileCandidates.length) {
      noFile += 1;
      continue;
    }

    if (!args.overwrite && player.photo_url) {
      alreadyHasPhoto += 1;
      continue;
    }

    const file = pickBestFileForKey(fileCandidates);
    if (!file) {
      noFile += 1;
      continue;
    }

    plan.push({ player, file });
  }

  console.log('--- Plano ---');
  console.log('Fotos encontradas:', images.length);
  console.log('Atletas carregados:', players.length);
  console.log('Ambiguos (nome repetido no banco):', ambiguousPlayers);
  console.log('Sem arquivo correspondente:', noFile);
  console.log('Ja tinham foto (pulados):', alreadyHasPhoto);
  console.log('Vai atualizar:', plan.length);

  if (!plan.length) {
    console.log('Nada para fazer.');
    return;
  }

  if (args.dryRun) {
    console.log('\nDRY RUN - exemplos (primeiros 20):');
    plan.slice(0, 20).forEach((x) => {
      console.log(`- ${x.player.name}  <=  ${x.file.name}`);
    });
    return;
  }

  // executa em lotes pequenos
  const chunkSize = 5;
  const chunks = [];
  for (let i = 0; i < plan.length; i += chunkSize) chunks.push(plan.slice(i, i + chunkSize));

  let done = 0;
  const failures = [];

  for (let i = 0; i < chunks.length; i += 1) {
    const chunk = chunks[i];

    await Promise.all(
      chunk.map(async ({ player, file }) => {
        try {
          const rawBuf = await fs.readFile(file.fullPath);
          const originalExt = file.ext.toLowerCase();
          const transformed = await transformForPlayerPhoto(rawBuf, originalExt);
          const buf = transformed.buffer;
          const ext = transformed.ext.toLowerCase();
          const safeKey = normalizePlayerKey(player.name).slice(0, 60) || player.id;
          const storagePath = `${FOLDER}/${safeKey}_${player.id}${ext}`;

          // upsert true pra facilitar re-run
          const uploadRes = await supabase.storage
            .from(BUCKET)
            .upload(storagePath, buf, {
              contentType: transformed.contentType || guessContentType(ext),
              cacheControl: '3600',
              upsert: true,
            });

          if (uploadRes.error) throw uploadRes.error;

          const publicUrlRes = supabase.storage.from(BUCKET).getPublicUrl(storagePath);
          const publicUrl = publicUrlRes?.data?.publicUrl;
          if (!publicUrl) throw new Error('Nao foi possivel obter publicUrl da foto');

          const upd = await supabase.from('players').update({ photo_url: publicUrl }).eq('id', player.id);
          if (upd.error) throw upd.error;

          done += 1;
        } catch (err) {
          failures.push({ id: player.id, name: player.name, file: file?.name, error: err?.message || String(err) });
        }
      })
    );

    console.log(`Progresso: ${done}/${plan.length}`);
  }

  console.log('--- Resultado ---');
  console.log('Atualizados:', done);
  console.log('Falhas:', failures.length);
  if (failures.length) {
    const reportPath = path.join(__dirname, 'attach-player-photos.failures.json');
    await fs.writeFile(reportPath, JSON.stringify({ failures }, null, 2), 'utf8');
    console.log('Relatorio de falhas:', reportPath);
  }
};

main().catch((e) => {
  console.error('Fatal:', e);
  process.exit(1);
});
