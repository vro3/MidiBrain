# HANDOFF — MidiBrain
Generated 2026-04-16 by overnight audit agent (Haiku 4.5)

## What it does
MidiBrain is an Electron + React desktop application for archival and routing of MIDI mappings. The core functionality is a visual MIDI router (`MidiRouter` component, 1751 lines) that handles note, CC (Control Change), and Program Change routing with collapsible sections for organization. It supports CSV/XLSX import and PDF export of mappings via jspdf and PapaParse. The tool runs as a native macOS app (DMG distributable) wrapping the Vite-bundled React frontend.

## Run it (verified commands)
From package.json `scripts`:

| Script | Purpose | Status |
|--------|---------|--------|
| `npm run dev` | Vite dev server on port 3456 | Ready — verified config in vite.config.ts |
| `npm run dev:electron` | Dev Electron + Vite (concurrent) | Ready — uses concurrently + wait-on |
| `npm run build` | Vite bundle to dist/ | Ready — Tested (dist/ present) |
| `npm run build:electron` | Build + electron-builder macOS DMG | Ready — Tested (release/ contains arm64.dmg built 2026-03-16) |
| `npm run preview` | Preview built app locally | Ready — Vite preview mode |
| `npm run clean` | Rm dist/ and release/ | Ready |
| `npm run lint` | TypeScript type check (no emit) | Ready |

**Prerequisites:** Node.js (npm install).

## State today
- **Status:** Working v1.0.0, confirmed buildable
  - Electron main process: electron/main.cjs (properly isolated, loads dev or dist/index.html)
  - React entry: src/main.tsx → src/App.tsx → src/components/MidiRouter.tsx
  - Build artifacts: dist/ (2026-03-16) and release/MidiBrain-1.0.0-arm64.dmg (2026-03-16, 118 MB)
- **Last meaningful file mod:** 2026-03-16 09:28 UTC on src/components/MidiRouter.tsx (commit `4a7c99f` — "feat: add MIDI CC and Program Change routing with collapsible sections")
- **Dirty?:** No — `git status` reports clean working tree on main, no unpushed commits
- **Dependencies locked:** package-lock.json present (npm 10.x compatible)

## Missing pieces
- **No MIDI Web API integration** — Component reads MIDI data structure but no live input from device. No webmidi.js, no navigator.requestMIDIAccess. Mapping is archival/reference only, not active routing.
- **No run-of-show integration** — Unlike DJKontrol (reads live djay state), MidiBrain is static/imported. No real-time sync to external sequencer or MIDI controller.
- **No authentication/cloud sync** — All mappings stored locally; no user accounts, remote backup, or multi-device sync.
- **No version upgrade path** — Electron app has no auto-update mechanism (no electron-updater).

## Known bugs
- None documented. README was auto-generated (AI Studio boilerplate template, mentions Gemini API key which does not apply). No CLAUDE.md, no TODO.md, no issue tracker in this repo.
- Large component (`MidiRouter.tsx` 81 KB) suggests possible refactoring opportunity to split collapsible sections into sub-components, but no functional defect reported.

## Overlaps
**Strong overlap with DJKontrol** (sibling project in personal-projects/).
- **DJKontrol:** Swift macOS tool. Reads live djay Pro deck state via Accessibility API (key, title, artist, BPM, pitch). Outputs OSC. Purpose: **real-time DJ state capture**.
- **MidiBrain:** Electron/React app. Archival MIDI mapping viewer/editor. Supports CSV/XLSX import. Purpose: **static MIDI mapping reference**.

**Consolidation candidate:** Both deal with MIDI/control state but serve different ends. DJKontrol is input (read live state) → MidiBrain is archival/output (store + visualize mappings). Could share a common MIDI format library (e.g., MIDI CC/note constants, mapping serialization) if multiple projects grow. Currently no code overlap detected.

**Tertiary project:** TrapKat exists in sibling folder but uninspected.

## Recommended next step
1. **If archival only:** MidiBrain is done. Document that it's a reference tool (no live MIDI input). Close out or archive.
2. **If adding live MIDI:** Integrate Web MIDI API (webmidi.js) to read from devices. Map real-time device input to stored mappings. This would converge it toward DJKontrol's real-time philosophy.
3. **If expansion planned:** Extract shared MIDI types (CC tables, note mappings, serialization) into a `@vrcg/midi-format` package. Both DJKontrol and MidiBrain could consume it, reducing duplication if a third tool (TrapKat?) also touches MIDI.
4. **Build quality:** App builds and ships. No blockers to distribution. Consider adding electron-updater if releases become frequent.

