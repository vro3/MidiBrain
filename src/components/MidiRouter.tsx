import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Play, Square, Zap, Target, Download, Settings, Edit2, Plus, RefreshCw, X } from 'lucide-react';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import 'jspdf-autotable';
import { ReactFlow, Background, Controls, MiniMap, Node, Edge, MarkerType, useNodesState, useEdgesState, addEdge, OnNodesChange, OnEdgesChange, OnConnect, Handle, Position, BackgroundVariant, Panel, ConnectionLineType, applyNodeChanges, applyEdgeChanges, BaseEdge, getSmoothStepPath, EdgeProps, EdgeLabelRenderer } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import type { MidiDevices, MidiDevice, MidiMessagePayload } from '../types/midi-bridge';

const InputNode = ({ data }: { data: { label: string, originalName?: string, active?: boolean } }) => (
  <div className={`relative flex items-center w-[220px] h-[44px] bg-[#1a1c23] border ${data.active ? 'border-cyan-500/50 shadow-[0_0_15px_rgba(6,182,212,0.2)]' : 'border-zinc-700'} rounded-lg px-3 py-2 text-zinc-300 text-[11px] font-display tracking-tight shadow-md hover:border-zinc-500 transition-all duration-200`}>
    <div className={`w-1.5 h-1.5 rounded-full mr-2 transition-all duration-300 ${data.active ? 'bg-[#06b6d4] shadow-[0_0_8px_rgba(6,182,212,0.8)] scale-125' : 'bg-zinc-700'} flex-shrink-0`}></div>
    <div className="flex flex-col w-full overflow-hidden">
      <span className="truncate w-full font-bold">{data.label}</span>
      {data.originalName && data.originalName !== data.label && (
        <span className="text-[8px] text-zinc-600 truncate w-full font-mono uppercase opacity-70 leading-none">{data.originalName}</span>
      )}
    </div>
    <Handle 
      id="source" 
      type="source" 
      position={Position.Right} 
      className="!w-4 !h-4 !bg-[#06b6d4] !border-none !right-[-8px] hover:!scale-125 transition-transform" 
      style={{ zIndex: 100 }}
    />
  </div>
);

const OutputNode = ({ data }: { data: { label: string, originalName?: string, active?: boolean } }) => (
  <div className={`relative flex items-center w-[220px] h-[44px] bg-[#1a1c23] border ${data.active ? 'border-amber-500/50 shadow-[0_0_15px_rgba(251,191,36,0.2)]' : 'border-zinc-700'} rounded-lg px-3 py-2 text-zinc-300 text-[11px] font-display tracking-tight shadow-md hover:border-zinc-500 transition-all duration-200`}>
    <Handle 
      id="target" 
      type="target" 
      position={Position.Left} 
      className="!w-4 !h-4 !bg-[#fbbf24] !border-none !left-[-8px] hover:!scale-125 transition-transform" 
      style={{ zIndex: 100 }}
    />
    <div className="flex flex-col items-end w-full overflow-hidden">
      <span className="truncate w-full text-right font-bold">{data.label}</span>
      {data.originalName && data.originalName !== data.label && (
        <span className="text-[8px] text-zinc-600 truncate w-full text-right font-mono uppercase opacity-70 leading-none">{data.originalName}</span>
      )}
    </div>
    <div className={`w-1.5 h-1.5 rounded-full ml-2 transition-all duration-300 ${data.active ? 'bg-[#fbbf24] shadow-[0_0_8px_rgba(251,191,36,0.8)] scale-125' : 'bg-zinc-700'} flex-shrink-0`}></div>
  </div>
);

const ProAudioEdge = ({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  style = {},
  markerEnd,
  selected,
  animated
}: EdgeProps) => {
  const getSeed = (str: string) => {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = ((hash << 5) - hash) + str.charCodeAt(i);
      hash |= 0;
    }
    return Math.abs(hash);
  };

  const seed = getSeed(id);
  // deterministic jitter: ensures each connection between same nodes has its own 'lane'
  const jitterY = (seed % 5) * 6 - 12; // vertical offset at ports
  const jitterX = (seed % 7) * 12 - 42; // offset for the main vertical segment trunk

  const [edgePath] = getSmoothStepPath({
    sourceX,
    sourceY: sourceY + jitterY,
    targetX,
    targetY: targetY + jitterY,
    sourcePosition,
    targetPosition,
    borderRadius: 16,
    centerX: (sourceX + targetX) / 2 + jitterX,
  });

  return (
    <BaseEdge
      path={edgePath}
      markerEnd={markerEnd}
      style={{
        ...style,
        strokeWidth: selected ? 4 : 3,
        stroke: selected ? '#fff' : (style.stroke || '#06b6d4'),
        transition: 'stroke 0.3s ease, stroke-width 0.3s ease',
        opacity: selected ? 1 : 0.8,
      }}
    />
  );
};

const EditableLabel = ({ 
  value, 
  originalName, 
  onSave, 
  className = "",
  subClassName = "" 
}: { 
  value: string, 
  originalName: string, 
  onSave: (val: string) => void,
  className?: string,
  subClassName?: string
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(value);

  if (isEditing) {
    return (
      <input
        autoFocus
        className={`bg-zinc-800 text-white px-2 py-0.5 rounded border border-cyan-500 outline-none w-full ${className}`}
        value={editValue}
        onChange={(e) => setEditValue(e.target.value)}
        onBlur={() => {
          onSave(editValue);
          setIsEditing(false);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            onSave(editValue);
            setIsEditing(false);
          }
          if (e.key === 'Escape') {
            setEditValue(value);
            setIsEditing(false);
          }
        }}
        onClick={(e) => e.stopPropagation()}
      />
    );
  }

  return (
    <div 
      className="flex flex-col cursor-text group/label"
      onClick={(e) => {
        e.stopPropagation();
        setIsEditing(true);
      }}
    >
      <div className="flex items-center gap-2">
        <span className={className}>{value || originalName}</span>
        <Edit2 size={10} className="opacity-0 group-hover/label:opacity-40 transition-opacity text-zinc-400" />
      </div>
      {originalName !== value && value !== "" && (
        <span className={`text-[9px] font-mono text-zinc-600 opacity-60 uppercase tracking-tighter ${subClassName}`}>
          Bus: {originalName}
        </span>
      )}
    </div>
  );
};

const initialNodeTypes = {
  inputNode: InputNode,
  outputNode: OutputNode,
};

const initialEdgeTypes = {
  proaudio: ProAudioEdge,
};

interface RouteMatrix {
  note: { [num: number]: { [channel: number]: string } };
  cc: { [num: number]: { [channel: number]: string } };
  pc: { [num: number]: { [channel: number]: string } };
}

interface Remapping {
  type: 'note' | 'cc' | 'pc';
  value: number;
  channel: number;
}

interface MatrixRouting {
  id: string;
  inputId: string;
  outputId: string;
  enabled: boolean;
  // Optional filters. Undefined / empty = pass everything.
  channels?: number[];          // 1-16; only these MIDI channels forward
  noteMin?: number;             // 0-127; applies to note on/off only
  noteMax?: number;             // 0-127; applies to note on/off only
}

interface Preset {
  id: string;
  name: string;
  matrix: RouteMatrix;
  matrixRoutings: MatrixRouting[];
  remappings: { [sourceKey: string]: Remapping };
  aliases?: { [portName: string]: string };
  liveRouting?: { [inputName: string]: string[] };
  timestamp: number;
}

const CHANNELS = Array.from({ length: 16 }, (_, i) => i + 1);
const NOTES = Array.from({ length: 128 }, (_, i) => i);
const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const getNoteName = (note: number) => {
  const name = noteNames[note % 12];
  const octave = Math.floor(note / 12) - 1;
  return `${name}${octave}`;
};

const CC_NAMES: { [key: number]: string } = {
  0: 'Bank Select',
  1: 'Mod Wheel',
  2: 'Breath',
  4: 'Foot Ctrl',
  5: 'Portamento',
  6: 'Data Entry',
  7: 'Volume',
  8: 'Balance',
  10: 'Pan',
  11: 'Expression',
  64: 'Sustain',
  65: 'Portamento On/Off',
  66: 'Sostenuto',
  67: 'Soft Pedal',
  71: 'Resonance',
  74: 'Frequency/Brightness',
  91: 'Reverb Depth',
  92: 'Tremolo Depth',
  93: 'Chorus Depth',
  94: 'Celeste Depth',
  95: 'Phaser Depth',
};

const CHANNEL_COLORS: { [key: number]: string } = {
  1: "#ef4444",  // Red
  2: "#f97316",  // Orange
  3: "#f59e0b",  // Amber
  4: "#eab308",  // Yellow
  5: "#84cc16",  // Lime
  6: "#22c55e",  // Green
  7: "#10b981",  // Emerald
  8: "#14b8a6",  // Teal
  9: "#06b6d4",  // Cyan
  10: "#0ea5e9", // Sky
  11: "#3b82f6", // Blue
  12: "#6366f1", // Indigo
  13: "#8b5cf6", // Violet
  14: "#a855f7", // Purple
  15: "#d946ef", // Fuchsia
  16: "#ec4899"  // Pink
};

const getChannelRgba = (ch: number, alpha: number) => {
  const hex = CHANNEL_COLORS[ch] || "#94a3b8";
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

type AliasMap = Record<string, string>;
type RoutingMap = Record<string, string[]>;

interface MidiRouterProps {
  aliases?: AliasMap;
  setAliases?: React.Dispatch<React.SetStateAction<AliasMap>>;
  routing?: RoutingMap;
  setRouting?: React.Dispatch<React.SetStateAction<RoutingMap>>;
  devices?: MidiDevices;
}

export default function MidiRouter({
  aliases: aliasesProp,
  setAliases: setAliasesProp,
  routing: routingProp,
  setRouting: setRoutingProp,
  devices,
}: MidiRouterProps = {}) {
  const bridge = typeof window !== 'undefined' ? window.midi : undefined;

  // Device lists come from App via the Electron bridge. id === name (port names
  // are stable identifiers). Wrapping as {id, name} keeps the existing JSX
  // working unchanged since it reads input.id / input.name.
  const inputs = useMemo<MidiDevice[]>(
    () => (devices?.inputs ?? []).map((n) => ({ id: n, name: n })),
    [devices?.inputs],
  );
  const outputs = useMemo<MidiDevice[]>(
    () => (devices?.outputs ?? []).map((n) => ({ id: n, name: n })),
    [devices?.outputs],
  );

  const [selectedInputs, setSelectedInputs] = useState<Set<string>>(new Set());
  const [inputActivity, setInputActivity] = useState<Set<string>>(new Set());
  const [outputActivity, setOutputActivity] = useState<Set<string>>(new Set());
  const [selectedOutputs, setSelectedOutputs] = useState<Set<string>>(new Set());
  const [channelNames, setChannelNames] = useState<{ [channel: number]: string }>(() => {
    const saved = localStorage.getItem('midibrain.channelNames');
    return saved ? JSON.parse(saved) : {};
  });
  const [isRunning, setIsRunning] = useState(false);
  const [matrix, setMatrix] = useState<RouteMatrix>(() => {
    const saved = localStorage.getItem('midibrain.matrix');
    if (!saved) return { note: {}, cc: {}, pc: {} };
    
    try {
      const parsed = JSON.parse(saved);
      // Migration: If it's the old format (flat note-based), move it to .note
      if (parsed && !parsed.note && !parsed.cc) {
        return { note: parsed, cc: {}, pc: {} };
      }
      return parsed;
    } catch (e) {
      return { note: {}, cc: {}, pc: {} };
    }
  });

  const [showMappedOnly, setShowMappedOnly] = useState(false);
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set());

  useEffect(() => {
    localStorage.setItem('midibrain.matrix', JSON.stringify(matrix));
  }, [matrix]);

  useEffect(() => {
    localStorage.setItem('midibrain.channelNames', JSON.stringify(channelNames));
  }, [channelNames]);

  const [lastMidiMessage, setLastMidiMessage] = useState<{ note: number, channel: number, velocity: number } | null>(null);
  const [isLearning, setIsLearning] = useState(false);
  const [highlighted, setHighlighted] = useState<{ type: 'note' | 'cc' | 'pc', num: number, channel: number } | null>(null);

  const [midiLog, setMidiLog] = useState<Array<{ time: string, source: string, message: string, channel: number, data: string }>>([]);
  const [isMonitorOpen, setIsMonitorOpen] = useState(false);
  const [isPresetManagerOpen, setIsPresetManagerOpen] = useState(false);
  const [renamingPresetId, setRenamingPresetId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState('');
  const [expandedFilters, setExpandedFilters] = useState<Set<string>>(new Set());

  const updateRoutingFilter = (id: string, patch: Partial<MatrixRouting>) => {
    setMatrixRoutings((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  };

  const routingHasFilters = (r: MatrixRouting) =>
    (r.channels && r.channels.length > 0) || r.noteMin != null || r.noteMax != null;

  const [activeTab, setActiveTab] = useState<'router' | 'remap' | 'matrix' | 'learning'>('matrix');
  const [matrixView, setMatrixView] = useState<'crosspoint' | 'topography' | 'list'>('crosspoint');
  const [columnWidths, setColumnWidths] = useState<{ [key: string]: number }>({
    'note': 80,
    ...CHANNELS.reduce((acc, ch) => ({ ...acc, [ch]: 150 }), {})
  });
  const [rowHeights, setRowHeights] = useState<{ [key: number]: number }>(() => {
    const saved = localStorage.getItem('midibrain.rowHeights');
    return saved ? JSON.parse(saved) : {};
  });

  useEffect(() => {
    localStorage.setItem('midibrain.rowHeights', JSON.stringify(rowHeights));
  }, [rowHeights]);
  const [remappings, setRemappings] = useState<{ [sourceKey: string]: Remapping }>(() => {
    const saved = localStorage.getItem('midibrain.remappings');
    return saved ? JSON.parse(saved) : {};
  });
  const [matrixRoutings, setMatrixRoutings] = useState<MatrixRouting[]>(() => {
    const saved = localStorage.getItem('midibrain.matrixRoutings');
    return saved ? JSON.parse(saved) : [];
  });
  const [presets, setPresets] = useState<Preset[]>(() => {
    const saved = localStorage.getItem('midibrain.presets');
    return saved ? JSON.parse(saved) : [];
  });

  // Aliases are now sourced from App (shared with LiveIOPanel, keyed by port name).
  // Keep a local fallback so the component still works standalone (tests, legacy).
  const aliases = aliasesProp ?? {};

  // Live Routing (LiveIOPanel) is the source of truth for which devices are "in play".
  // Mirror its input→outputs map into our selection sets so Topography / Matrix show the
  // same devices that the user routed.
  useEffect(() => {
    if (!routingProp) return;
    const routedInputNames = new Set<string>();
    const routedOutputNames = new Set<string>();
    for (const k of Object.keys(routingProp)) {
      const outs = routingProp[k];
      if (outs.length > 0) routedInputNames.add(k);
      for (const o of outs) routedOutputNames.add(o);
    }
    setSelectedInputs(new Set(inputs.filter((i) => routedInputNames.has(i.name)).map((i) => i.id)));
    setSelectedOutputs(new Set(outputs.filter((o) => routedOutputNames.has(o.name)).map((o) => o.id)));
  }, [routingProp, inputs, outputs]);

  useEffect(() => {
    localStorage.setItem('midibrain.matrixRoutings', JSON.stringify(matrixRoutings));
  }, [matrixRoutings]);

  useEffect(() => {
    localStorage.setItem('midibrain.remappings', JSON.stringify(remappings));
  }, [remappings]);

  useEffect(() => {
    localStorage.setItem('midibrain.presets', JSON.stringify(presets));
  }, [presets]);

  const [isNamingPreset, setIsNamingPreset] = useState(false);
  const [newPresetName, setNewPresetName] = useState('');

  const saveCurrentAsPreset = () => {
    if (!newPresetName.trim()) return;

    const newPreset: Preset = {
      id: Date.now().toString(),
      name: newPresetName.trim(),
      matrix,
      matrixRoutings,
      remappings,
      aliases: aliasesProp ?? {},
      liveRouting: routingProp ?? {},
      timestamp: Date.now(),
    };

    setPresets((prev) => [...prev, newPreset]);
    setNewPresetName('');
    setIsNamingPreset(false);
  };

  const loadPreset = (preset: Preset) => {
    if (!confirm(`Load preset "${preset.name}"? This will overwrite your current configuration.`)) return;
    setMatrix(preset.matrix);
    setMatrixRoutings(preset.matrixRoutings);
    setRemappings(preset.remappings);
    if (preset.aliases && setAliasesProp) setAliasesProp(preset.aliases);
    if (preset.liveRouting && setRoutingProp) setRoutingProp(preset.liveRouting);
  };

  const deletePreset = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm('Delete this preset?')) {
      setPresets((prev: Preset[]) => prev.filter((p: Preset) => p.id !== id));
    }
  };

  const renamePreset = (id: string, nextName: string) => {
    const trimmed = nextName.trim();
    if (!trimmed) return;
    setPresets((prev) => prev.map((p) => (p.id === id ? { ...p, name: trimmed } : p)));
  };

  const duplicatePreset = (preset: Preset) => {
    const copy: Preset = {
      ...preset,
      id: Date.now().toString(),
      name: `${preset.name} (copy)`,
      timestamp: Date.now(),
    };
    setPresets((prev) => [...prev, copy]);
  };

  const exportSinglePreset = (preset: Preset) => {
    const payload = {
      kind: 'midibrain-preset',
      version: 1,
      exportedAt: new Date().toISOString(),
      preset,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    const safeName = preset.name.replace(/[^a-z0-9-_]/gi, '_');
    link.download = `${safeName}.preset`;
    link.click();
    URL.revokeObjectURL(link.href);
  };

  const presetImportRef = useRef<HTMLInputElement>(null);

  const importSinglePreset = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result));
        const candidate = parsed?.preset ?? parsed;
        if (!candidate || typeof candidate !== 'object' || !candidate.name) {
          throw new Error('Not a valid preset file');
        }
        const imported: Preset = {
          ...candidate,
          id: Date.now().toString(),
          timestamp: Date.now(),
        };
        setPresets((prev) => [...prev, imported]);
      } catch (err) {
        alert(`Could not import preset: ${err instanceof Error ? err.message : String(err)}`);
      }
    };
    reader.readAsText(file);
  };

  const nodeTypes = useMemo(() => initialNodeTypes, []);
  const edgeTypes = useMemo(() => initialEdgeTypes, []);

  const scrollRef = useRef<HTMLTableRowElement>(null);
  const inputRefs = useRef<{ [key: string]: HTMLTextAreaElement | null }>({});
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Keep latest state accessible to the single persistent message subscription
  // without re-subscribing every render (which would drop in-flight events).
  const stateRef = useRef({
    selectedInputs,
    selectedOutputs,
    isRunning,
    isLearning,
    activeTab,
    matrix,
    matrixRoutings,
    remappings,
  });
  useEffect(() => {
    stateRef.current = {
      selectedInputs,
      selectedOutputs,
      isRunning,
      isLearning,
      activeTab,
      matrix,
      matrixRoutings,
      remappings,
    };
  }, [selectedInputs, selectedOutputs, isRunning, isLearning, activeTab, matrix, matrixRoutings, remappings]);

  const bumpInputActivity = (name: string) => {
    setInputActivity((prev) => new Set(prev).add(name));
    setTimeout(() => setInputActivity((prev) => {
      const next = new Set(prev);
      next.delete(name);
      return next;
    }), 100);
  };

  const bumpOutputActivity = (name: string) => {
    setOutputActivity((prev) => new Set(prev).add(name));
    setTimeout(() => setOutputActivity((prev) => {
      const next = new Set(prev);
      next.delete(name);
      return next;
    }), 100);
  };

  const sendToOutput = (outputName: string, bytes: number[]) => {
    if (!bridge) return;
    bridge.sendRaw(outputName, bytes);
    bumpOutputActivity(outputName);
  };

  // MIDI Panic: silence every output immediately. Sends All Sound Off (CC 120),
  // All Notes Off (CC 123), and Reset All Controllers (CC 121) on all 16
  // channels to every open output. Standard pro-audio rescue from stuck notes.
  const panic = () => {
    if (!bridge) return;
    const outputNames = devices?.outputs ?? [];
    for (const outName of outputNames) {
      for (let ch = 0; ch < 16; ch++) {
        const status = 0xB0 | ch;
        bridge.sendRaw(outName, [status, 120, 0]); // All Sound Off
        bridge.sendRaw(outName, [status, 123, 0]); // All Notes Off
        bridge.sendRaw(outName, [status, 121, 0]); // Reset All Controllers
      }
      bumpOutputActivity(outName);
    }
  };

  const handleMidiPayload = (payload: MidiMessagePayload) => {
    const bytes = payload.rawBytes;
    if (!bytes || bytes.length === 0) return;
    const status = bytes[0];
    const data1 = bytes[1] ?? 0;
    const data2 = bytes[2] ?? 0;
    const channel = (status & 0x0F) + 1;
    const type = status & 0xF0;
    const inputName = payload.inputName;

    const s = stateRef.current;

    // 1. Activity + log
    const now = new Date();
    const timeString = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}.${now.getMilliseconds().toString().padStart(3, '0')}`;

    let messageType = 'Unknown';
    if (type === 0x90 && data2 > 0) messageType = 'Note On';
    else if (type === 0x80 || (type === 0x90 && data2 === 0)) messageType = 'Note Off';
    else if (type === 0xB0) messageType = 'Control Change';
    else if (type === 0xE0) messageType = 'Pitch Bend';
    else if (type === 0xC0) messageType = 'Program Change';
    else if (type === 0xD0) messageType = 'Channel Press';
    else if (type === 0xA0) messageType = 'Poly Aftertouch';

    let dataString = '';
    if (bytes.length > 1) {
      if (messageType.includes('Note')) dataString = `${getNoteName(data1)}  Vel: ${data2}`;
      else dataString = `${data1}  ${data2 || ''}`;
    }

    bumpInputActivity(inputName);

    // Master enable: only process selected inputs beyond the activity LED
    if (!s.selectedInputs.has(inputName)) return;

    setMidiLog((prev) => {
      const newLog = [{
        time: timeString,
        source: inputName,
        message: messageType,
        channel: channel,
        data: dataString,
      }, ...prev];
      if (newLog.length > 300) newLog.length = 300;
      return newLog;
    });

    // 2. Direct matrix routing — transparent pass-through with optional filters
    if (s.isRunning) {
      const isNoteMsg = type === 0x90 || type === 0x80;
      for (const routing of s.matrixRoutings) {
        if (!routing.enabled) continue;
        if (routing.inputId !== inputName) continue;
        if (routing.channels && routing.channels.length > 0 && !routing.channels.includes(channel)) continue;
        if (isNoteMsg) {
          if (routing.noteMin != null && data1 < routing.noteMin) continue;
          if (routing.noteMax != null && data1 > routing.noteMax) continue;
        }
        sendToOutput(routing.outputId, bytes);
      }
    }

    // 3. Remap + grid router
    const isNoteOn = type === 0x90 && data2 > 0;
    const isNoteOff = type === 0x80 || (type === 0x90 && data2 === 0);
    const isCC = type === 0xB0;

    if (s.isLearning && s.activeTab === 'remap') {
      if (isNoteOn || isCC) {
        const sourceKey = isNoteOn ? `note:${channel}:${data1}` : `cc:${channel}:${data1}`;
        if (!s.remappings[sourceKey]) {
          setRemappings((prev) => ({
            ...prev,
            [sourceKey]: {
              type: isNoteOn ? 'note' : 'cc',
              value: data1,
              channel: channel,
            },
          }));
        }
        setHighlighted({ type: isNoteOn ? 'note' : 'cc', num: data1, channel });
        return;
      }
    }

    let outputNote = data1;
    let outputChannel = channel;
    let outputType = type;
    let skipRouter = false;

    const sourceKey = isNoteOn || isNoteOff ? `note:${channel}:${data1}` : isCC ? `cc:${channel}:${data1}` : null;
    if (sourceKey && s.remappings[sourceKey]) {
      const mapping = s.remappings[sourceKey];
      outputNote = mapping.value;
      outputChannel = mapping.channel;

      if (mapping.type === 'note') outputType = isNoteOff ? 0x80 : 0x90;
      else if (mapping.type === 'cc') outputType = 0xB0;
      else if (mapping.type === 'pc') outputType = 0xC0;

      if (isCC && mapping.type === 'note') {
        // fall through to router
      } else if (isNoteOn && (mapping.type === 'cc' || mapping.type === 'pc')) {
        skipRouter = true;
      }
    }

    if ((isNoteOn || isNoteOff || (isCC && sourceKey && s.remappings[sourceKey]?.type === 'note')) && !skipRouter) {
      const note = outputNote;
      const velocity = data2;
      const effectiveType = (isCC && s.remappings[sourceKey!]?.type === 'note') ? 0x90 : outputType;

      if (effectiveType === 0x90) {
        setLastMidiMessage({ note, channel: outputChannel, velocity });

        if (s.isLearning && s.activeTab !== 'remap') {
          setHighlighted({ type: 'note', num: note, channel: outputChannel });
          scrollRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
          setTimeout(() => {
            inputRefs.current[`note-${note}-${outputChannel}`]?.focus();
          }, 100);
        } else if (s.isRunning) {
          const action = s.matrix.note[note]?.[outputChannel];
          if (action) {
            const outputStatus = effectiveType | (outputChannel - 1);
            s.selectedOutputs.forEach((outName) => {
              sendToOutput(outName, [outputStatus, note, velocity]);
            });
          }
        }
      } else if (effectiveType === 0x80) {
        if (s.isRunning) {
          const action = s.matrix.note[note]?.[outputChannel];
          if (action) {
            const outputStatus = effectiveType | (outputChannel - 1);
            s.selectedOutputs.forEach((outName) => {
              sendToOutput(outName, [outputStatus, note, velocity]);
            });
          }
        }
      }
    } else if (s.isRunning && sourceKey && s.remappings[sourceKey] && skipRouter) {
      const finalStatus = outputType | (outputChannel - 1);
      s.selectedOutputs.forEach((outName) => {
        sendToOutput(outName, [finalStatus, outputNote, data2]);
      });
    }

    // CC + PC direct routing (matrix grid)
    if (s.isRunning && !skipRouter) {
      if (type === 0xB0) {
        const action = s.matrix.cc[data1]?.[channel];
        if (action) {
          s.selectedOutputs.forEach((outName) => sendToOutput(outName, bytes));
        }
        setHighlighted({ type: 'cc', num: data1, channel });
      } else if (type === 0xC0) {
        const action = s.matrix.pc[data1]?.[channel];
        if (action) {
          s.selectedOutputs.forEach((outName) => sendToOutput(outName, bytes));
        }
        setHighlighted({ type: 'pc', num: data1, channel });
      }
    }
  };

  useEffect(() => {
    if (!bridge) return;
    const unsubscribe = bridge.onMessage(handleMidiPayload);
    return unsubscribe;
    // Subscribe once per bridge; handler reads current state via stateRef.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bridge]);

  const toggleMatrixRouting = (inputId: string, outputId: string) => {
    setMatrixRoutings(prev => {
      const existing = prev.find(r => r.inputId === inputId && r.outputId === outputId);
      if (existing) {
        return prev.filter(r => r.id !== existing.id);
      } else {
        return [...prev, { id: Date.now().toString(), inputId, outputId, enabled: true }];
      }
    });
  };

  const updateCell = (type: 'note' | 'cc' | 'pc', num: number, channel: number, action: string) => {
    setMatrix(prev => ({
      ...prev,
      [type]: {
        ...prev[type],
        [num]: { ...prev[type][num], [channel]: action }
      }
    }));
  };

  const getMatrixData = () => {
    const data: any[] = [];
    
    // Process Notes
    for (let note = 0; note < 128; note++) {
      const row: any = { 'Type': 'Note', 'Number': note, 'Label': getNoteName(note) };
      CHANNELS.forEach((channel: number) => {
        row[`Channel ${channel}`] = matrix.note[note]?.[channel] || '';
      });
      data.push(row);
    }
    
    // Process CC
    for (let cc = 0; cc < 128; cc++) {
      const row: any = { 'Type': 'CC', 'Number': cc, 'Label': CC_NAMES[cc] || '' };
      CHANNELS.forEach((channel: number) => {
        row[`Channel ${channel}`] = matrix.cc[cc]?.[channel] || '';
      });
      data.push(row);
    }

    // Process PC
    for (let pc = 0; pc < 128; pc++) {
      const row: any = { 'Type': 'PC', 'Number': pc, 'Label': '' };
      CHANNELS.forEach((channel: number) => {
        row[`Channel ${channel}`] = matrix.pc[pc]?.[channel] || '';
      });
      data.push(row);
    }

    return data;
  };

  const exportCSV = () => {
    const csv = Papa.unparse(getMatrixData());
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'midi-map.csv';
    link.click();
  };

  const downloadMonitorCSV = () => {
    if (midiLog.length === 0) return;
    const rows = midiLog.slice().reverse().map((l) => ({
      time: l.time,
      source: l.source,
      message: l.message,
      channel: l.channel,
      data: l.data,
    }));
    const csv = Papa.unparse(rows);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `midibrain-monitor-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  };

  const importCSV = (file: File) => {
    Papa.parse(file, {
      header: true,
      complete: (results: any) => {
        const newMatrix: RouteMatrix = { note: {}, cc: {}, pc: {} };
        results.data.forEach((row: any) => {
          const type = (row['Type'] || 'Note').toLowerCase() as 'note' | 'cc' | 'pc';
          const numStr = row['Number'] || row['Note Number'];
          if (numStr === undefined) return;
          const num = parseInt(numStr);
          if (!isNaN(num)) {
            newMatrix[type][num] = {};
            CHANNELS.forEach((channel: number) => {
              const action = row[`Channel ${channel}`];
              if (action) {
                newMatrix[type][num][channel] = action;
              }
            });
          }
        });
        setMatrix(newMatrix);
      }
    });
  };

  const exportExcel = () => {
    const ws = XLSX.utils.json_to_sheet(getMatrixData());
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'MIDI Map');
    XLSX.writeFile(wb, 'midi-map.xlsx');
  };

  const exportPDF = () => {
    const doc = new jsPDF();
    const data = getMatrixData().map(row => Object.values(row));
    const columns = ['Note', ...CHANNELS.map(ch => `Ch ${ch}`)];
    (doc as any).autoTable({
      head: [columns],
      body: data,
    });
    doc.save('midi-map.pdf');
  };


  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);

  const onNodesChange: OnNodesChange = React.useCallback(
    (changes: any) => setNodes((nds: Node[]) => applyNodeChanges(changes, nds)),
    [setNodes]
  );

  const onEdgesChange: OnEdgesChange = React.useCallback(
    (changes: any) => setEdges((eds: Edge[]) => applyEdgeChanges(changes, eds)),
    [setEdges]
  );

  const onConnect: OnConnect = React.useCallback((params: any) => {
    if (!params.source || !params.target) return;
    if (params.source === params.target) return;

    const rawSourceId = params.source.replace('in:', '');
    const rawTargetId = params.target.replace('out:', '');

    setMatrixRoutings((prev: MatrixRouting[]) => {
      const exists = prev.some(r => r.inputId === rawSourceId && r.outputId === rawTargetId);
      if (exists) return prev;
      return [...prev, {
        id: `route-${rawSourceId}-${rawTargetId}-${Date.now()}`,
        inputId: rawSourceId,
        outputId: rawTargetId,
        enabled: true
      }];
    });
  }, [setMatrixRoutings]);

  useEffect(() => {
    const newNodes: Node[] = [];
    inputs.filter(i => selectedInputs.has(i.id)).forEach((input, index) => {
      newNodes.push({
        id: `in:${input.id}`,
        type: 'inputNode',
        data: { 
          label: aliases[input.name] || input.name, 
          originalName: input.name,
          active: inputActivity.has(input.id) 
        },
        position: { x: 0, y: index * 65 },
        draggable: false, 
      });
    });
    outputs.filter(o => selectedOutputs.has(o.id)).forEach((output, index) => {
      newNodes.push({
        id: `out:${output.id}`,
        type: 'outputNode',
        data: { 
          label: aliases[output.name] || output.name, 
          originalName: output.name,
          active: outputActivity.has(output.id) 
        },
        position: { x: 800, y: index * 65 },
        draggable: false,
      });
    });

    setNodes(newNodes);
  }, [inputs, outputs, selectedInputs, selectedOutputs, inputActivity, outputActivity, aliases]);

  useEffect(() => {
    const newEdges: Edge[] = [];
    matrixRoutings.forEach(routing => {
      if (routing.enabled) {
        newEdges.push({
          id: routing.id,
          source: `in:${routing.inputId}`,
          target: `out:${routing.outputId}`,
          sourceHandle: 'source',
          targetHandle: 'target',
          markerEnd: { type: MarkerType.ArrowClosed, color: '#06b6d4', width: 22, height: 22 },
          style: { stroke: '#06b6d4', strokeWidth: 3 },
          animated: true,
          type: 'proaudio',
        });
      }
    });
    setEdges(newEdges);
  }, [matrixRoutings]);

  const ResizeHandle = ({ onResize }: { onResize: (delta: number) => void }) => (
    <div
      className="absolute top-0 right-0 w-1.5 h-full cursor-col-resize bg-zinc-800/50 hover:bg-cyan-500/50 hover:w-2 transition-all z-20"
      onMouseDown={(e) => {
        e.preventDefault();
        e.stopPropagation();
        let lastX = e.clientX;
        const onMouseMove = (moveEvent: MouseEvent) => {
          onResize(moveEvent.clientX - lastX);
          lastX = moveEvent.clientX;
        };
        const onMouseUp = () => {
          window.removeEventListener('mousemove', onMouseMove);
          window.removeEventListener('mouseup', onMouseUp);
        };
        window.addEventListener('mousemove', onMouseMove);
        window.addEventListener('mouseup', onMouseUp);
      }}
    />
  );

  const VerticalResizeHandle = ({ onResize }: { onResize: (delta: number) => void }) => (
    <div
      className="absolute bottom-0 left-0 w-full h-1.5 cursor-row-resize bg-zinc-800/10 hover:bg-cyan-500/40 hover:h-2 transition-all z-20"
      onMouseDown={(e) => {
        e.preventDefault();
        e.stopPropagation();
        let lastY = e.clientY;
        const onMouseMove = (moveEvent: MouseEvent) => {
          onResize(moveEvent.clientY - lastY);
          lastY = moveEvent.clientY;
        };
        const onMouseUp = () => {
          window.removeEventListener('mousemove', onMouseMove);
          window.removeEventListener('mouseup', onMouseUp);
        };
        window.addEventListener('mousemove', onMouseMove);
        window.addEventListener('mouseup', onMouseUp);
      }}
    />
  );

  return (
    <div className="p-8 bg-zinc-950 text-zinc-100 min-h-screen font-sans">
      <header className="flex items-center justify-between mb-8 pb-6 border-b border-zinc-800">
        {/* Left: spacer (I/O tab removed — Live Routing sidebar handles device selection) */}
        <div />

        {/* Center: MIDI Map, Router, Remap, Matrix */}
        <div className="flex gap-4 items-center">
          <button
            className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${isLearning ? 'bg-amber-500 text-zinc-950' : 'bg-zinc-800 hover:bg-zinc-700'}`}
            onClick={() => setIsLearning(!isLearning)}
          >
            <Target size={16} />
            {isLearning ? 'Learning...' : 'MIDI Map'}
          </button>
          <div className="flex gap-2 bg-zinc-900 p-1 rounded-md">
            <button
              className={`px-4 py-1.5 rounded-sm text-sm font-medium transition-colors ${activeTab === 'router' ? 'bg-zinc-800 text-white' : 'text-zinc-500 hover:text-zinc-300'}`}
              onClick={() => setActiveTab('router')}
            >
              Router
            </button>
            <button
              className={`px-4 py-1.5 rounded-sm text-sm font-medium transition-colors ${activeTab === 'remap' ? 'bg-zinc-800 text-white' : 'text-zinc-500 hover:text-zinc-300'}`}
              onClick={() => setActiveTab('remap')}
            >
              Remap
            </button>
            <button
              className={`px-4 py-1.5 rounded-sm text-sm font-medium transition-colors ${activeTab === 'matrix' ? 'bg-zinc-800 text-white' : 'text-zinc-500 hover:text-zinc-300'}`}
              onClick={() => setActiveTab('matrix')}
            >
              Matrix
            </button>
          </div>
        </div>

        {/* Right: Monitor, Start/Stop, Export */}
        <div className="flex gap-3 items-center">
          <button 
            onClick={() => setIsMonitorOpen(true)}
            className="bg-[#0a0a0a] border border-zinc-800 px-3 py-1.5 rounded-md text-xs font-mono text-zinc-400 hover:text-cyan-400 hover:border-cyan-900 transition-colors shadow-inner flex items-center gap-2"
          >
            <div className={`w-2 h-2 rounded-full ${midiLog.length > 0 ? 'bg-cyan-500 shadow-[0_0_8px_rgba(6,182,212,0.8)]' : 'bg-zinc-700'}`}></div>
            Monitor: {lastMidiMessage ? `Note ${lastMidiMessage.note}, Ch ${lastMidiMessage.channel}, Vel ${lastMidiMessage.velocity}` : 'Waiting...'}
          </button>
          <button
            onClick={panic}
            className="flex items-center gap-2 px-4 py-2 rounded-md text-sm font-bold bg-red-900/40 hover:bg-red-900/70 text-red-200 border border-red-700/40 transition-colors"
            title="Silence all outputs: All Sound Off + All Notes Off + Reset Controllers on every channel"
          >
            <Zap size={16} />
            PANIC
          </button>
          <button
            className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${isRunning ? 'bg-emerald-900/50 text-emerald-200 hover:bg-emerald-900/70' : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'}`}
            onClick={() => setIsRunning(!isRunning)}
            title={isRunning
              ? 'Transforms on — Matrix/Remap/Router are processing. Live Routing (sidebar) always passes through regardless.'
              : 'Transforms off — only Live Routing (sidebar) is forwarding MIDI. Click to enable Matrix/Remap/Router.'}
          >
            {isRunning ? <Square size={16} /> : <Play size={16} />}
            Transforms: {isRunning ? 'On' : 'Off'}
          </button>
          <div className="relative group">
            <button className="flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium bg-zinc-800 hover:bg-zinc-700 transition-colors">
              <Settings size={16} />
              Menu
            </button>
            <div className="absolute right-0 mt-2 w-40 bg-zinc-800 border border-zinc-700 rounded-md shadow-lg hidden group-hover:block z-10">
              <div className="px-4 py-2 text-xs font-semibold text-zinc-500 uppercase">Presets</div>
              <button onClick={saveCurrentAsPreset} className="block w-full text-left px-4 py-2 text-sm hover:bg-zinc-700">Save Preset...</button>
              <div className="max-h-48 overflow-y-auto custom-scrollbar">
                {presets.length === 0 ? (
                  <div className="px-4 py-2 text-[10px] text-zinc-600 italic">No presets saved</div>
                ) : (
                  presets.map((p: Preset) => (
                    <button key={p.id} onClick={() => loadPreset(p)} className="block w-full text-left px-6 py-2 text-xs text-zinc-400 hover:text-cyan-400 hover:bg-zinc-700/50 transition-colors border-l-2 border-transparent hover:border-cyan-500">
                      {p.name}
                    </button>
                  ))
                )}
              </div>
              <div className="border-t border-zinc-700 my-1"></div>
              <div className="px-4 py-2 text-xs font-semibold text-zinc-500 uppercase">Export</div>
              <button onClick={exportCSV} className="block w-full text-left px-4 py-2 text-sm hover:bg-zinc-700">Export CSV</button>
              <button onClick={() => fileInputRef.current?.click()} className="block w-full text-left px-4 py-2 text-sm hover:bg-zinc-700">Import CSV</button>
              <button onClick={exportExcel} className="block w-full text-left px-4 py-2 text-sm hover:bg-zinc-700">Export Excel</button>
              <button onClick={exportPDF} className="block w-full text-left px-4 py-2 text-sm hover:bg-zinc-700">Export PDF</button>
            </div>
            <input
              type="file"
              ref={fileInputRef}
              className="hidden"
              accept=".csv"
              onChange={(e) => {
                if (e.target.files && e.target.files[0]) {
                  importCSV(e.target.files[0]);
                }
              }}
            />
          </div>
        </div>
      </header>

      {inputs.length === 0 && outputs.length === 0 && (
        <div className="max-w-2xl mx-auto py-16 px-8">
          <div className="bg-[#1a1c23] border border-zinc-800 rounded-2xl p-10 text-center">
            <div className="w-16 h-16 bg-cyan-900/20 border border-cyan-700/40 rounded-2xl flex items-center justify-center mx-auto mb-6">
              <Zap size={28} className="text-cyan-400" />
            </div>
            <h2 className="text-xl font-bold text-zinc-100 mb-2">Welcome to MidiBrain</h2>
            <p className="text-zinc-400 text-sm mb-6 leading-relaxed">
              No MIDI devices detected yet. Connect a MIDI controller, interface, or synth — or create a virtual port from the Live Routing sidebar to route between apps on this Mac.
            </p>
            <div className="text-left bg-zinc-950 border border-zinc-800 rounded-lg p-4 text-[11px] text-zinc-500 leading-relaxed space-y-2">
              <div><span className="text-cyan-400 font-bold">1.</span> Plug in your MIDI gear (USB or MIDI interface).</div>
              <div><span className="text-cyan-400 font-bold">2.</span> Open the Live Routing sidebar on the left.</div>
              <div><span className="text-cyan-400 font-bold">3.</span> Click output chips next to each input to start routing.</div>
              <div className="pt-2 border-t border-zinc-800/80">
                <span className="text-violet-400 font-bold">Tip:</span> Virtual Ports let other apps (Logic, Ableton, MainStage) see MidiBrain as a MIDI device. Expand "Virtual Ports" in the sidebar to create one.
              </div>
            </div>
          </div>
        </div>
      )}

      {inputs.length + outputs.length > 0 && activeTab === 'router' && (
        <div className="space-y-8">
          <div className="flex items-center justify-between px-2 mb-4">
             <div className="flex items-center gap-6">
                <button 
                  onClick={() => setShowMappedOnly(!showMappedOnly)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all border ${showMappedOnly ? 'bg-cyan-500 text-black border-cyan-400' : 'bg-zinc-900 text-zinc-500 border-zinc-800 hover:border-zinc-700'}`}
                >
                  <div className={`w-2 h-2 rounded-full ${showMappedOnly ? 'bg-black' : 'bg-zinc-700'}`}></div>
                  SHOW MAPPED ONLY
                </button>
             </div>
             <div className="text-[10px] text-zinc-600 font-mono uppercase tracking-[0.2em]">
               Unified MIDI Router Grid
             </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full border-collapse table-fixed">
              <thead>
                <tr className="text-left text-xs text-zinc-500 uppercase tracking-wider">
                  <th className="p-3 relative" style={{ width: columnWidths['note'] }}>
                    Signal
                    <ResizeHandle onResize={(delta) => setColumnWidths(prev => ({ ...prev, 'note': Math.max(50, prev['note'] + delta) }))} />
                  </th>
                  {CHANNELS.map(ch => (
                    <th key={ch} className="p-3 relative bg-zinc-900/40 border-l border-white/5" style={{ width: columnWidths[ch] }}>
                      <div className="absolute top-0 left-0 w-full h-0.5" style={{ backgroundColor: CHANNEL_COLORS[ch] }}></div>
                      <div className="flex flex-col gap-1 pt-1">
                        <span className="text-[10px] font-bold tracking-tighter" style={{ color: CHANNEL_COLORS[ch] }}>CH {ch}</span>
                        <input
                          type="text"
                          placeholder="Lab..."
                          className="bg-zinc-950/50 p-1 text-[10px] text-zinc-400 rounded w-full outline-none border border-zinc-800 focus:border-cyan-500/30 transition-all font-display"
                          value={channelNames[ch] || ''}
                          onChange={(e) => setChannelNames(prev => ({ ...prev, [ch]: e.target.value }))}
                        />
                      </div>
                      <ResizeHandle onResize={(delta) => setColumnWidths(prev => ({ ...prev, [ch]: Math.max(50, prev[ch] + delta) }))} />
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {(['note', 'cc', 'pc'] as const).map((type) => {
                  const isCollapsed = collapsedSections.has(type);
                  const typeLabel = type.toUpperCase();
                  
                  return (
                    <React.Fragment key={type}>
                      <tr 
                        className="bg-zinc-900/80 sticky top-0 z-10 cursor-pointer hover:bg-zinc-800 transition-colors"
                        onClick={() => {
                          setCollapsedSections(prev => {
                            const next = new Set(prev);
                            if (next.has(type)) next.delete(type);
                            else next.add(type);
                            return next;
                          });
                        }}
                      >
                        <td colSpan={17} className="p-2 border-y border-white/5">
                          <div className="flex items-center gap-2 text-[10px] font-black text-zinc-400 uppercase tracking-[0.3em]">
                            <div className={`transition-transform duration-200 ${isCollapsed ? '-rotate-90' : ''}`}>▼</div>
                            {typeLabel} ({type === 'note' ? 'PIANO' : type === 'cc' ? 'CONTINUOUS CTRL' : 'PROGRAM'})
                          </div>
                        </td>
                      </tr>
                      {!isCollapsed && Array.from({ length: 128 }).map((_, num) => {
                        const h = rowHeights[num] || 56;
                        const rowMappings = matrix[type][num] || {};
                        const hasMappings = Object.values(rowMappings).some(val => typeof val === 'string' && val.trim() !== "");
                        const isRecentlyActive = highlighted?.num === num && highlighted?.type === type && activeTab === 'router';
                        
                        if (showMappedOnly && !hasMappings && !isRecentlyActive) return null;

                        return (
                          <tr 
                            key={`${type}-${num}`} 
                            className={`group hover:bg-white/5 transition-colors ${isRecentlyActive ? 'bg-[#1a1a24]' : ''}`} 
                            style={{ height: h }}
                          >
                            <td className={`p-3 font-mono text-sm text-zinc-400 relative border-r border-white/5 ${isRecentlyActive ? 'ring-1 ring-amber-500/50' : ''}`} style={{ width: columnWidths['note'] }}>
                              <div className="flex flex-col h-full justify-center">
                                <span className="font-bold text-zinc-200">{num}</span>
                                <span className="text-[9px] text-zinc-600 font-bold uppercase tracking-tighter opacity-70">
                                  {type === 'note' ? getNoteName(num) : type === 'cc' ? (CC_NAMES[num] || 'MIDI CC') : 'PATCH'}
                                </span>
                              </div>
                              <VerticalResizeHandle onResize={(delta) => setRowHeights(prev => ({ ...prev, [num]: Math.max(40, (prev[num] || 56) + delta) }))} />
                            </td>
                            {CHANNELS.map(channel => {
                              const isActive = !!matrix[type][num]?.[channel];
                              const isCellHighlighted = isRecentlyActive && highlighted?.channel === channel;
                              const chColor = CHANNEL_COLORS[channel];
                              const bgTint = getChannelRgba(channel, 0.02);
                              const activeGlow = getChannelRgba(channel, 0.15);

                              return (
                                <td 
                                  key={channel} 
                                  className={`p-0 align-top relative border-l border-white/5 ${isCellHighlighted ? 'ring-1 ring-amber-500/50' : ''}`} 
                                  style={{ width: columnWidths[channel], backgroundColor: bgTint }}
                                >
                                  <div className={`w-full h-full p-2 matrix-input-cell border-l transition-all ${isActive ? 'border-l-2' : 'border-transparent group-hover:bg-white/5'}`} 
                                       style={{ minHeight: h, borderColor: isActive ? chColor : 'transparent', backgroundColor: isActive ? activeGlow : 'transparent' }}>
                                    <textarea
                                      ref={(el) => { inputRefs.current[`${type}-${num}-${channel}`] = el; }}
                                      className="w-full bg-transparent outline-none text-xs resize-none whitespace-normal font-mono leading-tight tracking-tight overflow-hidden"
                                      style={{ height: h - 16, color: isActive ? chColor : '#52525b' }}
                                      value={matrix[type][num]?.[channel] || ''}
                                      onChange={(e) => updateCell(type, num, channel, e.target.value)}
                                    />
                                    <div className="absolute top-1 right-1 opacity-0 group-hover:opacity-100" style={{ color: chColor }}>
                                      {isActive ? <Edit2 size={10} /> : <Plus size={10} className="text-zinc-700" />}
                                    </div>
                                  </div>
                                </td>
                              );
                            })}
                          </tr>
                        );
                      })}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {inputs.length + outputs.length > 0 && activeTab === 'remap' && (
        <div className="max-w-6xl mx-auto py-8 px-4">
          <div className="flex items-center justify-between mb-8">
            <div>
              <h2 className="text-xl font-bold font-sans tracking-tight text-white mb-1">Transformer Engine</h2>
              <div className="text-zinc-500 text-[10px] uppercase tracking-widest font-display font-bold">MIDI Learned Mappings & Global Conversions</div>
            </div>
            <div className="flex gap-3">
               {isLearning && (
                 <div className="flex items-center gap-2 px-3 py-1 bg-amber-500/10 border border-amber-500/20 rounded text-amber-500 text-[10px] font-bold animate-pulse">
                   <Zap size={10} />
                   TRIGGER HARDWARE TO ADD TO LIST
                 </div>
               )}
               <button 
                onClick={() => { if(confirm('Reset all transformers?')) setRemappings({}); }}
                className="px-4 py-1.5 bg-zinc-900 rounded border border-zinc-800 text-[10px] font-bold text-zinc-500 hover:text-red-400 hover:border-red-900/50 transition-all"
               >
                 CLEAR ALL
               </button>
            </div>
          </div>

          <div className="space-y-2">
            {Object.keys(remappings).length === 0 ? (
              <div className="h-64 flex flex-col items-center justify-center border-2 border-dashed border-zinc-900 rounded-2xl bg-zinc-900/20 text-zinc-700">
                <Target size={40} className="mb-4 opacity-20" />
                <p className="font-display font-bold text-sm">No Active Transformers</p>
                <p className="text-[10px] uppercase tracking-widest mt-1">Enable 'MIDI Map' and play a note/CC to begin</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-2">
                <div className="grid grid-cols-12 gap-4 px-6 py-2 text-[10px] font-bold text-zinc-600 uppercase tracking-widest bg-zinc-900/50 rounded-lg">
                  <div className="col-span-1">Source</div>
                  <div className="col-span-2">Input Trigger</div>
                  <div className="col-span-1 text-center">→</div>
                  <div className="col-span-2">Target Type</div>
                  <div className="col-span-1">Channel</div>
                  <div className="col-span-4">Value / Note</div>
                  <div className="col-span-1 text-right">Action</div>
                </div>
                {Object.entries(remappings).map(([key, mapping]) => {
                  const [mType, ch, mNum] = key.split(':');
                  const targetMapping = mapping as Remapping;
                  const isHighlighted = highlighted?.num === parseInt(mNum) && highlighted?.channel === parseInt(ch) && highlighted?.type === (mType as any);
                  
                  return (
                    <div 
                      key={key} 
                      className={`grid grid-cols-12 gap-4 items-center px-6 py-3 bg-[#1a1c23] border ${isHighlighted ? 'border-cyan-500 shadow-[0_0_15px_rgba(6,182,212,0.1)]' : 'border-zinc-800'} rounded-xl transition-all group`}
                    >
                      <div className="col-span-1">
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${mType === 'note' ? 'bg-cyan-500/10 text-cyan-400' : 'bg-amber-500/10 text-amber-400'}`}>
                          {mType === 'note' ? <Zap size={14} /> : <Settings size={14} />}
                        </div>
                      </div>
                      
                      <div className="col-span-2">
                        <div className="text-[11px] font-bold text-zinc-300">{mType.toUpperCase()} {mNum}</div>
                        <div className="text-[9px] text-zinc-600 font-mono">Channel {ch}</div>
                      </div>

                      <div className="col-span-1 text-center text-zinc-700">→</div>

                      <div className="col-span-2">
                        <select
                          className="w-full bg-[#0a0a0a] text-[10px] p-2 rounded border border-zinc-800 outline-none text-zinc-400 focus:border-cyan-500/50 transition-colors"
                          value={targetMapping.type}
                          onChange={(e) => setRemappings(prev => ({ ...prev, [key]: { ...prev[key], type: e.target.value as any } }))}
                        >
                          <option value="note">NOTE</option>
                          <option value="cc">CC</option>
                          <option value="pc">PC</option>
                        </select>
                      </div>

                      <div className="col-span-1">
                        <input
                          type="number"
                          min="1"
                          max="16"
                          className="w-full bg-[#0a0a0a] text-[11px] p-2 rounded border border-zinc-800 outline-none text-zinc-300 font-mono text-center"
                          value={targetMapping.channel}
                          onChange={(e) => setRemappings(prev => ({ ...prev, [key]: { ...prev[key], channel: parseInt(e.target.value) || 1 } }))}
                        />
                      </div>

                      <div className="col-span-4 flex items-center gap-3">
                        <input
                          type="range"
                          min="0"
                          max="127"
                          className="flex-1 accent-cyan-500 h-1"
                          value={targetMapping.value}
                          onChange={(e) => setRemappings(prev => ({ ...prev, [key]: { ...prev[key], value: parseInt(e.target.value) } }))}
                        />
                        <div className="w-16 flex flex-col items-center">
                          <input
                            type="number"
                            min="0"
                            max="127"
                            className="w-full bg-[#0a0a0a] text-[11px] p-1.5 rounded border border-zinc-800 outline-none text-cyan-400 font-mono text-center"
                            value={targetMapping.value}
                            onChange={(e) => setRemappings(prev => ({ ...prev, [key]: { ...prev[key], value: parseInt(e.target.value) || 0 } }))}
                          />
                          <span className="text-[8px] text-zinc-600 font-bold mt-0.5">{targetMapping.type === 'note' ? getNoteName(targetMapping.value) : `VAL ${targetMapping.value}`}</span>
                        </div>
                      </div>

                      <div className="col-span-1 text-right">
                        <button 
                          onClick={() => setRemappings(prev => {
                            const n = { ...prev };
                            delete n[key];
                            return n;
                          })}
                          className="p-2 text-zinc-700 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100"
                        >
                          <X size={14} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {inputs.length + outputs.length > 0 && activeTab === 'matrix' && (
        <div className="bg-[#111116] rounded-xl border border-zinc-800 p-8 shadow-2xl">
            <div className="flex items-center justify-between mb-8">
            <div>
              <h2 className="text-xl font-bold font-sans tracking-tight text-zinc-100">Crosspoint Matrix</h2>
              <p className="text-zinc-500 text-sm mt-1">Route physical and virtual MIDI devices globally.</p>
            </div>
            <div className="flex gap-4">
              <button 
                onClick={() => { if(confirm('Clear all matrix connections?')) setMatrixRoutings([]); }}
                className="px-4 py-1.5 rounded-lg text-[10px] font-bold text-red-500 border border-red-900/30 hover:bg-red-950/20 transition-colors"
              >
                CLEAR MATRIX
              </button>
              <div className="flex gap-1 bg-zinc-900 p-1 rounded-md">
                <button
                  className={`px-4 py-1.5 rounded-sm text-xs font-medium transition-colors ${matrixView === 'crosspoint' ? 'bg-zinc-800 text-white' : 'text-zinc-500 hover:text-zinc-300'}`}
                  onClick={() => setMatrixView('crosspoint')}
                >
                  Crosspoint
                </button>
                <button
                  className={`px-4 py-1.5 rounded-sm text-xs font-medium transition-colors ${matrixView === 'topography' ? 'bg-zinc-800 text-white' : 'text-zinc-500 hover:text-zinc-300'}`}
                  onClick={() => setMatrixView('topography')}
                >
                  Topography
                </button>
                <button
                  className={`px-4 py-1.5 rounded-sm text-xs font-medium transition-colors ${matrixView === 'list' ? 'bg-zinc-800 text-white' : 'text-zinc-500 hover:text-zinc-300'}`}
                  onClick={() => setMatrixView('list')}
                >
                  List
                </button>
              </div>
            </div>
          </div>

          {matrixView === 'crosspoint' && (
            <div className="overflow-auto rounded-lg border border-zinc-800/50 bg-[#0f1115] shadow-inner custom-scrollbar max-h-[700px]">
              <table className="w-full border-separate border-spacing-0">
                <thead className="sticky top-0 z-30">
                  <tr className="bg-[#1a1c23]">
                    <th className="p-4 text-left font-display text-[10px] font-bold text-zinc-500 uppercase tracking-[0.2em] border-b border-r border-zinc-800 sticky left-0 top-0 z-40 bg-[#1a1c23] min-w-[260px]">SOURCE \ DEST</th>
                    {outputs.map(out => (
                      <th key={out.id} className="p-4 text-center font-sans text-xs font-semibold text-zinc-400 border-b border-zinc-800 min-w-[150px] bg-[#1a1c23] sticky top-0 z-30">
                        <div className="flex flex-col items-center gap-2 group/header">
                          <div className={`w-1.5 h-1.5 rounded-full transition-all duration-300 ${outputActivity.has(out.id) ? 'bg-[#fbbf24] shadow-[0_0_8px_rgba(251,191,36,0.8)] scale-125' : 'bg-zinc-800'}`}></div>
                          <div className="w-full bg-[#272a35] py-1.5 px-3 rounded text-[10px] tracking-tight border border-zinc-700/50 group-hover/header:border-zinc-500 transition-colors whitespace-nowrap" title={out.name}>
                            {aliases[out.name] || out.name}
                          </div>
                          {(aliases[out.name] && aliases[out.name] !== out.name) && (
                            <div className="text-[8px] opacity-40 font-mono uppercase">{out.name}</div>
                          )}
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/20">
                  {inputs.map(input => (
                    <tr key={input.id} className="hover:bg-[#1a1c23]/30 transition-colors group">
                      <td className="p-4 font-display text-[10px] font-bold text-zinc-400 uppercase tracking-widest bg-[#13151a] border-r border-b border-zinc-800/50 sticky left-0 z-20 min-w-[260px]">
                        <div className="flex items-center gap-3">
                          <div className={`w-1.5 h-1.5 rounded-full transition-all duration-300 ${inputActivity.has(input.id) ? 'bg-[#06b6d4] shadow-[0_0_8px_rgba(6,182,212,0.8)] scale-125' : 'bg-zinc-800'}`}></div>
                          <div className="flex flex-col">
                            <span className="text-zinc-200 whitespace-nowrap">{aliases[input.name] || input.name}</span>
                            {(aliases[input.name] && aliases[input.name] !== input.name) && (
                              <span className="text-[8px] opacity-40 font-mono whitespace-nowrap">{input.name}</span>
                            )}
                          </div>
                        </div>
                      </td>
                      {outputs.map(out => {
                        const isActive = matrixRoutings.some(r => r.inputId === input.id && r.outputId === out.id && r.enabled);
                        return (
                          <td key={out.id} className="p-4 text-center border-b border-r border-zinc-800/30">
                            <button
                              onClick={() => toggleMatrixRouting(input.id, out.id)}
                              className={`w-6 h-6 rounded flex items-center justify-center transition-all duration-300 relative ${isActive ? 'bg-cyan-500 shadow-[0_0_15px_rgba(6,182,212,0.6)]' : 'bg-[#0a0a0a] border border-zinc-800 hover:border-zinc-600'}`}
                            >
                              {isActive && <div className="w-1.5 h-1.5 bg-white rounded-full shadow-[0_0_5px_white]" />}
                            </button>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {activeTab === 'matrix' && matrixView === 'list' && (
            <div className="max-w-4xl mx-auto space-y-4">
              <div className="flex justify-between items-center mb-6 px-2">
                 <div>
                   <p className="text-[10px] text-zinc-600 uppercase tracking-[0.2em] font-bold">Device Routing List</p>
                   <p className="text-[9px] text-zinc-800 uppercase tracking-tighter mt-1">Direct hardware-to-hardware mapping</p>
                 </div>
                 <button 
                  onClick={() => {
                    const firstInput = inputs[0]?.id;
                    const firstOutput = outputs[0]?.id;
                    if (firstInput && firstOutput) {
                      const newId = `route-${Date.now()}`;
                      setMatrixRoutings(prev => [...prev, {
                        id: newId,
                        inputId: firstInput,
                        outputId: firstOutput,
                        enabled: true
                      }]);
                    }
                  }}
                  className="px-4 py-2 bg-cyan-600 text-black rounded-lg text-[10px] font-black hover:bg-cyan-400 transition-all flex items-center gap-2 shadow-[0_0_15px_rgba(6,182,212,0.3)]"
                 >
                   <Plus size={14} strokeWidth={3} />
                   ADD NEW ROUTE
                 </button>
              </div>
              
              <div className="space-y-2">
                {matrixRoutings.length === 0 ? (
                  <div className="py-24 text-center border-2 border-dashed border-zinc-900 rounded-3xl bg-zinc-950/30">
                    <div className="w-16 h-16 bg-zinc-900/50 rounded-full flex items-center justify-center mx-auto mb-4 border border-zinc-800">
                      <Zap size={24} className="text-zinc-800" />
                    </div>
                    <p className="font-display font-bold text-zinc-600">No active device routes</p>
                    <p className="text-[9px] uppercase tracking-widest mt-2 text-zinc-800">Add a route above or use the Crosspoint Matrix</p>
                  </div>
                ) : (
                  matrixRoutings.map((routing, idx) => {
                    const filterOpen = expandedFilters.has(routing.id);
                    const hasFilters = routingHasFilters(routing);
                    return (
                    <div key={routing.id} className="bg-[#1a1c23]/60 p-4 rounded-2xl border border-zinc-800/80 group hover:border-cyan-500/30 transition-all shadow-lg animate-in fade-in slide-in-from-bottom-2 duration-300">
                      <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-xl bg-zinc-900 border border-zinc-800 flex flex-col items-center justify-center">
                        <span className="text-[8px] text-zinc-600 font-bold uppercase tracking-tighter leading-none mb-0.5">Pt</span>
                        <span className="text-xs font-black text-cyan-500/60 leading-none">{idx + 1}</span>
                      </div>

                      <div className="flex-1 flex items-center gap-4">
                        <div className="flex-1 relative">
                          <label className="absolute -top-2 left-3 bg-[#1a1c23] px-1.5 text-[8px] font-black text-zinc-600 uppercase tracking-widest z-10">Source</label>
                          <select
                            className="w-full bg-zinc-950 text-xs px-4 py-3 rounded-xl border border-zinc-800 outline-none text-zinc-100 focus:border-cyan-500/50 transition-all cursor-pointer appearance-none shadow-inner"
                            value={routing.inputId}
                            onChange={(e) => {
                              const val = e.target.value;
                              setMatrixRoutings(prev => prev.map(r => r.id === routing.id ? { ...r, inputId: val } : r));
                            }}
                          >
                            {inputs.map(i => (
                              <option key={i.id} value={i.id}>{aliases[i.name] || i.name} {inputActivity.has(i.id) ? '●' : ''}</option>
                            ))}
                          </select>
                        </div>

                        <div className={`p-2 rounded-full border transition-all duration-500 ${inputActivity.has(routing.inputId) || outputActivity.has(routing.outputId) ? 'bg-cyan-500/10 border-cyan-500/30 text-cyan-400 scale-110 shadow-[0_0_10px_rgba(6,182,212,0.2)]' : 'bg-zinc-900/50 border-zinc-800 text-zinc-700'}`}>
                          <Zap size={16} fill={inputActivity.has(routing.inputId) || outputActivity.has(routing.outputId) ? "currentColor" : "none"} />
                        </div>

                        <div className="flex-1 relative">
                          <label className="absolute -top-2 left-3 bg-[#1a1c23] px-1.5 text-[8px] font-black text-zinc-600 uppercase tracking-widest z-10">Destination</label>
                          <select
                            className="w-full bg-zinc-950 text-xs px-4 py-3 rounded-xl border border-zinc-800 outline-none text-zinc-100 focus:border-cyan-500/50 transition-all cursor-pointer appearance-none shadow-inner"
                            value={routing.outputId}
                            onChange={(e) => {
                              const val = e.target.value;
                              setMatrixRoutings(prev => prev.map(r => r.id === routing.id ? { ...r, outputId: val } : r));
                            }}
                          >
                            {outputs.map(o => (
                              <option key={o.id} value={o.id}>{aliases[o.name] || o.name} {outputActivity.has(o.id) ? '●' : ''}</option>
                            ))}
                          </select>
                        </div>
                      </div>

                      <button
                        onClick={() => setExpandedFilters((prev) => {
                          const next = new Set(prev);
                          if (next.has(routing.id)) next.delete(routing.id);
                          else next.add(routing.id);
                          return next;
                        })}
                        className={`px-3 py-2 rounded-lg text-[10px] font-bold border transition-colors ${hasFilters ? 'bg-violet-900/30 text-violet-300 border-violet-700/50' : 'bg-zinc-900 text-zinc-500 border-zinc-800 hover:text-zinc-300'}`}
                        title="Filters: limit which MIDI passes this route"
                      >
                        {hasFilters ? 'FILTERED' : 'FILTERS'}
                      </button>

                      <button
                        onClick={() => {
                          setMatrixRoutings(prev => prev.filter(r => r.id !== routing.id));
                          setExpandedFilters((prev) => {
                            const next = new Set(prev);
                            next.delete(routing.id);
                            return next;
                          });
                        }}
                        className="w-12 h-12 flex items-center justify-center rounded-xl bg-red-950/10 text-red-500/40 hover:bg-red-500 hover:text-white transition-all opacity-0 group-hover:opacity-100 border border-transparent hover:border-red-400 shadow-lg"
                      >
                        <X size={20} />
                      </button>
                      </div>

                      {filterOpen && (
                        <div className="mt-4 pt-4 border-t border-zinc-800/60 space-y-3">
                          <div>
                            <div className="text-[9px] font-bold text-zinc-500 uppercase tracking-widest mb-2">Channels</div>
                            <div className="flex flex-wrap gap-1">
                              {CHANNELS.map((ch) => {
                                const active = !routing.channels || routing.channels.length === 0 || routing.channels.includes(ch);
                                return (
                                  <button
                                    key={ch}
                                    onClick={() => {
                                      const current = routing.channels && routing.channels.length > 0 ? routing.channels : [...CHANNELS];
                                      const next = current.includes(ch)
                                        ? current.filter((c) => c !== ch)
                                        : [...current, ch].sort((a, b) => a - b);
                                      updateRoutingFilter(routing.id, {
                                        channels: next.length === 0 || next.length === 16 ? undefined : next,
                                      });
                                    }}
                                    className={`w-8 h-7 rounded text-[10px] font-bold border transition-colors ${active ? 'bg-cyan-900/40 text-cyan-200 border-cyan-700/60' : 'bg-zinc-900 text-zinc-600 border-zinc-800'}`}
                                    style={active ? { borderColor: CHANNEL_COLORS[ch], color: CHANNEL_COLORS[ch] } : undefined}
                                  >
                                    {ch}
                                  </button>
                                );
                              })}
                              <button
                                onClick={() => updateRoutingFilter(routing.id, { channels: undefined })}
                                className="px-2 h-7 rounded text-[10px] text-zinc-500 hover:text-zinc-200 border border-zinc-800 ml-2"
                              >
                                ALL
                              </button>
                            </div>
                          </div>

                          <div className="flex items-center gap-4">
                            <div className="text-[9px] font-bold text-zinc-500 uppercase tracking-widest">Note Range</div>
                            <div className="flex items-center gap-2">
                              <input
                                type="number"
                                min={0}
                                max={127}
                                placeholder="0"
                                value={routing.noteMin ?? ''}
                                onChange={(e) => {
                                  const v = e.target.value === '' ? undefined : Math.max(0, Math.min(127, parseInt(e.target.value) || 0));
                                  updateRoutingFilter(routing.id, { noteMin: v });
                                }}
                                className="w-16 bg-zinc-950 border border-zinc-800 rounded px-2 py-1 text-[11px] text-zinc-200 text-center outline-none focus:border-cyan-500"
                              />
                              <span className="text-zinc-600 text-[10px]">
                                {routing.noteMin != null ? getNoteName(routing.noteMin) : 'min'}
                              </span>
                              <span className="text-zinc-700">—</span>
                              <input
                                type="number"
                                min={0}
                                max={127}
                                placeholder="127"
                                value={routing.noteMax ?? ''}
                                onChange={(e) => {
                                  const v = e.target.value === '' ? undefined : Math.max(0, Math.min(127, parseInt(e.target.value) || 0));
                                  updateRoutingFilter(routing.id, { noteMax: v });
                                }}
                                className="w-16 bg-zinc-950 border border-zinc-800 rounded px-2 py-1 text-[11px] text-zinc-200 text-center outline-none focus:border-cyan-500"
                              />
                              <span className="text-zinc-600 text-[10px]">
                                {routing.noteMax != null ? getNoteName(routing.noteMax) : 'max'}
                              </span>
                              {(routing.noteMin != null || routing.noteMax != null) && (
                                <button
                                  onClick={() => updateRoutingFilter(routing.id, { noteMin: undefined, noteMax: undefined })}
                                  className="text-zinc-600 hover:text-zinc-300 text-[10px] ml-2"
                                >
                                  clear
                                </button>
                              )}
                            </div>
                            <div className="text-[9px] text-zinc-700 ml-2">Applies to note on/off only</div>
                          </div>
                        </div>
                      )}
                    </div>
                    );
                  })
                )}
              </div>
            </div>
          )}

          {matrixView === 'topography' && (
            <div className="flex flex-col gap-6 w-full max-w-6xl mx-auto">
              <div className="h-[600px] w-full rounded-lg border border-zinc-800/30 bg-[#0f1115] shadow-inner relative overflow-hidden">
                <ReactFlow
                  className="pro-audio-flow"
                  nodes={nodes}
                  edges={edges}
                  nodeTypes={nodeTypes}
                  edgeTypes={edgeTypes}
                  onNodesChange={onNodesChange}
                  onEdgesChange={onEdgesChange}
                  onConnect={onConnect}
                  onInit={(inst) => setTimeout(() => inst.fitView({ padding: 0.2 }), 50)}
                  connectionLineType={ConnectionLineType.SmoothStep}
                  connectionLineStyle={{ stroke: '#06b6d4', strokeWidth: 3 }}
                  minZoom={0.1}
                  maxZoom={2}
                  proOptions={{ hideAttribution: true }}
                >
                  <Background color="#27272a" gap={40} size={1} variant={BackgroundVariant.Lines} className="opacity-20" />
                  
                  <Panel position="top-left" className="m-4 pointer-events-none">
                    <h3 className="text-zinc-500 font-display font-bold tracking-widest text-[10px] uppercase opacity-70">SOURCES</h3>
                    <p className="text-zinc-700 font-display text-[9px] uppercase tracking-wider">Physical Hardware Inputs</p>
                  </Panel>
                  
                  <Panel position="top-right" className="m-4 pointer-events-none text-right">
                    <h3 className="text-zinc-500 font-display font-bold tracking-widest text-[10px] uppercase opacity-70">DESTINATIONS</h3>
                    <p className="text-zinc-700 font-display text-[9px] uppercase tracking-wider">Physical Hardware Outputs</p>
                  </Panel>
                </ReactFlow>
              </div>
            </div>
          )}

          {/* Universal Matrix Presets Footer - showing in both List and Topography */}
          <div className="w-full bg-[#1a1c23] border border-zinc-800 p-6 shadow-xl relative rounded-lg mt-8">
            <div className="flex justify-between items-center mb-6">
              <div className="flex items-center gap-4">
                <h3 className="text-zinc-400 font-display font-semibold tracking-wider text-sm uppercase">PATCH PRESETS</h3>
                {!isNamingPreset ? (
                  <button 
                    onClick={() => setIsNamingPreset(true)}
                    className="flex items-center gap-2 px-3 py-1.5 bg-cyan-500/10 hover:bg-cyan-500/20 transition-all rounded text-[10px] text-cyan-500 font-bold border border-cyan-500/30"
                  >
                    <Plus size={12} />
                    SAVE NEW
                  </button>
                ) : (
                  <div className="flex items-center gap-2 animate-in fade-in slide-in-from-left-2 duration-300">
                    <input 
                      autoFocus
                      type="text"
                      placeholder="Enter Preset Name..."
                      className="bg-zinc-950 border border-cyan-500/50 rounded px-3 py-1.5 text-xs text-white outline-none w-64 focus:ring-1 ring-cyan-500/30"
                      value={newPresetName}
                      onChange={(e) => setNewPresetName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') saveCurrentAsPreset();
                        if (e.key === 'Escape') setIsNamingPreset(false);
                      }}
                    />
                    <button 
                      onClick={saveCurrentAsPreset}
                      className="px-3 py-1.5 bg-cyan-500 text-black font-bold rounded text-[10px]"
                    >
                      SAVE
                    </button>
                    <button 
                      onClick={() => setIsNamingPreset(false)}
                      className="p-1.5 text-zinc-500 hover:text-white"
                    >
                      <X size={16} />
                    </button>
                  </div>
                )}
              </div>
              <button
                onClick={() => setIsPresetManagerOpen(true)}
                className="px-3 py-1.5 bg-[#272a35] hover:bg-[#343846] transition-colors rounded text-xs text-zinc-300 font-display border border-zinc-700"
              >
                MANAGE PRESETS
              </button>
            </div>
            <div className="space-y-1 mb-4 grid grid-cols-1 md:grid-cols-2 gap-2 max-h-60 overflow-y-auto custom-scrollbar">
              {presets.length === 0 ? (
                <div className="px-4 py-2 text-zinc-600 text-[11px] italic">No presets saved yet. Click 'ADD NEW PRESET' below...</div>
              ) : (
                presets.slice().reverse().map((preset) => (
                  <div 
                    key={preset.id}
                    onClick={() => loadPreset(preset)}
                    className="group flex justify-between items-center px-4 py-2 bg-[#13151a] hover:bg-[#20232c] text-zinc-400 rounded text-sm cursor-pointer transition-colors border border-zinc-800 hover:border-zinc-700"
                  >
                    <div className="flex items-center gap-3">
                       <div className="w-1.5 h-1.5 rounded-full bg-zinc-600 group-hover:bg-[#06b6d4] shadow-[0_0_4px_rgba(6,182,212,0)] group-hover:shadow-[0_0_8px_rgba(6,182,212,0.8)]"></div>
                       <span className="group-hover:text-white transition-colors">{preset.name}</span>
                    </div>
                    <button 
                      onClick={(e) => deletePreset(preset.id, e)}
                      className="opacity-0 group-hover:opacity-100 text-[10px] text-zinc-600 hover:text-red-400 transition-opacity px-2"
                    >
                      DELETE
                    </button>
                  </div>
                ))
              )}
            </div>
            <div className="flex justify-between items-center pt-2 border-t border-zinc-800 mt-4">
              <button 
                onClick={saveCurrentAsPreset}
                className="px-4 py-2 bg-[#272a35] hover:bg-[#343846] transition-colors rounded text-xs text-zinc-300 font-display border border-zinc-700 mt-2 flex items-center gap-2"
              >
                <Plus size={14} />
                ADD NEW PRESET
              </button>
              <button 
                onClick={saveCurrentAsPreset}
                className="px-4 py-2 bg-[#06b6d4] hover:bg-[#0891b2] transition-colors rounded text-xs text-white font-display font-semibold border-none mt-2 shadow-[0_0_15px_rgba(6,182,212,0.3)]"
              >
                SAVE CURRENT SESSION
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Removed Topography tab content from here */}




      {/* MIDI Monitor Overlay - Image Inspired */}
      {isPresetManagerOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-8 bg-black/40 backdrop-blur-sm">
          <div className="w-full max-w-2xl max-h-[80vh] bg-[#1a1c23] border border-zinc-800 rounded-2xl shadow-2xl flex flex-col overflow-hidden">
            <div className="px-6 py-4 border-b border-zinc-800 flex justify-between items-center bg-[#13151a]">
              <div className="flex items-center gap-3">
                <Settings size={16} className="text-zinc-400" />
                <h3 className="text-zinc-300 font-display font-semibold tracking-wider text-sm">PRESET MANAGER</h3>
                <span className="text-zinc-600 text-[10px] font-mono">{presets.length} saved</span>
              </div>
              <button
                onClick={() => { setIsPresetManagerOpen(false); setRenamingPresetId(null); }}
                className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-zinc-800 text-zinc-500 hover:text-white transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-4 py-4 space-y-2">
              {presets.length === 0 && (
                <div className="py-16 text-center text-zinc-600 text-xs">
                  No presets yet. Close this window and click "SAVE NEW" to create one.
                </div>
              )}
              {presets.slice().reverse().map((preset) => {
                const isRenaming = renamingPresetId === preset.id;
                return (
                  <div key={preset.id} className="flex items-center gap-3 px-3 py-2 bg-[#0f1115] border border-zinc-800 rounded-lg hover:border-zinc-700 transition-colors">
                    <div className="flex-1 min-w-0">
                      {isRenaming ? (
                        <input
                          autoFocus
                          value={renameDraft}
                          onChange={(e) => setRenameDraft(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              renamePreset(preset.id, renameDraft);
                              setRenamingPresetId(null);
                            }
                            if (e.key === 'Escape') setRenamingPresetId(null);
                          }}
                          onBlur={() => {
                            renamePreset(preset.id, renameDraft);
                            setRenamingPresetId(null);
                          }}
                          className="w-full bg-zinc-900 border border-cyan-500/50 rounded px-2 py-1 text-xs text-white outline-none"
                        />
                      ) : (
                        <>
                          <div className="text-zinc-200 text-sm font-medium truncate">{preset.name}</div>
                          <div className="text-zinc-600 text-[10px] font-mono">
                            {new Date(preset.timestamp).toLocaleString()}
                          </div>
                        </>
                      )}
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <button
                        onClick={() => { loadPreset(preset); setIsPresetManagerOpen(false); }}
                        className="px-2 py-1 bg-cyan-600/20 hover:bg-cyan-600/40 text-cyan-300 rounded text-[10px] font-bold transition-colors"
                        title="Load this preset"
                      >
                        LOAD
                      </button>
                      <button
                        onClick={() => { setRenamingPresetId(preset.id); setRenameDraft(preset.name); }}
                        className="px-2 py-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-400 rounded text-[10px] transition-colors"
                        title="Rename"
                      >
                        <Edit2 size={10} />
                      </button>
                      <button
                        onClick={() => duplicatePreset(preset)}
                        className="px-2 py-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-400 rounded text-[10px] transition-colors"
                        title="Duplicate"
                      >
                        <Plus size={10} />
                      </button>
                      <button
                        onClick={() => exportSinglePreset(preset)}
                        className="px-2 py-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-400 rounded text-[10px] transition-colors"
                        title="Export as .preset file"
                      >
                        <Download size={10} />
                      </button>
                      <button
                        onClick={(e) => deletePreset(preset.id, e)}
                        className="px-2 py-1 bg-zinc-800 hover:bg-red-900/40 text-zinc-500 hover:text-red-300 rounded text-[10px] transition-colors"
                        title="Delete"
                      >
                        <X size={10} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="px-6 py-3 border-t border-zinc-800 bg-[#13151a] flex items-center justify-between">
              <div className="text-[10px] text-zinc-600">
                LOAD applies a preset. Presets include routing, aliases, and transforms.
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => presetImportRef.current?.click()}
                  className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded text-[10px] font-bold transition-colors flex items-center gap-1"
                  title="Import a single .preset file"
                >
                  <Plus size={10} /> IMPORT PRESET
                </button>
                <input
                  ref={presetImportRef}
                  type="file"
                  accept=".preset,application/json,.json"
                  className="hidden"
                  onChange={(e) => {
                    if (e.target.files && e.target.files[0]) {
                      importSinglePreset(e.target.files[0]);
                      e.target.value = '';
                    }
                  }}
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {isMonitorOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-8 bg-black/40 backdrop-blur-sm">
          <div className="w-full max-w-4xl h-[600px] bg-[#1a1c23] border border-zinc-800 rounded-2xl shadow-2xl flex flex-col overflow-hidden">
            <div className="px-6 py-4 border-b border-zinc-800 flex justify-between items-center bg-[#13151a]">
              <div className="flex items-center gap-3">
                <div className="w-3 h-3 rounded-full bg-[#06b6d4] shadow-[0_0_8px_rgba(6,182,212,0.8)] animate-pulse"></div>
                <h3 className="text-zinc-300 font-display font-semibold tracking-wider text-sm">MIDI STREAM MONITOR</h3>
              </div>
              <div className="flex items-center gap-4">
                <span className="text-zinc-600 text-[10px] font-mono uppercase tracking-widest">Active Streams: {selectedInputs.size}</span>
                <button 
                  onClick={() => setIsMonitorOpen(false)}
                  className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-zinc-800 text-zinc-500 hover:text-white transition-colors"
                >
                  <X size={18} />
                </button>
              </div>
            </div>
            
            <div className="flex-1 overflow-y-auto px-6 py-4 font-mono text-[11px] space-y-1 bg-[#0f1115]">
              <div className="grid grid-cols-5 gap-4 text-zinc-600 border-b border-zinc-800 pb-2 mb-4 sticky top-0 bg-[#0f1115]">
                <span>TIMESTAMP</span>
                <span>SOURCE</span>
                <span>EVENT</span>
                <span>CH</span>
                <span>DATA</span>
              </div>
              {midiLog.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-zinc-700 space-y-2 opacity-50">
                  <Zap size={32} />
                  <p className="font-display italic">Waiting for MIDI input...</p>
                </div>
              ) : (
                midiLog.slice().reverse().map((log, index) => (
                  <div key={index} className="grid grid-cols-5 gap-4 py-1.5 border-b border-zinc-800/30 hover:bg-zinc-800/20 transition-colors animate-in fade-in slide-in-from-left-2">
                    <span className="text-zinc-500">{log.time}</span>
                    <span className="text-[#06b6d4] truncate">{log.source}</span>
                    <span className="text-zinc-300">{log.message}</span>
                    <span className="text-zinc-400">{log.channel}</span>
                    <span className="text-zinc-500">{log.data}</span>
                  </div>
                ))
              )}
            </div>

            <div className="px-6 py-3 border-t border-zinc-800 bg-[#13151a] flex justify-between items-center">
              <button 
                onClick={() => setMidiLog([])}
                className="px-3 py-1.5 bg-[#272a35] hover:bg-red-900/40 hover:text-red-200 transition-colors rounded text-[10px] text-zinc-400 font-display border border-zinc-700"
              >
                CLEAR LOG
              </button>
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                   <div className="w-2 h-2 rounded-full bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]"></div>
                   <span className="text-zinc-500 text-[10px]">{midiLog.length} EVENTS</span>
                </div>
                <button
                  onClick={downloadMonitorCSV}
                  disabled={midiLog.length === 0}
                  className="px-4 py-1.5 bg-[#06b6d4] hover:bg-[#0891b2] disabled:opacity-40 disabled:cursor-not-allowed transition-colors rounded text-[10px] text-white font-display font-semibold shadow-[0_0_15px_rgba(6,182,212,0.3)]"
                >
                  DOWNLOAD CSV
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
