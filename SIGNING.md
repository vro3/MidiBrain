# Code Signing & Notarization Runbook
Last updated: 2026-04-16

Follow this the first time you build a signed, notarized `.dmg` for distribution.
Without these steps, macOS Gatekeeper will refuse to open MidiBrain on any Mac
except the one that built it.

---

## One-time setup

### 1. Apple Developer Program
- Enroll at [developer.apple.com](https://developer.apple.com) — $99/year.
- Wait for approval email (usually same-day, occasionally 24-48 hours).

### 2. Generate your Developer ID certificate
- Open **Xcode → Settings → Accounts**.
- Sign in with your Apple ID (must be the one enrolled in the Developer Program).
- Select your team, click **Manage Certificates…**
- Click **+** → **Developer ID Application**.
- Xcode generates and installs the certificate into your login keychain.

Verify it's installed:

```bash
security find-identity -v -p codesigning
```

You should see a line like:
```
1) ABCD1234EF5678... "Developer ID Application: Vince Romanelli (TEAMID123)"
```

The `TEAMID123` part at the end is your **Team ID** — keep it, you'll need it below.

### 3. Create an app-specific password for notarization
- Go to [appleid.apple.com](https://appleid.apple.com) → sign in.
- **Sign-In and Security** → **App-Specific Passwords** → **Generate Password**.
- Label it `MidiBrain Notarization` (or anything).
- Copy the generated password (format: 4 groups of 4 lowercase chars separated by dashes) — Apple shows it once.

**Never use your real Apple ID password for notarization.**

### 4. Install the notarize helper
```bash
cd /Users/m4mini/GitHub/MidiBrain
npm i -D @electron/notarize
```

---

## Every-build workflow

### 1. Set environment variables
Either add to your shell profile (`~/.zshrc`) for permanent use:

```bash
export APPLE_ID='vince@vinceromanelli.com'
export APPLE_APP_SPECIFIC_PASSWORD='REPLACE_WITH_APP_SPECIFIC_PASSWORD'
export APPLE_TEAM_ID='TEAMID123'
```

…or set them inline for a single build:

```bash
APPLE_ID='vince@example.com' \
APPLE_APP_SPECIFIC_PASSWORD='REPLACE_WITH_APP_SPECIFIC_PASSWORD' \
APPLE_TEAM_ID='TEAMID123' \
npm run build:electron
```

### 2. Build the signed, notarized DMG
```bash
npm run build:electron
```

What happens behind the scenes:
1. Vite builds the React app into `dist/`.
2. electron-builder bundles Electron + your app into `release/mac/MidiBrain.app`.
3. electron-builder auto-detects your Developer ID certificate and signs every binary.
4. The `afterSign` hook (`scripts/notarize.cjs`) runs, uploading the signed `.app` to Apple's notary service.
5. Apple scans for malware (takes 2-15 minutes typically).
6. Once approved, the notarization ticket is stapled to the `.app` and wrapped into `release/MidiBrain-<version>.dmg`.

### 3. Verify the build

```bash
# Confirm the signature is valid
codesign --verify --deep --strict --verbose=2 release/mac-universal/MidiBrain.app

# Confirm notarization is stapled
stapler validate release/mac-universal/MidiBrain.app

# Confirm Gatekeeper accepts it
spctl -a -t exec -vv release/mac-universal/MidiBrain.app
```

All three should say "accepted" / "valid" / "no errors". If any complain, the DMG
will trigger a Gatekeeper warning on other Macs.

### 4. Test on a clean Mac
Before announcing a release:
- Copy the `.dmg` to a Mac that's never run MidiBrain.
- Open it, drag MidiBrain to `/Applications`, launch it.
- Confirm no "unidentified developer" warning appears.
- Confirm MIDI devices enumerate correctly (sandbox entitlements are in place).

---

## Troubleshooting

**"No identity found" during build.**
Your certificate isn't in the keychain. Re-run the Xcode step above. If Xcode
says the certificate exists but build still fails, open Keychain Access, find
"Developer ID Application: Your Name", right-click → Get Info, and confirm
it's not expired or marked untrusted.

**Notarization fails with "The signature of the binary is invalid".**
Usually means a nested helper binary isn't signed. Check that
`mac.hardenedRuntime: true` is set in `package.json` — this is already
configured.

**Notarization fails with "resource-requirements" or "invalid entitlements".**
Check `entitlements.mac.plist`. It should include:
- `com.apple.security.cs.allow-unsigned-executable-memory` (Electron needs this)
- `com.apple.security.cs.allow-jit` (Electron needs this)
- `com.apple.security.cs.disable-library-validation` (native modules need this)
- `com.apple.security.device.audio-input` (CoreMIDI needs this)

All four are in the current entitlements file.

**Notarization times out.**
Apple's notary service can get slow on weekdays. Wait 20 minutes and check
status with:

```bash
xcrun notarytool history \
  --apple-id "$APPLE_ID" \
  --password "$APPLE_APP_SPECIFIC_PASSWORD" \
  --team-id "$APPLE_TEAM_ID"
```

**First-time build asks to access keychain repeatedly.**
Unlock your login keychain and click "Always Allow" when prompted for
`codesign`. After the first run, it won't ask again.

---

## What if you don't have a Developer account yet?

Run `npm run build:electron` anyway — the notarize hook skips itself when env
vars aren't set. The resulting DMG will work on YOUR Mac, but any other Mac
will show "MidiBrain cannot be opened because Apple cannot check it for
malicious software."

For beta testing with a handful of known users, that's acceptable if you
tell them to right-click → Open the first time. For public distribution,
signing + notarization is non-negotiable.

---

## Distribution checklist

Before uploading the `.dmg` anywhere public:

- [ ] `codesign --verify` passes
- [ ] `stapler validate` passes
- [ ] `spctl -a -t exec -vv` passes
- [ ] Installed and launched on a Mac that's never run MidiBrain before
- [ ] MIDI devices enumerate on that clean Mac
- [ ] Virtual ports can be created on that clean Mac
- [ ] Version in `package.json` bumped
- [ ] Changelog updated (if you have one)
- [ ] Download URL tested in an incognito browser window
