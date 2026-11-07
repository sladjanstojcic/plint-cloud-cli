import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { deployCore } from '../../src/lib/deploy-core.js';

describe('deployCore', () => {
  it('creates a new zone when existingZone is missing', async () => {
    const result = await deployCore(
      { path: '/tmp/site', zoneName: 'plint-demo' },
      {
        stat: async () => ({ isFile: () => false }),
        walkLocalFiles: async () => ({ warnings: [], files: [{ path: 'index.html', localPath: '/tmp/site/index.html', checksum: 'A', size: 12 }] }),
        computeChangeset: () => ({ toUpload: [{ path: 'index.html', localPath: '/tmp/site/index.html', checksum: 'A' }], toDelete: [], unchanged: 0 }),
        resolveApiKey: () => 'account-key',
        findStorageZoneByName: async () => null,
        createStorageZone: async () => ({ Id: 10, Name: 'plint-demo', Password: 'secret', StorageHostname: 'storage.bunnycdn.com' }),
        findPullZoneByName: async () => null,
        createPullZone: async () => ({ Id: 11, Name: 'plint-demo', Hostnames: [{ Value: 'plint-demo.b-cdn.net', IsSystemHostname: true }] }),
        waitForStorageReady: async () => {},
        listRemoteFiles: async () => [],
        uploadRemoteFile: async () => {},
        deleteRemoteFile: async () => {}
      }
    );

    assert.equal(result.storageZoneId, 10);
    assert.equal(result.pullZoneId, 11);
    assert.deepEqual(result.remoteFiles, ['index.html']);
  });

  it('reuses an existing zone for updates', async () => {
    const result = await deployCore(
      {
        path: '/tmp/report.pdf',
        zoneName: 'plint-demo',
        existingZone: {
          zoneId: '10',
          zoneName: 'plint-demo',
          zonePassword: 'secret',
          storageHostname: 'storage.bunnycdn.com',
          pullZoneId: '11',
          pullZoneHostname: 'plint-demo.b-cdn.net'
        }
      },
      {
        resolveApiKey: () => 'account-key',
        stat: async () => ({ isFile: () => true }),
        buildSingleFileEntry: async () => ({ path: 'report.pdf', localPath: '/tmp/report.pdf', checksum: 'A', size: 10 }),
        uploadRemoteFile: async () => {},
        listRemoteFiles: async () => []
      }
    );

    assert.equal(result.storageZoneId, '10');
    assert.equal(result.fileCount, 1);
  });

  it('resolves the storage zone name for updates when it is not stored locally', async () => {
    let uploadConfig = null;

    const result = await deployCore(
      {
        path: '/tmp/report.pdf',
        existingZone: {
          zoneId: '10',
          zonePassword: 'secret',
          storageHostname: 'storage.bunnycdn.com',
          pullZoneId: '11',
          pullZoneHostname: 'plint-demo.b-cdn.net'
        }
      },
      {
        resolveApiKey: () => 'account-key',
        getStorageZone: async () => ({ Name: 'plint-demo' }),
        stat: async () => ({ isFile: () => true }),
        buildSingleFileEntry: async () => ({
          path: 'report.pdf',
          localPath: '/tmp/report.pdf',
          checksum: 'A',
          size: 10
        }),
        uploadRemoteFile: async (config) => {
          uploadConfig = config;
        },
        listRemoteFiles: async () => []
      }
    );

    assert.equal(uploadConfig.zoneName, 'plint-demo');
    assert.equal(result.storageZoneId, '10');
  });

  it('preserves non-name-taken pull-zone create errors', async () => {
    await assert.rejects(
      () => deployCore(
        { path: '/tmp/site', zoneName: 'plint-demo' },
        {
          stat: async () => ({ isFile: () => false }),
          walkLocalFiles: async () => ({ warnings: [], files: [{ path: 'index.html', localPath: '/tmp/site/index.html', checksum: 'A', size: 12 }] }),
          computeChangeset: () => ({ toUpload: [], toDelete: [], unchanged: 1 }),
          resolveApiKey: () => 'account-key',
          findStorageZoneByName: async () => null,
          createStorageZone: async () => ({ Id: 10, Name: 'plint-demo', Password: 'secret', StorageHostname: 'storage.bunnycdn.com' }),
          findPullZoneByName: async () => null,
          createPullZone: async () => {
            const error = new Error('validation failed');
            error.status = 400;
            error.errorKey = 'pullzone.validation_failed';
            throw error;
          }
        }
      ),
      (error) => error.errorKey === 'pullzone.validation_failed'
    );
  });

  it('creates a random internal binding for a new project', async () => {
    let createdZoneName = null;

    const result = await deployCore(
      { path: '/tmp/site' },
      {
        stat: async () => ({ isFile: () => false }),
        walkLocalFiles: async () => ({
          warnings: [],
          files: [
            {
              path: 'index.html',
              localPath: '/tmp/site/index.html',
              checksum: 'A',
              size: 12
            }
          ]
        }),
        computeChangeset: () => ({
          toUpload: [
            {
              path: 'index.html',
              localPath: '/tmp/site/index.html',
              checksum: 'A'
            }
          ],
          toDelete: [],
          unchanged: 0
        }),
        resolveApiKey: () => 'account-key',
        generateInternalZoneName: () => 'plint-a1b2c3d4',
        createStorageZone: async (_apiKey, name) => {
          createdZoneName = name;
          return {
            Id: 10,
            Name: name,
            Password: 'secret',
            StorageHostname: 'storage.bunnycdn.com'
          };
        },
        createPullZone: async (_apiKey, name) => ({
          Id: 11,
          Name: name,
          Hostnames: [
            { Value: 'plint-a1b2c3d4.b-cdn.net', IsSystemHostname: true }
          ]
        }),
        waitForStorageReady: async () => {},
        listRemoteFiles: async () => [],
        uploadRemoteFile: async () => {},
        deleteRemoteFile: async () => {}
      }
    );

    assert.equal(createdZoneName, 'plint-a1b2c3d4');
    assert.equal(result.storageZoneId, 10);
    assert.equal(result.pullZoneId, 11);
  });

  it('retries generated internal names when Bunny reports storage name_taken', async () => {
    const generated = ['plint-first', 'plint-second'];
    let attempts = 0;

    const result = await deployCore(
      { path: '/tmp/site' },
      {
        stat: async () => ({ isFile: () => false }),
        walkLocalFiles: async () => ({
          warnings: [],
          files: [
            {
              path: 'index.html',
              localPath: '/tmp/site/index.html',
              checksum: 'A',
              size: 12
            }
          ]
        }),
        computeChangeset: () => ({ toUpload: [], toDelete: [], unchanged: 1 }),
        resolveApiKey: () => 'account-key',
        generateInternalZoneName: () => generated[attempts++],
        createStorageZone: async (_apiKey, name) => {
          if (name === 'plint-first') {
            const error = new Error('taken');
            error.errorKey = 'storagezone.name_taken';
            throw error;
          }
          return {
            Id: 10,
            Name: name,
            Password: 'secret',
            StorageHostname: 'storage.bunnycdn.com'
          };
        },
        createPullZone: async (_apiKey, name) => ({
          Id: 11,
          Name: name,
          Hostnames: [{ Value: `${name}.b-cdn.net`, IsSystemHostname: true }]
        }),
        waitForStorageReady: async () => {},
        listRemoteFiles: async () => [],
        uploadRemoteFile: async () => {},
        deleteRemoteFile: async () => {}
      }
    );

    assert.equal(result.pullZoneHostname, 'plint-second.b-cdn.net');
  });

  it('raises PROJECT_STALE when an existing binding returns 404 from Bunny', async () => {
    await assert.rejects(
      () =>
        deployCore(
          {
            path: '/tmp/site',
            existingZone: {
              zoneId: 1,
              zonePassword: 'secret',
              storageHostname: 'storage.bunnycdn.com',
              pullZoneId: 2,
              pullZoneHostname: 'plint-old.b-cdn.net'
            }
          },
          {
            stat: async () => ({ isFile: () => false }),
            walkLocalFiles: async () => ({
              warnings: [],
              files: [
                {
                  path: 'index.html',
                  localPath: '/tmp/site/index.html',
                  checksum: 'A',
                  size: 12
                }
              ]
            }),
            computeChangeset: () => ({ toUpload: [], toDelete: [], unchanged: 1 }),
            resolveApiKey: () => 'account-key',
            getStorageZone: async () => ({ Name: 'plint-old' }),
            listRemoteFiles: async () => {
              const error = new Error('gone');
              error.status = 404;
              throw error;
            },
            uploadRemoteFile: async () => {},
            deleteRemoteFile: async () => {}
          }
        ),
      (error) => error.code === 'PROJECT_STALE'
    );
  });

  it('raises BINDING_CREATE_FAILED after repeated name_taken retries', async () => {
    await assert.rejects(
      () =>
        deployCore(
          { path: '/tmp/site' },
          {
            stat: async () => ({ isFile: () => false }),
            walkLocalFiles: async () => ({
              warnings: [],
              files: [{ path: 'index.html', localPath: '/tmp/site/index.html', checksum: 'A', size: 12 }]
            }),
            computeChangeset: () => ({ toUpload: [], toDelete: [], unchanged: 0 }),
            resolveApiKey: () => 'account-key',
            generateInternalZoneName: () => 'plint-dup',
            createStorageZone: async () => {
              const error = new Error('taken');
              error.errorKey = 'storagezone.name_taken';
              throw error;
            },
            createPullZone: async () => ({ Id: 11, Name: 'plint-dup', Hostnames: [] }),
            waitForStorageReady: async () => {},
            listRemoteFiles: async () => [],
            uploadRemoteFile: async () => {},
            deleteRemoteFile: async () => {}
          }
        ),
      (error) => error.code === 'BINDING_CREATE_FAILED'
    );
  });

  it('calls onProgress with upload and delete counts during real deploys', async () => {
    const events = [];
    const { deployCore } = await import('../../src/lib/deploy-core.js');
    await deployCore(
      {
        path: '/tmp/site',
        existingZone: {
          zoneId: '10',
          zoneName: 'z',
          zonePassword: 'p',
          storageHostname: 's',
          pullZoneId: '11',
          pullZoneHostname: 'h'
        },
        onProgress: (event) => events.push(event)
      },
      {
        resolveApiKey: () => 'account-key',
        stat: async () => ({ isFile: () => false }),
        walkLocalFiles: async () => ({
          files: [
            { path: 'a.html', size: 10, checksum: 'A', localPath: '/tmp/site/a.html' },
            { path: 'b.html', size: 10, checksum: 'B', localPath: '/tmp/site/b.html' }
          ],
          warnings: []
        }),
        listRemoteFiles: async () => [{ path: 'old.html', size: 4, checksum: 'old' }],
        uploadRemoteFile: async () => {},
        deleteRemoteFile: async () => {},
        purgePullZone: async () => {}
      }
    );
    const uploads = events.filter((event) => event.phase === 'upload');
    const deletes = events.filter((event) => event.phase === 'delete');
    assert.equal(uploads.length, 2);
    assert.equal(uploads.at(-1).done, 2);
    assert.equal(uploads.at(-1).total, 2);
    assert.equal(deletes.length, 1);
    assert.equal(deletes.at(0).total, 1);
  });

  it('returns local path, warnings, and cache purge status on real directory deploys', async () => {
    const { deployCore } = await import('../../src/lib/deploy-core.js');
    const result = await deployCore(
      {
        path: '/tmp/site',
        existingZone: {
          zoneId: '10',
          zoneName: 'z',
          zonePassword: 'p',
          storageHostname: 's',
          pullZoneId: '11',
          pullZoneHostname: 'h'
        }
      },
      {
        resolveApiKey: () => 'account-key',
        stat: async () => ({ isFile: () => false }),
        walkLocalFiles: async () => ({
          files: [{ path: 'index.html', size: 12, checksum: 'new', localPath: '/tmp/site/index.html' }],
          warnings: [
            { code: 'SKIPPED_SYMLINK', message: 'Skipped symlink: link.txt', path: 'link.txt', severity: 'warning' }
          ]
        }),
        listRemoteFiles: async () => [],
        uploadRemoteFile: async () => {},
        deleteRemoteFile: async () => {},
        purgePullZone: async () => {}
      }
    );
    assert.equal(result.localPath, '/tmp/site');
    assert.equal(result.cachePurge, 'purged');
    assert.deepEqual(result.warnings, [
      { code: 'SKIPPED_SYMLINK', message: 'Skipped symlink: link.txt', path: 'link.txt', severity: 'warning' }
    ]);
  });

  it('computes dry-run changes without upload, delete, or purge', async () => {
    const calls = [];
    const { deployCore } = await import('../../src/lib/deploy-core.js');
    const result = await deployCore(
      { path: '/tmp/site', existingZone: { zoneId: '10', zoneName: 'z', zonePassword: 'p', storageHostname: 's', pullZoneId: '11', pullZoneHostname: 'h' }, dryRun: true },
      {
        resolveApiKey: () => 'account-key',
        stat: async () => ({ isFile: () => false }),
        walkLocalFiles: async () => ({ files: [{ path: 'index.html', size: 12, checksum: 'new', localPath: '/tmp/site/index.html' }], warnings: [] }),
        listRemoteFiles: async () => [{ path: 'index.html', size: 11, checksum: 'old' }, { path: 'old.html', size: 4, checksum: 'old' }],
        uploadRemoteFile: async () => calls.push('upload'),
        deleteRemoteFile: async () => calls.push('delete'),
        purgePullZone: async () => calls.push('purge')
      }
    );
    assert.equal(result.toUpload.length, 1);
    assert.deepEqual(result.toDelete, ['old.html']);
    assert.equal(result.unchanged, 0);
    assert.deepEqual(calls, []);
  });

  it('uses a caller-provided scan instead of walking the directory again', async () => {
    const { deployCore } = await import('../../src/lib/deploy-core.js');
    const result = await deployCore(
      {
        path: '/tmp/site',
        existingZone: { zoneId: '10', zoneName: 'z', zonePassword: 'p', storageHostname: 's', pullZoneId: '11', pullZoneHostname: 'h' },
        scan: { files: [{ path: 'index.html', size: 12, checksum: 'new', localPath: '/tmp/site/index.html' }], warnings: [] },
        dryRun: true
      },
      {
        resolveApiKey: () => 'account-key',
        stat: async () => ({ isFile: () => false }),
        walkLocalFiles: async () => {
          throw new Error('walkLocalFiles must not run when a scan is provided');
        },
        listRemoteFiles: async () => []
      }
    );
    assert.equal(result.toUpload.length, 1);
  });

  it('dry-runs single-file deploy without reporting unrelated remote deletes', async () => {
    const calls = [];
    const { deployCore } = await import('../../src/lib/deploy-core.js');
    const result = await deployCore(
      { path: '/tmp/site/report.pdf', existingZone: { zoneId: '10', zoneName: 'z', zonePassword: 'p', storageHostname: 's', pullZoneId: '11', pullZoneHostname: 'h' }, dryRun: true },
      {
        resolveApiKey: () => 'account-key',
        stat: async () => ({ isFile: () => true }),
        buildSingleFileEntry: async () => ({ path: 'report.pdf', size: 12, checksum: 'new', localPath: '/tmp/site/report.pdf' }),
        listRemoteFiles: async () => [{ path: 'old.html', size: 4, checksum: 'old' }],
        uploadRemoteFile: async () => calls.push('upload'),
        deleteRemoteFile: async () => calls.push('delete'),
        purgePullZone: async () => calls.push('purge')
      }
    );
    assert.equal(result.toUpload.length, 1);
    assert.deepEqual(result.toDelete, []);
    assert.equal(result.unchanged, 0);
    assert.deepEqual(calls, []);
  });

  it('skips uploading a single file that is already on the server unchanged', async () => {
    const calls = [];
    const { deployCore } = await import('../../src/lib/deploy-core.js');
    const result = await deployCore(
      { path: '/tmp/site/report.pdf', existingZone: { zoneId: '10', zoneName: 'z', zonePassword: 'p', storageHostname: 's', pullZoneId: '11', pullZoneHostname: 'h' } },
      {
        resolveApiKey: () => 'account-key',
        stat: async () => ({ isFile: () => true }),
        buildSingleFileEntry: async () => ({ path: 'report.pdf', size: 12, checksum: 'same', localPath: '/tmp/site/report.pdf' }),
        listRemoteFiles: async () => [{ path: 'report.pdf', size: 12, checksum: 'same' }],
        uploadRemoteFile: async () => calls.push('upload'),
        purgePullZone: async () => calls.push('purge')
      }
    );
    assert.equal(result.uploaded, 0);
    assert.equal(result.unchanged, 1);
    assert.deepEqual(calls, ['purge']);
  });

  it('uploads a single file whose remote copy differs', async () => {
    const calls = [];
    const { deployCore } = await import('../../src/lib/deploy-core.js');
    const result = await deployCore(
      { path: '/tmp/site/report.pdf', existingZone: { zoneId: '10', zoneName: 'z', zonePassword: 'p', storageHostname: 's', pullZoneId: '11', pullZoneHostname: 'h' } },
      {
        resolveApiKey: () => 'account-key',
        stat: async () => ({ isFile: () => true }),
        buildSingleFileEntry: async () => ({ path: 'report.pdf', size: 12, checksum: 'new', localPath: '/tmp/site/report.pdf' }),
        listRemoteFiles: async () => [{ path: 'report.pdf', size: 12, checksum: 'old' }],
        uploadRemoteFile: async () => calls.push('upload'),
        purgePullZone: async () => calls.push('purge')
      }
    );
    assert.equal(result.uploaded, 1);
    assert.equal(result.unchanged, 0);
    assert.deepEqual(calls, ['upload', 'purge']);
  });

  it('reports new zones through onBindingCreated before uploading anything', async () => {
    const events = [];
    const { deployCore } = await import('../../src/lib/deploy-core.js');
    const result = await deployCore(
      { path: '/tmp/site', onBindingCreated: async (config) => events.push(['binding', config.zoneId, config.zoneName]) },
      {
        resolveApiKey: () => 'account-key',
        stat: async () => ({ isFile: () => false }),
        walkLocalFiles: async () => ({ files: [{ path: 'index.html', size: 2, checksum: 'c', localPath: '/tmp/site/index.html' }], warnings: [] }),
        generateInternalZoneName: () => 'plint-new',
        createStorageZone: async () => ({ Id: 10, Name: 'plint-new', Password: 'p', StorageHostname: 's' }),
        createPullZone: async () => ({ Id: 11, Hostnames: [{ Value: 'plint-new.b-cdn.net', IsSystemHostname: true }] }),
        waitForStorageReady: async () => {},
        listRemoteFiles: async () => [],
        uploadRemoteFile: async () => events.push(['upload']),
        purgePullZone: async () => {}
      }
    );
    assert.deepEqual(events, [['binding', 10, 'plint-new'], ['upload']]);
    assert.equal(result.targetType, 'directory');
  });

  it('does not call onBindingCreated for an existing project', async () => {
    const calls = [];
    const { deployCore } = await import('../../src/lib/deploy-core.js');
    const result = await deployCore(
      { path: '/tmp/site/report.pdf', existingZone: { zoneId: '10', zoneName: 'z', zonePassword: 'p', storageHostname: 's', pullZoneId: '11', pullZoneHostname: 'h' }, onBindingCreated: async () => calls.push('binding') },
      {
        resolveApiKey: () => 'account-key',
        stat: async () => ({ isFile: () => true }),
        buildSingleFileEntry: async () => ({ path: 'report.pdf', size: 1, checksum: 'c', localPath: '/tmp/site/report.pdf' }),
        listRemoteFiles: async () => [],
        uploadRemoteFile: async () => {},
        purgePullZone: async () => {}
      }
    );
    assert.deepEqual(calls, []);
    assert.equal(result.targetType, 'file');
  });

  it('raises DIRECTORY_EMPTY for an empty directory deploy', async () => {
    const calls = [];
    await assert.rejects(
      () =>
        deployCore(
          { path: '/tmp/site' },
          {
            stat: async () => ({ isFile: () => false }),
            walkLocalFiles: async () => ({ warnings: [], files: [] }),
            resolveApiKey: () => 'account-key',
            generateInternalZoneName: () => 'plint-empty',
            createStorageZone: async () => {
              calls.push('createStorageZone');
              return {
                Id: 10,
                Name: 'plint-empty',
                Password: 'secret',
                StorageHostname: 'storage.bunnycdn.com'
              };
            },
            createPullZone: async () => {
              calls.push('createPullZone');
              return {
                Id: 11,
                Name: 'plint-empty',
                Hostnames: [{ Value: 'plint-empty.b-cdn.net', IsSystemHostname: true }]
              };
            },
            waitForStorageReady: async () => {
              calls.push('waitForStorageReady');
            },
            listRemoteFiles: async () => []
          }
        ),
      (error) => error.code === 'DIRECTORY_EMPTY'
    );
    assert.deepEqual(calls, []);
  });
});
