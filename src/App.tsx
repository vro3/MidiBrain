/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { ChevronRight, ChevronLeft } from 'lucide-react';
import MidiRouter from './components/MidiRouter';
import LiveIOPanel from './components/LiveIOPanel';

const MIN_WIDTH = 280;
const MAX_WIDTH = 900;
const DEFAULT_WIDTH = 420;
const STORAGE_KEY = 'midibrain.sidebarWidth';

export default function App() {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [sidebarWidth, setSidebarWidth] = useState<number>(() => {
    const stored = typeof window !== 'undefined' ? window.localStorage.getItem(STORAGE_KEY) : null;
    const n = stored ? Number(stored) : NaN;
    return Number.isFinite(n) && n >= MIN_WIDTH && n <= MAX_WIDTH ? n : DEFAULT_WIDTH;
  });
  const draggingRef = useRef(false);

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, String(sidebarWidth));
  }, [sidebarWidth]);

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    draggingRef.current = true;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }, []);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!draggingRef.current) return;
      setSidebarWidth(Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, e.clientX)));
    };
    const onUp = () => {
      if (!draggingRef.current) return;
      draggingRef.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, []);

  return (
    <div className="flex w-screen h-screen overflow-hidden">
      <div
        className="relative flex-shrink-0 h-full bg-zinc-950 border-r border-zinc-800"
        style={{ width: sidebarOpen ? sidebarWidth : 0 }}
      >
        {sidebarOpen && (
          <div
            onMouseDown={onMouseDown}
            className="absolute top-0 -right-1 w-2 h-full cursor-col-resize z-40 group"
            title="Drag to resize"
          >
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-px h-full bg-zinc-800 group-hover:bg-cyan-500 transition-colors" />
          </div>
        )}

        <button
          onClick={() => setSidebarOpen((v) => !v)}
          className="absolute top-4 -right-8 z-50 w-8 h-16 bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 border-l-0 rounded-r flex items-center justify-center text-zinc-300"
          title={sidebarOpen ? 'Hide Live Routing' : 'Show Live Routing'}
        >
          {sidebarOpen ? <ChevronLeft size={16} /> : <ChevronRight size={16} />}
        </button>

        {sidebarOpen && (
          <div className="h-full overflow-y-auto p-3">
            <LiveIOPanel />
          </div>
        )}
      </div>

      <div className="flex-1 min-w-0 relative">
        <MidiRouter />
      </div>
    </div>
  );
}
