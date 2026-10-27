import type { FormDefinition } from 'auto-formisch-core';
import { fromDefinition } from 'auto-formisch-json';

/** Compile an editable, versioned definition into Valibot and a UI schema. */
export function buildForm(definition: FormDefinition) {
  return fromDefinition(definition);
}
export type { FormDefinition, FieldDefinition, FieldUI, UISchema } from 'auto-formisch-core';
