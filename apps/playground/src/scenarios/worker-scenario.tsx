import { useEffect, useState } from 'react';

/**
 * Sends a Definition with nested object and Repeater defaults, custom-type
 * objects among them, to a Web Worker that compiles it with
 * `@auto-formisch/core` alone, and shows what comes back.
 */
const definition = {
  version: 1,
  components: [
    {
      type: 'object',
      name: 'address',
      components: [
        { type: 'text', name: 'city', default: 'Hanoi' },
        { type: 'place', name: 'spot', default: { lat: 21, lng: 105 } },
      ],
    },
    {
      type: 'repeater',
      name: 'rows',
      default: [{}, { title: 'Second' }],
      components: [
        { type: 'text', name: 'title', default: 'Untitled' },
        { type: 'multi_choice', name: 'tags', choices: ['a', 'b'], default: ['a'] },
        { type: 'place', name: 'at', default: { lat: 16, lng: 107 } },
      ],
    },
  ],
};

export function WorkerScenario() {
  const [result, setResult] = useState<unknown>('running');
  useEffect(() => {
    const worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (event) => setResult(event.data);
    worker.onerror = (event) => setResult({ workerError: event.message });
    worker.postMessage({
      definition,
      input: { address: { city: 'Hue', spot: { lat: 100, lng: 0 } }, rows: [] },
    });
    return () => worker.terminate();
  }, []);
  return <pre id="worker">{JSON.stringify(result, null, 2)}</pre>;
}
