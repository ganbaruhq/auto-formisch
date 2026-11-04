// @vitest-environment node
import { describe, expect, it } from 'vite-plus/test';
import { compile, DefinitionError } from '@auto-formisch/core';
import { extensions } from './examples/extensions';

// Keeps every code sample in the docs working. A `ts`, `tsx` or `json` block
// must follow a marker comment:
//
// - `<!-- example: docs/examples/file.tsx#name -->`: the block is the region
//   between `// #region name` and `// #endregion name` of that file (the whole
//   file without `#region`), which the other tests in this folder run and
//   `pnpm typecheck` checks.
// - `<!-- check: definition -->` or `<!-- check: components -->`: the block is
//   a Form Definition, or a list of Components, that `compile` accepts.
// - `<!-- check: invalid -->`: a Form Definition that `compile` rejects.

declare global {
  interface ImportMeta {
    glob(
      pattern: string | readonly string[],
      options: { query: '?raw'; import: 'default'; eager: true },
    ): Record<string, string>;
  }
}

const pages = import.meta.glob(
  ['../README.md', './*.md', '../packages/*/README.md', '../frameworks/*/README.md'],
  { query: '?raw', import: 'default', eager: true },
);
const sources = import.meta.glob('./examples/*.{ts,tsx,json}', {
  query: '?raw',
  import: 'default',
  eager: true,
});

/** A glob key for a path from the repository root. */
const keyOf = (path: string) => (path.startsWith('docs/') ? `./${path.slice(5)}` : `../${path}`);
const fromRoot = (key: string) => (key.startsWith('./') ? `docs/${key.slice(2)}` : key.slice(3));

const CHECKED = new Set(['ts', 'tsx', 'js', 'jsx', 'json', 'jsonc']);
const MARKER = /^<!-- (example|check): (\S+) -->$/;
const REGION = /^\s*\/\/ #(end)?region\b/;

interface Block {
  readonly where: string;
  readonly lang: string;
  readonly code: string;
  readonly marker?: { readonly kind: string; readonly target: string };
}

const dedent = (lines: readonly string[]) => {
  const indents = lines.filter((line) => line.trim()).map((line) => /^ */.exec(line)![0].length);
  const indent = Math.min(...indents);
  return lines.map((line) => line.slice(indent)).join('\n');
};

function blocksOf(file: string, text: string): Block[] {
  const lines = text.split('\n');
  const blocks: Block[] = [];
  for (let start = 0; start < lines.length; start++) {
    const fence = /^( *)```(\S*)$/.exec(lines[start]);
    if (fence === null) continue;
    const end = lines.findIndex((line, index) => index > start && line.trim() === '```');
    let before = start - 1;
    while (before >= 0 && lines[before].trim() === '') before--;
    const marker = before >= 0 ? MARKER.exec(lines[before].trim()) : null;
    blocks.push({
      where: `${fromRoot(file)}:${start + 1}`,
      lang: fence[2],
      code: dedent(lines.slice(start + 1, end)),
      marker: marker === null ? undefined : { kind: marker[1], target: marker[2] },
    });
    start = end;
  }
  return blocks;
}

function regionOf(path: string, name: string | undefined): string {
  const source = sources[keyOf(path)];
  if (source === undefined) throw new Error(`No example file ${path}`);
  let lines = source.trimEnd().split('\n');
  if (name !== undefined) {
    const start = lines.findIndex((line) => line.trim() === `// #region ${name}`);
    const end = lines.findIndex((line) => line.trim() === `// #endregion ${name}`);
    if (start < 0 || end < start) throw new Error(`No region "${name}" in ${path}`);
    lines = lines.slice(start + 1, end);
  }
  return dedent(lines.filter((line) => !REGION.test(line)));
}

const all = Object.entries(pages).flatMap(([file, text]) => blocksOf(file, text));

describe('code samples in the docs', () => {
  it('finds the docs', () => {
    expect(Object.keys(pages).map(fromRoot).sort()).toEqual([
      'README.md',
      'docs/guide.md',
      'docs/reference.md',
      'frameworks/react/README.md',
      'packages/core/README.md',
    ]);
    expect(all.length).toBeGreaterThan(20);
  });

  it('marks every code sample', () => {
    const unmarked = all.filter((block) => CHECKED.has(block.lang) && !block.marker);
    expect(unmarked.map((block) => block.where)).toEqual([]);
  });

  it.each(all.filter((block) => block.marker?.kind === 'example'))(
    '$where is the tested example',
    ({ code, marker }) => {
      const [path, name] = marker!.target.split('#');
      expect(code).toBe(regionOf(path, name));
    },
  );

  it.each(all.filter((block) => block.marker?.kind === 'check'))(
    '$where is a Definition that compile judges as marked',
    ({ code, marker }) => {
      const value: unknown = JSON.parse(code);
      const load = () =>
        compile(
          marker!.target === 'components' ? { version: 1, components: value } : value,
          extensions,
        );
      if (marker!.target === 'invalid') expect(load).toThrow(DefinitionError);
      else expect(load).not.toThrow();
    },
  );

  it('shows every example region somewhere', () => {
    const shown = new Set(
      all.flatMap((block) => (block.marker?.kind === 'example' ? [block.marker.target] : [])),
    );
    const regions = Object.entries(sources).flatMap(([key, source]) =>
      [...source.matchAll(/\/\/ #region (\S+)/g)].map((match) => `${fromRoot(key)}#${match[1]}`),
    );
    expect(regions.filter((region) => !shown.has(region))).toEqual([]);
  });
});
