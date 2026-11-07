import { collectDoctor } from '../lib/doctor.js';
import { writeJsonSuccess } from '../lib/output.js';

export default async function doctor(
  _args = [],
  context = {},
  deps = { collectDoctor }
) {
  const data = await deps.collectDoctor();
  if (context.json) {
    writeJsonSuccess('doctor', data, context.stdout);
    return;
  }

  console.log('CHECK               OK   DETAIL');
  for (const check of data.checks) {
    console.log(`${check.name.padEnd(18)} ${String(check.ok).padEnd(4)} ${check.detail}`);
  }
}
