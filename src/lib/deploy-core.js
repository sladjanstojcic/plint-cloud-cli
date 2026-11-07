import pLimit from 'p-limit';
import { stat } from 'node:fs/promises';
import { dirname } from 'node:path';
import { buildSingleFileEntry, walkLocalFiles } from './files.js';
import {
  createPullZone,
  createStorageZone,
  generateInternalZoneName,
  getStorageZone,
  purgePullZone
} from './bunny.js';
import {
  deleteRemoteFile,
  listRemoteFiles,
  uploadRemoteFile,
  waitForStorageReady
} from './storage.js';
import { computeChangeset } from './sync.js';
import { requireApiKey, resolveApiKey } from './config.js';
import { ERROR_CODES } from './error-codes.js';
import { assertSafePath } from './files/safety.js';
import { directoryEmptyError } from './deploy/validation.js';

const uploadLimit = pLimit(10);
const deleteLimit = pLimit(5);
const transientStatuses = new Set([408, 425, 429]);
const transientErrorCodes = new Set([
  'ECONNREFUSED',
  'ECONNRESET',
  'ENOTFOUND',
  'ETIMEDOUT',
  'EAI_AGAIN'
]);
const MAX_BINDING_ATTEMPTS = 5;

function toConfig(zone, pullZone) {
  return {
    zoneId: zone.Id,
    zoneName: zone.Name,
    zonePassword: zone.Password,
    storageHostname: zone.StorageHostname,
    pullZoneId: pullZone.Id,
    pullZoneHostname: pullZone.Hostnames.find((item) => item.IsSystemHostname)?.Value
  };
}

function isTransientDeployError(error) {
  const status = error?.status;
  if (transientStatuses.has(status) || status >= 500) return true;
  if (transientErrorCodes.has(error?.code) || transientErrorCodes.has(error?.cause?.code)) {
    return true;
  }
  return error?.name === 'TypeError' && !status;
}

async function withTransientRetry(
  operation,
  {
    sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    retryDelaysMs = [0, 250, 500, 1000]
  } = {}
) {
  let lastError;
  for (const delay of retryDelaysMs) {
    if (delay > 0) await sleep(delay);
    try {
      return await operation();
    } catch (error) {
      if (!isTransientDeployError(error)) throw error;
      lastError = error;
    }
  }
  throw lastError;
}

async function createProjectBinding(apiKey, api) {
  for (let attempt = 0; attempt < MAX_BINDING_ATTEMPTS; attempt += 1) {
    const zoneName = api.generateInternalZoneName();
    try {
      const zone = await api.createStorageZone(apiKey, zoneName);
      const pullZone = await api.createPullZone(apiKey, zoneName, zone.Id);
      return toConfig(zone, pullZone);
    } catch (error) {
      if (error.errorKey !== 'storagezone.name_taken') throw error;
    }
  }

  const error = new Error('Could not generate a unique Bunny zone name.');
  error.code = ERROR_CODES.BINDING_CREATE_FAILED;
  throw error;
}

async function ensureZoneName(config, apiKey, api) {
  if (config.zoneName) return config;
  const zone = await api.getStorageZone(apiKey, config.zoneId);
  return { ...config, zoneName: zone.Name };
}

function maybeStale(error, existingZone) {
  if (!existingZone) return error;
  if (error?.status === 404 || error?.status === 401) {
    error.code = ERROR_CODES.PROJECT_STALE;
  }
  return error;
}

async function tryPurge(api, apiKey, config) {
  if (!config.pullZoneId) return 'skipped';
  try {
    await withTransientRetry(() => api.purgePullZone(apiKey, config.pullZoneId));
    return 'purged';
  } catch {
    return 'failed';
  }
}

// input.scan: optional scanLocalTarget() result for input.path, so callers that
// already scanned (to validate before prompting) don't walk the tree twice.
// input.onBindingCreated(config): called once new zones exist, before any upload.
export async function deployCore(input, deps = {}) {
  const api = {
    stat,
    buildSingleFileEntry,
    walkLocalFiles,
    computeChangeset,
    resolveApiKey,
    generateInternalZoneName,
    createStorageZone,
    createPullZone,
    getStorageZone,
    purgePullZone,
    waitForStorageReady,
    listRemoteFiles,
    uploadRemoteFile,
    deleteRemoteFile,
    ...deps
  };

  assertSafePath(input.path);

  const targetStats = await api.stat(input.path).catch(() => null);
  if (!targetStats) {
    const error = new Error(`Path not found: ${input.path}`);
    error.code = ERROR_CODES.PATH_NOT_FOUND;
    throw error;
  }

  const apiKey = requireApiKey(api.resolveApiKey);

  let config = input.existingZone;
  async function bindZone() {
    if (!config) {
      config = await createProjectBinding(apiKey, api);
      await api.waitForStorageReady(config);
      await input.onBindingCreated?.(config);
    }
    config = await ensureZoneName(config, apiKey, api);
  }

  if (targetStats.isFile()) {
    try {
      const file =
        input.scan?.files[0] ?? (await api.buildSingleFileEntry(dirname(input.path), input.path));
      await bindZone();
      const remote = await api.listRemoteFiles(config);
      const existing = remote.find((item) => item.path === file.path);
      const unchanged = existing && existing.size === file.size && existing.checksum === file.checksum ? 1 : 0;
      if (input.dryRun) {
        return {
          toUpload: unchanged ? [] : [file],
          toDelete: [],
          unchanged
        };
      }
      if (!unchanged) {
        await withTransientRetry(() =>
          api.uploadRemoteFile(config, file.path, file.localPath, file.checksum)
        );
      }
      const cachePurge = await tryPurge(api, apiKey, config);
      return {
        storageZoneId: config.zoneId,
        zoneName: config.zoneName,
        storageHostname: config.storageHostname,
        zonePassword: config.zonePassword,
        pullZoneId: config.pullZoneId,
        pullZoneHostname: config.pullZoneHostname,
        remoteFiles: [file.path],
        fileCount: 1,
        bytes: file.size ?? 0,
        uploaded: 1 - unchanged,
        deleted: 0,
        unchanged,
        localPath: input.path,
        targetType: 'file',
        warnings: [],
        cachePurge
      };
    } catch (error) {
      throw maybeStale(error, input.existingZone);
    }
  }

  try {
    const local = input.scan ?? (await api.walkLocalFiles(input.path));
    if (local.files.length === 0) {
      throw directoryEmptyError(input.path);
    }
    await bindZone();
    const remote = await api.listRemoteFiles(config);
    const { toUpload, toDelete, unchanged } = api.computeChangeset(local.files, remote);

    if (input.dryRun) {
      return { toUpload, toDelete, unchanged };
    }

    const onProgress = typeof input.onProgress === 'function' ? input.onProgress : null;
    let uploadedCount = 0;
    await Promise.all(
      toUpload.map((file) =>
        uploadLimit(async () => {
          await withTransientRetry(() =>
            api.uploadRemoteFile(config, file.path, file.localPath, file.checksum)
          );
          uploadedCount += 1;
          onProgress?.({ phase: 'upload', done: uploadedCount, total: toUpload.length });
        })
      )
    );
    let deletedCount = 0;
    await Promise.all(
      toDelete.map((filePath) =>
        deleteLimit(async () => {
          await withTransientRetry(() => api.deleteRemoteFile(config, filePath));
          deletedCount += 1;
          onProgress?.({ phase: 'delete', done: deletedCount, total: toDelete.length });
        })
      )
    );
    const cachePurge = await tryPurge(api, apiKey, config);

    const finalFiles = local.files.map((file) => file.path);

    return {
      storageZoneId: config.zoneId,
      zoneName: config.zoneName,
      storageHostname: config.storageHostname,
      zonePassword: config.zonePassword,
      pullZoneId: config.pullZoneId,
      pullZoneHostname: config.pullZoneHostname,
      remoteFiles: finalFiles,
      fileCount: local.files.length,
      bytes: local.files.reduce((sum, file) => sum + (file.size ?? 0), 0),
      uploaded: toUpload.length,
      deleted: toDelete.length,
      unchanged,
      localPath: input.path,
      targetType: 'directory',
      warnings: local.warnings,
      cachePurge
    };
  } catch (error) {
    throw maybeStale(error, input.existingZone);
  }
}
