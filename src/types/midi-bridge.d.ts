export interface MidiDevices {
  inputs: string[];
  outputs: string[];
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
  timestamp: number;
}

export interface MidiBridge {
  listDevices(): Promise<MidiDevices>;
  openInput(name: string): Promise<boolean>;
  closeInput(name: string): Promise<boolean>;
  openOutput(name: string): Promise<boolean>;
  closeOutput(name: string): Promise<boolean>;
  setRoutes(routes: MidiRoute[]): Promise<void>;
  onMessage(callback: (payload: MidiMessagePayload) => void): () => void;
}

declare global {
  interface Window {
    midi?: MidiBridge;
  }
}

export {};
