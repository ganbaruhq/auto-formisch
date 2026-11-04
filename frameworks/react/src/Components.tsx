import { Fragment, useContext, useState, type ComponentType, type CSSProperties } from 'react';
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
import { DataScopeContext } from './useFormValue';

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
  const { conditions } = useRenderContext();
  // A hidden Component is left out before the grid wraps it, so it takes no
  // cell. Its values stay in the store and come back when it reappears.
  const shown = components.flatMap((node, index) =>
    conditions.isVisible(node, scope) ? [{ node, index }] : [],
  );
  const children = shown.map(({ node, index }) => {
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
      return <ObjectGroup node={node} scope={scope} />;
    case 'repeater':
      return <Repeater node={node} scope={scope} />;
    default:
      return <Field node={node} scope={scope} />;
  }
}

/**
 * Keeps the active Tab and renders every shown Tab, so inactive ones stay
 * mounted. A hidden Tab leaves the list; while the active one is hidden, the
 * first shown Tab is active.
 */
function Tabs({ node, scope }: { readonly node: TabsLayout; readonly scope: Scope }) {
  const { layouts, conditions } = useRenderContext();
  const [activeKey, setActiveKey] = useState('0');
  const { tabs: TabsLayout, tab: TabLayout } = layouts;
  const tabs = node.components.flatMap((tab, index) =>
    conditions.isVisible(tab, scope)
      ? [
          {
            key: String(index),
            label: tab.label,
            children: (
              <TabLayout node={tab}>
                <Components components={tab.components} scope={scope} columns={tab.columns} />
              </TabLayout>
            ),
          },
        ]
      : [],
  );
  if (tabs.length === 0) return null;
  const active = tabs.some((tab) => tab.key === activeKey) ? activeKey : tabs[0].key;
  return <TabsLayout tabs={tabs} activeKey={active} onActiveChange={setActiveKey} />;
}

/** Content: looked up in the Widget map by `widget ?? type`, like a Field. */
function Content({ node: declared }: { readonly node: ContentNode }) {
  const { widgetOf } = useRenderContext();
  const { node, entry } = widgetOf(declared);
  const Widget = entry.component as ComponentType<ContentProps>;
  return <Widget node={node} />;
}

interface NestedProps<N> {
  readonly node: N;
  /** The data path of the scope this Field sits in. */
  readonly scope: Scope;
}

/** An `object`: its Widget around its Components, which add `name` to their path. */
function ObjectGroup({ node: declared, scope }: NestedProps<ObjectField>) {
  const { widgetOf, conditions } = useRenderContext();
  const { node, entry } = widgetOf(declared);
  const Widget = entry.component as ComponentType<ObjectProps>;
  const parent = useContext(DataScopeContext);
  const path = [...scope, declared.name];
  return (
    <Widget node={node} disabled={conditions.isDisabled(declared, scope)}>
      <DataScopeContext value={{ path, components: declared.components, parent }}>
        <Components components={declared.components} scope={path} />
      </DataScopeContext>
    </Widget>
  );
}

/**
 * A Repeater: its Widget with one entry per row of the Formisch field array.
 * A row's `key` comes from Formisch's `items`, so a row's values, errors, DOM
 * and local state go with it when it moves. While it is disabled, adding,
 * removing and reordering rows do nothing, whatever the Widget shows.
 */
function Repeater({ node: declared, scope }: NestedProps<RepeaterField>) {
  const { store, widgetOf, conditions } = useRenderContext();
  const { node, entry } = widgetOf(declared);
  const Widget = entry.component as ComponentType<RepeaterProps>;
  const parent = useContext(DataScopeContext);
  const path = [...scope, declared.name];
  // Paths come from a JSON Definition, so they cannot be typed against the
  // schema, whose input type has no arrays.
  const arrayPath = path as never;
  const array = useFieldArray(store, { path: arrayPath });
  const disabled = conditions.isDisabled(declared, scope);
  const unlessDisabled = (change: () => void) => () => {
    if (!disabled) change();
  };
  const max = maxItems(node);
  const rows = array.items.map((key, index): RepeaterRow => ({
    key,
    index,
    children: (
      <DataScopeContext value={{ path: [...path, index], components: declared.components, parent }}>
        <Components components={declared.components} scope={[...path, index]} />
      </DataScopeContext>
    ),
    remove: unlessDisabled(() => remove(store, { path: arrayPath, at: index })),
    moveTo: (to) => unlessDisabled(() => move(store, { path: arrayPath, from: index, to }))(),
  }));
  return (
    <Widget
      rows={rows}
      add={unlessDisabled(() => insert(store, { path: arrayPath }))}
      canAdd={!disabled && (max === undefined || rows.length < max)}
      disabled={disabled}
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
