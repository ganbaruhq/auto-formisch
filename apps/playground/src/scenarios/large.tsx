import { useState } from 'react';
import { AutoForm, compile, type FormOutput } from '@auto-formisch/react';
import { record } from './record';

/**
 * A large form with Rules and Conditions, to measure the cost of a keystroke.
 * Each Section has a driver checkbox that shows three of its Fields, so every
 * input re-evaluates the Conditions; Rules run on every revalidation. With
 * `?sections=n` it has n Sections (or Pages) of 21 value Fields each.
 */
export function largeDefinition(sections: number, asWizard: boolean, conditions = true) {
  const sectionComponents = Array.from({ length: sections }, (_, s) => [
    { type: 'boolean', name: `s${s}_extra`, label: `Section ${s + 1}: more details` },
    ...Array.from({ length: 5 }, (_, i) => ({
      type: 'text',
      name: `s${s}_text${i}`,
      label: `Section ${s + 1} text ${i + 1}`,
      required: i === 0,
      rules: [
        { type: 'min_length', requirement: 2 },
        { type: 'max_length', requirement: 40 },
      ],
    })),
    {
      type: 'text',
      name: `s${s}_email`,
      label: `Section ${s + 1} email`,
      rules: [{ type: 'email' }, { type: 'max_length', requirement: 254 }],
    },
    ...Array.from({ length: 4 }, (_, i) => ({
      type: 'number',
      name: `s${s}_number${i}`,
      label: `Section ${s + 1} number ${i + 1}`,
      rules: [
        { type: 'min_value', requirement: 0 },
        { type: 'max_value', requirement: 1000 },
        { type: 'integer' },
      ],
    })),
    {
      type: 'choice',
      name: `s${s}_choice`,
      label: `Section ${s + 1} choice`,
      choices: ['a', 'b', 'c', 'd'],
    },
    {
      type: 'multi_choice',
      name: `s${s}_tags`,
      label: `Section ${s + 1} tags`,
      choices: ['x', 'y', 'z'],
      rules: [{ type: 'max_items', requirement: 2 }],
    },
    {
      type: 'date',
      name: `s${s}_date`,
      label: `Section ${s + 1} date`,
      rules: [{ type: 'min_value', requirement: '2000-01-01' }],
    },
    ...Array.from({ length: 3 }, (_, i) => ({
      type: 'text',
      name: `s${s}_more${i}`,
      label: `Section ${s + 1} more ${i + 1}`,
      ...(conditions && { visible: { field: `s${s}_extra`, operator: 'eq', value: true } }),
      required: true,
      rules: [{ type: 'min_length', requirement: 3 }],
    })),
    {
      type: 'repeater',
      name: `s${s}_rows`,
      label: `Section ${s + 1} rows`,
      default: [{}, {}],
      rules: [{ type: 'max_items', requirement: 5 }],
      components: [
        {
          type: 'text',
          name: 'title',
          label: 'Title',
          required: true,
          rules: [{ type: 'min_length', requirement: 2 }],
        },
        {
          type: 'number',
          name: 'qty',
          label: 'Quantity',
          rules: [{ type: 'min_value', requirement: 1 }],
        },
      ],
    },
  ]);
  if (asWizard) {
    return {
      version: 1,
      pages: sectionComponents.map((components, s) => ({
        type: 'page',
        label: `Step ${s + 1}`,
        components,
      })),
    };
  }
  return {
    version: 1,
    components: sectionComponents.map((components, s) => ({
      type: 'section',
      label: `Section ${s + 1}`,
      components,
    })),
  };
}

/** The number of value Fields of `largeDefinition`, rows included. */
export const fieldCount = (sections: number) => sections * (1 + 5 + 1 + 4 + 3 + 3 + 2 * 2);

function Large({ asWizard }: { readonly asWizard: boolean }) {
  const query = new URLSearchParams(location.search);
  const sections = Number(query.get('sections') ?? 10);
  // `?conditions=0` drops the Conditions, to compare the cost of a keystroke.
  const conditions = query.get('conditions') !== '0';
  const [form] = useState(() => compile(largeDefinition(sections, asWizard, conditions)));
  const [submission, setSubmission] = useState<FormOutput | null>(null);
  return (
    <>
      <p>
        {sections} {asWizard ? 'Pages' : 'Sections'}, {fieldCount(sections)} value Fields with
        Rules; each driver checkbox shows three required Fields.
      </p>
      <AutoForm
        form={form}
        onSubmit={(output) => {
          record(output);
          setSubmission(output);
        }}
      />
      <pre data-testid="submission">{JSON.stringify(submission, null, 2)}</pre>
    </>
  );
}

export const LargeForm = () => <Large asWizard={false} />;
export const LargeWizard = () => <Large asWizard={true} />;
