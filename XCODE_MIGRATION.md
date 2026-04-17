# MidiBrain — Xcode / Native Swift Migration Runbook
Last updated: 2026-04-16

This is a future-reference doc. If and when you decide to rewrite MidiBrain as a native macOS app, start here. Do not read this unless you're actively considering the switch — it'll just distract you from shipping the Electron version.

---

## 1. When this migration is worth doing

You're not doing this for fun. You're doing it when at least two of these are true:

- **Users are complaining about bundle size or RAM.** Electron idles at 200-400MB RAM and ships as a ~200MB DMG. Native Swift lands at ~50MB RAM and <10MB binary. Touring musicians on 8GB MacBook Airs will notice.
- **Someone wants sysex support.** easymidi (the library the Electron version uses) doesn't forward sysex messages. CoreMIDI does. If users are asking to archive patch dumps or talk to old synths, you've hit a wall that can only be solved natively.
- **Latency is getting reported as a real problem.** The Electron app adds sub-millisecond IPC latency per message. Most users won't notice. If a clock-critical user (drummer, producer syncing to tape) says "MidiBrain drifts," native CoreMIDI is the fix.
- **You want to charge more than ~$40.** Electron apps look cheap to pro audio buyers. Native signals legitimacy. Bome MIDI Translator Pro ($69) and MIDI Monitor (free but native) are the competitive bar.
- **You're ready to go Mac-only.** Swift/CoreMIDI is macOS only. Electron gave you Windows/Linux for free. Once you commit to native, those doors close unless you maintain two codebases.

If none of those apply, stay on Electron. Native is not an upgrade in the abstract — it's a response to specific pressure.

---

## 2. Prerequisites

**Apple Developer Program membership** — $99/year. Required for code signing and notarization. Also required for App Store distribution if you go that route. Sign up at developer.apple.com.

**Xcode** — latest stable from the Mac App Store. Not Xcode Command Line Tools alone; the full IDE.

**An existing MidiBrain user base** — do not start this rewrite on a blank slate. Ship the Electron version first, gather 20-50 users, watch what they actually use. The native rewrite should target real features, not hypothetical ones.

---

## 3. Scaffold the project

```bash
# In a sibling folder to the Electron version
cd /Users/m4mini/GitHub
mkdir MidiBrainNative && cd MidiBrainNative

# Open Xcode → File → New → Project → macOS → App
# Interface: SwiftUI
# Language: Swift
# Product Name: MidiBrain
# Bundle Identifier: com.midibrain.app  (match the Electron version so users
#                                         can't install both side-by-side by mistake)
# Minimum deployment: macOS 13 (Ventura) — needed for MIDI 2.0 APIs
```

Add the following capabilities in the project's "Signing & Capabilities" tab:
- **Audio Input** (required for Core MIDI in sandboxed apps)
- **Hardened Runtime** (required for notarization)

---

## 4. The CoreMIDI layer

This replaces `electron/midi-engine.cjs`. CoreMIDI is a C API — Swift wraps it but you'll still see C-style callbacks.

Create `MidiEngine.swift`:

```swift
import CoreMIDI
import Combine

struct MidiMessage {
    let inputName: String
    let rawBytes: [UInt8]
    let timestamp: MIDITimeStamp
}

final class MidiEngine: ObservableObject {
    @Published private(set) var inputs: [String] = []
    @Published private(set) var outputs: [String] = []

    let messages = PassthroughSubject<MidiMessage, Never>()

    private var client: MIDIClientRef = 0
    private var inputPort: MIDIPortRef = 0
    private var outputPort: MIDIPortRef = 0
    private var sourceByName: [String: MIDIEndpointRef] = [:]
    private var destByName: [String: MIDIEndpointRef] = [:]

    init() throws {
        let clientStatus = MIDIClientCreateWithBlock(
            "MidiBrain" as CFString,
            &client
        ) { [weak self] notifPtr in
            // Device connect/disconnect — re-enumerate.
            DispatchQueue.main.async { self?.refreshDevices() }
        }
        try check(clientStatus, "MIDIClientCreate")

        let inStatus = MIDIInputPortCreateWithProtocol(
            client,
            "MidiBrain In" as CFString,
            ._1_0,
            &inputPort
        ) { [weak self] eventListPtr, srcConnRefCon in
            guard let self else { return }
            let inputName = Unmanaged<NSString>
                .fromOpaque(srcConnRefCon!).takeUnretainedValue() as String
            self.dispatchEvents(eventListPtr, inputName: inputName)
        }
        try check(inStatus, "InputPortCreate")

        let outStatus = MIDIOutputPortCreate(
            client, "MidiBrain Out" as CFString, &outputPort
        )
        try check(outStatus, "OutputPortCreate")

        refreshDevices()
    }

    func refreshDevices() {
        var newInputs: [String] = []
        sourceByName.removeAll()
        for i in 0..<MIDIGetNumberOfSources() {
            let ep = MIDIGetSource(i)
            if let name = endpointName(ep) {
                newInputs.append(name)
                sourceByName[name] = ep
                // Connect source with the name as refCon for the read block
                let refCon = Unmanaged.passRetained(name as NSString).toOpaque()
                MIDIPortConnectSource(inputPort, ep, refCon)
            }
        }
        inputs = newInputs

        var newOutputs: [String] = []
        destByName.removeAll()
        for i in 0..<MIDIGetNumberOfDestinations() {
            let ep = MIDIGetDestination(i)
            if let name = endpointName(ep) {
                newOutputs.append(name)
                destByName[name] = ep
            }
        }
        outputs = newOutputs
    }

    func sendRaw(to outputName: String, bytes: [UInt8]) {
        guard let dest = destByName[outputName] else { return }
        var packet = MIDIPacket()
        packet.timeStamp = 0
        packet.length = UInt16(bytes.count)
        withUnsafeMutableBytes(of: &packet.data) { buf in
            for (i, b) in bytes.enumerated() where i < 256 {
                buf[i] = b
            }
        }
        var list = MIDIPacketList(numPackets: 1, packet: packet)
        MIDISend(outputPort, dest, &list)
    }

    private func dispatchEvents(
        _ eventListPtr: UnsafePointer<MIDIEventList>,
        inputName: String
    ) {
        // MIDI 2.0 universal messages — parse, downgrade to 1.0 bytes, publish.
        // For full implementation see Apple's "Handling MIDI Events" docs or
        // the AudioKit MIDI source (github.com/AudioKit/AudioKit).
        // Subject publishes on its current thread — hop to main for UI state.
    }

    private func endpointName(_ ep: MIDIEndpointRef) -> String? {
        var cfName: Unmanaged<CFString>?
        let status = MIDIObjectGetStringProperty(ep, kMIDIPropertyDisplayName, &cfName)
        guard status == noErr, let cfName else { return nil }
        return cfName.takeRetainedValue() as String
    }

    private func check(_ status: OSStatus, _ label: String) throws {
        if status != noErr { throw MidiError.osStatus(status, label) }
    }
}

enum MidiError: Error {
    case osStatus(OSStatus, String)
}
```

**References worth reading before you write the real version:**
- Apple's CoreMIDI reference documentation (search "Core MIDI" in Xcode docs)
- AudioKit's MIDI layer (github.com/AudioKit/AudioKit) — battle-tested Swift wrappers, MIT licensed, study their parsing code
- SwiftMIDI (github.com/moddotcom/SwiftMIDI) — lighter wrapper if AudioKit feels too big

---

## 5. Feature parity checklist

Map of the current Electron app to what needs to exist in the Swift version. Work through these in roughly this order.

**Ship-critical (native v1 must have):**
- [ ] Device enumeration — matches `window.midi.listDevices()`
- [ ] Input/output open/close — matches `openInput`/`openOutput`
- [ ] Live routing pass-through — the LiveIOPanel functionality; inputs route to outputs as configured
- [ ] Port aliases — rename cryptic port names, persisted across launches (use `UserDefaults` or a JSON file in Application Support)
- [ ] Crosspoint Matrix view — the 2D grid of source × destination checkboxes
- [ ] Preset save/load — export and import routing configurations as JSON files
- [ ] MIDI message monitor — the log view showing recent events
- [ ] Activity LEDs — per-port blinkers showing traffic
- [ ] Menu bar with File/Edit/View/Window/Help following Apple HIG

**Ship-important (native v1 should have):**
- [ ] Router tab — the 128×16 note/CC/PC action grid with per-cell text
- [ ] Remap (Transformer) tab — source key → target mapping with learn mode
- [ ] CSV import/export
- [ ] Start/Stop routing master switch

**Defer to v1.1 or later:**
- [ ] **Topography view** — the ReactFlow node-graph with draggable connections. No direct SwiftUI equivalent. Either build on `Canvas` + gesture recognizers (~1 week of focused work) or drop it. The Crosspoint grid does the same job. Seriously consider dropping it permanently.
- [ ] Excel export (xlsx) — no first-class Swift library; either call a command-line tool, use a paid SDK, or export CSV and let users open in Excel
- [ ] PDF export — doable natively via `PDFKit` but not critical for v1

**New-for-native (things Electron couldn't do):**
- [ ] **Sysex support** — huge differentiator; if users asked for it, build it
- [ ] Menu bar extra (the small icon in the macOS top menu bar for quick status)
- [ ] Global hotkeys for preset switching
- [ ] Native notifications when devices connect/disconnect
- [ ] MIDI 2.0 property exchange (if any of your users have MIDI 2.0 gear)

---

## 6. State and persistence

The Electron version uses `localStorage` for everything: aliases, routing, matrix, remappings, presets, sidebar width, row heights, channel names, column widths.

In Swift, split these by volatility:

**`UserDefaults`** (small, auto-synced): sidebar width, column widths, row heights, last-used preset.

**JSON file in `~/Library/Application Support/MidiBrain/`** (larger, user-visible, backup-friendly): aliases, current routing, matrix contents, remappings, presets. This gives users a file they can back up, version-control, or share — useful differentiator over Electron.

**SwiftData or Core Data** (overkill for this app): don't bother. JSON is fine.

---

## 7. Code signing and notarization

Without these, macOS Gatekeeper will refuse to open the app for anyone except you.

```bash
# Check that your Developer ID certificate is installed:
security find-identity -v -p codesigning
# Look for "Developer ID Application: Your Name (TEAMID)"

# In Xcode project settings:
# Signing & Capabilities → Team → (your Apple Developer team)
# Signing & Capabilities → Signing Certificate → Developer ID Application
```

**Notarization flow** (required for distribution outside the App Store):

```bash
# Archive from Xcode: Product → Archive
# In the Organizer window, click "Distribute App"
# Choose "Developer ID" → "Upload" → Apple's notary service
# Wait 5-30 minutes for notarization to complete
# Back in Organizer, click "Export Notarized App"
```

Script the notarization for CI if you release often — search "notarytool" in Apple's docs.

**Outcome:** a `.dmg` that any Mac can open without Gatekeeper warnings.

---

## 8. Distribution

Three options, pick one or more:

**Direct DMG download** (simplest): host the notarized `.dmg` on your own site. Use a payment processor like Paddle, Gumroad, or Stripe. Issue license keys via email. The user downloads, drags to Applications, enters their key on first launch.

**Mac App Store** (easier purchase flow, Apple takes 30% first year, 15% thereafter): requires sandboxing your app, which adds constraints on MIDI access (doable, but more entitlements to manage). Good if you want passive sales and don't want to run your own license server.

**Both** (best for commercial success, more work): a free-tier or demo version in the App Store to catch discoverability, a Pro version via direct DMG to capture higher margins.

For a MIDI utility, I'd lean direct DMG via Paddle. The audience searches for it specifically; App Store discoverability matters less than sales-page conversion.

---

## 9. Realistic timeline

For someone working with Claude Code, assuming you're comfortable with the current Electron codebase and treating the rewrite as the main priority:

- **Week 1:** Xcode project scaffold, CoreMIDI engine, device enumeration, basic input→output pass-through proven working with real hardware.
- **Week 2:** Port aliasing, Live Routing sidebar (the simple pass-through UI), preset save/load.
- **Week 3:** Crosspoint Matrix view, Remap (Transformer) tab.
- **Week 4:** Router tab (the 128×16 grid — this is visually dense; budget time).
- **Week 5:** MIDI Monitor, activity LEDs, CSV import/export, menu bar.
- **Week 6:** Sysex support if you want the differentiator. Polish pass — keyboard shortcuts, preferences window, about window, HIG compliance.
- **Week 7:** Code signing, notarization, DMG packaging, landing page.
- **Week 8:** Beta with 10-20 users from the Electron version, fix bugs they report.
- **Weeks 9-10:** Licensing system, payment integration, public launch.

That's ~10 weeks of focused work. Double it if this isn't your primary project.

Skip Topography for v1 — that alone saves a week. Add it in v1.1 if anyone asks for it.

---

## 10. What to do the day you start

1. Open a new terminal. Do not touch the Electron repo.
2. Create the Xcode project per section 3.
3. Implement `MidiEngine` from section 4. Get it to the point where you can enumerate devices, connect to a source, and print incoming bytes to the console. This is the foundation — do not build any UI until this works reliably with at least two real MIDI devices.
4. Once MIDI I/O is rock solid, build the Live Routing sidebar first. It's the simplest view and exercises end-to-end pass-through.
5. Every time you finish a feature, build a signed DMG and run it from `/Applications` to make sure nothing breaks when you're not in the debugger.
6. Keep the Electron version available as reference. When you need to remember what a feature does, read the TypeScript, don't guess.

---

## 11. Things that will bite you

- **MIDI 2.0 vs 1.0.** CoreMIDI's new APIs are 2.0-first. Most hardware is still 1.0. You'll spend time writing a translation layer. AudioKit has done this — study theirs before writing your own.
- **Thread safety.** CoreMIDI callbacks fire on a high-priority MIDI thread, not the main thread. Touching SwiftUI state from that thread will crash the app. Every message must hop to the main thread via `DispatchQueue.main.async` before updating published state.
- **App sandboxing.** If you submit to the App Store, your MIDI entitlements need to be correct or CoreMIDI will silently return empty device lists. Test on a clean machine, not just your dev box.
- **The Topography view.** Seriously. If you try to rebuild ReactFlow in SwiftUI, you will lose a week. Drop it for v1.
- **ObjC refCon memory management.** The `Unmanaged.passRetained` pattern in `MidiPortConnectSource` leaks strings if you reconnect without releasing. Either keep the retained pointers in a set and release on disconnect, or use `passUnretained` and make sure the string outlives the connection. The scaffold above uses `passRetained` — fix this before shipping.

---

## 12. Don't forget

The whole reason to do this is commercial viability — smaller bundle, better RAM, pro-audio legitimacy, sysex, native feel. If at any point during the rewrite you catch yourself thinking "the Electron version does this better and the users don't care about native," stop and ask honestly whether you should ship Electron v2 instead.

Sunk cost is not a good reason to finish a rewrite.
