// Post-sign notarization hook for electron-builder.
// No-ops unless the required env vars are present, so unsigned dev builds
// still work. To enable:
//
//   export APPLE_ID='your.appleid@example.com'
//   export APPLE_APP_SPECIFIC_PASSWORD='REPLACE_WITH_APP_SPECIFIC_PASSWORD'
//   export APPLE_TEAM_ID='YOURTEAMID'
//
// Then run: npm run build:electron
//
// Note: the app-specific password is generated at appleid.apple.com → Sign-In
// and Security → App-Specific Passwords. Never use your actual Apple ID password.
exports.default = async function notarize(context) {
  const { electronPlatformName, appOutDir } = context;
  if (electronPlatformName !== 'darwin') return;

  const { APPLE_ID, APPLE_APP_SPECIFIC_PASSWORD, APPLE_TEAM_ID } = process.env;
  if (!APPLE_ID || !APPLE_APP_SPECIFIC_PASSWORD || !APPLE_TEAM_ID) {
    console.log('[notarize] Skipped — APPLE_ID / APPLE_APP_SPECIFIC_PASSWORD / APPLE_TEAM_ID not all set');
    return;
  }

  let notarize;
  try {
    notarize = require('@electron/notarize').notarize;
  } catch {
    console.log('[notarize] Skipped — @electron/notarize not installed. Run: npm i -D @electron/notarize');
    return;
  }

  const appName = context.packager.appInfo.productFilename;
  const appPath = `${appOutDir}/${appName}.app`;
  console.log(`[notarize] Submitting ${appPath} to Apple notary service…`);

  await notarize({
    appBundleId: 'com.midibrain.app',
    appPath,
    appleId: APPLE_ID,
    appleIdPassword: APPLE_APP_SPECIFIC_PASSWORD,
    teamId: APPLE_TEAM_ID,
    tool: 'notarytool',
  });

  console.log('[notarize] Success. App is stapled and ready for distribution.');
};
