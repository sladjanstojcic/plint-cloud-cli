import { createReadStream } from 'node:fs';
import mime from 'mime-types';
import { ERROR_CODES } from './error-codes.js';

const jsonHeaders = { Accept: 'application/json' };

const buildBaseUrl = (config) => `https://${config.storageHostname}/${config.zoneName}`;
const normalizeDirectoryPath = (path) => (path && path !== '/' ? `/${path.replace(/^\/+|\/+$/g, '')}/` : '/');
const normalizeFilePath = (path) => `/${path.replace(/^\/+/, '')}`;

async function parseBody(response) {
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

async function request(config, path, options = {}, fetchImpl = fetch) {
  const response = await fetchImpl(`${buildBaseUrl(config)}${path}`, {
    ...options,
    headers: {
      AccessKey: config.zonePassword,
      ...jsonHeaders,
      ...options.headers
    }
  });

  if (!response.ok) {
    const body = await parseBody(response).catch(() => null);
    const error = new Error(body?.Message ?? `Bunny storage error ${response.status}`);
    error.status = response.status;
    error.body = body;
    throw error;
  }

  return response;
}

export function createStorageClient(config) {
  return { baseUrl: buildBaseUrl(config), zonePassword: config.zonePassword };
}

export async function waitForStorageReady(
  config,
  {
    retryDelaysMs = [0, 250, 500, 1000, 2000, 4000],
    sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    fetchImpl = fetch
  } = {}
) {
  for (const delay of retryDelaysMs) {
    if (delay > 0) await sleep(delay);
    const response = await fetchImpl(`${buildBaseUrl(config)}/`, {
      headers: {
        AccessKey: config.zonePassword,
        ...jsonHeaders
      }
    });

    if (response.ok) return;
    if (![401, 404].includes(response.status)) {
      const error = new Error(`Storage readiness check failed with status ${response.status}.`);
      error.code = ERROR_CODES.BUNNY_STORAGE_PROBE_FAILED;
      throw error;
    }
  }

  const error = new Error(`Storage zone ${config.zoneName} is not ready for Edge Storage requests yet.`);
  error.code = ERROR_CODES.BUNNY_STORAGE_NOT_READY;
  throw error;
}

export async function listRemoteFiles(config, fetchImpl = fetch) {
  const files = [];

  async function walk(path) {
    const response = await request(config, normalizeDirectoryPath(path), {}, fetchImpl);
    const entries = await parseBody(response);
    for (const entry of entries) {
      const nextPath = path === '/' ? `${entry.ObjectName}` : `${path.replace(/\/$/, '')}/${entry.ObjectName}`;
      if (entry.IsDirectory) {
        await walk(`${nextPath}/`);
      } else {
        files.push({ path: nextPath, size: entry.Length, checksum: entry.Checksum });
      }
    }
  }

  await walk('/');
  return files.sort((left, right) => left.path.localeCompare(right.path));
}

export async function uploadRemoteFile(
  config,
  remotePath,
  localPath,
  checksum,
  { fetchImpl = fetch, createBody = (path) => createReadStream(path) } = {}
) {
  const body = createBody(localPath);
  const contentType = mime.lookup(remotePath) || 'application/octet-stream';

  await request(config, normalizeFilePath(remotePath), {
    method: 'PUT',
    headers: {
      'Content-Type': contentType,
      Checksum: checksum
    },
    body,
    duplex: 'half'
  }, fetchImpl);

  return true;
}

export async function deleteRemoteFile(config, remotePath, fetchImpl = fetch) {
  await request(config, normalizeFilePath(remotePath), { method: 'DELETE' }, fetchImpl);
  return true;
}
