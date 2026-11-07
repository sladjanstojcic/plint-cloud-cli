import { estimateStorageCost } from './pricing.js';
import { guardrailWarnings } from './warnings.js';

export function largestFiles(files, limit = 5) {
  return [...files]
    .sort((left, right) => (right.size ?? 0) - (left.size ?? 0))
    .slice(0, limit)
    .map((file) => ({ path: file.path, size: file.size ?? 0 }));
}

export function summarizeScan({ path, targetType, files, warnings = [] }) {
  const bytes = files.reduce((sum, file) => sum + (file.size ?? 0), 0);
  const allWarnings = [...warnings, ...guardrailWarnings(files, undefined, bytes)];
  return {
    path,
    target_type: targetType,
    file_count: files.length,
    bytes,
    largest_files: largestFiles(files),
    warnings: allWarnings,
    warning_count: allWarnings.length,
    cost_estimate: estimateStorageCost(bytes)
  };
}
