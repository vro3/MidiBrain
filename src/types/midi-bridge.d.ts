export interface MidiDevices {
  inputs: string[];
  outputs: string[];
}

export interface MidiDevice {
  id: string;
  name: string;
}

export interface MidiRoute {
  inputName: string;
  outputName: string;
  enabled: boolean;
}

export interface MidiMessagePayload {
  inputName: string;
  eventType: string;
  msg: Record<string, number>;
  rawBytes: number[] | null;
  timestamp: number;
}

export interface MidiBridge {
  listDevices(): Promise<MidiDevices>;
  openInput(name: string): Promise<boolean>;
  closeInput(name: string): Promise<boolean>;
  openOutput(name: string): Promise<boolean>;
  closeOutput(name: string): Promise<boolean>;
  setRoutes(routes: MidiRoute[]): Promise<void>;
  sendRaw(outputName: string, bytes: number[]): Promise<boolean>;
  listVirtualPorts(): Promise<MidiDevices>;
  createVirtualInput(name: string): Promise<boolean>;
  createVirtualOutput(name: string): Promise<boolean>;
  destroyVirtualInput(name: string): Promise<boolean>;
  destroyVirtualOutput(name: string): Promise<boolean>;
  onMessage(callback: (payload: MidiMessagePayload) => void): () => void;
}

declare global {
  interface Window {
    midi?: MidiBridge;
  }
}

export {};
