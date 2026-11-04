import { expect, it } from 'vite-plus/test';

declare global {
  interface ImportMeta {
    glob(
      pattern: string,
      options: { query: '?raw'; import: 'default'; eager: true },
    ): Record<string, string>;
  }
}

// Formisch marks `useField`, `useFieldArray` and `useForm` `@__NO_SIDE_EFFECTS__`,
// so a production bundler drops a call whose result is unused. A component that
// calls one only to subscribe to what it reads then stops re-rendering in
// production builds, while every test, which runs unbundled, still passes: the
// Tab error counts did, in a real browser.
it('uses the result of every Formisch hook it calls', () => {
  const sources = import.meta.glob('./*.{ts,tsx}', {
    query: '?raw',
    import: 'default',
    eager: true,
  });
  expect(Object.keys(sources)).toContain('./Components.tsx');
  const bare: string[] = [];
  for (const [file, source] of Object.entries(sources)) {
    if (file.includes('.test.')) continue;
    for (const match of source.matchAll(/^\s*(?:void\s+)?(useField|useFieldArray|useForm)\(/gm)) {
      bare.push(`${file}: ${match[0].trim()}`);
    }
  }
  expect(bare).toEqual([]);
});
