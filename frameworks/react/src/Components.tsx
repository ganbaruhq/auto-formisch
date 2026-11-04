import { Fragment, useState, type ComponentType, type CSSProperties } from 'react';
import type { Component, ContentNode, PathKey, TabsLayout } from '@auto-formisch/core';
import type { ContentProps } from './contracts';
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
