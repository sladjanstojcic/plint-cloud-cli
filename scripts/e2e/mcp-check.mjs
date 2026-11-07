// MCP smoke checks against an existing project, over raw stdio JSON-RPC.
// Usage: node mcp-check.mjs <plint-binary> <existing-project> <site-dir>
import { checker, startMcp } from './mcp-client.mjs';

const [plint, project, site] = process.argv.slice(2);
const mcp = startMcp(plint);
const { rpc, call } = mcp;
const result = checker();
const check = result.check;

try {
  const init = await mcp.init();
  check('initialize returns serverInfo plint', init.result?.serverInfo?.name === 'plint', JSON.stringify(init));

  const tools = (await rpc('tools/list', {})).result.tools.map((t) => t.name).sort();
  check('tools/list has 10 tools', tools.length === 10, tools.join(','));

  const doctor = await call('plint_doctor', {});
  check('plint_doctor ok', !doctor.isError, JSON.stringify(doctor).slice(0, 300));

  const list = await call('plint_list', {});
  check('plint_list includes project', JSON.stringify(list).includes(project), JSON.stringify(list).slice(0, 300));

  const insp = await call('plint_inspect', { project });
  const reveal = await call('plint_inspect', { project, reveal: true });
  const pw = reveal.structuredContent?.binding?.zone_password ?? '';
  check('plint_inspect reveal returns password', pw.length > 20, JSON.stringify(reveal).slice(0, 300));
  check('plint_inspect default hides password', !JSON.stringify(insp).includes(pw), 'password leaked');

  const dry = await call('plint_deploy', { path: site, project, dry_run: true });
  check('plint_deploy dry_run on existing ok', !dry.isError && dry.structuredContent?.dry_run === true, JSON.stringify(dry).slice(0, 300));
  check('plint_deploy dry_run reports 0 uploads (unchanged)', dry.structuredContent?.uploaded === 0, JSON.stringify(dry.structuredContent));

  const missing = await call('plint_deploy', { path: '/nope/plint-missing', project, dry_run: true });
  check('dry_run missing path -> PATH_NOT_FOUND', missing.structuredContent?.code === 'PATH_NOT_FOUND', JSON.stringify(missing).slice(0, 300));

  const unsafe = await call('plint_deploy', { path: '/', project });
  check('deploy / -> PATH_UNSAFE', unsafe.structuredContent?.code === 'PATH_UNSAFE', JSON.stringify(unsafe).slice(0, 300));

  const rel = await rpc('tools/call', { name: 'plint_deploy', arguments: { path: 'relative/dir', project } });
  check('relative path rejected', Boolean(rel.error || rel.result?.isError), JSON.stringify(rel).slice(0, 300));

  const nf = await call('plint_deploy', { path: site, project: 'mcp-nope-nope' });
  check('unknown project without create -> PROJECT_NOT_FOUND', nf.structuredContent?.code === 'PROJECT_NOT_FOUND', JSON.stringify(nf).slice(0, 300));

  const files = await call('plint_files', { project });
  check('plint_files returns index.html', JSON.stringify(files).includes('index.html'), JSON.stringify(files).slice(0, 200));

  const est = await call('plint_estimate', { path: site });
  check('plint_estimate ok', !est.isError, JSON.stringify(est).slice(0, 300));

  check('no non-JSON bytes on MCP stdout', mcp.nonJsonStdout === 0, `${mcp.nonJsonStdout} lines`);
} catch (error) {
  check('mcp session', false, `${error.message}\nstderr: ${mcp.stderr.slice(0, 500)}`);
} finally {
  mcp.close();
}
process.exit(result.failed ? 1 : 0);
