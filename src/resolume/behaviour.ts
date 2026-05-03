// The Resolume `behaviour` attribute on <Shortcut> is a bitmask. Bits
// inferred from a corpus of real presets — labels are best-guess names that
// match Resolume's UI controls. Combinations occur (e.g. 1028 = Trigger |
// Toggle, 16392 = Relative | Fader).

export const BehaviourBit = {
  Toggle: 4,
  Fader: 8,
  StepIncrement: 16,
  Trigger: 1024,
  Latch: 2048,
  Relative: 16384,
  Scrubber: 2097152,
} as const;

const BIT_LABELS: Array<[number, string]> = [
  [BehaviourBit.Scrubber, 'Scrubber'],
  [BehaviourBit.Relative, 'Relative'],
  [BehaviourBit.Latch, 'Latch'],
  [BehaviourBit.Trigger, 'Trigger'],
  [BehaviourBit.StepIncrement, 'Step'],
  [BehaviourBit.Fader, 'Fader'],
  [BehaviourBit.Toggle, 'Toggle'],
];

export function describeBehaviour(value: number): string {
  if (!value) return 'None';
  const parts: string[] = [];
  let remaining = value;
  for (const [bit, label] of BIT_LABELS) {
    if ((remaining & bit) === bit) {
      parts.push(label);
      remaining &= ~bit;
    }
  }
  if (remaining !== 0) {
    parts.push(`+${remaining}`);
  }
  return parts.join(' + ') || `(${value})`;
}

// Common values seen in the wild — shown as a dropdown alongside the raw
// integer so users can pick a preset behaviour without bit-twiddling.
export interface BehaviourPreset {
  value: number;
  label: string;
  hint: string;
}

export const COMMON_BEHAVIOURS: BehaviourPreset[] = [
  { value: 1028, label: 'Trigger + Toggle',     hint: 'fires on press; latches between two states' },
  { value: 1032, label: 'Trigger + Fader',      hint: 'fires + sends 0–127 value' },
  { value: 4,    label: 'Toggle',               hint: 'pure toggle, no trigger fire' },
  { value: 8,    label: 'Fader',                hint: 'continuous value, no trigger' },
  { value: 2056, label: 'Latch + Fader',        hint: 'latched fader (holds value)' },
  { value: 3076, label: 'Trigger + Latch + Toggle', hint: 'multi-state' },
  { value: 16392, label: 'Relative Encoder',    hint: 'jog wheel / rotary encoder' },
  { value: 2113544, label: 'Scrubber',          hint: 'timeline scrubber' },
];

export function nearestBehaviourLabel(value: number): string {
  const exact = COMMON_BEHAVIOURS.find(b => b.value === value);
  if (exact) return exact.label;
  return describeBehaviour(value);
}
