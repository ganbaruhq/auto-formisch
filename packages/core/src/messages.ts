import type * as v from 'valibot';

/** The message of a required error: a string, or a function of the issue, as in Valibot. */
export type RequiredMessage = v.ErrorMessage<v.CheckIssue<unknown>>;

let store: Map<string | undefined, RequiredMessage> | undefined;

/**
 * Sets the message of a required error, for one language or, without `lang`,
 * for validation that runs with no language. Shaped like Valibot's
 * `setSpecificMessage`. A Field's `requiredMessage` still takes priority.
 *
 * Valibot's `setGlobalMessage` doesn't reach required errors: they always
 * carry a message of their own, so the internal value never shows.
 */
export function setRequiredMessage(message: RequiredMessage, lang?: string): void {
  store ??= new Map();
  store.set(lang, message);
}

/** Deletes a message set with `setRequiredMessage`, like Valibot's `deleteSpecificMessage`. */
export function deleteRequiredMessage(lang?: string): void {
  store?.delete(lang);
}

/** The message set for `lang`, if any. Like Valibot, there is no fallback to another language. */
export const getRequiredMessage = (lang: string | undefined): RequiredMessage | undefined =>
  store?.get(lang);
