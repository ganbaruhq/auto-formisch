import { useEffect, useState } from 'react';

/**
 * Sends a Definition with nested object and Repeater defaults to a Web Worker
 * that compiles it with `@auto-formisch/core` alone, and shows what comes back.
 */
const definition = {
  version: 1,
  components: [
    {
      type: 'object',
      name: 'address',
      components: [{ type: 'text', name: 'city', default: 'Hanoi' }],
    },
    {
      type: 'repeater',
      name: 'rows',
      default: [{}, { title: 'Second' }],
      components: [
        { type: 'text', name: 'title', default: 'Untitled' },
        { type: 'multi_choice', name: 'tags', choices: ['a', 'b'], default: ['a'] },
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
    worker.postMessage({ definition, input: { address: { city: 'Hue' }, rows: [] } });
    return () => worker.terminate();
  }, []);
  return <pre id="worker">{JSON.stringify(result, null, 2)}</pre>;
}
