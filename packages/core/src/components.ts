import * as v from 'valibot';

/**
 * How the loader reads a Component `type` that holds child Components or no
 * value: the Layouts, Content, and the `object` and `repeater` Fields.
 *
 * A Layout or Content has no `name`, so it adds no data path, and a Layout's
 * children share its parent's data scope. An `object` or `repeater` has a
 * `name` in its parent's scope, and its children are a new scope.
 *
 * Every Component also takes `colSpan` when its parent sets `columns`; the
 * loader checks that key itself.
 */
export interface ComponentSpec {
  readonly type: string;
  /** Keys beside `type`, `name`, `rules`, `components` and `colSpan`, with their schemas. */
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
  /**
   * Set when the type is a Field with child Fields: it takes a `name`, and its
   * children are a new data scope. `'rules'` means it also takes `rules`.
   */
  readonly field?: 'plain' | 'rules';
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

const page: ComponentSpec = {
  type: 'page',
  keys: { label: v.string(), description: v.string(), columns: gridSize },
  required: [],
  children: {},
  // Only the root's `pages` holds Pages, so a Page never sits inside another
  // Component or in a data scope of its own.
  parent: 'pages',
};

const content: ComponentSpec = {
  type: 'content',
  // Plain text only, so a stored Definition can never inject HTML.
  keys: { text: v.string(), widget: v.string() },
  required: ['text'],
};

// Neither takes `required`: both always keep their key, as `{}` and `[]`.
const groupKeys = { label: v.string(), description: v.string(), widget: v.string() };

const object: ComponentSpec = {
  type: 'object',
  keys: groupKeys,
  required: [],
  children: { nonEmpty: true },
  field: 'plain',
};

const repeater: ComponentSpec = {
  type: 'repeater',
  keys: groupKeys,
  required: [],
  children: { nonEmpty: true },
  field: 'rules',
};

export const builtinComponents: ReadonlyMap<string, ComponentSpec> = new Map(
  [section, tabs, tab, page, content, object, repeater].map((spec) => [spec.type, spec]),
);
