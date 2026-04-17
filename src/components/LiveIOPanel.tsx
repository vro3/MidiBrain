import React, { useEffect, useState, useCallback, useRef } from 'react';
import type { MidiDevices, MidiMessagePayload, MidiRoute } from '../types/midi-bridge';

type RoutingMap = Record<string, string[]>;

const LiveIOPanel: React.FC = () => {
  const bridge = typeof window !== 'undefined' ? window.midi : undefined;
  const hasBridge = Boolean(bridge);

  const [devices, setDevices] = useState<MidiDevices>({ inputs: [], outputs: [] });
  const [routing, setRouting] = useState<RoutingMap>({});
  const [recent, setRecent] = useState<MidiMessagePayload[]>([]);
  const [error, setError] = useState<string | null>(null);
  const recentRef = useRef<MidiMessagePayload[]>([]);

  const refreshDevices = useCallback(async () => {
    if (!bridge) return;
    try {
      const next = await bridge.listDevices();
      setDevices(next);
      setRouting((prev) => {
        const cleaned: RoutingMap = {};
        for (const inName of Object.keys(prev)) {
          if (!next.inputs.includes(inName)) continue;
          const keptOuts = prev[inName].filter((o) => next.outputs.includes(o));
          if (keptOuts.length > 0) cleaned[inName] = keptOuts;
        }
        return cleaned;
      });
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
    const neededInputs = new Set(Object.keys(routing).filter((k) => routing[k].length > 0));
    const neededOutputs = new Set<string>();
    for (const inName of Object.keys(routing)) {
      for (const o of routing[inName]) neededOutputs.add(o);
    }

    const prevIn = prevInputsRef.current;
    const prevOut = prevOutputsRef.current;
    const toOpenIn = [...neededInputs].filter((n) => !prevIn.has(n));
    const toCloseIn = [...prevIn].filter((n) => !neededInputs.has(n));
    const toOpenOut = [...neededOutputs].filter((n) => !prevOut.has(n));
    const toCloseOut = [...prevOut].filter((n) => !neededOutputs.has(n));

    (async () => {
      try {
        for (const n of toOpenIn) await bridge.openInput(n);
        for (const n of toCloseIn) await bridge.closeInput(n);
        for (const n of toOpenOut) await bridge.openOutput(n);
        for (const n of toCloseOut) await bridge.closeOutput(n);

        const routes: MidiRoute[] = [];
        for (const inName of Object.keys(routing)) {
          for (const outName of routing[inName]) {
            routes.push({ inputName: inName, outputName: outName, enabled: true });
          }
        }
        await bridge.setRoutes(routes);

        prevInputsRef.current = neededInputs;
        prevOutputsRef.current = neededOutputs;
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    })();
  }, [bridge, routing]);

  const toggleRoute = (inputName: string, outputName: string) => {
    setRouting((prev) => {
      const current = prev[inputName] ?? [];
      const next = { ...prev };
      if (current.includes(outputName)) {
        const filtered = current.filter((o) => o !== outputName);
        if (filtered.length === 0) delete next[inputName];
        else next[inputName] = filtered;
      } else {
        next[inputName] = [...current, outputName];
      }
      return next;
    });
  };

  const clearInput = (inputName: string) => {
    setRouting((prev) => {
      const next = { ...prev };
      delete next[inputName];
      return next;
    });
  };

  const clearAll = () => setRouting({});

  const routeCount = Object.keys(routing).reduce((acc, k) => acc + routing[k].length, 0);
  const inputsWithActivity = new Set(recent.slice(0, 3).map((r) => r.inputName));

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
        <div className="flex gap-1">
          {routeCount > 0 && (
            <button
              onClick={clearAll}
              className="px-2 py-1 bg-zinc-800 hover:bg-zinc-700 rounded text-zinc-400"
              title="Clear all routes"
            >
              Clear
            </button>
          )}
          <button
            onClick={refreshDevices}
            className="px-2 py-1 bg-zinc-800 hover:bg-zinc-700 rounded text-zinc-300"
          >
            Refresh
          </button>
        </div>
      </div>

      {error && <div className="text-red-400">{error}</div>}

      <div className="text-zinc-500 text-[10px] leading-relaxed">
        For each input, click the outputs it should route to. Chips light up when the route is active.
      </div>

      {devices.inputs.length === 0 && (
        <div className="text-zinc-600 italic py-4 text-center">No MIDI inputs detected</div>
      )}

      {devices.inputs.length > 0 && devices.outputs.length === 0 && (
        <div className="text-zinc-600 italic py-4 text-center">No MIDI outputs detected</div>
      )}

      <div className="space-y-3">
        {devices.inputs.map((inName) => {
          const selectedOuts = routing[inName] ?? [];
          const isActive = selectedOuts.length > 0;
          const isReceiving = inputsWithActivity.has(inName);
          return (
            <div
              key={inName}
              className={`rounded-lg border p-2 transition-colors ${
                isActive ? 'bg-cyan-950/30 border-cyan-900/60' : 'bg-zinc-950 border-zinc-800'
              }`}
            >
              <div className="flex items-center gap-2 mb-1.5">
                <span
                  className={`w-2 h-2 rounded-full flex-shrink-0 ${
                    isReceiving
                      ? 'bg-cyan-400 shadow-[0_0_6px_rgba(6,182,212,0.9)]'
                      : isActive
                        ? 'bg-cyan-700'
                        : 'bg-zinc-700'
                  }`}
                />
                <span className="flex-1 truncate font-bold text-zinc-200">{inName}</span>
                {isActive && (
                  <button
                    onClick={() => clearInput(inName)}
                    className="text-zinc-500 hover:text-red-400 text-[10px] px-1"
                    title="Clear this input's routes"
                  >
                    ✕
                  </button>
                )}
              </div>
              <div className="flex flex-wrap gap-1 pl-4">
                {devices.outputs.length === 0 ? (
                  <span className="text-zinc-600 italic text-[10px]">(no outputs available)</span>
                ) : (
                  devices.outputs.map((outName) => {
                    const on = selectedOuts.includes(outName);
                    return (
                      <button
                        key={outName}
                        onClick={() => toggleRoute(inName, outName)}
                        className={`px-2 py-1 rounded border text-[10px] truncate max-w-[180px] transition-colors ${
                          on
                            ? 'bg-amber-900/50 text-amber-200 border-amber-700/60'
                            : 'bg-zinc-800 text-zinc-400 border-transparent hover:bg-zinc-700 hover:text-zinc-200'
                        }`}
                        title={outName}
                      >
                        {on ? '→ ' : ''}
                        {outName}
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="text-center text-[10px] text-zinc-500 py-1 border-y border-zinc-800">
        {routeCount === 0
          ? 'No active routes'
          : `${routeCount} active route${routeCount === 1 ? '' : 's'}`}
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
