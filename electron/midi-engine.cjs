const easymidi = require('easymidi');

const SUBSCRIBED_EVENTS = [
  'noteon',
  'noteoff',
  'cc',
  'program',
  'pitch',
  'poly aftertouch',
  'channel aftertouch',
  'position',
  'mtc',
  'select',
  'clock',
  'start',
  'continue',
  'stop',
  'reset',
];

const state = {
  inputs: new Map(),
  outputs: new Map(),
  // Virtual ports we create — tracked separately so listDevices can still
  // include them even though the OS may hide them from our own enumeration.
  virtualInputs: new Map(),  // name -> easymidi.Input (virtual)
  virtualOutputs: new Map(), // name -> easymidi.Output (virtual)
  routes: [],
  onMessage: null,
};

function listDevices() {
  const hardwareInputs = easymidi.getInputs();
  const hardwareOutputs = easymidi.getOutputs();
  // Merge virtual ports; dedupe by name (OS may or may not echo our virtuals
  // back in its enumeration depending on platform).
  const inputNames = new Set(hardwareInputs);
  for (const name of state.virtualInputs.keys()) inputNames.add(name);
  const outputNames = new Set(hardwareOutputs);
  for (const name of state.virtualOutputs.keys()) outputNames.add(name);
  return {
    inputs: Array.from(inputNames),
    outputs: Array.from(outputNames),
  };
}

function listVirtualPorts() {
  return {
    inputs: Array.from(state.virtualInputs.keys()),
    outputs: Array.from(state.virtualOutputs.keys()),
  };
}

// Reconstruct the original MIDI wire bytes from easymidi's parsed event.
// easymidi emits channel as 0-indexed (0..15) and pitch value as signed and
// centered at 0 (range -8192..+8191), so we add 8192 back to get the unsigned
// 14-bit wire value. Returns null for events without a canonical short form.
function toRawBytes(eventType, msg) {
  const ch = typeof msg.channel === 'number' ? (msg.channel & 0x0F) : 0;
  switch (eventType) {
    case 'noteon':
      return [0x90 | ch, msg.note & 0x7F, msg.velocity & 0x7F];
    case 'noteoff':
      return [0x80 | ch, msg.note & 0x7F, msg.velocity & 0x7F];
    case 'cc':
      return [0xB0 | ch, msg.controller & 0x7F, msg.value & 0x7F];
    case 'program':
      return [0xC0 | ch, msg.number & 0x7F];
    case 'pitch': {
      const v = ((msg.value | 0) + 8192) & 0x3FFF;
      return [0xE0 | ch, v & 0x7F, (v >> 7) & 0x7F];
    }
    case 'poly aftertouch':
      return [0xA0 | ch, msg.note & 0x7F, msg.pressure & 0x7F];
    case 'channel aftertouch':
      return [0xD0 | ch, msg.pressure & 0x7F];
    case 'position': {
      const p = (msg.value | 0) & 0x3FFF;
      return [0xF2, p & 0x7F, (p >> 7) & 0x7F];
    }
    case 'mtc':
      return [0xF1, (msg.value | 0) & 0x7F];
    case 'select':
      return [0xF3, (msg.song | 0) & 0x7F];
    case 'clock':
      return [0xF8];
    case 'start':
      return [0xFA];
    case 'continue':
      return [0xFB];
    case 'stop':
      return [0xFC];
    case 'reset':
      return [0xFF];
    default:
      return null;
  }
}

function createVirtualInput(name) {
  if (state.virtualInputs.has(name)) return true;
  try {
    const input = new easymidi.Input(name, true); // virtual=true
    for (const ev of SUBSCRIBED_EVENTS) {
      input.on(ev, (msg) => handleMessage(name, ev, msg));
    }
    state.virtualInputs.set(name, input);
    // Also register in the main inputs map so routes + openInput idempotency
    // treat it like any other input.
    state.inputs.set(name, input);
    return true;
  } catch (err) {
    return false;
  }
}

function createVirtualOutput(name) {
  if (state.virtualOutputs.has(name)) return true;
  try {
    const output = new easymidi.Output(name, true); // virtual=true
    state.virtualOutputs.set(name, output);
    state.outputs.set(name, output);
    return true;
  } catch (err) {
    return false;
  }
}

function destroyVirtualInput(name) {
  const input = state.virtualInputs.get(name);
  if (!input) return false;
  try { input.close(); } catch { /* noop */ }
  state.virtualInputs.delete(name);
  if (state.inputs.get(name) === input) state.inputs.delete(name);
  return true;
}

function destroyVirtualOutput(name) {
  const output = state.virtualOutputs.get(name);
  if (!output) return false;
  try { output.close(); } catch { /* noop */ }
  state.virtualOutputs.delete(name);
  if (state.outputs.get(name) === output) state.outputs.delete(name);
  return true;
}

function openInput(name) {
  if (state.inputs.has(name)) return true;
  try {
    const input = new easymidi.Input(name);
    for (const ev of SUBSCRIBED_EVENTS) {
      input.on(ev, (msg) => handleMessage(name, ev, msg));
    }
    state.inputs.set(name, input);
    return true;
  } catch (err) {
    return false;
  }
}

function closeInput(name) {
  const input = state.inputs.get(name);
  if (!input) return false;
  try { input.close(); } catch { /* noop */ }
  state.inputs.delete(name);
  return true;
}

function openOutput(name) {
  if (state.outputs.has(name)) return true;
  try {
    const output = new easymidi.Output(name);
    state.outputs.set(name, output);
    return true;
  } catch (err) {
    return false;
  }
}

function closeOutput(name) {
  const output = state.outputs.get(name);
  if (!output) return false;
  try { output.close(); } catch { /* noop */ }
  state.outputs.delete(name);
  return true;
}

function setRoutes(routes) {
  state.routes = Array.isArray(routes) ? routes : [];
}

function setMessageListener(fn) {
  state.onMessage = fn;
}

// Send raw MIDI bytes to an output. Uses node-midi's underlying sendMessage,
// accessed via easymidi's Output._output handle. Lazily opens the output if
// it hasn't been opened yet so the renderer can send without coordinating.
function sendRaw(outputName, bytes) {
  if (!Array.isArray(bytes) || bytes.length === 0) return false;
  let output = state.outputs.get(outputName);
  if (!output) {
    try {
      output = new easymidi.Output(outputName);
      state.outputs.set(outputName, output);
    } catch {
      return false;
    }
  }
  const underlying = output._output;
  if (!underlying || typeof underlying.sendMessage !== 'function') return false;
  try {
    underlying.sendMessage(bytes);
    return true;
  } catch {
    return false;
  }
}

function handleMessage(inputName, eventType, msg) {
  const rawBytes = toRawBytes(eventType, msg);
  if (state.onMessage) {
    state.onMessage({ inputName, eventType, msg, rawBytes, timestamp: Date.now() });
  }
  for (const route of state.routes) {
    if (!route.enabled) continue;
    if (route.inputName !== inputName) continue;
    const output = state.outputs.get(route.outputName);
    if (!output) continue;
    try {
      output.send(eventType, msg);
    } catch (err) {
      // swallow per-message errors so one bad route doesn't kill the engine
    }
  }
}

function shutdown() {
  for (const input of state.inputs.values()) {
    try { input.close(); } catch { /* noop */ }
  }
  for (const output of state.outputs.values()) {
    try { output.close(); } catch { /* noop */ }
  }
  state.inputs.clear();
  state.outputs.clear();
  state.virtualInputs.clear();
  state.virtualOutputs.clear();
  state.routes = [];
  state.onMessage = null;
}

module.exports = {
  listDevices,
  listVirtualPorts,
  openInput,
  closeInput,
  openOutput,
  closeOutput,
  setRoutes,
  sendRaw,
  createVirtualInput,
  createVirtualOutput,
  destroyVirtualInput,
  destroyVirtualOutput,
  setMessageListener,
  shutdown,
};
