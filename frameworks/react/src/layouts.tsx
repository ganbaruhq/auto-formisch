import { useId, useRef, type KeyboardEvent } from 'react';
import type { SectionLayout, TabLayout } from '@auto-formisch/core';
import type { LayoutMap, LayoutProps, TabsLayoutProps } from './contracts';

/**
 * The default `section`: a `fieldset` named by its `legend` when it has a label
 * or description, otherwise a plain `div` (such as a grid with no heading).
 */
export function Section({ node, children }: LayoutProps<SectionLayout>) {
  const descriptionId = useId();
  if (node.label === undefined && node.description === undefined) return <div>{children}</div>;
  return (
    <fieldset aria-describedby={node.description !== undefined ? descriptionId : undefined}>
      {node.label !== undefined && <legend>{node.label}</legend>}
      {node.description !== undefined && <p id={descriptionId}>{node.description}</p>}
      {children}
    </fieldset>
  );
}

/** The default `tab`: its description, then its Components. */
export function Tab({ node, children }: LayoutProps<TabLayout>) {
  return (
    <>
      {node.description !== undefined && <p>{node.description}</p>}
      {children}
    </>
  );
}

const KEYS: Readonly<Record<string, (index: number, last: number) => number>> = {
  ArrowRight: (index, last) => (index === last ? 0 : index + 1),
  ArrowLeft: (index, last) => (index === 0 ? last : index - 1),
  Home: () => 0,
  End: (_, last) => last,
};

/**
 * The default `tabs`: a WAI-ARIA tab list with a roving `tabIndex`, where the
 * arrow keys, Home and End move and activate. Every panel stays mounted and an
 * inactive one is `hidden`, so its Fields keep their values and are validated.
 * A Tab with errors says how many Fields have them after its label, which is
 * part of its accessible name.
 */
export function Tabs({ tabs, activeKey, onActiveChange }: TabsLayoutProps) {
  const id = useId();
  const buttons = useRef(new Map<string, HTMLButtonElement>());
  const tabId = (key: string) => `${id}-tab-${key}`;
  const panelId = (key: string) => `${id}-panel-${key}`;

  const onKeyDown = (event: KeyboardEvent, index: number) => {
    const move = KEYS[event.key];
    if (move === undefined) return;
    event.preventDefault();
    const { key } = tabs[move(index, tabs.length - 1)];
    onActiveChange(key);
    buttons.current.get(key)?.focus();
  };

  return (
    <div>
      <div role="tablist">
        {tabs.map((tab, index) => (
          <button
            key={tab.key}
            ref={(element) => {
              if (element === null) buttons.current.delete(tab.key);
              else buttons.current.set(tab.key, element);
            }}
            type="button"
            role="tab"
            id={tabId(tab.key)}
            aria-selected={tab.key === activeKey}
            aria-controls={panelId(tab.key)}
            tabIndex={tab.key === activeKey ? 0 : -1}
            onClick={() => onActiveChange(tab.key)}
            onKeyDown={(event) => onKeyDown(event, index)}
          >
            {tab.label}
            {tab.errorCount > 0 && ` (${tab.errorCount})`}
          </button>
        ))}
      </div>
      {tabs.map((tab) => (
        <div
          key={tab.key}
          role="tabpanel"
          id={panelId(tab.key)}
          aria-labelledby={tabId(tab.key)}
          hidden={tab.key !== activeKey}
        >
          {tab.children}
        </div>
      ))}
    </div>
  );
}

/** The default Layouts: native HTML, no stylesheet. */
export const defaultLayouts: LayoutMap = { section: Section, tabs: Tabs, tab: Tab };
