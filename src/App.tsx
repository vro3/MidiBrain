/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState } from 'react';
import { ChevronRight, ChevronLeft } from 'lucide-react';
import MidiRouter from './components/MidiRouter';
import LiveIOPanel from './components/LiveIOPanel';

export default function App() {
  const [sidebarOpen, setSidebarOpen] = useState(true);

  return (
    <div className="flex w-screen h-screen overflow-hidden">
      <div className="flex-1 min-w-0 relative">
        <MidiRouter />
      </div>

      <div
        className={`relative flex-shrink-0 h-full bg-zinc-950 border-l border-zinc-800 transition-all duration-200 ${
          sidebarOpen ? 'w-[420px]' : 'w-0'
        }`}
      >
        <button
          onClick={() => setSidebarOpen((v) => !v)}
          className="absolute top-4 -left-8 z-50 w-8 h-16 bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 border-r-0 rounded-l flex items-center justify-center text-zinc-300"
          title={sidebarOpen ? 'Hide Live I/O' : 'Show Live I/O'}
        >
          {sidebarOpen ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
        </button>

        {sidebarOpen && (
          <div className="h-full overflow-y-auto p-3">
            <LiveIOPanel />
          </div>
        )}
      </div>
    </div>
  );
}
