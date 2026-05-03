// Typed model of a Resolume Arena MIDI shortcut preset (.xml).
//
// The shape mirrors the XML closely so the parser can walk it directly. We
// preserve unknown fields under `_extra` so future Resolume versions don't
// strip data on round-trip.

export interface ResolumeVersionInfo {
  name: string;
  majorVersion: number;
  minorVersion: number;
  microVersion?: number;
  revision?: number;
  _extra?: Record<string, string>;
}

export interface ResolumeShortcutPath {
  // <ShortcutPath name="InputPath" path="..." translationType="2" allowedTranslationTypes="7"/>
  name: 'InputPath' | 'OutputPath' | 'InputSiblingPath' | string;
  path: string;
  translationType?: number;
  allowedTranslationTypes?: number;
  _extra?: Record<string, string>;
}

export interface ResolumeNamedValue {
  first: string;
  second: string; // value is stored as string in XML even for ints
}

// The 64-bit `key` is preserved as a string for fidelity (BigInt in JSON
// doesn't survive serialization in some toolchains) and decoded on demand.
export interface ResolumeRawInputMessage {
  keyRaw: string;        // exact original digits — used for byte-equivalent round-trip
  value: number;
  numSteps?: number;
  _extra?: Record<string, string>;
}

export interface ResolumeShortcut {
  uniqueId: string;
  paramNodeName: string; // 'ParamEvent' | 'ParamRange' | 'ParamChoice[Color]' | 'RangedParam[bool]' | 'ParamTrigger' | ...
  behaviour: number;
  inputDeviceName?: string;
  outputDeviceName?: string;
  paths: ResolumeShortcutPath[];
  rawInput?: ResolumeRawInputMessage;
  namedValues?: ResolumeNamedValue[];
  _extra?: Record<string, string>;       // unknown attrs on <Shortcut>
  _extraChildren?: unknown[];            // unknown child elements, preserved verbatim
}

export interface ResolumePreset {
  name: string;
  presetId: string;
  versionInfo?: ResolumeVersionInfo;
  shortcutManagerName: string;           // typically "MIDIShortcutManagerShortcuts"
  shortcuts: ResolumeShortcut[];
  _extra?: Record<string, string>;       // unknown attrs on <MidiShortcutPreset>
  _extraChildren?: unknown[];            // unknown top-level children
}

// Behaviour bitmask values observed in the wild. Useful for the editor UI;
// not authoritative — Resolume may add more.
export const BehaviourFlags = {
  Toggle: 4,
  Fader: 8,
  MultiStateTrigger: 1028,
  RelativeEncoder: 16392,
  Scrubber: 2113544,
} as const;
