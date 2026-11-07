import { randomBytes } from 'node:crypto';
import { ERROR_CODES } from './error-codes.js';

const BASE_URL = 'https://api.bunny.net';

async function request(path, apiKey, options = {}, fetchImpl = fetch) {
  const response = await fetchImpl(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      AccessKey: apiKey,
      'Content-Type': 'application/json',
      ...options.headers
    }
  });

  if (response.status === 204) return null;

  const text = await response.text();

  if (!response.ok) {
    let message = `Bunny API error ${response.status} at ${path}`;
    let errorKey = null;
    try {
      const body = text ? JSON.parse(text) : null;
      if (body?.Message) message = body.Message;
      errorKey = body?.ErrorKey ?? null;
    } catch {
      // Non-JSON error body — keep the status-based message.
    }
    const error = new Error(message);
    error.status = response.status;
    error.errorKey = errorKey;
    error.code = ERROR_CODES.BUNNY_API_ERROR;
    throw error;
  }

  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    const error = new Error(`Bunny returned a non-JSON success response at ${path}.`);
    error.code = ERROR_CODES.BUNNY_API_ERROR;
    error.status = response.status;
    throw error;
  }
}

function getSystemHostname(pullZone) {
  return pullZone?.Hostnames?.find((hostname) => hostname.IsSystemHostname)?.Value ?? null;
}

function normalizeZoneReference(reference) {
  try {
    return new URL(reference).hostname;
  } catch {
    return reference.replace(/^https?:\/\//, '').replace(/\/.*$/, '');
  }
}

export const listStorageZones = (apiKey) => request('/storagezone', apiKey);
export const listPullZones = (apiKey) => request('/pullzone', apiKey);
export const getStorageZone = (apiKey, zoneId) => request(`/storagezone/${zoneId}`, apiKey);
export const createStorageZone = (apiKey, name, region = 'DE') =>
  request('/storagezone', apiKey, {
    method: 'POST',
    body: JSON.stringify({ Name: name, Region: region })
  });
export const deleteStorageZone = (
  apiKey,
  zoneId,
  { deleteLinkedPullZones = false } = {},
  fetchImpl = fetch
) => {
  const suffix = deleteLinkedPullZones ? '?deleteLinkedPullZones=true' : '';
  return request(`/storagezone/${zoneId}${suffix}`, apiKey, { method: 'DELETE' }, fetchImpl);
};
export const createPullZone = (apiKey, name, storageZoneId, fetchImpl = fetch) =>
  request('/pullzone', apiKey, {
    method: 'POST',
    body: JSON.stringify({ Name: name, StorageZoneId: storageZoneId, OriginType: 2 })
  }, fetchImpl);
export const getPullZone = (apiKey, pullZoneId) => request(`/pullzone/${pullZoneId}`, apiKey);
export const purgePullZone = (apiKey, pullZoneId) =>
  request(`/pullzone/${pullZoneId}/purgeCache`, apiKey, { method: 'POST' });
export const apiGet = (apiKey, path) => request(path, apiKey, { method: 'GET' });

export function generateInternalZoneName(prefix = 'plint') {
  return `${prefix}-${randomBytes(4).toString('hex')}`;
}

export async function findStorageZoneByName(apiKey, name, listImpl = listStorageZones) {
  const zones = await listImpl(apiKey);
  return zones.find((zone) => zone.Name === name) ?? null;
}

export async function findPullZoneByName(apiKey, name, listImpl = listPullZones) {
  const zones = await listImpl(apiKey);
  return zones.find((zone) => zone.Name === name) ?? null;
}

export async function probeManagementApi(apiKey = '', fetchImpl = fetch) {
  const response = await fetchImpl(`${BASE_URL}/storagezone`, {
    headers: apiKey ? { AccessKey: apiKey } : {}
  });
  return {
    reachable: response.ok,
    status: response.status
  };
}

export async function resolveZoneReference(apiKey, reference) {
  const needle = normalizeZoneReference(reference);
  const zones = await listStorageZones(apiKey);

  for (const zone of zones) {
    for (const pullZone of zone.PullZones ?? []) {
      const hostname = getSystemHostname(pullZone);
      if (zone.Name === needle || hostname === needle) {
        return {
          zoneId: zone.Id,
          zoneName: zone.Name,
          pullZoneId: pullZone.Id ?? null,
          pullZoneUrl: hostname ? `https://${hostname}` : null
        };
      }
    }

    if (zone.Name === needle) {
      return {
        zoneId: zone.Id,
        zoneName: zone.Name,
        pullZoneId: null,
        pullZoneUrl: null
      };
    }
  }

  const error = new Error(`No Bunny zone matched "${reference}".`);
  error.code = ERROR_CODES.ZONE_NOT_FOUND;
  throw error;
}
