import type { Component, PathKey } from '@auto-formisch/core';
import { Field } from './Field';

interface ComponentsProps {
  readonly components: readonly Component[];
  /** The data path of the scope these Components belong to. */
  readonly scope: readonly PathKey[];
}

/**
 * Renders a list of Components in Definition order. Every Component today is a
 * single-value Field; Layouts, Content, `object` and Repeater dispatch here by
 * `type`, and a Layout passes its own `scope` through unchanged.
 */
export function Components({ components, scope }: ComponentsProps) {
  return components.map((node) => (
    <Field key={node.name} node={node} path={[...scope, node.name]} />
  ));
}
