/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { ChevronRight, ChevronLeft, FileCode2 } from 'lucide-react';
import MidiRouter from './components/MidiRouter';
import LiveIOPanel from './components/LiveIOPanel';
import ResolumePanel from './components/ResolumePanel';
import LoopMidiPrompt from './components/LoopMidiPrompt';
import type { MidiDevices } from './types/midi-bridge';
import { migrateBackupRouterKeys } from './migrations';

const MIN_WIDTH = 280;
const MAX_WIDTH = 900;
const DEFAULT_WIDTH = 420;
const STORAGE_KEY = 'midibrain.sidebarWidth';
const ALIAS_KEY = 'midibrain.portAliases';
const ROUTING_KEY = 'midibrain.liveRouting';
const VIRTUAL_PORTS_KEY = 'midibrain.virtualPorts';

// Keys persisted by MidiRouter. Listed here so backup/restore can round-trip
// them without needing to lift all that state into App.
const MIDIROUTER_STORAGE_KEYS = [
  'midibrain.matrix',
  'midibrain.matrixRoutings',
  'midibrain.presets',
  'midibrain.channelNames',
  'midibrain.rowHeights',
];

const BACKUP_KIND = 'midibrain-backup';
const BACKUP_VERSION = 2;

type AliasMap = Record<string, string>;
type RoutingMap = Record<string, string[]>;

function loadJSON<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    return (parsed ?? fallback) as T;
  } catch {
    return fallback;
  }
}

function loadAliases(): AliasMap {
  const obj = loadJSON<AliasMap>(ALIAS_KEY, {});
  return typeof obj === 'object' && obj ? obj : {};
}

function loadRouting(): RoutingMap {
  const obj = loadJSON<RoutingMap>(ROUTING_KEY, {});
  return typeof obj === 'object' && obj ? obj : {};
}

export default function App() {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [resolumeOpen, setResolumeOpen] = useState(false);
  const [resolumeAutoCommand, setResolumeAutoCommand] = useState<'open' | 'save' | 'save-as' | null>(null);
  const [virtualPortsBroken, setVirtualPortsBroken] = useState(false);
  const isWindows = typeof window !== 'undefined' && window.platform?.os === 'win32';
  const [sidebarWidth, setSidebarWidth] = useState<number>(() => {
    const stored = typeof window !== 'undefined' ? window.localStorage.getItem(STORAGE_KEY) : null;
    const n = stored ? Number(stored) : NaN;
    return Number.isFinite(n) && n >= MIN_WIDTH && n <= MAX_WIDTH ? n : DEFAULT_WIDTH;
  });
  const draggingRef = useRef(false);

  const [aliases, setAliases] = useState<AliasMap>(() => loadAliases());
  const [routing, setRouting] = useState<RoutingMap>(() => loadRouting());
  const [devices, setDevices] = useState<MidiDevices>({ inputs: [], outputs: [] });
  const [deviceError, setDeviceError] = useState<string | null>(null);
  const [virtualPorts, setVirtualPorts] = useState<string[]>(() =>
    loadJSON<string[]>(VIRTUAL_PORTS_KEY, []),
  );

  useEffect(() => {
    window.localStorage.setItem(VIRTUAL_PORTS_KEY, JSON.stringify(virtualPorts));
  }, [virtualPorts]);

  // macOS application menu commands. Open/Save/Save As… mirror the buttons in
  // ResolumePanel so the app feels native.
  useEffect(() => {
    const bridge = typeof window !== 'undefined' ? window.midi : undefined;
    if (!bridge?.onMenuCommand) return;
    const off = bridge.onMenuCommand((channel) => {
      if (channel === 'menu:open-resolume') {
        setResolumeOpen(true);
        setResolumeAutoCommand('open');
      } else if (channel === 'menu:save-resolume') {
        if (resolumeOpenRef.current) setResolumeAutoCommand('save');
      } else if (channel === 'menu:save-resolume-as') {
        if (resolumeOpenRef.current) setResolumeAutoCommand('save-as');
      } else if (channel === 'menu:close-resolume') {
        setResolumeOpen(false);
      }
    });
    return off;
  }, []);

  // Track resolumeOpen in a ref so the menu listener (registered once on
  // mount) can read the latest value without re-registering on every change.
  const resolumeOpenRef = useRef(resolumeOpen);
  useEffect(() => { resolumeOpenRef.current = resolumeOpen; }, [resolumeOpen]);

  const refreshDevices = useCallback(async () => {
    const bridge = typeof window !== 'undefined' ? window.midi : undefined;
    if (!bridge) return;
    try {
      const next = await bridge.listDevices();
      setDevices((prev) => {
        // Shallow-compare by stringified sorted arrays — avoids re-triggering
        // the port-open effect every poll tick when nothing changed.
        const sameInputs = prev.inputs.length === next.inputs.length
          && prev.inputs.every((n, i) => n === next.inputs[i]);
        const sameOutputs = prev.outputs.length === next.outputs.length
          && prev.outputs.every((n, i) => n === next.outputs[i]);
        return sameInputs && sameOutputs ? prev : next;
      });
      setDeviceError(null);
    } catch (err) {
      setDeviceError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  useEffect(() => {
    refreshDevices();
    // Poll every 3s to pick up hotplug (node-midi has no native event for
    // device changes cross-platform, so polling is the portable answer).
    const interval = window.setInterval(refreshDevices, 3000);
    // Refresh immediately when the app regains focus — faster than waiting
    // for the next poll tick when the user plugged something in while the
    // window was backgrounded.
    const onFocus = () => refreshDevices();
    const onVisible = () => {
      if (document.visibilityState === 'visible') refreshDevices();
    };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [refreshDevices]);

  // Recreate persisted virtual ports on mount. Each name corresponds to both
  // a virtual input and virtual output with that name (a "device" to the user).
  // On Windows, virtual port creation fails without loopMIDI installed; we
  // surface that so the LoopMidiPrompt can fire.
  useEffect(() => {
    const bridge = typeof window !== 'undefined' ? window.midi : undefined;
    if (!bridge) return;
    let cancelled = false;
    (async () => {
      let failed = false;
      for (const name of virtualPorts) {
        if (cancelled) return;
        try {
          const inOk = await bridge.createVirtualInput(name);
          const outOk = await bridge.createVirtualOutput(name);
          if (!inOk || !outOk) failed = true;
        } catch {
          failed = true;
        }
      }
      // If the user has no persisted virtual ports, try a probe on Windows so
      // we can surface the loopMIDI prompt before they ever click "+".
      if (!cancelled && isWindows && virtualPorts.length === 0) {
        try {
          const probeName = '__midibrain_probe__';
          const ok = await bridge.createVirtualOutput(probeName);
          if (ok) {
            await bridge.destroyVirtualOutput(probeName);
          } else {
            failed = true;
          }
        } catch {
          failed = true;
        }
      }
      if (!cancelled && failed) setVirtualPortsBroken(true);
      await refreshDevices();
    })();
    return () => { cancelled = true; };
    // Intentionally only on mount — later additions are handled inline.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const createVirtualPort = useCallback(async (name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const bridge = typeof window !== 'undefined' ? window.midi : undefined;
    if (!bridge) return;
    if (virtualPorts.includes(trimmed)) return;
    const inOk = await bridge.createVirtualInput(trimmed);
    const outOk = await bridge.createVirtualOutput(trimmed);
    if (inOk && outOk) {
      setVirtualPorts((prev) => [...prev, trimmed]);
      await refreshDevices();
    }
  }, [virtualPorts, refreshDevices]);

  const destroyVirtualPort = useCallback(async (name: string) => {
    const bridge = typeof window !== 'undefined' ? window.midi : undefined;
    if (!bridge) return;
    await bridge.destroyVirtualInput(name);
    await bridge.destroyVirtualOutput(name);
    setVirtualPorts((prev) => prev.filter((n) => n !== name));
    await refreshDevices();
  }, [refreshDevices]);

  // App owns device lifecycle: open every detected input/output eagerly so both
  // panels can subscribe and send without coordinating opens/closes. Engine's
  // openInput/openOutput are idempotent; failures (port in use) are silent.
  useEffect(() => {
    const bridge = typeof window !== 'undefined' ? window.midi : undefined;
    if (!bridge) return;
    let cancelled = false;
    (async () => {
      for (const name of devices.inputs) {
        if (cancelled) return;
        try { await bridge.openInput(name); } catch { /* noop */ }
      }
      for (const name of devices.outputs) {
        if (cancelled) return;
        try { await bridge.openOutput(name); } catch { /* noop */ }
      }
    })();
    return () => { cancelled = true; };
  }, [devices]);

  useEffect(() => {
    window.localStorage.setItem(ALIAS_KEY, JSON.stringify(aliases));
  }, [aliases]);

  useEffect(() => {
    window.localStorage.setItem(ROUTING_KEY, JSON.stringify(routing));
  }, [routing]);

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, String(sidebarWidth));
  }, [sidebarWidth]);

  const exportBackup = useCallback(() => {
    const router: Record<string, unknown> = {};
    for (const key of MIDIROUTER_STORAGE_KEYS) {
      const raw = window.localStorage.getItem(key);
      if (raw != null) {
        try { router[key] = JSON.parse(raw); } catch { router[key] = raw; }
      }
    }
    const payload = {
      kind: BACKUP_KIND,
      version: BACKUP_VERSION,
      exportedAt: new Date().toISOString(),
      aliases,
      liveRouting: routing,
      router,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    const stamp = new Date().toISOString().slice(0, 10);
    link.download = `midibrain-backup-${stamp}.midibrain`;
    link.click();
    URL.revokeObjectURL(link.href);
  }, [aliases, routing]);

  const importBackup = useCallback((file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result));
        if (!parsed || typeof parsed !== 'object') throw new Error('Invalid backup file');

        // Write MidiRouter localStorage keys first so a reload picks them up.
        // Rewrite any old-format (underscore) keys to the current dot-notation
        // form so imported backups from older builds still load.
        const rawRouter = (parsed.router && typeof parsed.router === 'object') ? parsed.router : null;
        const router = rawRouter ? migrateBackupRouterKeys(rawRouter as Record<string, unknown>) : null;
        if (router) {
          for (const key of MIDIROUTER_STORAGE_KEYS) {
            if (key in router) {
              window.localStorage.setItem(key, JSON.stringify(router[key]));
            }
          }
        }

        // Legacy v1 format had { aliases, routing } at the top level.
        if (parsed.aliases && typeof parsed.aliases === 'object') {
          window.localStorage.setItem(ALIAS_KEY, JSON.stringify(parsed.aliases));
        }
        const live = parsed.liveRouting ?? parsed.routing;
        if (live && typeof live === 'object') {
          window.localStorage.setItem(ROUTING_KEY, JSON.stringify(live));
        }

        // Reload so every useState initializer re-reads from localStorage
        // and the engine's route set gets rebuilt from the restored routing.
        window.location.reload();
      } catch (err) {
        alert(`Could not restore backup: ${err instanceof Error ? err.message : String(err)}`);
      }
    };
    reader.readAsText(file);
  }, []);

  const setAlias = useCallback((raw: string, next: string) => {
    setAliases((prev) => {
      const updated = { ...prev };
      if (next.length === 0 || next === raw) {
        delete updated[raw];
      } else {
        updated[raw] = next;
      }
      return updated;
    });
  }, []);

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    draggingRef.current = true;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }, []);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!draggingRef.current) return;
      setSidebarWidth(Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, e.clientX)));
    };
    const onUp = () => {
      if (!draggingRef.current) return;
      draggingRef.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, []);

  return (
    <div className="flex w-screen h-screen overflow-hidden">
      <div
        className="relative flex-shrink-0 h-full bg-zinc-950 border-r border-zinc-800"
        style={{ width: sidebarOpen ? sidebarWidth : 0 }}
      >
        {sidebarOpen && (
          <div
            onMouseDown={onMouseDown}
            className="absolute top-0 -right-1 w-2 h-full cursor-col-resize z-40 group"
            title="Drag to resize"
          >
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-px h-full bg-zinc-800 group-hover:bg-cyan-500 transition-colors" />
          </div>
        )}

        <button
          onClick={() => setSidebarOpen((v) => !v)}
          className="absolute top-4 -right-8 z-50 w-8 h-16 bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 border-l-0 rounded-r flex items-center justify-center text-zinc-300"
          title={sidebarOpen ? 'Hide Live Routing' : 'Show Live Routing'}
        >
          {sidebarOpen ? <ChevronLeft size={16} /> : <ChevronRight size={16} />}
        </button>

        {sidebarOpen && (
          <div className="h-full overflow-y-auto p-3">
            <LiveIOPanel
              aliases={aliases}
              setAlias={setAlias}
              setAliases={setAliases}
              routing={routing}
              setRouting={setRouting}
              devices={devices}
              refreshDevices={refreshDevices}
              deviceError={deviceError}
              onBackup={exportBackup}
              onRestore={importBackup}
              virtualPorts={virtualPorts}
              onCreateVirtualPort={createVirtualPort}
              onDestroyVirtualPort={destroyVirtualPort}
            />
          </div>
        )}
      </div>

      <div className="flex-1 min-w-0 relative h-full overflow-y-auto">
        <button
          onClick={() => setResolumeOpen(true)}
          className="absolute top-3 right-3 z-30 flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded bg-zinc-900 hover:bg-zinc-800 text-zinc-200 border border-zinc-700"
          title="Open Resolume Arena MIDI shortcut preset editor"
        >
          <FileCode2 size={14} /> Resolume Presets
        </button>
        <MidiRouter
          aliases={aliases}
          setAliases={setAliases}
          routing={routing}
          setRouting={setRouting}
          devices={devices}
        />
      </div>

      {resolumeOpen && (
        <ResolumePanel
          onClose={() => setResolumeOpen(false)}
          autoCommand={resolumeAutoCommand}
          onAutoCommandConsumed={() => setResolumeAutoCommand(null)}
        />
      )}

      <LoopMidiPrompt isWindows={isWindows} virtualPortsBroken={virtualPortsBroken} />
    </div>
  );
}
