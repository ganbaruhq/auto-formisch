import * as v from 'valibot';

/**
 * How the loader reads a Component `type` that is not a Field: the Layouts and
 * Content. None of them has a `name` or a value, so none adds a data path; a
 * Layout's children share its parent's data scope.
 *
 * Every Component also takes `colSpan` when its parent sets `columns`; the
 * loader checks that key itself.
 */
export interface ComponentSpec {
  readonly type: string;
  /** Keys beside `type`, `components` and `colSpan`, with their schemas. */
  readonly keys: Readonly<Record<string, v.GenericSchema>>;
  /** Keys of `keys` that must be present. */
  readonly required: readonly string[];
  /** Present when the type holds child Components in `components`. */
  readonly children?: {
    /** The only `type` allowed as a direct child. */
    readonly only?: string;
    /** At least one child is required. */
    readonly nonEmpty?: boolean;
  };
  /** The `type` this one must sit directly inside. */
  readonly parent?: string;
}

/** A positive integer, for `columns` and `colSpan`. */
export const gridSize = v.pipe(v.number(), v.integer(), v.minValue(1));

const section: ComponentSpec = {
  type: 'section',
  keys: { label: v.string(), description: v.string(), columns: gridSize },
  required: [],
  children: {},
};

const tabs: ComponentSpec = {
  type: 'tabs',
  keys: {},
  required: [],
  children: { only: 'tab', nonEmpty: true },
};

const tab: ComponentSpec = {
  type: 'tab',
  // A Tab is a button, so it always needs a name.
  keys: { label: v.string(), description: v.string(), columns: gridSize },
  required: ['label'],
  children: {},
  parent: 'tabs',
};

const content: ComponentSpec = {
  type: 'content',
  // Plain text only, so a stored Definition can never inject HTML.
  keys: { text: v.string(), widget: v.string() },
  required: ['text'],
};

export const builtinComponents: ReadonlyMap<string, ComponentSpec> = new Map(
  [section, tabs, tab, content].map((spec) => [spec.type, spec]),
);
