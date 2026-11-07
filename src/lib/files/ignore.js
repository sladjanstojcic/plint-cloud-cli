import { readFile } from 'node:fs/promises';
import ignore from 'ignore';
import { join } from 'node:path';
import { secretPathWarning } from '../preflight/index.js';
import { pushWarning } from './warnings.js';

const HARD_EXCLUDES = ['.git/', 'node_modules/', '.DS_Store', '.env', '.env.*', '*.pem', '*.key'];
const hasHiddenSegment = (relativePath) => relativePath.split('/').some((segment) => segment.startsWith('.'));

async function addIgnoreFile(matcher, rootDir, filename) {
  try {
    return matcher.add(await readFile(join(rootDir, filename), 'utf8'));
  } catch {
    return matcher;
  }
}

export async function buildIgnoreRules(rootDir) {
  let user = ignore();
  user = await addIgnoreFile(user, rootDir, '.gitignore');
  user = await addIgnoreFile(user, rootDir, '.plintignore');
  return { hard: ignore().add(HARD_EXCLUDES), user };
}

export function isExcluded(relativePath, rules, warnings) {
  const cleanPath = relativePath.replace(/\/$/, '');
  const hardHit = rules.hard.ignores(relativePath) || rules.hard.ignores(cleanPath);
  const hiddenHit = cleanPath === '.plint' || hasHiddenSegment(cleanPath);
  if (hardHit || hiddenHit) {
    const warning = secretPathWarning(cleanPath);
    if (warning) pushWarning(warnings, warning);
    return true;
  }
  return rules.user.ignores(relativePath) || rules.user.ignores(cleanPath);
}
