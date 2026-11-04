import { defineRule } from '@auto-formisch/react';

declare global {
  interface Window {
    /** What the scenarios submitted, in order, for browser check scripts. */
    playgroundSubmissions?: unknown[];
  }
}

/** Keeps a submitted output where a browser check script can read it. */
export function record(output: unknown) {
  (window.playgroundSubmissions ??= []).push(output);
}

/** A custom Rule with a bug: its check throws on the text "boom". */
export const explode = defineRule({
  type: 'explode',
  appliesTo: ['text'],
  check: (value) => {
    if (value === 'boom') throw new Error('The explode Rule crashed');
    return true;
  },
});
