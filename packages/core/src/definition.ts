/**
 * The Form Definition format, version 1.
 *
 * These types describe a Definition that has passed the loader. Add a new
 * Component `type` by adding its node type here, to the `Component` union, and
 * to the loader's table in `field-types.ts` (Fields) or a sibling table
 * (Layouts, Content).
 */

/** The only Form Definition format version this package reads. */
export const DEFINITION_VERSION = 1;

/** A serializable validation constraint declared on a Field. */
export interface RuleNode {
  readonly type: string;
  readonly requirement?: unknown;
  readonly message?: string;
}

/** Keys shared by every Field. */
export interface FieldBase {
  readonly type: string;
  readonly name: string;
  readonly label?: string;
  readonly description?: string;
  readonly widget?: string;
  readonly required?: boolean;
  readonly requiredMessage?: string;
}

/** A single-line or multi-line text value. */
export interface TextField extends FieldBase {
  readonly type: 'text';
  readonly placeholder?: string;
  readonly rules?: readonly RuleNode[];
}

/** Any Field this package knows. */
export type FieldNode = TextField;

/** Any node in a Form Definition's tree. */
export type Component = FieldNode;

/** A loaded, version 1 Form Definition. */
export interface FormDefinition {
  readonly $schema?: string;
  readonly version: typeof DEFINITION_VERSION;
  readonly components: readonly Component[];
}
