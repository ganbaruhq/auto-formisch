// #region define
// extensions.ts: no React, so the server imports it too.
import * as v from 'valibot';
import { defineFieldType, defineRule } from '@auto-formisch/core';

export const rating = defineFieldType({
  type: 'rating',
  options: { max: v.pipe(v.number(), v.integer(), v.minValue(1)) },
  schema: (node) => v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(node.max)),
  conditionAs: 'number',
});

export const startsWith = defineRule({
  type: 'starts_with',
  appliesTo: ['text'],
  requirement: v.string(),
  check: (value, requirement) => value.startsWith(requirement),
  message: 'Wrong prefix',
});

export const extensions = { fieldTypes: [rating], rules: [startsWith] };
// #endregion define

// #region use
import { compile, form, label, required, text } from '@auto-formisch/core';

export const review = compile(
  form(
    [
      rating('score', { max: 5 }, [label('Score'), required()]),
      text('code', [label('Voucher'), startsWith('VN')]),
    ],
    extensions,
  ),
  extensions,
);
// { score: number; code?: string }

// A stored JSON Definition needs the same registrations.
export const stored = compile(
  {
    version: 1,
    components: [
      { type: 'rating', name: 'score', label: 'Score', max: 5, required: true },
      { type: 'text', name: 'code', rules: [{ type: 'starts_with', requirement: 'VN' }] },
    ],
  },
  extensions,
);
// #endregion use

// #region widget
import type { Ref } from 'react';
import {
  AutoForm,
  type FormOutput,
  type InferFieldNode,
  type InferFieldValue,
  type WidgetProps,
} from '@auto-formisch/react';

type StarsProps = WidgetProps<InferFieldValue<typeof rating>, InferFieldNode<typeof rating>>;

function Stars({ value, onChange, inputProps, node, disabled, readOnly }: StarsProps) {
  const { id, ref, ...aria } = inputProps;
  const stars = Array.from({ length: node.max }, (_, index) => index + 1);
  return (
    <div role="radiogroup" id={id} aria-label={node.label ?? node.name} {...aria}>
      {stars.map((star) => (
        <button
          key={star}
          type="button"
          role="radio"
          aria-checked={value === star}
          disabled={disabled || readOnly}
          ref={star === 1 ? (ref as Ref<HTMLButtonElement>) : undefined}
          onClick={() => onChange(value === star ? undefined : star)}
        >
          {star} {star === 1 ? 'star' : 'stars'}
        </button>
      ))}
    </div>
  );
}

export function ReviewForm({ onSave }: { onSave: (output: FormOutput) => void }) {
  return <AutoForm form={review} widgets={{ rating: Stars }} onSubmit={onSave} />;
}
// #endregion widget
