## Summary

<!-- 1–3 sentences: what changed and why. Link the issue (Closes #12). -->

## Type

- [ ] Bug fix
- [ ] Feature
- [ ] Documentation / locales
- [ ] Refactor / tests
- [ ] Other:

## Screenshots

<!-- For UI changes: the three localized README shots or a short recording; state the mock source. -->

## Checklist

- [ ] `npm run check` passes.
- [ ] `client.js` was rebuilt from `src/client/**` and is committed (`npm run build`; CI checks the diff).
- [ ] New UI strings exist in all eight dictionaries; `npm run i18n` is green.
- [ ] `docs/DETAIL*.md` is still exactly one image line; `meta.description` carries the text.
- [ ] All three READMEs and `screenshots.json` are updated if the UI changed (array, maximum eight images).
- [ ] `npm run check:pack` shows a runtime-only tarball: no `src/`, `scripts/`, `dev/`, `docs/dev/`, `docs/DEVELOPMENT.md` or `docs/RELEASING.md`.
- [ ] `CHANGELOG.md` has an entry for the user-visible change.
- [ ] No BOM, no CRLF, no local absolute paths or personal profile names in committed files.
- [ ] The read-only boundary is intact: no task mutations, no kill control, no terminal output, `ctx.jobs` still soft.
- [ ] `dev/` is not staged; screenshots use fictional data only.

<!-- By opening this pull request you agree that the contribution is licensed under the MIT License. -->
