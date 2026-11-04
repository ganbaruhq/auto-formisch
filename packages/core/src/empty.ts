/**
 * The one definition of an empty value: `undefined`, `null`, `''`, a string of
 * only whitespace, or `[]`. `0` and `false` are values. Whitespace only decides
 * emptiness; a value with content is never trimmed.
 */
export const isEmpty = (value: unknown): boolean =>
  value === undefined ||
  value === null ||
  (typeof value === 'string' && value.trim() === '') ||
  (Array.isArray(value) && value.length === 0);
