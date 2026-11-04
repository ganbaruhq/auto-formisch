import { expect, it } from 'vite-plus/test';
import pkg from '../package.json';

it('runs with no DOM', () => {
  expect(typeof document).toBe('undefined');
  expect(typeof window).toBe('undefined');
});

it('depends on nothing but its Valibot and TypeScript peers', () => {
  const declared = {
    ...(pkg as { dependencies?: object }).dependencies,
    ...pkg.peerDependencies,
  };
  expect(Object.keys(declared).sort()).toEqual(['typescript', 'valibot']);
});

it('imports nothing from React, the DOM, Node or Formisch', () => {
  const sources = import.meta.glob('./**/*.ts', { query: '?raw', import: 'default', eager: true });
  const imported = new Set<string>();
  for (const [file, source] of Object.entries(sources)) {
    if (file.endsWith('.test.ts')) continue;
    for (const match of source.matchAll(/\bfrom\s+'([^']+)'|\bimport\(\s*'([^']+)'/g)) {
      const specifier = match[1] ?? match[2];
      if (!specifier.startsWith('.')) imported.add(specifier);
    }
  }
  expect([...imported]).toEqual(['valibot']);
});
