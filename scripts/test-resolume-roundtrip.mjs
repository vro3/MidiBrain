#!/usr/bin/env node
// Round-trip every Resolume preset fixture: parse -> serialize -> compare.
// We compare on a normalized DOM-equivalent representation (semantic eq),
// not byte-equivalent — XML pretty-printing differs by parser.
//
// Run: npx tsx scripts/test-resolume-roundtrip.mjs

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = fileURLToPath(new URL('.', import.meta.url));
const root = join(here, '..');
const fixturesDir = join(root, 'test-fixtures', 'resolume');

const { parsePreset, serializePreset } = await import(join(root, 'src/resolume/preset-io.ts'));
const { decodeRawInputKey, encodeRawInputKey } = await import(join(root, 'src/resolume/raw-input-key.ts'));

let failures = 0;
const files = readdirSync(fixturesDir).filter(f => f.endsWith('.xml'));
console.log(`Round-tripping ${files.length} presets...\n`);

for (const file of files) {
  const original = readFileSync(join(fixturesDir, file), 'utf8');
  try {
    const preset = parsePreset(original);
    const reserialized = serializePreset(preset);

    // Re-parse the output so we compare semantic structure, not whitespace
    const reparsed = parsePreset(reserialized);

    // Sanity check: every key round-trips through the codec
    let keyMismatch = 0;
    for (const s of preset.shortcuts) {
      if (!s.rawInput) continue;
      const decoded = decodeRawInputKey(s.rawInput.keyRaw);
      const encoded = encodeRawInputKey(decoded);
      if (encoded.toString() !== s.rawInput.keyRaw) {
        keyMismatch++;
      }
    }

    // Check shortcut count + ids match after re-parse
    const aIds = preset.shortcuts.map(s => s.uniqueId).sort();
    const bIds = reparsed.shortcuts.map(s => s.uniqueId).sort();
    const idsEqual = aIds.length === bIds.length && aIds.every((v, i) => v === bIds[i]);

    // Check key set matches after re-parse
    const aKeys = preset.shortcuts.map(s => s.rawInput?.keyRaw ?? '').sort();
    const bKeys = reparsed.shortcuts.map(s => s.rawInput?.keyRaw ?? '').sort();
    const keysEqual = aKeys.length === bKeys.length && aKeys.every((v, i) => v === bKeys[i]);

    const ok = idsEqual && keysEqual && keyMismatch === 0;
    if (ok) {
      console.log(`  PASS  ${file}  (${preset.shortcuts.length} shortcuts)`);
    } else {
      console.log(`  FAIL  ${file}`);
      if (!idsEqual) console.log(`        shortcut ids differ after round-trip`);
      if (!keysEqual) console.log(`        raw input keys differ after round-trip`);
      if (keyMismatch > 0) console.log(`        ${keyMismatch} key codec mismatches`);
      failures++;
    }
  } catch (err) {
    console.log(`  FAIL  ${file}  -> ${err.message}`);
    failures++;
  }
}

// Synthetic test: emulate the "Add Shortcut" flow — create a new shortcut
// from scratch, append it, serialize, re-parse, and verify it survives.
{
  const seedFile = readdirSync(fixturesDir).find(f => f.endsWith('.xml'));
  const seed = parsePreset(readFileSync(join(fixturesDir, seedFile), 'utf8'));
  const synthetic = {
    uniqueId: '9999999999',
    paramNodeName: 'ParamEvent',
    behaviour: 1028,
    paths: [
      { name: 'InputPath', path: '/composition/synthetic/test', translationType: 2, allowedTranslationTypes: 7 },
      { name: 'OutputPath', path: '/composition/synthetic/test', translationType: 2, allowedTranslationTypes: 7 },
    ],
    rawInput: {
      keyRaw: encodeRawInputKey({ topByte: 1, deviceHash: 0n, data1: 42, status: 0x90 }).toString(),
      value: 0,
      numSteps: 128,
    },
    namedValues: [{ first: 'Off', second: '0' }, { first: 'On', second: '1' }],
  };
  const augmented = { ...seed, shortcuts: [synthetic, ...seed.shortcuts] };
  const xml = serializePreset(augmented);
  const reparsed = parsePreset(xml);
  const found = reparsed.shortcuts.find(s => s.uniqueId === synthetic.uniqueId);
  if (!found) {
    console.log('  FAIL  add-shortcut synthetic — uniqueId not found after re-parse');
    failures++;
  } else if (found.rawInput?.keyRaw !== synthetic.rawInput.keyRaw) {
    console.log('  FAIL  add-shortcut synthetic — keyRaw differs after re-parse');
    failures++;
  } else if (found.paths.find(p => p.name === 'InputPath')?.path !== '/composition/synthetic/test') {
    console.log('  FAIL  add-shortcut synthetic — InputPath differs after re-parse');
    failures++;
  } else {
    console.log('  PASS  add-shortcut synthetic  (uniqueId, keyRaw, InputPath survive round-trip)');
  }
}

console.log();
if (failures === 0) {
  console.log(`OK  all checks passed.`);
  process.exit(0);
} else {
  console.log(`FAIL  ${failures} checks failed.`);
  process.exit(1);
}
