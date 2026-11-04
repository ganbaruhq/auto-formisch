# Spike: giá trị ban đầu và sửa record trên Formisch

Bằng chứng cho ticket `AF-11` (Default values and editing existing records). Nhánh này không bao giờ được merge.

- **Phiên bản:** `@formisch/react@1.1.1`, `valibot@1.5.0`, chạy trong jsdom. Chưa chạy trên browser thật.
- **Test:** `test/initial-input.test.tsx`, gồm 24 probe. Phần lớn chỉ log kết quả, nên test pass không chứng minh hành vi; hãy đọc `results-initial-input.txt`.
- **Nền:** `src/`, `results.txt` và các test còn lại được giữ từ nhánh `research/condition-compile-spike` (`AF-7`).
- **Type:** file test mới không qua được `tsc`.
- **Chưa kiểm chứng:** `validate: 'initial'` kết hợp `reset`; `keepInput` khi số row lồng nhau lệch; schema async.

Chạy lại từ thư mục này:

```sh
pnpm install --ignore-workspace
npx vitest run test/initial-input.test.tsx
```
