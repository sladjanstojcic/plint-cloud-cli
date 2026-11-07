import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createStorageClient, deleteRemoteFile, listRemoteFiles, waitForStorageReady } from '../../src/lib/storage.js';

const originalFetch = global.fetch;

afterEach(() => {
  global.fetch = originalFetch;
});

describe('storage wrapper', () => {
  it('builds URLs from Bunny returned storageHostname', () => {
    const client = createStorageClient({
      storageHostname: 'de.storage.example.test',
      zoneName: 'plint-zone',
      zonePassword: 'secret'
    });

    assert.equal(client.baseUrl, 'https://de.storage.example.test/plint-zone');
  });

  it('flattens recursive file listings', async () => {
    const seenUrls = [];
    global.fetch = async (url) => {
      seenUrls.push(url);
      if (url === 'https://storage.example.test/plint-zone/') {
        return new Response(JSON.stringify([
          { ObjectName: 'css', IsDirectory: true, Length: 0, Checksum: null },
          { ObjectName: 'index.html', IsDirectory: false, Length: 11, Checksum: 'A' }
        ]), { status: 200, headers: { 'content-type': 'application/json' } });
      }

      if (url === 'https://storage.example.test/plint-zone/css/') {
        return new Response(JSON.stringify([
          { ObjectName: 'style.css', IsDirectory: false, Length: 6, Checksum: 'B' }
        ]), { status: 200, headers: { 'content-type': 'application/json' } });
      }

      return new Response('[]', { status: 200, headers: { 'content-type': 'application/json' } });
    };

    const files = await listRemoteFiles({
      storageHostname: 'storage.example.test',
      zoneName: 'plint-zone',
      zonePassword: 'secret'
    });

    assert.deepEqual(files, [
      { path: 'css/style.css', size: 6, checksum: 'B' },
      { path: 'index.html', size: 11, checksum: 'A' }
    ]);
    assert.deepEqual(seenUrls, [
      'https://storage.example.test/plint-zone/',
      'https://storage.example.test/plint-zone/css/'
    ]);
  });

  it('retries immediately and then with short backoff until the zone is ready', async () => {
    let calls = 0;

    await waitForStorageReady(
      {
        storageHostname: 'storage.example.test',
        zoneName: 'plint-zone',
        zonePassword: 'secret'
      },
      {
        retryDelaysMs: [0, 10],
        sleep: async () => {},
        fetchImpl: async () => {
          calls += 1;
          return new Response(calls === 1 ? JSON.stringify({ HttpCode: 401, Message: 'Unauthorized' }) : '[]', {
            status: calls === 1 ? 401 : 200,
            headers: { 'content-type': 'application/json' }
          });
        }
      }
    );

    assert.equal(calls, 2);
  });

  it('throws when Bunny reports a delete failure', async () => {
    global.fetch = async () => new Response(JSON.stringify({
      HttpCode: 404,
      Message: 'Object Not Found'
    }), {
      status: 404,
      headers: { 'content-type': 'application/json' }
    });

    await assert.rejects(
      () => deleteRemoteFile({
        storageHostname: 'storage.example.test',
        zoneName: 'plint-zone',
        zonePassword: 'secret'
      }, 'old.txt'),
      (error) => error.status === 404 && error.message.includes('Object Not Found')
    );
  });

  it('preserves upload integrity failures with status codes', async () => {
    const { uploadRemoteFile } = await import('../../src/lib/storage.js');
    global.fetch = async () => new Response(JSON.stringify({
      HttpCode: 400,
      Message: 'Checksum mismatch'
    }), {
      status: 400,
      headers: { 'content-type': 'application/json' }
    });

    await assert.rejects(
      () => uploadRemoteFile(
        {
          storageHostname: 'storage.example.test',
          zoneName: 'plint-zone',
          zonePassword: 'secret'
        },
        'index.html',
        '/tmp/index.html',
        'ABC',
        { createBody: () => Buffer.from('<h1>ok</h1>') }
      ),
      (error) => error.status === 400 && error.message.includes('Checksum mismatch')
    );
  });

  it('passes the body factory output through fetch with duplex: half', async () => {
    const { uploadRemoteFile } = await import('../../src/lib/storage.js');
    const captured = [];
    const fetchImpl = async (url, options) => {
      captured.push({ url, options });
      return new Response('', { status: 201 });
    };
    const sentinel = Symbol('body');
    await uploadRemoteFile(
      {
        storageHostname: 'storage.example.test',
        zoneName: 'plint-zone',
        zonePassword: 'secret'
      },
      'index.html',
      '/tmp/index.html',
      'ABC',
      { fetchImpl, createBody: () => sentinel }
    );
    assert.equal(captured[0].options.method, 'PUT');
    assert.equal(captured[0].options.body, sentinel);
    assert.equal(captured[0].options.duplex, 'half');
    assert.equal(captured[0].options.headers.Checksum, 'ABC');
  });
});
