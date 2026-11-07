export const WARNING_THRESHOLDS = {
  fileCountHigh: 10_000,
  totalSizeHigh: 500 * 1024 * 1024,
  fileSizeHigh: 25 * 1024 * 1024
};

const SECRET_LIKE_PATTERNS = [/^\.env(?:$|\.)/, /\.pem$/i, /\.key$/i];

export function secretPathWarning(path) {
  if (!SECRET_LIKE_PATTERNS.some((pattern) => pattern.test(path))) return null;
  return {
    code: 'SECRET_LIKE_PATH',
    message: `Skipped secret-like file: ${path}`,
    path,
    severity: 'warning'
  };
}

export function guardrailWarnings(
  files,
  thresholds = WARNING_THRESHOLDS,
  totalBytes = null
) {
  const bytes = totalBytes ?? files.reduce((sum, file) => sum + (file.size ?? 0), 0);
  const warnings = [];
  if (files.length > thresholds.fileCountHigh) {
    warnings.push({
      code: 'FILE_COUNT_HIGH',
      message: `Deploy contains ${files.length} files, above the ${thresholds.fileCountHigh} file warning threshold.`,
      severity: 'warning'
    });
  }
  if (bytes > thresholds.totalSizeHigh) {
    warnings.push({
      code: 'TOTAL_SIZE_HIGH',
      message: `Deploy is ${bytes} bytes, above the ${thresholds.totalSizeHigh} byte warning threshold.`,
      severity: 'warning'
    });
  }
  for (const file of files) {
    if ((file.size ?? 0) > thresholds.fileSizeHigh) {
      warnings.push({
        code: 'FILE_SIZE_HIGH',
        message: `${file.path} is ${file.size} bytes, above the ${thresholds.fileSizeHigh} byte warning threshold.`,
        path: file.path,
        severity: 'warning'
      });
    }
  }
  return warnings;
}
