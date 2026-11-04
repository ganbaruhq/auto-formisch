# Spike: Wizard trên Formisch

Bằng chứng cho ticket `AF-10` (Wizard step validation semantics). Nhánh này không bao giờ được merge. Nhánh được tạo từ `research/renderer-spike`, nên vẫn chứa các file của spike đó.

- **Phiên bản:** `@formisch/react@1.1.1`, `valibot@1.5.0`, React 19.3.1, chạy trong jsdom.
- **Test:** `packages/auto-formisch-react/src/wizard.spike.test.tsx`, có assert. Kết quả và các dòng `OBS` nằm trong `results.txt`.
- **Harness:** component `Wizard` trong file test là bản tối thiểu của các quyết định, không phải Renderer thật.
- **Compile:** `wizard-cascade.ts` chép từ `research/condition-compile-spike`, thêm `fieldsOf` và `isVisible`. `compile` đó thực hiện ba bước của ADR 0002 nhưng chỉ có `eq`, `empty`, `not_empty`, không có Rule.
- **Type:** file spike không qua được `tsc`.

Chạy lại từ root repo:

```sh
pnpm exec vp test run packages/auto-formisch-react/src/wizard.spike.test.tsx --silent=false --disable-console-intercept
```
