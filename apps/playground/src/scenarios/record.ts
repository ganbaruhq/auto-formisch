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
