/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState } from 'react';
import MidiRouter from './components/MidiRouter';
import LiveIOPanel from './components/LiveIOPanel';

export default function App() {
  const [showLive, setShowLive] = useState(true);

  return (
    <div className="relative w-screen h-screen">
      <MidiRouter />
      <button
        onClick={() => setShowLive((v) => !v)}
        className="absolute top-4 right-4 z-50 px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 rounded text-zinc-200 text-xs font-bold uppercase tracking-wide"
      >
        {showLive ? 'Hide Live I/O' : 'Show Live I/O'}
      </button>
      {showLive && (
        <div className="absolute top-16 right-4 z-40 w-[480px] max-h-[80vh] overflow-y-auto shadow-2xl">
          <LiveIOPanel />
        </div>
      )}
    </div>
  );
}
