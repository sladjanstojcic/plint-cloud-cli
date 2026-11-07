// Full project lifecycle through every MCP tool, over raw stdio JSON-RPC.
// Usage: node mcp-lifecycle.mjs <plint-binary> <new-project> <site-dir> <single-file>
// Prints "ZONES <storage-id> <pull-id>" so the caller can confirm deletion on Bunny.
import { checker, startMcp } from './mcp-client.mjs';

const [plint, project, site, single] = process.argv.slice(2);
const mcp = startMcp(plint);
const { call } = mcp;
const result = checker('mcp-life');
const check = result.check;
const brief = (r) => JSON.stringify(r).slice(0, 300);

try {
  await mcp.init();

  const created = await call('plint_deploy', { path: site, project, create: true });
  check('deploy create', !created.isError && created.structuredContent?.created === true, brief(created));
  const url = created.structuredContent?.url;

  const again = await call('plint_deploy', { path: site, project });
  check('redeploy uploads nothing', again.structuredContent?.uploaded === 0, brief(again));

  const one = await call('plint_deploy', { path: single, project });
  check('single file into same project', !one.isError && one.structuredContent?.uploaded === 1, brief(one));

  const [files, dry] = await Promise.all([
    call('plint_files', { project }),
    call('plint_deploy', { path: site, project, dry_run: true })
  ]);
  check('parallel calls in one session both answer', !files.isError && !dry.isError, `${brief(files)} ${brief(dry)}`);
  check('files lists the single file', JSON.stringify(files).includes(single.split('/').pop()), brief(files));
  check('dry-run after single file would delete it (folder mirror)', dry.structuredContent?.deleted === 1, brief(dry.structuredContent));

  const history = await call('plint_history', { project });
  const entries = history.structuredContent?.entries ?? [];
  check('history has 3 deploys', entries.length === 3, brief(history.structuredContent));
  const limited = await call('plint_history', { project, limit: 1 });
  check('history limit 1', (limited.structuredContent?.entries ?? []).length === 1, brief(limited.structuredContent));

  const purge = await call('plint_purge', { project });
  check('purge', !purge.isError, brief(purge));

  const repair = await call('plint_repair', {});
  check('repair defaults to dry run', !repair.isError && repair.structuredContent?.dry_run === true, brief(repair));

  const inspect = await call('plint_inspect', { project, reveal: true });
  const binding = inspect.structuredContent?.binding ?? {};
  console.log(`ZONES ${binding.storage_zone_id} ${binding.pull_zone_id}`);
  check('single file into a folder project keeps the root URL', one.structuredContent?.url === url && inspect.structuredContent?.url === url, brief(inspect.structuredContent));

  const bad = await call('plint_inspect', { project: 'Bad--Name' });
  check('invalid name -> PROJECT_INVALID or NOT_FOUND', ['PROJECT_INVALID', 'PROJECT_NOT_FOUND'].includes(bad.structuredContent?.code), brief(bad));
  check('error text carries the code', /^[A-Z_]+: /.test(bad.content?.[0]?.text ?? ''), brief(bad));

  const destroyed = await call('plint_destroy', { project });
  check('destroy', !destroyed.isError, brief(destroyed));
  const after = await call('plint_inspect', { project });
  check('inspect after destroy -> PROJECT_NOT_FOUND', after.structuredContent?.code === 'PROJECT_NOT_FOUND', brief(after));
  const reuse = await call('plint_deploy', { path: site, project, create: true });
  check('destroyed name is reserved', reuse.structuredContent?.code === 'PROJECT_NAME_RESERVED', brief(reuse));
  const hist = await call('plint_history', { project: 'never-existed-zz' });
  check('history of a never-deployed project is empty (history outlives projects)', !hist.isError && hist.structuredContent?.entries?.length === 0, brief(hist));
  check('no non-JSON bytes on stdout', mcp.nonJsonStdout === 0, `${mcp.nonJsonStdout} lines`);
} catch (error) {
  check('mcp session', false, `${error.message}\nstderr: ${mcp.stderr.slice(0, 500)}`);
} finally {
  mcp.close();
}
process.exit(result.failed ? 1 : 0);
