// Diagnostic probe for token-radar-01: does the grader execute an entry?
//
// This program is intentionally trivial. It loads the sealed snapshot,
// emits a minimal board (every protocol scored zero), copies the static
// dashboard and screenshots, assembles a dossier, and exits zero.
// It performs no ranking and no modelling. Its only job is to answer
// one question: does run_completes pass for an entry that plainly runs?
// A pass means the grader itself is healthy and our main entry carries
// the fault. A fail means the fault sits on the grader side, and the
// next step is escalation with this entry as evidence. The board below
// is deliberately unranked so the probe measures execution, not skill.
//
// Execution matches the grader: `node /bot/main.ts`, no arguments,
// no network, sealed input under /input, results under /output.
// Locally, MAKEFUN_OUTPUT_DIR replaces /output and --input selects
// a snapshot file or a directory holding snapshot.json.

import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = fileURLToPath(new URL('.', import.meta.url));
const MAX_TEXT = 65_536;
const SHOT_NAME = /^[A-Za-z0-9_][A-Za-z0-9._-]{0,127}$/;

type BoardRow = { slug: string; name: string; score: number };

function flagValue(flag: string, fallback: string): string {
  const pos = process.argv.indexOf(`--${flag}`);
  if (pos >= 0 && pos + 1 < process.argv.length) return process.argv[pos + 1]!;
  const eq = process.argv.find((a) => a.startsWith(`--${flag}=`));
  return eq === undefined ? fallback : eq.slice(flag.length + 3);
}

function fail(message: string, code: number): never {
  process.stderr.write(`probe-minimal: ${message}\n`);
  process.exit(code);
}

function loadSnapshot(path: string): { protocols: unknown[]; watchlist: unknown[] } {
  if (!existsSync(path)) fail(`no snapshot at ${path}`, 2);
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(path, 'utf8')) as unknown;
  } catch {
    fail(`${path} is not valid JSON`, 2);
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    fail(`${path} is not a snapshot object`, 2);
  }
  const snap = parsed as { protocols?: unknown; watchlist?: unknown };
  return {
    protocols: Array.isArray(snap.protocols) ? snap.protocols : [],
    watchlist: Array.isArray(snap.watchlist) ? snap.watchlist : [],
  };
}

function boardFrom(protocols: unknown[]): BoardRow[] {
  return protocols.map((entry) => {
    const rec = (entry ?? {}) as { slug?: unknown; name?: unknown };
    const slug = typeof rec.slug === 'string' ? rec.slug : 'unknown';
    const name = typeof rec.name === 'string' ? rec.name : slug;
    return { slug, name, score: 0 };
  });
}

function mirrorDir(from: string, to: string): string[] {
  if (!existsSync(from)) return [];
  mkdirSync(to, { recursive: true });
  const names: string[] = [];
  for (const name of readdirSync(from)) {
    if (name.startsWith('.')) continue;
    const src = join(from, name);
    if (!statSync(src).isFile()) continue;
    copyFileSync(src, join(to, name));
    names.push(name);
  }
  return names;
}

function dossierText(dashboardNames: string[]): string {
  const lines = [
    '## Dashboard',
    '',
    `Files: ${dashboardNames.length}`,
    ...dashboardNames.map((n) => `- ${n}`),
    '',
    '## Source',
    '',
    'Diagnostic probe: reads the snapshot, writes a board, exits 0.',
    'No ranking, no model, no farm plan.',
    '',
  ];
  const text = lines.join('\n');
  return text.length <= MAX_TEXT ? text : text.slice(0, MAX_TEXT);
}

function dossierImages(outDir: string, shotNames: string[]) {
  return shotNames.map((name) => {
    const bytes = readFileSync(join(outDir, 'screenshots', name));
    const isPng = bytes[0] === 0x89 && bytes[1] === 0x50;
    return {
      name,
      media_type: isPng ? 'image/png' : 'image/jpeg',
      sha256: createHash('sha256').update(bytes).digest('hex'),
      base64: bytes.toString('base64'),
    };
  });
}

function main(): void {
  const inputArg = flagValue('input', '/input');
  const snapshotPath = inputArg.endsWith('.json')
    ? inputArg
    : join(inputArg, 'snapshot.json');
  const outDir = flagValue('output', process.env.MAKEFUN_OUTPUT_DIR ?? '/output');
  const { protocols, watchlist } = loadSnapshot(snapshotPath);
  if (protocols.length === 0) {
    process.stderr.write('probe-minimal: warning: snapshot holds no protocols; writing an empty board\n');
  }

  const boardRows = boardFrom(protocols);
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, 'board.json'), `${JSON.stringify({ rows: boardRows })}\n`);
  writeFileSync(join(outDir, 'data.js'), `window.DATA=${JSON.stringify({ rows: boardRows })};\n`);

  const dashboardNames = mirrorDir(join(scriptDir, 'dashboard'), join(outDir, 'dashboard'));
  const shotNames = mirrorDir(join(scriptDir, 'screenshots'), join(outDir, 'screenshots'));
  if (shotNames.length < 3) {
    fail(`screenshots/ holds ${shotNames.length} images, need 3`, 1);
  }
  for (const name of shotNames) {
    if (!SHOT_NAME.test(name)) fail(`screenshots/${name}: bad name`, 1);
  }

  const doc = {
    schema: 'makefun/dossier/v1',
    cover: 0,
    text: dossierText(dashboardNames),
    images: dossierImages(outDir, shotNames),
  };
  writeFileSync(join(outDir, 'dossier.json'), `${JSON.stringify(doc)}\n`);

  process.stdout.write(
    `probe-minimal: ${protocols.length} protocols, ${watchlist.length} on the watchlist, ${boardRows.length} rows\n` +
    `probe-minimal: wrote board.json, data.js, dashboard (${dashboardNames.length} files), screenshots (${shotNames.length} images), dossier.json\n`,
  );
}

main();
