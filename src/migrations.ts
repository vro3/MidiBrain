// One-time localStorage key migrations. Runs synchronously before React
// mounts so hooks reading localStorage during useState init see the new
// names. Safe to run repeatedly — skips when the new key is already set.

const KEY_RENAMES: Array<[string, string]> = [
  ['midibrain_matrix', 'midibrain.matrix'],
  ['midibrain_routings', 'midibrain.matrixRoutings'],
  ['midibrain_remappings', 'midibrain.remappings'],
  ['midibrain_presets', 'midibrain.presets'],
  ['midibrain_channelNames', 'midibrain.channelNames'],
  ['midibrain_rowHeights', 'midibrain.rowHeights'],
];

export function runLocalStorageMigrations(): void {
  if (typeof window === 'undefined') return;
  for (const [oldKey, newKey] of KEY_RENAMES) {
    try {
      const old = window.localStorage.getItem(oldKey);
      if (old == null) continue;
      const existing = window.localStorage.getItem(newKey);
      if (existing == null) {
        window.localStorage.setItem(newKey, old);
      }
      window.localStorage.removeItem(oldKey);
    } catch {
      // localStorage can throw under quota / privacy modes — ignore.
    }
  }
}

// Translate an old-format backup's router key map to the new key names, in
// place. Returns the same object for convenience. If a key is already in the
// new format, it's preserved untouched.
export function migrateBackupRouterKeys(router: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  const renameMap = new Map(KEY_RENAMES);
  for (const key of Object.keys(router)) {
    const mapped = renameMap.get(key) ?? key;
    // Later keys win if somehow both old and new appear.
    if (!(mapped in result)) result[mapped] = router[key];
  }
  return result;
}
