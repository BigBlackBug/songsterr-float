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

## Install

### As a browser extension
- **Chrome / Edge / Brave:** download `songsterr-float-extension-vX.Y.Z.zip` from [Releases](https://github.com/lockiF/songsterr-float/releases), unzip, open `chrome://extensions`, enable *Developer mode* → *Load unpacked* → pick the folder.
- **Firefox:** (store link here once published). Until then: `about:debugging#/runtime/this-firefox` → *Load Temporary Add-on* → pick `manifest.json` (temporary, removed on restart).

### As a userscript
Install [Tampermonkey](https://www.tampermonkey.net/) or [Violentmonkey](https://violentmonkey.github.io/), then open
[`songsterr-float.user.js`](https://github.com/lockiF/songsterr-float/raw/main/songsterr-float.user.js) and click *Install*.

Both builds are generated from the same `src/core.js`.

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
  `CLASSES` / `MODULES` in `src/core.js` are updated. Please [open an issue](https://github.com/lockiF/songsterr-float/issues) with a screenshot.
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
