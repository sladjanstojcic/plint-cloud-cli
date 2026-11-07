const CACHE_PURGE_LABELS = {
  purged: 'cache purged',
  failed: 'cache purge failed',
  skipped: 'no CDN cache'
};

export function printDeploySummary(payload, stdout = process.stdout) {
  const action = payload.created ? 'created' : 'updated';
  const purge = CACHE_PURGE_LABELS[payload.cache_purge] ?? payload.cache_purge;
  stdout.write(`Deployed ${payload.project} (${action})\n`);
  stdout.write(`${payload.url}\n`);
  stdout.write(`Path: ${payload.local_path}\n`);
  stdout.write(
    `${payload.uploaded} uploaded, ${payload.deleted} deleted, ${payload.unchanged} unchanged · ${payload.bytes} bytes · ${purge}\n`
  );
  for (const warning of payload.warnings ?? []) stdout.write(`Warning: ${warning.message}\n`);
  if (payload.warning) stdout.write(`Warning: ${payload.warning}\n`);
}
