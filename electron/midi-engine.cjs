const easymidi = require('easymidi');

const state = {
  inputs: new Map(),
  outputs: new Map(),
  routes: [],
  onMessage: null,
};

const EVENTS = [
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

function listDevices() {
  return {
    inputs: easymidi.getInputs(),
    outputs: easymidi.getOutputs(),
  };
}

function openInput(name) {
  if (state.inputs.has(name)) return true;
  const input = new easymidi.Input(name);
  for (const ev of EVENTS) {
    input.on(ev, (msg) => handleMessage(name, ev, msg));
  }
  state.inputs.set(name, input);
  return true;
}

function closeInput(name) {
  const input = state.inputs.get(name);
  if (!input) return false;
  input.close();
  state.inputs.delete(name);
  return true;
}

function openOutput(name) {
  if (state.outputs.has(name)) return true;
  const output = new easymidi.Output(name);
  state.outputs.set(name, output);
  return true;
}

function closeOutput(name) {
  const output = state.outputs.get(name);
  if (!output) return false;
  output.close();
  state.outputs.delete(name);
  return true;
}

function setRoutes(routes) {
  state.routes = Array.isArray(routes) ? routes : [];
}

function setMessageListener(fn) {
  state.onMessage = fn;
}

// Reconstruct raw MIDI bytes from an easymidi parsed event.
// Returns null for events that don't have a standard 2/3-byte channel-voice form
// (system exclusive and similar are left as null).
function rawBytesFor(eventType, msg) {
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
      const v = (msg.value | 0) + 8192;
      return [0xE0 | ch, v & 0x7F, (v >> 7) & 0x7F];
    }
    case 'poly aftertouch':
      return [0xA0 | ch, msg.note & 0x7F, msg.pressure & 0x7F];
    case 'channel aftertouch':
      return [0xD0 | ch, msg.pressure & 0x7F];
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

function handleMessage(inputName, eventType, msg) {
  const rawBytes = rawBytesFor(eventType, msg);
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

// Send raw MIDI bytes to an output. Uses node-midi's underlying sendMessage,
// accessed via easymidi's Output._output handle. Opens the output if needed.
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

function shutdown() {
  for (const input of state.inputs.values()) input.close();
  for (const output of state.outputs.values()) output.close();
  state.inputs.clear();
  state.outputs.clear();
  state.routes = [];
  state.onMessage = null;
}

module.exports = {
  listDevices,
  openInput,
  closeInput,
  openOutput,
  closeOutput,
  setRoutes,
  sendRaw,
  setMessageListener,
  shutdown,
};
