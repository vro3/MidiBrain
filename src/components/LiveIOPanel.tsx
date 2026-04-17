import React, { useEffect, useState, useCallback, useRef } from 'react';
import { Pencil, Download, Upload } from 'lucide-react';
import type { MidiDevices, MidiMessagePayload, MidiRoute } from '../types/midi-bridge';

type RoutingMap = Record<string, string[]>;
type AliasMap = Record<string, string>;

interface LiveIOPanelProps {
  aliases: AliasMap;
  setAlias: (raw: string, next: string) => void;
  setAliases: React.Dispatch<React.SetStateAction<AliasMap>>;
  routing: RoutingMap;
  setRouting: React.Dispatch<React.SetStateAction<RoutingMap>>;
}

interface EditableNameProps {
  raw: string;
  alias: string | undefined;
  onSave: (next: string) => void;
  className?: string;
  subClassName?: string;
}

const EditableName: React.FC<EditableNameProps> = ({ raw, alias, onSave, className = '', subClassName = '' }) => {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(alias ?? '');

  useEffect(() => {
    setValue(alias ?? '');
  }, [alias]);

  const commit = () => {
    onSave(value.trim());
    setEditing(false);
  };

  if (editing) {
    return (
      <input
        autoFocus
        value={value}
        placeholder={raw}
        onChange={(e) => setValue(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit();
          if (e.key === 'Escape') {
            setValue(alias ?? '');
            setEditing(false);
          }
        }}
        className={`bg-zinc-800 border border-zinc-600 px-1 py-0.5 rounded text-zinc-100 outline-none focus:border-cyan-500 ${className}`}
      />
    );
  }

  const display = alias && alias.length > 0 ? alias : raw;
  const showRaw = alias && alias.length > 0 && alias !== raw;

  return (
    <div
      className="group flex-1 min-w-0 cursor-text"
      onClick={() => setEditing(true)}
      title={`Click to rename (raw: ${raw})`}
    >
      <div className={`truncate ${className}`}>
        {display}
        <Pencil size={10} className="inline-block ml-1 text-zinc-600 opacity-0 group-hover:opacity-100 transition-opacity align-baseline" />
      </div>
      {showRaw && (
        <div className={`truncate text-[9px] text-zinc-600 font-mono uppercase leading-none ${subClassName}`}>{raw}</div>
      )}
    </div>
  );
};

const LiveIOPanel: React.FC<LiveIOPanelProps> = ({ aliases, setAlias, setAliases, routing, setRouting }) => {
  const bridge = typeof window !== 'undefined' ? window.midi : undefined;
  const hasBridge = Boolean(bridge);

  const [devices, setDevices] = useState<MidiDevices>({ inputs: [], outputs: [] });
  const [recent, setRecent] = useState<MidiMessagePayload[]>([]);
  const [error, setError] = useState<string | null>(null);
  const recentRef = useRef<MidiMessagePayload[]>([]);

  const labelFor = (raw: string) => aliases[raw] ?? raw;
  const [renameOpen, setRenameOpen] = useState(false);

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

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const exportSetup = () => {
    const payload = {
      version: 1,
      kind: 'midibrain-routing',
      exportedAt: new Date().toISOString(),
      aliases,
      routing,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `midibrain-routing-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(link.href);
  };

  const importSetup = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result));
        if (parsed && typeof parsed === 'object') {
          if (parsed.aliases && typeof parsed.aliases === 'object') {
            setAliases(parsed.aliases);
          }
          if (parsed.routing && typeof parsed.routing === 'object') {
            const next: RoutingMap = {};
            for (const k of Object.keys(parsed.routing)) {
              const v = parsed.routing[k];
              if (Array.isArray(v)) next[k] = v.filter((x: unknown) => typeof x === 'string');
            }
            setRouting(next);
          }
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    };
    reader.readAsText(file);
  };

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
          <button
            onClick={exportSetup}
            className="p-1.5 bg-zinc-800 hover:bg-zinc-700 rounded text-zinc-300"
            title="Export routing + device names to JSON"
          >
            <Download size={12} />
          </button>
          <button
            onClick={() => fileInputRef.current?.click()}
            className="p-1.5 bg-zinc-800 hover:bg-zinc-700 rounded text-zinc-300"
            title="Import routing + device names from JSON"
          >
            <Upload size={12} />
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(e) => {
              if (e.target.files && e.target.files[0]) {
                importSetup(e.target.files[0]);
                e.target.value = '';
              }
            }}
          />
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
        For each input, click the outputs it should route to. Chips light up when the route is active. Click any device name to rename it.
      </div>

      {(devices.inputs.length + devices.outputs.length > 0) && (
        <div className="rounded border border-zinc-800 bg-zinc-950">
          <button
            onClick={() => setRenameOpen((v) => !v)}
            className="w-full text-left px-2 py-1.5 text-[10px] uppercase tracking-wide text-zinc-400 hover:text-zinc-200 flex items-center justify-between"
          >
            <span>Device Names</span>
            <span className="text-zinc-600">{renameOpen ? '▼' : '▶'}</span>
          </button>
          {renameOpen && (
            <div className="p-2 space-y-2 border-t border-zinc-800">
              {devices.inputs.length > 0 && (
                <div>
                  <div className="text-zinc-600 text-[9px] uppercase mb-1">Inputs</div>
                  {devices.inputs.map((name) => (
                    <div key={name} className="flex items-center gap-2 mb-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-cyan-700 flex-shrink-0" />
                      <EditableName
                        raw={name}
                        alias={aliases[name]}
                        onSave={(next) => setAlias(name, next)}
                        className="text-zinc-300 text-[11px]"
                      />
                    </div>
                  ))}
                </div>
              )}
              {devices.outputs.length > 0 && (
                <div>
                  <div className="text-zinc-600 text-[9px] uppercase mb-1">Outputs</div>
                  {devices.outputs.map((name) => (
                    <div key={name} className="flex items-center gap-2 mb-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-700 flex-shrink-0" />
                      <EditableName
                        raw={name}
                        alias={aliases[name]}
                        onSave={(next) => setAlias(name, next)}
                        className="text-zinc-300 text-[11px]"
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

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
                <EditableName
                  raw={inName}
                  alias={aliases[inName]}
                  onSave={(next) => setAlias(inName, next)}
                  className="font-bold text-zinc-200 text-xs"
                />
                {isActive && (
                  <button
                    onClick={() => clearInput(inName)}
                    className="text-zinc-500 hover:text-red-400 text-[10px] px-1 flex-shrink-0"
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
                        title={outName !== labelFor(outName) ? `${labelFor(outName)} (${outName})` : outName}
                      >
                        {on ? '→ ' : ''}
                        {labelFor(outName)}
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
