import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

const createBuffer = () => {
  let value = '';
  return {
    stream: { write: (chunk) => { value += chunk; } },
    read: () => value
  };
};

describe('estimate command', () => {
  it('prints marginal cost, human-readable size, and minimum-charge framing in human mode', async () => {
    const buffer = createBuffer();
    const { default: estimate } = await import('../../../src/commands/estimate.js');
    await estimate(['dist'], { json: false, stdout: buffer.stream }, {
      scanLocalTarget: async () => ({
        path: '/tmp/dist',
        targetType: 'directory',
        files: [{ path: 'index.html', size: 42_800_000 }],
        warnings: []
      }),
      summarizeScan: () => ({
        path: '/tmp/dist',
        target_type: 'directory',
        file_count: 1,
        bytes: 42_800_000,
        largest_files: [],
        warnings: [],
        warning_count: 0,
        cost_estimate: {
          provider: 'bunny',
          currency: 'USD',
          storage_gb: 0.04,
          raw_storage_monthly: 0.0004,
          minimum_monthly_charge: 1,
          estimated_storage_monthly: 1,
          cdn_estimated: false,
          pricing_source: 'https://docs.bunny.net/storage/pricing',
          pricing_updated_at: '2026-04-21',
          caveats: []
        }
      })
    });
    const text = buffer.read();
    assert.ok(text.includes('40.82 MB'), `expected human-readable size, got: ${text}`);
    assert.ok(text.includes('<$0.01/mo'), `expected marginal cost framing, got: ${text}`);
    assert.ok(text.includes('$1.00/mo account minimum'), `expected minimum-charge disclosure, got: ${text}`);
  });

  it('shows marginal cost over one cent when scan bytes are large', async () => {
    const buffer = createBuffer();
    const { default: estimate } = await import('../../../src/commands/estimate.js');
    await estimate(['dist'], { json: false, stdout: buffer.stream }, {
      scanLocalTarget: async () => ({ path: '/tmp/dist', targetType: 'directory', files: [], warnings: [] }),
      summarizeScan: () => ({
        path: '/tmp/dist',
        target_type: 'directory',
        file_count: 1,
        bytes: 3 * 1024 * 1024 * 1024,
        largest_files: [],
        warnings: [],
        warning_count: 0,
        cost_estimate: {
          provider: 'bunny',
          currency: 'USD',
          storage_gb: 3,
          raw_storage_monthly: 0.03,
          minimum_monthly_charge: 1,
          estimated_storage_monthly: 1,
          cdn_estimated: false,
          pricing_source: 'https://docs.bunny.net/storage/pricing',
          pricing_updated_at: '2026-04-21',
          caveats: []
        }
      })
    });
    assert.ok(buffer.read().includes('+$0.03/mo'));
  });


  it('returns estimate JSON without requiring auth', async () => {
    const buffer = createBuffer();
    const { default: estimate } = await import('../../../src/commands/estimate.js');
    await estimate(['dist'], { json: true, stdout: buffer.stream }, {
      scanLocalTarget: async () => ({
        path: '/tmp/dist',
        targetType: 'directory',
        files: [{ path: 'index.html', size: 12 }],
        warnings: []
      }),
      summarizeScan: ({ path, targetType, files, warnings }) => ({
        path,
        target_type: targetType,
        file_count: files.length,
        bytes: 12,
        largest_files: [{ path: 'index.html', size: 12 }],
        warnings,
        warning_count: 0,
        cost_estimate: { provider: 'bunny', estimated_storage_monthly: 1, cdn_estimated: false }
      })
    });
    const parsed = JSON.parse(buffer.read());
    assert.equal(parsed.command, 'estimate');
    assert.equal(parsed.data.file_count, 1);
    assert.equal(parsed.data.cost_estimate.provider, 'bunny');
  });

  it('returns single-file estimate JSON', async () => {
    const buffer = createBuffer();
    const { default: estimate } = await import('../../../src/commands/estimate.js');
    await estimate(['report.pdf'], { json: true, stdout: buffer.stream }, {
      scanLocalTarget: async () => ({
        path: '/tmp/report.pdf',
        targetType: 'file',
        files: [{ path: 'report.pdf', size: 12 }],
        warnings: []
      }),
      summarizeScan: ({ path, targetType, files, warnings }) => ({
        path,
        target_type: targetType,
        file_count: files.length,
        bytes: 12,
        largest_files: [{ path: 'report.pdf', size: 12 }],
        warnings,
        warning_count: 0,
        cost_estimate: { provider: 'bunny', estimated_storage_monthly: 1, cdn_estimated: false }
      })
    });
    const parsed = JSON.parse(buffer.read());
    assert.equal(parsed.data.target_type, 'file');
    assert.equal(parsed.data.file_count, 1);
  });

  it('propagates PATH_NOT_FOUND from the scanner', async () => {
    const { default: estimate } = await import('../../../src/commands/estimate.js');
    await assert.rejects(
      () => estimate(['missing'], { json: true, stdout: { write() {} } }, {
        scanLocalTarget: async () => {
          const error = new Error('Path not found: /tmp/missing');
          error.code = 'PATH_NOT_FOUND';
          throw error;
        },
        summarizeScan: () => ({})
      }),
      (error) => error.code === 'PATH_NOT_FOUND'
    );
  });

  it('returns a zero-file warning summary for excluded single-file targets', async () => {
    const buffer = createBuffer();
    const { default: estimate } = await import('../../../src/commands/estimate.js');
    await estimate(['.env'], { json: true, stdout: buffer.stream }, {
      scanLocalTarget: async () => {
        const error = new Error('Single-file deploy target is excluded by plint rules.');
        error.code = 'PATH_EXCLUDED';
        error.warnings = [{
          code: 'SECRET_LIKE_PATH',
          message: 'Skipped secret-like file: .env',
          path: '.env',
          severity: 'warning'
        }];
        throw error;
      },
      summarizeScan: ({ path, targetType, files, warnings }) => ({
        path,
        target_type: targetType,
        file_count: files.length,
        bytes: 0,
        largest_files: [],
        warnings,
        warning_count: warnings.length,
        cost_estimate: { provider: 'bunny', estimated_storage_monthly: 1, cdn_estimated: false }
      })
    });
    const parsed = JSON.parse(buffer.read());
    assert.equal(parsed.data.file_count, 0);
    assert.equal(parsed.data.warnings[0].code, 'SECRET_LIKE_PATH');
  });
});
