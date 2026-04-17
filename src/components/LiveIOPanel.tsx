import React, { useEffect, useState, useRef } from 'react';
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
  devices: MidiDevices;
  refreshDevices: () => Promise<void> | void;
  deviceError: string | null;
  onBackup: () => void;
  onRestore: (file: File) => void;
  virtualPorts: string[];
  onCreateVirtualPort: (name: string) => Promise<void> | void;
  onDestroyVirtualPort: (name: string) => Promise<void> | void;
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

const LiveIOPanel: React.FC<LiveIOPanelProps> = ({ aliases, setAlias, setAliases, routing, setRouting, devices, refreshDevices, deviceError, onBackup, onRestore, virtualPorts, onCreateVirtualPort, onDestroyVirtualPort }) => {
  const bridge = typeof window !== 'undefined' ? window.midi : undefined;
  const hasBridge = Boolean(bridge);

  const [recent, setRecent] = useState<MidiMessagePayload[]>([]);
  const [error, setError] = useState<string | null>(deviceError);
  const recentRef = useRef<MidiMessagePayload[]>([]);

  useEffect(() => {
    setError(deviceError);
  }, [deviceError]);

  const labelFor = (raw: string) => aliases[raw] ?? raw;
  const [renameOpen, setRenameOpen] = useState(false);
  const [virtualOpen, setVirtualOpen] = useState(false);
  const [newVirtualName, setNewVirtualName] = useState('');

  useEffect(() => {
    setRouting((prev) => {
      const cleaned: RoutingMap = {};
      for (const inName of Object.keys(prev)) {
        if (!devices.inputs.includes(inName)) continue;
        const keptOuts = prev[inName].filter((o) => devices.outputs.includes(o));
        if (keptOuts.length > 0) cleaned[inName] = keptOuts;
      }
      const prevKeys = Object.keys(prev);
      const cleanedKeys = Object.keys(cleaned);
      const sameShape = prevKeys.length === cleanedKeys.length
        && prevKeys.every((k) => cleaned[k] && cleaned[k].length === prev[k].length && cleaned[k].every((o, i) => o === prev[k][i]));
      return sameShape ? prev : cleaned;
    });
  }, [devices, setRouting]);

  useEffect(() => {
    if (!bridge) return;
    const unsubscribe = bridge.onMessage((payload) => {
      recentRef.current = [payload, ...recentRef.current].slice(0, 30);
      setRecent([...recentRef.current]);
    });
    return unsubscribe;
  }, [bridge]);

  // App owns device-open lifecycle. This effect just publishes the current
  // user-defined pass-through routes to the engine.
  useEffect(() => {
    if (!bridge) return;
    const routes: MidiRoute[] = [];
    for (const inName of Object.keys(routing)) {
      for (const outName of routing[inName]) {
        routes.push({ inputName: inName, outputName: outName, enabled: true });
      }
    }
    bridge.setRoutes(routes).catch((err: unknown) => {
      setError(err instanceof Error ? err.message : String(err));
    });
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

  const confirmRestore = (file: File) => {
    const ok = window.confirm(
      'Restore from this backup?\n\nYour current routing, aliases, transforms, and presets will be replaced. The app will reload.',
    );
    if (ok) onRestore(file);
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
            onClick={onBackup}
            className="p-1.5 bg-zinc-800 hover:bg-zinc-700 rounded text-zinc-300"
            title="Backup everything (routing, aliases, transforms, presets) to a .midibrain file"
          >
            <Download size={12} />
          </button>
          <button
            onClick={() => fileInputRef.current?.click()}
            className="p-1.5 bg-zinc-800 hover:bg-zinc-700 rounded text-zinc-300"
            title="Restore from a .midibrain backup file"
          >
            <Upload size={12} />
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".midibrain,application/json,.json"
            className="hidden"
            onChange={(e) => {
              if (e.target.files && e.target.files[0]) {
                confirmRestore(e.target.files[0]);
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

      <div className="rounded border border-zinc-800 bg-zinc-950">
        <button
          onClick={() => setVirtualOpen((v) => !v)}
          className="w-full text-left px-2 py-1.5 text-[10px] uppercase tracking-wide text-zinc-400 hover:text-zinc-200 flex items-center justify-between"
        >
          <span>Virtual Ports{virtualPorts.length > 0 ? ` (${virtualPorts.length})` : ''}</span>
          <span className="text-zinc-600">{virtualOpen ? '▼' : '▶'}</span>
        </button>
        {virtualOpen && (
          <div className="p-2 space-y-2 border-t border-zinc-800">
            <div className="text-zinc-500 text-[10px] leading-relaxed">
              Create a virtual MIDI device that other apps (Logic, Ableton, MainStage) will see as a real port. Each virtual port is bidirectional — other apps can send to it and receive from it.
            </div>
            {virtualPorts.length > 0 && (
              <div className="space-y-1">
                {virtualPorts.map((name) => (
                  <div key={name} className="flex items-center justify-between gap-2 px-2 py-1 bg-zinc-900 rounded">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="w-1.5 h-1.5 rounded-full bg-violet-500 flex-shrink-0" />
                      <span className="text-zinc-300 text-[11px] truncate">{name}</span>
                    </div>
                    <button
                      onClick={() => onDestroyVirtualPort(name)}
                      className="text-zinc-600 hover:text-red-400 text-[10px] px-1"
                      title="Remove virtual port"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            )}
            <div className="flex gap-1">
              <input
                type="text"
                placeholder="e.g. MidiBrain Hub"
                value={newVirtualName}
                onChange={(e) => setNewVirtualName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && newVirtualName.trim()) {
                    onCreateVirtualPort(newVirtualName.trim());
                    setNewVirtualName('');
                  }
                }}
                className="flex-1 bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-[11px] text-zinc-200 outline-none focus:border-cyan-500"
              />
              <button
                disabled={!newVirtualName.trim() || virtualPorts.includes(newVirtualName.trim())}
                onClick={() => {
                  if (newVirtualName.trim()) {
                    onCreateVirtualPort(newVirtualName.trim());
                    setNewVirtualName('');
                  }
                }}
                className="px-2 py-1 bg-violet-900/40 hover:bg-violet-800/60 disabled:opacity-30 disabled:cursor-not-allowed text-violet-200 rounded text-[10px] font-bold"
              >
                + ADD
              </button>
            </div>
          </div>
        )}
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
