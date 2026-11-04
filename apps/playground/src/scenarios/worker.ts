import * as v from 'valibot';
import { compile, defineFieldType } from '@auto-formisch/core';

/** A custom Field Type whose value is an object, registered in the Worker itself. */
const place = defineFieldType({
  type: 'place',
  schema: v.object({
    lat: v.pipe(v.number(), v.minValue(-90), v.maxValue(90)),
    lng: v.pipe(v.number(), v.minValue(-180), v.maxValue(180)),
  }),
});

interface Place {
  lat: number;
  lng: number;
}

/**
 * Compiles a Definition received as plain data, reads `compiled.defaults`
 * twice and changes one copy, nested custom-type objects included, then
 * validates: core alone, with no DOM.
 */
self.onmessage = (event: MessageEvent<{ definition: unknown; input: unknown }>) => {
  try {
    const compiled = compile(event.data.definition, { fieldTypes: [place] });
    const first = compiled.defaults as {
      address: { city?: string; spot?: Place };
      rows: { tags?: string[]; at?: Place }[];
    };
    const second = compiled.defaults;
    first.address.city = 'changed';
    first.address.spot!.lat = 99;
    first.rows[0].tags?.push('changed');
    first.rows[0].at!.lng = 99;
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
