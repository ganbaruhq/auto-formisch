import { Fragment, useState, type ComponentType, type CSSProperties } from 'react';
import { insert, move, remove, useFieldArray } from '@formisch/react';
import type {
  Component,
  ContentNode,
  ObjectField,
  PathKey,
  RepeaterField,
  TabsLayout,
} from '@auto-formisch/core';
import type { ContentProps, ObjectProps, RepeaterProps, RepeaterRow } from './contracts';
import { useRenderContext } from './context';
import { Field } from './Field';

type Scope = readonly PathKey[];

interface ComponentsProps {
  readonly components: readonly Component[];
  /** The data path of the scope these Components belong to. Layouts pass it through. */
  readonly scope: Scope;
  /** The parent's `columns`: the Components are laid out in a CSS grid. */
  readonly columns?: number;
}

/**
 * Renders a list of Components in Definition order. In a grid, each Component
 * sits in its own cell, which spans `colSpan` columns. The column count is the
 * fallback of `--af-columns`, so an application can change it in a media query.
 */
export function Components({ components, scope, columns }: ComponentsProps) {
  const children = components.map((node, index) => {
    // A name is unique in its scope and never starts with '#'.
    const key = 'name' in node ? node.name : `#${index}`;
    const element = <ComponentNode node={node} scope={scope} />;
    if (columns === undefined) return <Fragment key={key}>{element}</Fragment>;
    const span = 'colSpan' in node ? node.colSpan : undefined;
    return (
      <div key={key} style={span !== undefined ? { gridColumn: `span ${span}` } : undefined}>
        {element}
      </div>
    );
  });
  if (columns === undefined) return children;
  return <div style={gridStyle(columns)}>{children}</div>;
}

const gridStyle = (columns: number): CSSProperties => ({
  display: 'grid',
  gridTemplateColumns: `repeat(var(--af-columns, ${columns}), minmax(0, 1fr))`,
});

/** Dispatches one Component by `type`. */
function ComponentNode({ node, scope }: { readonly node: Component; readonly scope: Scope }) {
  const { layouts } = useRenderContext();
  switch (node.type) {
    case 'section': {
      const Section = layouts.section;
      return (
        <Section node={node}>
          <Components components={node.components} scope={scope} columns={node.columns} />
        </Section>
      );
    }
    case 'tabs':
      return <Tabs node={node} scope={scope} />;
    case 'tab':
      // The loader only accepts a `tab` directly inside `tabs`, which renders it.
      throw new Error('A "tab" renders only inside "tabs"');
    case 'content':
      return <Content node={node} />;
    case 'object':
      return <ObjectGroup node={node} path={[...scope, node.name]} />;
    case 'repeater':
      return <Repeater node={node} path={[...scope, node.name]} />;
    default:
      return <Field node={node} path={[...scope, node.name]} />;
  }
}

/** Keeps the active Tab and renders every Tab, so inactive ones stay mounted. */
function Tabs({ node, scope }: { readonly node: TabsLayout; readonly scope: Scope }) {
  const { layouts } = useRenderContext();
  const [activeKey, setActiveKey] = useState('0');
  const { tabs: TabsLayout, tab: TabLayout } = layouts;
  const tabs = node.components.map((tab, index) => ({
    key: String(index),
    label: tab.label,
    children: (
      <TabLayout node={tab}>
        <Components components={tab.components} scope={scope} columns={tab.columns} />
      </TabLayout>
    ),
  }));
  return <TabsLayout tabs={tabs} activeKey={activeKey} onActiveChange={setActiveKey} />;
}

/** Content: looked up in the Widget map by `widget ?? type`, like a Field. */
function Content({ node }: { readonly node: ContentNode }) {
  const { widgets } = useRenderContext();
  const key = node.widget ?? node.type;
  const entry = widgets[key];
  if (entry === undefined) throw new Error(`No Widget "${key}" for a Content Component`);
  const Widget = entry.component as ComponentType<ContentProps>;
  return <Widget node={node} />;
}

interface NestedProps<N> {
  readonly node: N;
  /** The data path of this Field, and so of the scope of its children. */
  readonly path: readonly PathKey[];
}

/** An `object`: its Widget around its Components, which add `name` to their path. */
function ObjectGroup({ node, path }: NestedProps<ObjectField>) {
  const Widget = useNestedWidget<ObjectProps>(node, path);
  return (
    <Widget node={node} disabled={false}>
      <Components components={node.components} scope={path} />
    </Widget>
  );
}

/**
 * A Repeater: its Widget with one entry per row of the Formisch field array.
 * A row's `key` comes from Formisch's `items`, so a row's values, errors, DOM
 * and local state go with it when it moves.
 */
function Repeater({ node, path }: NestedProps<RepeaterField>) {
  const { store } = useRenderContext();
  const Widget = useNestedWidget<RepeaterProps>(node, path);
  // Paths come from a JSON Definition, so they cannot be typed against the
  // schema, whose input type has no arrays.
  const arrayPath = path as never;
  const array = useFieldArray(store, { path: arrayPath });
  const max = maxItems(node);
  const rows = array.items.map((key, index): RepeaterRow => ({
    key,
    index,
    children: <Components components={node.components} scope={[...path, index]} />,
    remove: () => remove(store, { path: arrayPath, at: index }),
    moveTo: (to) => move(store, { path: arrayPath, from: index, to }),
  }));
  return (
    <Widget
      rows={rows}
      add={() => insert(store, { path: arrayPath })}
      canAdd={max === undefined || rows.length < max}
      disabled={false}
      errors={array.errors ?? []}
      node={node}
    />
  );
}

/** The smallest `max_items` of a Repeater, if it has one. */
function maxItems(node: RepeaterField): number | undefined {
  const limits = (node.rules ?? [])
    .filter((rule) => rule.type === 'max_items')
    .map((rule) => rule.requirement as number);
  return limits.length > 0 ? Math.min(...limits) : undefined;
}

/** An `object` or Repeater Widget, looked up by `widget ?? type` like a value Field's. */
function useNestedWidget<P>(node: ObjectField | RepeaterField, path: readonly PathKey[]) {
  const { widgets } = useRenderContext();
  const key = node.widget ?? node.type;
  const entry = widgets[key];
  if (entry === undefined) {
    throw new Error(`No Widget "${key}" for the Field at "${path.join('.')}"`);
  }
  return entry.component as ComponentType<P>;
}
