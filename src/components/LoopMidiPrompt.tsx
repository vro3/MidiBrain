/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// First-launch prompt for Windows users explaining loopMIDI. Windows has no
// native virtual MIDI ports — without a third-party driver, MidiBrain can
// route between physical devices but can't expose itself as a virtual port
// to other apps (DAWs, Resolume, etc).
//
// Shown once per machine; the user's acknowledgment is persisted in
// localStorage under midibrain.loopMidiAcknowledged.

import { useEffect, useState } from 'react';
import { ExternalLink, X } from 'lucide-react';

const ACK_KEY = 'midibrain.loopMidiAcknowledged';
const LOOPMIDI_URL = 'https://www.tobias-erichsen.de/software/loopmidi.html';

interface Props {
  /** True if the host platform requires loopMIDI (Windows). */
  isWindows: boolean;
  /** True if a virtual port could not be created on this run. */
  virtualPortsBroken: boolean;
}

export default function LoopMidiPrompt({ isWindows, virtualPortsBroken }: Props) {
  const [acknowledged, setAcknowledged] = useState<boolean>(() => {
    if (typeof window === 'undefined') return true;
    return window.localStorage.getItem(ACK_KEY) === 'true';
  });
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (!isWindows) return;
    if (acknowledged) return;
    if (!virtualPortsBroken) return;
    setShow(true);
  }, [isWindows, virtualPortsBroken, acknowledged]);

  const dismiss = () => {
    window.localStorage.setItem(ACK_KEY, 'true');
    setAcknowledged(true);
    setShow(false);
  };

  if (!show) return null;

  return (
    <div className="fixed inset-0 z-[60] bg-black/70 backdrop-blur-sm flex items-center justify-center p-6">
      <div className="bg-zinc-900 border border-zinc-700 rounded-lg shadow-xl max-w-md w-full p-6">
        <div className="flex items-start justify-between mb-3">
          <h2 className="text-lg font-semibold text-zinc-100">Virtual MIDI on Windows</h2>
          <button onClick={dismiss} className="text-zinc-500 hover:text-zinc-300" title="Dismiss">
            <X size={16} />
          </button>
        </div>

        <p className="text-sm text-zinc-300 mb-3">
          Windows has no built-in virtual MIDI ports. To create virtual ports
          inside MidiBrain — for routing into Resolume, Ableton, or other apps —
          install <span className="font-medium text-cyan-400">loopMIDI</span> by
          Tobias Erichsen. It's a free third-party driver.
        </p>

        <p className="text-xs text-zinc-500 mb-5">
          Routing between physical MIDI devices already works without loopMIDI.
        </p>

        <div className="flex gap-2 justify-end">
          <button
            onClick={dismiss}
            className="px-4 py-2 text-sm rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700"
          >
            Continue without
          </button>
          <button
            onClick={() => {
              window.midi?.openExternal(LOOPMIDI_URL);
              dismiss();
            }}
            className="flex items-center gap-1.5 px-4 py-2 text-sm rounded bg-cyan-600 hover:bg-cyan-500 text-white border border-cyan-500"
          >
            <ExternalLink size={14} /> Open Download Page
          </button>
        </div>
      </div>
    </div>
  );
}
