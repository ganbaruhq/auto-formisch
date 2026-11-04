# Spike: Renderer facts trên Formisch

Bằng chứng cho ticket `AF-9` (Renderer and Widget map contract). Nhánh này không bao giờ được merge.

- **Phiên bản:** `@formisch/react@1.1.1`, `valibot@1.5.0`, React 19.3.1, chạy trong jsdom.
- **Test:** `packages/auto-formisch-react/src/spike.test.tsx`. Phần lớn test chỉ log dòng `OBS`, không assert, nên test pass không chứng minh hành vi; hãy đọc `results.txt`.
- **Type:** file spike không qua được `tsc`, vì path và kiểu `errors` không được cast.
- **`packages/auto-formisch-react/.spike/`:** trang kiểm tra focus trên browser thật. Trang này **chưa chạy được**, nên focus khi đổi thứ tự row trên browser thật vẫn chưa kiểm chứng.

Chạy lại từ root repo:

```sh
pnpm exec vp test run packages/auto-formisch-react/src/spike.test.tsx --silent=false --disable-console-intercept
```
