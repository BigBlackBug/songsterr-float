# Songsterr Float (unofficial)

Not happy with the new Songsterr desktop layout? This restores a cleaner, more compact one:

- one floating **top pill** with navigation (Search · My tabs · New tab · For teachers | Inbox · Help · profile)
- floating **bottom dock** with player controls, grouped with dividers
- **tools pill** (play, original/synth, loop, speed…) in the left column
- mixer / transpose / settings / revisions windows in a tidy right column — above the dock on narrower windows, never under it
- the "original audio" video panel stacks above those windows instead of covering them
- the **speed (BPM) window stays open** when you click the tab — close it with its ✕ (or Esc)
- a **☆ star on every search result** to add it to / remove it from *My tabs* without opening the tab
- centered search / My tabs / New tab panels, consistent rounded corners, subtle fade-in animations

It does **not** collect data or talk to anyone but Songsterr. The only network requests it makes are Songsterr's own
favorites API (`/api/favorites`), on songsterr.com, with your existing session — to show which search results are in
*My tabs* and to change that when you click a star. Logged out, no stars are shown.

> Unofficial. Not affiliated with or endorsed by Songsterr. All trademarks belong to their owners.
> Fork of [lockiF/songsterr-float](https://github.com/lockiF/songsterr-float).

## Install

### As a userscript — updates itself
Install [Tampermonkey](https://www.tampermonkey.net/) or [Violentmonkey](https://violentmonkey.github.io/), then open
[`songsterr-float.user.js`](https://github.com/BigBlackBug/songsterr-float/raw/main/songsterr-float.user.js) and click *Install*.

The script's `@updateURL` points at that same file on `main`, so the manager picks up every new version on its own
(Tampermonkey checks about once a day; *Utilities → Check for userscript updates* forces it).

### As a browser extension — manual updates
An unpacked extension never updates itself; Chrome allows self-updating extensions only from the Web Store.
Don't run it together with the userscript — the layout would be applied twice.

- **Chrome / Edge / Brave:** `npm install && npm run build`, open `chrome://extensions`, enable *Developer mode* → *Load unpacked* → pick `dist/extension` (not `extension/` — that is the source without `content.js`). To update: `git pull && npm run build`, then ↻ on the extension card.
- **Firefox:** `about:debugging#/runtime/this-firefox` → *Load Temporary Add-on* → pick `dist/extension/manifest.json` (temporary, removed on restart).

Both builds are generated from the same `src/core.js`.

## Versioning: every commit to `main` is a release

Installed userscripts update only when `@version` grows, so **every commit on `main` carries a new version**
(`MAJOR.MINOR.PATCH`, set in `package.json`; the build copies it into `@version` and the extension manifest):

| Change | Bump | Example |
|---|---|---|
| fix: Songsterr changed something, a window sits wrong, small style tweak | patch | `1.0.0 → 1.0.1` |
| new feature: a new button, pinned window, setting | minor | `1.0.1 → 1.1.0` |
| redesign, something removed, reinstall needed | major | `1.4.2 → 2.0.0` |

Git hooks in `.githooks/` enforce it (`npm install` turns them on via `core.hooksPath`):

- **pre-commit** — a commit on `main` that doesn't raise the version gets a patch bump automatically, the userscript is
  rebuilt and everything goes into the same commit. For a minor/major release bump it yourself first:
  `npm version minor --no-git-tag-version` (or `major`), then commit.
- **pre-push** — refuses to push to `main` any commit whose version isn't higher than its parent's (covers fast-forward
  merges, rebases and `--no-verify` commits).

Feature branches are not touched; the version is decided when the work lands on `main` (squash-merge).
Amending a commit on `main` bumps once more — amend with `--no-verify` if the version is already right.

Before pushing: `npm run check`.

## Customize

Open `src/core.js` and edit the `G` object at the top (pill height, offsets, radius, widths…), then `npm run build`.
Windows that should only close with their ✕ are listed in `PINNED_POPUPS`.
Or tweak the generated userscript directly in Tampermonkey.

## How it survives Songsterr updates

Songsterr's CSS classes look like `_0meAjW_bottomBarCenter`: a per-module hash plus a stable name. The hash changes on
every Songsterr deploy. `src/core.js` keeps only the stable names (`CLASSES`) and the last known hash of each module
(`MODULES`). When a module's hash no longer matches the page, the script finds the new one by the module's anchor
class name and rebuilds its CSS on the fly (the console shows `[Songsterr Float] модуль …: хэш … → …`).
The top pill is arranged by menu item ids (`#menu-search`, `#bottombar-help`), not by element position.

## Known limitations

- If Songsterr renames a class (not just re-hashes it), that part of the layout falls back to the site's own style until
  `CLASSES` / `MODULES` in `src/core.js` are updated. Please [open an issue](https://github.com/BigBlackBug/songsterr-float/issues) with a screenshot.
- A star changed in search updates Songsterr's servers, but a page that already loaded your favorites (e.g. the star on
  an open tab) shows the old state until it reloads.
- Desktop only; designed for wide windows (the video panel moves to the right column from 1811px).

## Development

```bash
npm install
```

```bash
npm run check
```

`check` = `build` + `lint` (ESLint) + `test` (`node:test`; DOM behaviour runs in jsdom with a mocked Songsterr API).
`npm run build` outputs `songsterr-float.user.js` (committed — Tampermonkey installs it from here), `dist/extension/`
and a zip ready for the Chrome Web Store / Firefox AMO. Requires Node 20+ and `zip` (macOS/Linux) or `tar` (Windows 10+).

## License

MIT
