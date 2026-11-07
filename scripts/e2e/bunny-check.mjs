// Independent check of what really exists on Bunny, bypassing plint's own code.
// Usage:
//   node bunny-check.mjs state <project>          -> JSON: zones + every stored file (recursive)
//   node bunny-check.mjs gone <storageId> <pullId> -> exit 0 if both zones are deleted
import { readFileSync } from 'node:fs';

const home = process.env.HOME;
const apiKey = JSON.parse(readFileSync(`${home}/.plint/config.json`, 'utf8')).apiKey;
const api = (path) =>
  fetch(`https://api.bunny.net${path}`, { headers: { AccessKey: apiKey, Accept: 'application/json' } });

const [mode, a, b] = process.argv.slice(2);

if (mode === 'state') {
  const state = JSON.parse(readFileSync(`${home}/.plint/state.json`, 'utf8'));
  const binding = state.projects?.[a]?.binding;
  if (!binding) { console.log(JSON.stringify({ error: 'no binding in state.json' })); process.exit(1); }
  const sz = await api(`/storagezone/${binding.storage_zone_id}`);
  const szJson = sz.ok ? await sz.json() : null;
  const pz = await api(`/pullzone/${binding.pull_zone_id}`);
  const pzJson = pz.ok ? await pz.json() : null;

  const files = [];
  async function walk(dir) {
    const res = await fetch(`https://${binding.storage_hostname}/${binding.zone_name}/${dir}`, {
      headers: { AccessKey: binding.zone_password, Accept: 'application/json' }
    });
    if (!res.ok) throw new Error(`storage list ${dir}: ${res.status}`);
    for (const item of await res.json()) {
      const rel = `${dir}${item.ObjectName}`;
      if (item.IsDirectory) await walk(`${rel}/`);
      else files.push({ path: rel, size: item.Length });
    }
  }
  await walk('');
  files.sort((x, y) => x.path.localeCompare(y.path));
  console.log(JSON.stringify({
    storage_zone: szJson && { id: szJson.Id, name: szJson.Name, deleted: szJson.Deleted },
    pull_zone: pzJson && {
      id: pzJson.Id,
      origin_storage_zone_id: pzJson.StorageZoneId,
      hostnames: (pzJson.Hostnames ?? []).map((h) => h.Value)
    },
    linked: pzJson?.StorageZoneId === Number(binding.storage_zone_id),
    name_matches: szJson?.Name === binding.zone_name,
    hostname_matches: (pzJson?.Hostnames ?? []).some((h) => h.Value === binding.pull_zone_hostname),
    file_count: files.length,
    total_bytes: files.reduce((s, f) => s + f.size, 0),
    files
  }));
} else if (mode === 'gone') {
  const sz = await api(`/storagezone/${a}`);
  const szGone = sz.status === 404 || (sz.ok && (await sz.json()).Deleted === true);
  const pz = await api(`/pullzone/${b}`);
  const pzGone = pz.status === 404 || (pz.ok && (await pz.json()).Deleted === true);
  console.log(JSON.stringify({ storage_gone: szGone, pull_gone: pzGone, storage_status: sz.status, pull_status: pz.status }));
  process.exit(szGone && pzGone ? 0 : 1);
} else {
  console.error('usage: state <project> | gone <storageId> <pullId>');
  process.exit(2);
}
