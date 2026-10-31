# Songsterr Float

Userscript + browser extension for songsterr.com, both built from `src/core.js` by `build.js`.
Users install the userscript from `main` on GitHub and Tampermonkey auto-updates it — so `main` is the release channel.

## Rules

- **Every commit on `main` carries a new version** (`version` in `package.json`, semver). Patch for fixes, minor for
  features, major for redesigns — table in README → *Versioning*. The pre-commit hook bumps patch automatically; bump
  minor/major yourself (`npm version minor --no-git-tag-version`) before committing. Never bypass the pre-push check.
- Work happens on a branch in `.worktrees/<name>`; it lands on `main` as one squash commit.
- `songsterr-float.user.js` is committed and must match `src/core.js` — run `npm run build` (part of `npm run check`).
- Before reporting done: `npm run check` (build + ESLint + `node:test`/jsdom tests).
- Never play audio while checking the site (no play button, no autoplaying embeds).

## Where things are

- `src/core.js` — everything: config (`G`, `MODULES`, `CLASSES`), CSS builders, pure helpers (exported for tests when
  there is no `document`), DOM sync run from one MutationObserver.
- Songsterr class names are CSS-module hashes that change on every deploy; keep only stable names in `CLASSES` and the
  last known hash in `MODULES` — `resolveModules()` finds new hashes at runtime.
- `scripts/version-guard.js` + `.githooks/` — the version rule above.
- `test/` — `core.test.js` (pure), `dom.test.js` (jsdom, mocked Songsterr API), `version-guard.test.js` (real git hooks in a temp repo).
