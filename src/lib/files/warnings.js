const WARNING_CAP = 100;

export const skipWarning = (code, reason, path) => ({
  code,
  message: `${reason}: ${path}`,
  path,
  severity: 'warning'
});

export const symlinkWarning = (path) => skipWarning('SKIPPED_SYMLINK', 'Skipped symlink', path);

export const specialFileWarning = (path) =>
  skipWarning('SKIPPED_SPECIAL', 'Skipped non-regular file (FIFO, socket, or device)', path);

export const unreadableWarning = (path) =>
  skipWarning('SKIPPED_UNREADABLE', 'Skipped unreadable entry', path);

// Bunny Storage truncates names at "?", turns "\\" into a folder separator and drops
// '"', "<" and ">", so such files would be stored under another name (and deleted again
// on the next deploy).
const UNSUPPORTED_NAME = /[?\\"<>]/;
export const hasUnsupportedName = (name) => UNSUPPORTED_NAME.test(name);
export const unsupportedNameWarning = (path) =>
  skipWarning('SKIPPED_UNSUPPORTED_NAME', 'Skipped name Bunny Storage cannot store (? \\ " < >)', path);

const truncationWarning = (skipped) => ({
  code: 'WARNINGS_TRUNCATED',
  message: `${skipped} additional warnings truncated`,
  skipped,
  severity: 'warning'
});

export function pushWarning(warnings, warning) {
  if (warnings.length < WARNING_CAP) {
    warnings.push(warning);
    return;
  }
  const last = warnings[warnings.length - 1];
  if (last?.code === 'WARNINGS_TRUNCATED') {
    warnings[warnings.length - 1] = truncationWarning(last.skipped + 1);
    return;
  }
  warnings.push(truncationWarning(1));
}
