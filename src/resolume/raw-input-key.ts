// Resolume Arena packs an entire MIDI shortcut binding into the single
// 64-bit `key` attribute on <RawInputMessage>. Reverse-engineered layout:
//
//   bits 0-7   : MIDI status byte (e.g. 0x90 = Note On ch1, 0xB3 = CC ch4)
//   bits 8-15  : data1 byte (note number for note messages, CC number for CCs)
//   bits 16-55 : 40-bit device identifier (Resolume's hash of the input
//                device name; stable across sessions for the same device)
//   bits 56-63 : "source slot" byte; observed values 0x01, 0x02, 0x04
//
// We let users edit `data1` and `status` (the editable MIDI surface) and
// preserve `deviceHash` and `topByte` verbatim so the round-trip is safe
// for devices Resolume already knows.

export interface DecodedRawInputKey {
  topByte: number;        // bits 56-63
  deviceHash: bigint;     // bits 16-55 (40-bit value)
  data1: number;          // bits 8-15  (note or CC number, 0-127)
  status: number;         // bits 0-7   (MIDI status byte, includes channel)
}

const MASK_8 = 0xffn;
const MASK_40 = 0xffffffffffn;

export function decodeRawInputKey(key: bigint | string | number): DecodedRawInputKey {
  const k = typeof key === 'bigint' ? key : BigInt(key);
  return {
    topByte: Number((k >> 56n) & MASK_8),
    deviceHash: (k >> 16n) & MASK_40,
    data1: Number((k >> 8n) & MASK_8),
    status: Number(k & MASK_8),
  };
}

export function encodeRawInputKey(parts: DecodedRawInputKey): bigint {
  return (
    (BigInt(parts.topByte & 0xff) << 56n) |
    ((parts.deviceHash & MASK_40) << 16n) |
    (BigInt(parts.data1 & 0xff) << 8n) |
    BigInt(parts.status & 0xff)
  );
}

// Convenience helpers for the UI: derive readable MIDI message info from a
// raw status byte. Status = (typeNibble << 4) | (channel - 1).
export type MidiMessageType =
  | 'noteOff'
  | 'noteOn'
  | 'aftertouch'
  | 'cc'
  | 'programChange'
  | 'channelPressure'
  | 'pitchBend'
  | 'system';

export function statusToMessage(status: number): { type: MidiMessageType; channel: number } {
  const high = (status >> 4) & 0xf;
  const channel = (status & 0xf) + 1;
  switch (high) {
    case 0x8: return { type: 'noteOff', channel };
    case 0x9: return { type: 'noteOn', channel };
    case 0xa: return { type: 'aftertouch', channel };
    case 0xb: return { type: 'cc', channel };
    case 0xc: return { type: 'programChange', channel };
    case 0xd: return { type: 'channelPressure', channel };
    case 0xe: return { type: 'pitchBend', channel };
    default:  return { type: 'system', channel: 0 };
  }
}

export function messageToStatus(type: MidiMessageType, channel: number): number {
  const ch = Math.max(1, Math.min(16, channel)) - 1;
  switch (type) {
    case 'noteOff':         return 0x80 | ch;
    case 'noteOn':          return 0x90 | ch;
    case 'aftertouch':      return 0xa0 | ch;
    case 'cc':              return 0xb0 | ch;
    case 'programChange':   return 0xc0 | ch;
    case 'channelPressure': return 0xd0 | ch;
    case 'pitchBend':       return 0xe0 | ch;
    case 'system':          return 0xf0;
  }
}

export function describeKey(key: bigint | string | number): string {
  const d = decodeRawInputKey(key);
  const m = statusToMessage(d.status);
  switch (m.type) {
    case 'noteOn':
    case 'noteOff':
      return `${m.type === 'noteOn' ? 'Note On' : 'Note Off'} ch${m.channel} note ${d.data1}`;
    case 'cc':
      return `CC ch${m.channel} #${d.data1}`;
    case 'pitchBend':
      return `Pitch Bend ch${m.channel}`;
    case 'programChange':
      return `Program Change ch${m.channel} #${d.data1}`;
    case 'aftertouch':
      return `Aftertouch ch${m.channel} note ${d.data1}`;
    case 'channelPressure':
      return `Channel Pressure ch${m.channel}`;
    case 'system':
      return `System 0x${d.status.toString(16)}`;
  }
}
