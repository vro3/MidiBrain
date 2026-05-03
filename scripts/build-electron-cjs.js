#!/usr/bin/env node
// Bundle and obfuscate electron/main.cjs + electron/preload.cjs into
// electron-dist/ for production builds. midi-engine.cjs is required by
// main.cjs at runtime via require('./midi-engine.cjs') — we bundle it
// inline (no external) so the obfuscation hides engine internals too.
//
// Run: npm run build (called as part of build:electron)

import { build } from 'esbuild';
import JavaScriptObfuscator from 'javascript-obfuscator';
import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const outDir = join(root, 'electron-dist');

rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });

const obfuscatorOptions = {
  compact: true,
  controlFlowFlattening: true,
  controlFlowFlatteningThreshold: 0.5,
  identifierNamesGenerator: 'mangled-shuffled',
  renameGlobals: false,
  selfDefending: false,
  splitStrings: true,
  splitStringsChunkLength: 8,
  stringArray: true,
  stringArrayEncoding: ['base64'],
  stringArrayThreshold: 0.6,
  target: 'node',
};

// `electron`, `node-midi`, and `easymidi` cannot be bundled — they are
// resolved at runtime against electron's node_modules.
const externals = ['electron', 'node-midi', 'easymidi', 'fs', 'fs/promises', 'path', 'os'];

async function bundle(entry, outName) {
  const result = await build({
    entryPoints: [join(root, 'electron', entry)],
    bundle: true,
    platform: 'node',
    target: 'node20',
    format: 'cjs',
    external: externals,
    write: false,
    minify: true,
    legalComments: 'none',
    logLevel: 'warning',
  });
  const bundled = result.outputFiles[0].text;
  const obfuscated = JavaScriptObfuscator.obfuscate(bundled, obfuscatorOptions).getObfuscatedCode();
  writeFileSync(join(outDir, outName), obfuscated, 'utf8');
  process.stdout.write(`  built ${outName}  (${obfuscated.length.toLocaleString()} bytes)\n`);
}

console.log('Bundling + obfuscating electron entry points...');
await bundle('main.cjs', 'main.cjs');
await bundle('preload.cjs', 'preload.cjs');
console.log('done.');
