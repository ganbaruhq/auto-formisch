import type { PathKey } from '@auto-formisch/core';

/*
 * Data paths as Formisch's functions take them. Paths come from a JSON
 * Definition, so they cannot be typed against the schema, whose input type is
 * a record of `unknown` leaves with no arrays: this is the one place that
 * says so.
 */

/** A path to any Field, typed as one key of the root record. */
export const storePath = (path: readonly PathKey[]): [string] => path as unknown as [string];

/** A path to a Repeater's field array, which the schema's input type has none of. */
export const arrayPath = (path: readonly PathKey[]): never => path as never;

/** The path of the root Field, `[]`: the whole form, which reads its whole input. */
export const ROOT_PATH = storePath([]);
