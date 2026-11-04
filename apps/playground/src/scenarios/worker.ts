import { compile } from '@auto-formisch/core';

/**
 * Compiles a Definition received as plain data, reads `compiled.defaults`
 * twice and changes one copy, then validates: core alone, with no DOM.
 */
self.onmessage = (event: MessageEvent<{ definition: unknown; input: unknown }>) => {
  try {
    const compiled = compile(event.data.definition);
    const first = compiled.defaults as {
      address: { city?: string };
      rows: { tags?: string[] }[];
    };
    const second = compiled.defaults;
    first.address.city = 'changed';
    first.rows[0].tags?.push('changed');
    self.postMessage({
      hasDocument: 'document' in self,
      defaults: compiled.defaults,
      secondCopy: second,
      changedCopy: first,
      validation: compiled['~standard'].validate(event.data.input),
      definitionRoundTrip:
        JSON.stringify(compiled.definition) === JSON.stringify(event.data.definition),
    });
  } catch (error) {
    self.postMessage({ error: String(error) });
  }
};
