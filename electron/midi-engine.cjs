const easymidi = require('easymidi');

const state = {
  inputs: new Map(),
  outputs: new Map(),
  routes: [],
  onMessage: null,
};

function listDevices() {
  return {
    inputs: easymidi.getInputs(),
    outputs: easymidi.getOutputs(),
  };
}

function openInput(name) {
  if (state.inputs.has(name)) return true;
  const input = new easymidi.Input(name);
  const events = ['noteon', 'noteoff', 'cc', 'program', 'pitch', 'poly aftertouch', 'channel aftertouch', 'position', 'mtc', 'select', 'clock', 'start', 'continue', 'stop', 'reset'];
  for (const ev of events) {
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

function handleMessage(inputName, eventType, msg) {
  if (state.onMessage) {
    state.onMessage({ inputName, eventType, msg, timestamp: Date.now() });
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
  setMessageListener,
  shutdown,
};
