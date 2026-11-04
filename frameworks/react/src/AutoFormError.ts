import type { FormError, PathKey } from '@auto-formisch/core';

/**
 * Thrown when `<AutoForm>` mounts with Widgets or `overrides` that don't fit
 * its form. Carries every error at once; `path` locates the value at fault,
 * starting at `components` (the Definition) or `overrides` (the prop).
 */
export class AutoFormError extends Error {
  readonly errors: readonly FormError[];

  constructor(errors: readonly FormError[]) {
    super(
      `Invalid AutoForm setup:\n${errors
        .map((error) => `- ${formatPath(error.path)}: ${error.message}`)
        .join('\n')}`,
    );
    this.name = 'AutoFormError';
    this.errors = errors;
  }
}

const formatPath = (path: readonly PathKey[]) => (path.length === 0 ? '(root)' : path.join('.'));
