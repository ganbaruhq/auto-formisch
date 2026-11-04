import type { CompiledForm } from './compile';
import type { FormDefinition } from './definition';
import type { FormError, PathKey } from './errors';
import { fieldsIn } from './fields';

/*
 * Pure functions over a Wizard's Pages. A Wizard always validates as one whole
 * form; Pages only decide which errors block a step and which are shown. A
 * Renderer navigates with these, and a server can check one step with them.
 */

/**
 * The Pages shown for `input`, by their index in the Definition's `pages`, in
 * order. A Page hidden by its `visible` leaves the list. Empty for a form
 * without Pages.
 */
export function shownPages(form: CompiledForm, input: unknown): number[] {
  const { pages = [] } = form.definition;
  const state = form.conditions.evaluate(input);
  return pages.flatMap((page, index) => (state.isVisible(page, []) ? [index] : []));
}

const pageByName = new WeakMap<FormDefinition, ReadonlyMap<string, number>>();

/**
 * The index of the Page holding the Field a data path, such as an error's,
 * leads into. Its first segment decides: a name is unique across the Pages,
 * and no `object` or Repeater spans two of them. `undefined` when no Page
 * holds it, or the form has no Pages.
 */
export function pageOf(form: CompiledForm, path: readonly PathKey[]): number | undefined {
  const { definition } = form;
  let names = pageByName.get(definition);
  if (names === undefined) {
    names = new Map(
      (definition.pages ?? []).flatMap((page, index) =>
        fieldsIn(page.components).map((field) => [field.name, index] as const),
      ),
    );
    pageByName.set(definition, names);
  }
  const [first] = path;
  return typeof first === 'string' ? names.get(first) : undefined;
}

/**
 * The errors on the Pages at `pages`, such as those a step up to some Page
 * must clear. An error no Page holds is kept too: no step can show it, yet it
 * fails the whole form.
 */
export function pageErrors(
  form: CompiledForm,
  errors: readonly FormError[],
  pages: readonly number[],
): FormError[] {
  return errors.filter((error) => {
    const page = pageOf(form, error.path);
    return page === undefined || pages.includes(page);
  });
}
