# Condition compile spike

Throwaway evidence for AF-7 (Condition format and semantics) and ADR 0002. It is never merged.

- `src/compile.ts`: candidate strategies C, D and E. E is the chosen three-stage root pipe.
- `src/cascade.ts`: Inactive cascade, relative references, load-time cycle check, keeping empty keys.
- `test/cascade.test.tsx`: 8 asserted tests, through `~standard.validate` only.
- Other `test/*.test.tsx`: mostly probes that log output instead of asserting, so read `results.txt` for the evidence. A passing run proves little on its own.

Run `pnpm install`, `npx vitest run`, `npx tsc --noEmit` from this directory.

Pinned to `valibot@1.5.0` and `@formisch/react@1.1.1`. The cascade and empty-key behaviour have not been run under real Formisch.
