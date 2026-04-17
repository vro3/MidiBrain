import React, { useEffect, useState, useCallback, useRef } from 'react';
import type { MidiDevices, MidiMessagePayload, MidiRoute } from '../types/midi-bridge';

const LiveIOPanel: React.FC = () => {
  const bridge = typeof window !== 'undefined' ? window.midi : undefined;
  const hasBridge = Boolean(bridge);

  const [devices, setDevices] = useState<MidiDevices>({ inputs: [], outputs: [] });
  const [selectedInputs, setSelectedInputs] = useState<Set<string>>(new Set());
  const [selectedOutputs, setSelectedOutputs] = useState<Set<string>>(new Set());
  const [recent, setRecent] = useState<MidiMessagePayload[]>([]);
  const [error, setError] = useState<string | null>(null);
  const recentRef = useRef<MidiMessagePayload[]>([]);

  const refreshDevices = useCallback(async () => {
    if (!bridge) return;
    try {
      const next = await bridge.listDevices();
      setDevices(next);
      setSelectedInputs((prev) => new Set([...prev].filter((n) => next.inputs.includes(n))));
      setSelectedOutputs((prev) => new Set([...prev].filter((n) => next.outputs.includes(n))));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [bridge]);

  useEffect(() => {
    if (!bridge) return;
    refreshDevices();
    const unsubscribe = bridge.onMessage((payload) => {
      recentRef.current = [payload, ...recentRef.current].slice(0, 30);
      setRecent([...recentRef.current]);
    });
    return unsubscribe;
  }, [bridge, refreshDevices]);

  const prevInputsRef = useRef<Set<string>>(new Set());
  const prevOutputsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!bridge) return;
    const prevIn = prevInputsRef.current;
    const prevOut = prevOutputsRef.current;

    const toOpenIn = [...selectedInputs].filter((n) => !prevIn.has(n));
    const toCloseIn = [...prevIn].filter((n) => !selectedInputs.has(n));
    const toOpenOut = [...selectedOutputs].filter((n) => !prevOut.has(n));
    const toCloseOut = [...prevOut].filter((n) => !selectedOutputs.has(n));

    (async () => {
      try {
        for (const n of toOpenIn) await bridge.openInput(n);
        for (const n of toCloseIn) await bridge.closeInput(n);
        for (const n of toOpenOut) await bridge.openOutput(n);
        for (const n of toCloseOut) await bridge.closeOutput(n);

        const routes: MidiRoute[] = [];
        for (const inName of selectedInputs) {
          for (const outName of selectedOutputs) {
            routes.push({ inputName: inName, outputName: outName, enabled: true });
          }
        }
        await bridge.setRoutes(routes);

        prevInputsRef.current = new Set(selectedInputs);
        prevOutputsRef.current = new Set(selectedOutputs);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    })();
  }, [bridge, selectedInputs, selectedOutputs]);

  const toggleInput = (name: string) => {
    setSelectedInputs((prev) => {
      const next = new Set(prev);
      next.has(name) ? next.delete(name) : next.add(name);
      return next;
    });
  };

  const toggleOutput = (name: string) => {
    setSelectedOutputs((prev) => {
      const next = new Set(prev);
      next.has(name) ? next.delete(name) : next.add(name);
      return next;
    });
  };

  const routeCount = selectedInputs.size * selectedOutputs.size;

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
        <h3 className="font-bold uppercase tracking-wide text-zinc-300">Live Routing</h3>
        <button
          onClick={refreshDevices}
          className="px-2 py-1 bg-zinc-800 hover:bg-zinc-700 rounded text-zinc-300"
        >
          Refresh
        </button>
      </div>

      {error && <div className="text-red-400">{error}</div>}

      <div className="text-zinc-500 text-[10px] leading-relaxed">
        Click inputs and outputs to route. Every selected input sends to every selected output.
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <div className="text-zinc-500 uppercase text-[10px] mb-1">
            Inputs {selectedInputs.size > 0 && <span className="text-cyan-400">({selectedInputs.size})</span>}
          </div>
          {devices.inputs.length === 0 && <div className="text-zinc-600 italic">None detected</div>}
          {devices.inputs.map((name) => (
            <button
              key={name}
              onClick={() => toggleInput(name)}
              className={`block w-full text-left px-2 py-1.5 rounded mb-1 truncate border transition-colors ${
                selectedInputs.has(name)
                  ? 'bg-cyan-900/40 text-cyan-300 border-cyan-700/60'
                  : 'bg-zinc-800 hover:bg-zinc-700 border-transparent'
              }`}
            >
              <span className="inline-block w-2 h-2 rounded-full mr-2 align-middle">
                <span
                  className={`block w-2 h-2 rounded-full ${
                    selectedInputs.has(name) ? 'bg-cyan-400 shadow-[0_0_6px_rgba(6,182,212,0.8)]' : 'bg-zinc-600'
                  }`}
                />
              </span>
              {name}
            </button>
          ))}
        </div>

        <div>
          <div className="text-zinc-500 uppercase text-[10px] mb-1">
            Outputs {selectedOutputs.size > 0 && <span className="text-amber-400">({selectedOutputs.size})</span>}
          </div>
          {devices.outputs.length === 0 && <div className="text-zinc-600 italic">None detected</div>}
          {devices.outputs.map((name) => (
            <button
              key={name}
              onClick={() => toggleOutput(name)}
              className={`block w-full text-left px-2 py-1.5 rounded mb-1 truncate border transition-colors ${
                selectedOutputs.has(name)
                  ? 'bg-amber-900/40 text-amber-300 border-amber-700/60'
                  : 'bg-zinc-800 hover:bg-zinc-700 border-transparent'
              }`}
            >
              <span className="inline-block w-2 h-2 rounded-full mr-2 align-middle">
                <span
                  className={`block w-2 h-2 rounded-full ${
                    selectedOutputs.has(name) ? 'bg-amber-400 shadow-[0_0_6px_rgba(251,191,36,0.8)]' : 'bg-zinc-600'
                  }`}
                />
              </span>
              {name}
            </button>
          ))}
        </div>
      </div>

      <div className="text-center text-[10px] text-zinc-500 py-1 border-y border-zinc-800">
        {routeCount === 0
          ? 'No active routes'
          : `${routeCount} active route${routeCount === 1 ? '' : 's'} · ${selectedInputs.size} in → ${selectedOutputs.size} out`}
      </div>

      <div>
        <div className="text-zinc-500 uppercase text-[10px] mb-1">Recent Messages</div>
        <div className="bg-zinc-950 rounded p-2 h-40 overflow-y-auto font-mono text-[10px]">
          {recent.length === 0 && <div className="text-zinc-600 italic">Waiting for MIDI traffic…</div>}
          {recent.map((m, i) => (
            <div key={i} className="text-zinc-400 truncate">
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
