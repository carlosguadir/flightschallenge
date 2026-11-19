import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const SRC = path.resolve(process.cwd(), 'src');
const LAYERS = new Set(['domain', 'application', 'infrastructure']);
const CORE_MODULES = new Set(['config', 'validation']);
const IMPORT_RE = /(?:from\s+|import\s*\()\s*['"]([^'"]+)['"]/g;

interface SourceFile {
  absolutePath: string;
  relativePath: string;
  moduleName: string;
  layer: string | undefined;
}

async function walk(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await walk(absolutePath)));
    } else if (entry.isFile() && entry.name.endsWith('.ts')) {
      files.push(absolutePath);
    }
  }

  return files;
}

function toSourceFile(absolutePath: string): SourceFile {
  const relativePath = path.relative(SRC, absolutePath).split(path.sep).join('/');
  const [moduleName = '', layer] = relativePath.split('/');
  return {
    absolutePath,
    relativePath,
    moduleName,
    layer: LAYERS.has(layer ?? '') ? layer : undefined,
  };
}

function violationsFor(file: SourceFile, source: string): string[] {
  if (file.layer !== 'domain' && file.layer !== 'application') return [];

  const violations: string[] = [];
  for (const match of source.matchAll(IMPORT_RE)) {
    const specifier = match[1];
    if (!specifier.startsWith('.')) continue;

    const resolved = path.resolve(path.dirname(file.absolutePath), specifier);
    const target = path.relative(SRC, resolved).split(path.sep).join('/');
    const segments = target.split('/');
    const targetModule = segments[0];

    if (target.startsWith('..')) {
      violations.push(`${file.relativePath} imports outside src: ${specifier}`);
      continue;
    }

    if (segments.includes('infrastructure')) {
      violations.push(`${file.relativePath} imports infrastructure: ${specifier}`);
      continue;
    }

    if (targetModule === file.moduleName) {
      if (
        file.layer === 'domain' &&
        (segments.includes('application') || segments.includes('infrastructure'))
      ) {
        violations.push(`${file.relativePath} imports an outer layer: ${specifier}`);
      }
      continue;
    }

    const isPublicIndex = target === targetModule || target === `${targetModule}/index`;

    if (targetModule === 'shared-kernel' && !isPublicIndex) {
      violations.push(`${file.relativePath} imports shared-kernel internals: ${specifier}`);
      continue;
    }

    if (CORE_MODULES.has(targetModule)) continue;

    if (!isPublicIndex) {
      violations.push(`${file.relativePath} imports another module's internals: ${specifier}`);
    }
  }

  return violations;
}

describe('10.21 architecture boundaries', () => {
  it('forbids application/domain imports of infrastructure or module internals', async () => {
    const files = (await walk(SRC)).map(toSourceFile);
    const violations: string[] = [];

    for (const file of files) {
      const source = await readFile(file.absolutePath, 'utf8');
      violations.push(...violationsFor(file, source));
    }

    expect(violations).toEqual([]);
  });
});
