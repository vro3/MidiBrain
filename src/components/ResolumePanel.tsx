/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useMemo, useState } from 'react';
import { X, FileUp, Save, FilePlus2 } from 'lucide-react';
import { parsePreset, serializePreset } from '../resolume/preset-io';
import {
  decodeRawInputKey,
  encodeRawInputKey,
  statusToMessage,
  messageToStatus,
  describeKey,
  type MidiMessageType,
} from '../resolume/raw-input-key';
import type { ResolumePreset, ResolumeShortcut } from '../resolume/types';

interface Props {
  onClose: () => void;
}

const MESSAGE_TYPES: MidiMessageType[] = [
  'noteOn', 'noteOff', 'cc', 'pitchBend', 'programChange', 'aftertouch', 'channelPressure',
];

function mutateShortcutKey(s: ResolumeShortcut, patch: { type?: MidiMessageType; channel?: number; data1?: number }): ResolumeShortcut {
  if (!s.rawInput) return s;
  const decoded = decodeRawInputKey(s.rawInput.keyRaw);
  const m = statusToMessage(decoded.status);
  const nextType = patch.type ?? m.type;
  const nextChannel = patch.channel ?? m.channel;
  const nextData1 = patch.data1 ?? decoded.data1;
  const nextStatus = messageToStatus(nextType, nextChannel);
  const nextKey = encodeRawInputKey({
    topByte: decoded.topByte,
    deviceHash: decoded.deviceHash,
    data1: nextData1,
    status: nextStatus,
  });
  return {
    ...s,
    rawInput: { ...s.rawInput, keyRaw: nextKey.toString() },
  };
}

export default function ResolumePanel({ onClose }: Props) {
  const [preset, setPreset] = useState<ResolumePreset | null>(null);
  const [filePath, setFilePath] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState('');

  const open = useCallback(async () => {
    const bridge = window.midi;
    if (!bridge) return;
    try {
      const result = await bridge.openResolumeFile();
      if (!result) return;
      const parsed = parsePreset(result.text);
      setPreset(parsed);
      setFilePath(result.path);
      setDirty(false);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  const save = useCallback(async (saveAs: boolean) => {
    const bridge = window.midi;
    if (!bridge || !preset) return;
    try {
      const xml = serializePreset(preset);
      const result = await bridge.saveResolumeFile(saveAs ? null : filePath, xml);
      if (!result) return;
      setFilePath(result.path);
      setDirty(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [preset, filePath]);

  const updateShortcut = useCallback((id: string, mutate: (s: ResolumeShortcut) => ResolumeShortcut) => {
    setPreset((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        shortcuts: prev.shortcuts.map((s) => (s.uniqueId === id ? mutate(s) : s)),
      };
    });
    setDirty(true);
  }, []);

  const filtered = useMemo(() => {
    if (!preset) return [];
    const q = filter.trim().toLowerCase();
    if (!q) return preset.shortcuts;
    return preset.shortcuts.filter((s) => {
      const inputPath = s.paths.find(p => p.name === 'InputPath')?.path ?? '';
      const desc = s.rawInput ? describeKey(s.rawInput.keyRaw) : '';
      return (
        inputPath.toLowerCase().includes(q) ||
        desc.toLowerCase().includes(q) ||
        (s.inputDeviceName ?? '').toLowerCase().includes(q) ||
        (s.outputDeviceName ?? '').toLowerCase().includes(q)
      );
    });
  }, [preset, filter]);

  return (
    <div className="fixed inset-0 z-50 bg-zinc-950/95 backdrop-blur-sm flex flex-col">
      <header className="flex items-center justify-between px-4 py-3 border-b border-zinc-800 bg-zinc-950">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-semibold text-zinc-100">Resolume Preset Editor</h2>
          {filePath && (
            <span className="text-xs text-zinc-500 truncate max-w-md" title={filePath}>
              {filePath.split('/').pop()}
              {dirty && <span className="ml-1 text-amber-400">●</span>}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={open}
            className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-100 border border-zinc-700"
            title="Open a Resolume MIDI shortcut preset (.xml)"
          >
            <FileUp size={14} /> Open
          </button>
          <button
            onClick={() => save(false)}
            disabled={!preset || !filePath}
            className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded bg-cyan-600 hover:bg-cyan-500 text-white disabled:bg-zinc-800 disabled:text-zinc-500 border border-cyan-500 disabled:border-zinc-700"
            title="Save changes to the current file"
          >
            <Save size={14} /> Save
          </button>
          <button
            onClick={() => save(true)}
            disabled={!preset}
            className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-100 disabled:text-zinc-500 border border-zinc-700"
            title="Save to a new file"
          >
            <FilePlus2 size={14} /> Save As
          </button>
          <button
            onClick={onClose}
            className="ml-2 w-8 h-8 flex items-center justify-center rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border border-zinc-700"
            title="Close"
          >
            <X size={16} />
          </button>
        </div>
      </header>

      {error && (
        <div className="px-4 py-2 text-sm bg-red-900/40 text-red-200 border-b border-red-700">
          {error}
        </div>
      )}

      {!preset ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <p className="text-zinc-400 mb-4">No preset loaded.</p>
            <button
              onClick={open}
              className="flex items-center gap-2 mx-auto text-sm px-4 py-2 rounded bg-cyan-600 hover:bg-cyan-500 text-white border border-cyan-500"
            >
              <FileUp size={14} /> Open Resolume Preset
            </button>
            <p className="mt-4 text-xs text-zinc-600">
              Resolume stores presets at<br/>
              <code>~/Documents/Resolume Arena/Shortcuts/MIDI/*.xml</code>
            </p>
          </div>
        </div>
      ) : (
        <>
          <div className="flex items-center gap-3 px-4 py-2 border-b border-zinc-800 bg-zinc-900/40 text-xs text-zinc-400">
            <span>
              <span className="font-medium text-zinc-200">{preset.name}</span>
              <span className="ml-2 text-zinc-500">({preset.shortcuts.length} shortcuts)</span>
            </span>
            <input
              type="text"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Filter by path or message…"
              className="ml-auto px-2 py-1 bg-zinc-900 border border-zinc-700 rounded text-zinc-100 text-xs w-72"
            />
          </div>

          <div className="flex-1 overflow-auto">
            <table className="w-full text-xs text-zinc-200">
              <thead className="sticky top-0 bg-zinc-900 border-b border-zinc-800 z-10">
                <tr className="text-left text-zinc-400">
                  <th className="px-3 py-2 font-medium">Type</th>
                  <th className="px-3 py-2 font-medium">Ch</th>
                  <th className="px-3 py-2 font-medium">Note/CC</th>
                  <th className="px-3 py-2 font-medium">Behaviour</th>
                  <th className="px-3 py-2 font-medium">Param Node</th>
                  <th className="px-3 py-2 font-medium">Input Path</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((s) => {
                  const decoded = s.rawInput ? decodeRawInputKey(s.rawInput.keyRaw) : null;
                  const msg = decoded ? statusToMessage(decoded.status) : null;
                  const inputPath = s.paths.find(p => p.name === 'InputPath')?.path ?? '';
                  return (
                    <tr key={s.uniqueId} className="border-b border-zinc-900 hover:bg-zinc-900/40">
                      <td className="px-3 py-1">
                        {msg ? (
                          <select
                            value={msg.type}
                            onChange={(e) => updateShortcut(s.uniqueId, (s2) => mutateShortcutKey(s2, { type: e.target.value as MidiMessageType }))}
                            className="bg-zinc-900 border border-zinc-700 rounded px-1 py-0.5 text-xs"
                          >
                            {MESSAGE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                          </select>
                        ) : <span className="text-zinc-600">—</span>}
                      </td>
                      <td className="px-3 py-1">
                        {msg ? (
                          <input
                            type="number" min={1} max={16} value={msg.channel}
                            onChange={(e) => updateShortcut(s.uniqueId, (s2) => mutateShortcutKey(s2, { channel: Number(e.target.value) }))}
                            className="w-12 bg-zinc-900 border border-zinc-700 rounded px-1 py-0.5 text-xs text-center"
                          />
                        ) : <span className="text-zinc-600">—</span>}
                      </td>
                      <td className="px-3 py-1">
                        {decoded && msg && msg.type !== 'pitchBend' && msg.type !== 'channelPressure' ? (
                          <input
                            type="number" min={0} max={127} value={decoded.data1}
                            onChange={(e) => updateShortcut(s.uniqueId, (s2) => mutateShortcutKey(s2, { data1: Number(e.target.value) }))}
                            className="w-16 bg-zinc-900 border border-zinc-700 rounded px-1 py-0.5 text-xs text-center"
                          />
                        ) : <span className="text-zinc-600">—</span>}
                      </td>
                      <td className="px-3 py-1 text-zinc-400">{s.behaviour}</td>
                      <td className="px-3 py-1 text-zinc-400">{s.paramNodeName}</td>
                      <td className="px-3 py-1 text-zinc-500 font-mono text-[10px] truncate max-w-md" title={inputPath}>
                        {inputPath}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
