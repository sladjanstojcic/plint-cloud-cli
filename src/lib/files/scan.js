import { lstat, readdir, stat } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { ERROR_CODES } from '../error-codes.js';
import { buildIgnoreRules, isExcluded } from './ignore.js';
import { buildFileRecord, toRelativePath } from './records.js';
import {
  pushWarning,
  specialFileWarning,
  symlinkWarning,
  unreadableWarning
} from './warnings.js';

function pathNotSupportedError(resolvedPath) {
  const error = new Error(
    `Path is not a regular file or directory: ${resolvedPath}`
  );
  error.code = ERROR_CODES.PATH_NOT_SUPPORTED;
  return error;
}

export async function walkLocalFiles(rootDir) {
  const resolvedRoot = resolve(rootDir);
  const rules = await buildIgnoreRules(resolvedRoot);
  const files = [];
  const warnings = [];

  async function walk(currentDir) {
    let entries;
    try {
      entries = await readdir(currentDir, { withFileTypes: true });
    } catch (error) {
      if (error.code === 'EACCES' || error.code === 'EPERM') {
        pushWarning(warnings, unreadableWarning(toRelativePath(resolvedRoot, currentDir)));
        return;
      }
      throw error;
    }

    for (const entry of entries) {
      const absolutePath = join(currentDir, entry.name);
      const relativePath = toRelativePath(resolvedRoot, absolutePath);
      if (entry.isDirectory() && isExcluded(`${relativePath}/`, rules, warnings)) continue;
      if (!entry.isDirectory() && isExcluded(relativePath, rules, warnings)) continue;

      let stats;
      try {
        stats = await lstat(absolutePath);
      } catch (error) {
        if (error.code === 'EACCES' || error.code === 'EPERM') {
          pushWarning(warnings, unreadableWarning(relativePath));
          continue;
        }
        throw error;
      }

      if (stats.isSymbolicLink()) {
        pushWarning(warnings, symlinkWarning(relativePath));
        continue;
      }
      if (stats.isDirectory()) {
        await walk(absolutePath);
        continue;
      }
      if (!stats.isFile()) {
        pushWarning(warnings, specialFileWarning(relativePath));
        continue;
      }
      files.push(await buildFileRecord(resolvedRoot, absolutePath));
    }
  }

  await walk(resolvedRoot);
  return { files: files.sort((left, right) => left.path.localeCompare(right.path)), warnings };
}

export async function buildSingleFileEntry(projectDir, filePath) {
  const resolvedProjectDir = resolve(projectDir);
  const resolvedFilePath = resolve(filePath);
  const relativePath = toRelativePath(resolvedProjectDir, resolvedFilePath);
  const rules = await buildIgnoreRules(resolvedProjectDir);
  const warnings = [];

  if (relativePath.startsWith('../')) {
    throw new Error('Single-file deploy target must be inside the current working directory.');
  }
  if (isExcluded(relativePath, rules, warnings)) {
    const error = new Error('Single-file deploy target is excluded by plint rules.');
    error.code = ERROR_CODES.PATH_EXCLUDED;
    error.warnings = warnings;
    throw error;
  }

  const stats = await lstat(resolvedFilePath);
  if (stats.isSymbolicLink()) throw new Error('Single-file deploy target cannot be a symlink.');
  if (!stats.isFile()) throw pathNotSupportedError(resolvedFilePath);
  return buildFileRecord(resolvedProjectDir, resolvedFilePath);
}

export async function scanLocalTarget(path) {
  const resolvedPath = resolve(path);
  const target = await stat(resolvedPath).catch(() => null);
  if (!target) {
    const error = new Error(`Path not found: ${resolvedPath}`);
    error.code = ERROR_CODES.PATH_NOT_FOUND;
    throw error;
  }
  if (target.isFile()) {
    const file = await buildSingleFileEntry(dirname(resolvedPath), resolvedPath);
    return { path: resolvedPath, targetType: 'file', files: [file], warnings: [] };
  }
  if (!target.isDirectory()) {
    throw pathNotSupportedError(resolvedPath);
  }
  const result = await walkLocalFiles(resolvedPath);
  return { path: resolvedPath, targetType: 'directory', files: result.files, warnings: result.warnings };
}
