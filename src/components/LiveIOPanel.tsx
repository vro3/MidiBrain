import React, { useEffect, useState, useCallback, useRef } from 'react';
import type { MidiDevices, MidiMessagePayload, MidiRoute } from '../types/midi-bridge';

const LiveIOPanel: React.FC = () => {
  const bridge = typeof window !== 'undefined' ? window.midi : undefined;
  const hasBridge = Boolean(bridge);

  const [devices, setDevices] = useState<MidiDevices>({ inputs: [], outputs: [] });
  const [openInputs, setOpenInputs] = useState<Set<string>>(new Set());
  const [openOutputs, setOpenOutputs] = useState<Set<string>>(new Set());
  const [routes, setRoutes] = useState<MidiRoute[]>([]);
  const [recent, setRecent] = useState<MidiMessagePayload[]>([]);
  const [error, setError] = useState<string | null>(null);
  const recentRef = useRef<MidiMessagePayload[]>([]);

  const refreshDevices = useCallback(async () => {
    if (!bridge) return;
    try {
      const next = await bridge.listDevices();
      setDevices(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [bridge]);

  useEffect(() => {
    if (!bridge) return;
    refreshDevices();
    const unsubscribe = bridge.onMessage((payload) => {
      recentRef.current = [payload, ...recentRef.current].slice(0, 20);
      setRecent([...recentRef.current]);
    });
    return unsubscribe;
  }, [bridge, refreshDevices]);

  const toggleInput = async (name: string) => {
    if (!bridge) return;
    if (openInputs.has(name)) {
      await bridge.closeInput(name);
      const next = new Set(openInputs);
      next.delete(name);
      setOpenInputs(next);
    } else {
      await bridge.openInput(name);
      setOpenInputs(new Set(openInputs).add(name));
    }
  };

  const toggleOutput = async (name: string) => {
    if (!bridge) return;
    if (openOutputs.has(name)) {
      await bridge.closeOutput(name);
      const next = new Set(openOutputs);
      next.delete(name);
      setOpenOutputs(next);
    } else {
      await bridge.openOutput(name);
      setOpenOutputs(new Set(openOutputs).add(name));
    }
  };

  const addRoute = async (inputName: string, outputName: string) => {
    if (!bridge) return;
    const next: MidiRoute[] = [...routes, { inputName, outputName, enabled: true }];
    setRoutes(next);
    await bridge.setRoutes(next);
  };

  const removeRoute = async (idx: number) => {
    if (!bridge) return;
    const next = routes.filter((_, i) => i !== idx);
    setRoutes(next);
    await bridge.setRoutes(next);
  };

  if (!hasBridge) {
    return (
      <div className="p-4 bg-zinc-900 border border-zinc-700 rounded-lg text-zinc-400 text-xs">
        Live MIDI bridge unavailable. Run in Electron (<code className="text-zinc-200">npm run dev:electron</code>) to enable.
      </div>
    );
  }

  return (
    <div className="p-4 bg-zinc-900 border border-zinc-700 rounded-lg text-zinc-200 text-xs space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-bold uppercase tracking-wide text-zinc-300">Live I/O</h3>
        <button
          onClick={refreshDevices}
          className="px-2 py-1 bg-zinc-800 hover:bg-zinc-700 rounded text-zinc-300"
        >
          Refresh
        </button>
      </div>

      {error && <div className="text-red-400">{error}</div>}

      <div className="grid grid-cols-2 gap-3">
        <div>
          <div className="text-zinc-500 uppercase text-[10px] mb-1">Inputs</div>
          {devices.inputs.length === 0 && <div className="text-zinc-600 italic">None detected</div>}
          {devices.inputs.map((name) => (
            <button
              key={name}
              onClick={() => toggleInput(name)}
              className={`block w-full text-left px-2 py-1 rounded mb-1 truncate ${
                openInputs.has(name) ? 'bg-cyan-900/40 text-cyan-300' : 'bg-zinc-800 hover:bg-zinc-700'
              }`}
            >
              {openInputs.has(name) ? '● ' : '○ '}
              {name}
            </button>
          ))}
        </div>

        <div>
          <div className="text-zinc-500 uppercase text-[10px] mb-1">Outputs</div>
          {devices.outputs.length === 0 && <div className="text-zinc-600 italic">None detected</div>}
          {devices.outputs.map((name) => (
            <button
              key={name}
              onClick={() => toggleOutput(name)}
              className={`block w-full text-left px-2 py-1 rounded mb-1 truncate ${
                openOutputs.has(name) ? 'bg-amber-900/40 text-amber-300' : 'bg-zinc-800 hover:bg-zinc-700'
              }`}
            >
              {openOutputs.has(name) ? '● ' : '○ '}
              {name}
            </button>
          ))}
        </div>
      </div>

      <div>
        <div className="text-zinc-500 uppercase text-[10px] mb-1">Routes</div>
        {routes.length === 0 && <div className="text-zinc-600 italic">No routes. Open an input + output, then add a route below.</div>}
        {routes.map((route, idx) => (
          <div key={idx} className="flex items-center gap-2 mb-1">
            <span className="flex-1 truncate">{route.inputName} → {route.outputName}</span>
            <button
              onClick={() => removeRoute(idx)}
              className="px-2 py-0.5 bg-red-900/40 hover:bg-red-900/60 rounded text-red-300"
            >
              Remove
            </button>
          </div>
        ))}
        {openInputs.size > 0 && openOutputs.size > 0 && (
          <div className="mt-2 flex gap-2">
            <select id="route-in" className="flex-1 bg-zinc-800 px-2 py-1 rounded">
              {Array.from(openInputs).map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
            <select id="route-out" className="flex-1 bg-zinc-800 px-2 py-1 rounded">
              {Array.from(openOutputs).map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
            <button
              onClick={() => {
                const inEl = document.getElementById('route-in') as HTMLSelectElement | null;
                const outEl = document.getElementById('route-out') as HTMLSelectElement | null;
                if (inEl && outEl) addRoute(inEl.value, outEl.value);
              }}
              className="px-2 py-1 bg-emerald-900/40 hover:bg-emerald-900/60 rounded text-emerald-300"
            >
              Add
            </button>
          </div>
        )}
      </div>

      <div>
        <div className="text-zinc-500 uppercase text-[10px] mb-1">Recent Messages</div>
        <div className="bg-zinc-950 rounded p-2 h-32 overflow-y-auto font-mono text-[10px]">
          {recent.length === 0 && <div className="text-zinc-600 italic">Waiting for MIDI traffic…</div>}
          {recent.map((m, i) => (
            <div key={i} className="text-zinc-400">
              <span className="text-cyan-400">{m.inputName}</span>{' '}
              <span className="text-amber-400">{m.eventType}</span>{' '}
              <span className="text-zinc-500">{JSON.stringify(m.msg)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default LiveIOPanel;
