import type * as v from 'valibot';

/** One path segment: an object key or an array index. */
export type PathKey = string | number;

/**
 * The only error shape this package exposes, for both a Definition that fails
 * to load and a submission that fails to validate. `path` is a plain key path.
 */
export interface FormError {
  readonly message: string;
  readonly path: readonly PathKey[];
}

/** Thrown when a Form Definition fails to load. Carries every error at once. */
export class DefinitionError extends Error {
  readonly errors: readonly FormError[];

  constructor(errors: readonly FormError[]) {
    super(
      `Invalid Form Definition:\n${errors
        .map((error) => `- ${formatPath(error.path)}: ${error.message}`)
        .join('\n')}`,
    );
    this.name = 'DefinitionError';
    this.errors = errors;
  }
}

const formatPath = (path: readonly PathKey[]) => (path.length === 0 ? '(root)' : path.join('.'));

/**
 * Converts Valibot issues to `{message, path}`. Raw issues must never leave
 * this package: a required issue carries an internal symbol (ADR 0002).
 */
export const toFormErrors = (issues: readonly v.BaseIssue<unknown>[]): FormError[] =>
  issues.map((issue) => ({
    message: issue.message,
    path: (issue.path ?? []).map((item) =>
      typeof item.key === 'number' ? item.key : String(item.key),
    ),
  }));
