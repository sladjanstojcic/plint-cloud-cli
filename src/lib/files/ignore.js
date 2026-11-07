import { readFile } from 'node:fs/promises';
import ignore from 'ignore';
import { join } from 'node:path';
import { secretPathWarning } from '../preflight/index.js';
import { pushWarning } from './warnings.js';

const HARD_EXCLUDES = ['.git/', 'node_modules/', '.DS_Store', '.env', '.env.*', '*.pem', '*.key'];
const hasHiddenSegment = (relativePath) => relativePath.split('/').some((segment) => segment.startsWith('.'));

const USER_IGNORE_FILES = ['.gitignore', '.plintignore'];

// Matcher for the user ignore files in one directory, or null when it has none.
async function readUserIgnores(dir) {
  let matcher = null;
  for (const filename of USER_IGNORE_FILES) {
    try {
      const text = await readFile(join(dir, filename), 'utf8');
      matcher = (matcher ?? ignore()).add(text);
    } catch {
      // missing or unreadable ignore file: nothing to add
    }
  }
  return matcher;
}

export async function buildIgnoreRules(rootDir) {
  return { hard: ignore().add(HARD_EXCLUDES), user: (await readUserIgnores(rootDir)) ?? ignore(), nested: [] };
}

// Rules for a subdirectory: its own .gitignore/.plintignore apply to paths below it,
// on top of every ancestor's. (A nested "!pattern" cannot re-include what an ancestor
// excluded; plint errs on the side of not publishing.)
export async function rulesForSubdirectory(rules, absoluteDir, relativeDir) {
  const matcher = await readUserIgnores(absoluteDir);
  if (!matcher) return rules;
  return { ...rules, nested: [...rules.nested, { base: `${relativeDir}/`, matcher }] };
}

function nestedIgnores(relativePath, nested) {
  return nested.some(({ base, matcher }) => {
    if (!relativePath.startsWith(base)) return false;
    const inner = relativePath.slice(base.length);
    return inner !== '' && (matcher.ignores(inner) || matcher.ignores(inner.replace(/\/$/, '')));
  });
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
  return (
    rules.user.ignores(relativePath) ||
    rules.user.ignores(cleanPath) ||
    nestedIgnores(relativePath, rules.nested)
  );
}
