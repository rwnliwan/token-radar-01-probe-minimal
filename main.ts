// Minimal diagnostic entry for token-radar-01 (probe run_completes).
//
// Purpose: test whether the make.fun grader runs ANY entry at all.
// It reads the sealed snapshot, writes a minimal but well-formed board,
// dashboard, screenshots and dossier, then exits 0. It scores nothing:
// the point is only to see whether run_completes passes or fails.
// If this trivial program also fails run_completes, the fault is on the
// grader side. If it passes, the fault is specific to our main entry.
//
// Runs as the grader does: `node /bot/main.ts` with no arguments,
// no network, input at /input/snapshot.json, output to /output.
// Outside the grader, MAKEFUN_OUTPUT_DIR stands in for /output and
// --input <file|dir> points at the snapshot.

import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = fileURLToPath(new URL('.', import.meta.url));
const TEXT_MAX_BYTES = 65_536;
const IMAGE_NAME = /^[A-Za-z0-9_][A-Za-z0-9._-]{0,127}$/;

function arg(name: string, fallback: string): string {
  const at = process.argv.indexOf(`--${name}`);
  if (at >= 0 && at + 1 < process.argv.length) return process.argv[at + 1]!;
  const withEquals = process.argv.find((a) => a.startsWith(`--${name}=`));
  return withEquals === undefined ? fallback : withEquals.slice(name.length + 3);
}

const inputArg = arg('input', '/input');
const inputFile = inputArg.endsWith('.json') ? inputArg : join(inputArg, 'snapshot.json');
if (!existsSync(inputFile)) {
  process.stderr.write(`probe-minimal: no snapshot at ${inputFile}\n`);
  process.exit(2);
}
const out = arg('output', process.env.MAKEFUN_OUTPUT_DIR ?? '/output');

const raw = readFileSync(inputFile, 'utf8');
let snapshot: unknown;
try {
  snapshot = JSON.parse(raw) as unknown;
} catch {
  process.stderr.write(`probe-minimal: ${inputFile} is not valid JSON\n`);
  process.exit(2);
}
if (typeof snapshot !== 'object' || snapshot === null || Array.isArray(snapshot)) {
  process.stderr.write(`probe-minimal: ${inputFile} is not a snapshot object\n`);
  process.exit(2);
}
const snap = snapshot as { protocols?: unknown[]; watchlist?: unknown[] };
const protocols = Array.isArray(snap.protocols) ? snap.protocols : [];
const watchlist = Array.isArray(snap.watchlist) ? snap.watchlist : [];
if (protocols.length === 0) {
  process.stderr.write('probe-minimal: warning: snapshot holds no protocols; writing an empty board\n');
}

// A minimal board: one row per protocol, scored 0, in snapshot order.
// The diagnostic does not rank anything; it only proves the pipeline runs.
const rows = protocols.map((p) => {
  const rec = (p ?? {}) as { slug?: unknown; name?: unknown };
  const slug = typeof rec.slug === 'string' ? rec.slug : 'unknown';
  const name = typeof rec.name === 'string' ? rec.name : slug;
  return { slug, name, score: 0 };
});

mkdirSync(out, { recursive: true });
writeFileSync(join(out, 'board.json'), `${JSON.stringify({ rows })}\n`);
writeFileSync(join(out, 'data.js'), `window.DATA=${JSON.stringify({ rows })};\n`);

function copyFiles(from: string, to: string): string[] {
  if (!existsSync(from)) return [];
  mkdirSync(to, { recursive: true });
  const copied: string[] = [];
  for (const name of readdirSync(from)) {
    if (name.startsWith('.')) continue;
    const path = join(from, name);
    if (!statSync(path).isFile()) continue;
    copyFileSync(path, join(to, name));
    copied.push(name);
  }
  return copied;
}

copyFiles(join(here, 'dashboard'), join(out, 'dashboard'));
const shots = copyFiles(join(here, 'screenshots'), join(out, 'screenshots'));
if (shots.length < 3) {
  process.stderr.write(`probe-minimal: screenshots/ holds ${shots.length} images, need 3\n`);
  process.exit(1);
}
for (const name of shots) {
  if (!IMAGE_NAME.test(name)) {
    process.stderr.write(`probe-minimal: screenshots/${name}: bad name\n`);
    process.exit(1);
  }
}

// Build the dossier by hand (no vendor library): schema, cover, text, images.
// The text is a short markdown summary; the images carry sha256 + base64.
const dashFiles = readdirSync(join(out, 'dashboard')).filter((n) => !n.startsWith('.')).sort();
const head = [
  '## Dashboard',
  '',
  `Files: ${dashFiles.length}`,
  ...dashFiles.map((f) => `- ${f}`),
  '',
  '## Source',
  '',
  'Minimal diagnostic entry: reads the snapshot, writes a board, exits 0.',
  '',
].join('\n');
const text = head.length <= TEXT_MAX_BYTES ? head : head.slice(0, TEXT_MAX_BYTES);
const images = shots.map((name) => {
  const bytes = readFileSync(join(out, 'screenshots', name));
  const media_type = bytes[0] === 0x89 && bytes[1] === 0x50 ? 'image/png' : 'image/jpeg';
  return {
    name,
    media_type,
    sha256: createHash('sha256').update(bytes).digest('hex'),
    base64: bytes.toString('base64'),
  };
});
const doc = { schema: 'makefun/dossier/v1', cover: 0, text, images };
writeFileSync(join(out, 'dossier.json'), `${JSON.stringify(doc)}\n`);

process.stdout.write(
  `probe-minimal: ${protocols.length} protocols, ${watchlist.length} on the watchlist, ${rows.length} rows\n` +
  `probe-minimal: wrote board.json, data.js, dashboard (${dashFiles.length} files), screenshots (${shots.length} images), dossier.json\n`,
);
