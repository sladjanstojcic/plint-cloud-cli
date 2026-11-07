import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { guardrailWarnings, secretPathWarning } from '../../../src/lib/preflight/warnings.js';

describe('preflight warnings', () => {
  it('warns for high file count, total bytes, and individual file size', () => {
    const files = Array.from({ length: 10_001 }, (_, index) => ({
      path: `asset-${index}.bin`,
      size: index === 0 ? 26 * 1024 * 1024 : 60 * 1024
    }));
    const warnings = guardrailWarnings(files);
    assert.ok(warnings.some((warning) => warning.code === 'FILE_COUNT_HIGH'));
    assert.ok(warnings.some((warning) => warning.code === 'TOTAL_SIZE_HIGH'));
    assert.ok(warnings.some((warning) => warning.code === 'FILE_SIZE_HIGH'));
  });

  it('creates a structured warning for secret-like paths', () => {
    assert.deepEqual(secretPathWarning('.env.local'), {
      code: 'SECRET_LIKE_PATH',
      message: 'Skipped secret-like file: .env.local',
      path: '.env.local',
      severity: 'warning'
    });
  });
});
