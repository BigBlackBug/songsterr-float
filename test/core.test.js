"use strict";
/* Чистые функции src/core.js: в node без DOM скрипт отдаёт их через module.exports. */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const core = require("../src/core.js");

test("CSS собирается целиком: скобки сбалансированы, нет undefined", () => {
  const css = core.buildCss();
  assert.equal((css.match(/{/g) || []).length, (css.match(/}/g) || []).length);
  assert.doesNotMatch(css, /undefined|NaN|\[object/);
});

test("верхняя плашка: порядок частей задаётся по содержимому, а не по позиции", () => {
  const css = core.buildCss();
  assert.match(css, /#tablist > :has\(#menu-search\) \{[^}]*order: -1/);
  assert.match(css, /#tablist > :has\(#bottombar-help\) \{[^}]*order: 2/);
  assert.match(css, /#tablist > \._0meAjW_bottomBarLeft \{[^}]*order: 3/);
  assert.doesNotMatch(css, /:nth-child/);
});

test("на узком экране окна дока стоят над доком", () => {
  const css = core.buildCss();
  const narrow = css.slice(css.lastIndexOf("@media (max-width: 1810px)"));
  assert.match(narrow, /\[data-fixpopup\][^{]*\{[^}]*bottom: var\(--panel-bottom\)/);
});

test("escapeClass экранирует только ведущую цифру", () => {
  assert.equal(core.escapeClass("_0meAjW_item"), "_0meAjW_item");
  assert.equal(core.escapeClass("idrtTa_controls"), "idrtTa_controls");
  assert.equal(core.escapeClass("-0AoUa_tuning"), "-\\30 AoUa_tuning");
  assert.equal(core.escapeClass("9abcde_x"), "\\39 abcde_x");
});

test("findModuleHash находит новый хэш модуля по якорю", () => {
  const mod = { hash: "_0meAjW", anchor: "bottomBarCenter" };
  const tokens = ["Zz9_9a_bottomBarCenterX", "Qq1-Ab_bottomBarCenter"];
  assert.equal(core.findModuleHash(tokens, mod, () => true), "Qq1-Ab");
});

test("findModuleHash проверяет confirm: якорь «panel» есть у многих модулей", () => {
  const mod = { hash: "oCvYpa", anchor: "panel", confirm: ["video"] };
  const present = new Set(["NEWvid_video"]);
  const hash = core.findModuleHash(["idrtTa_panel", "NEWvid_panel"], mod, (c) => present.has(c));
  assert.equal(hash, "NEWvid");
});

test("findModuleHash отвергает то, что не похоже на хэш", () => {
  const mod = { hash: "x", anchor: "item" };
  assert.equal(core.findModuleHash(["_item", "a b_item", "veryveryverylonghash_item"], mod, () => true), null);
});

test("refreshNames пересобирает классы и селекторы после смены хэша", () => {
  const old = core.MODULES.dock.hash;
  try {
    core.MODULES.dock.hash = "-1NewH";
    core.refreshNames();
    assert.equal(core.C.dockBar, "-1NewH_controls");
    assert.equal(core.D.dockBar, ".-\\31 NewH_controls");
    assert.equal(core.S.bar, "#controls .-\\31 NewH_controls");
    assert.match(core.buildCss(), /\.-\\31 NewH_controlsCard/);
  } finally {
    core.MODULES.dock.hash = old;
    core.refreshNames();
  }
});

test("planEditLayout: группы, разделители и кнопка сброса в конце", () => {
  const extras = Array.from({ length: 12 }, (_, i) => `b${i}`);
  const { order, seps } = core.planEditLayout(extras);
  const sorted = [...order.entries()].sort((a, b) => a[1] - b[1]).map(([el]) => el);

  assert.deepEqual(sorted, ["b0", "b1", "b2", "b3", "b5", "b6", "b7", "b8", "b9", "b10", "b11", "b4"]);
  assert.equal(seps.length, 4);
  assert.ok(seps.every((s) => s < 0));
});

test("planEditLayout: лишние кнопки — отдельной группой перед последней", () => {
  const extras = Array.from({ length: 14 }, (_, i) => `b${i}`);
  const { order } = core.planEditLayout(extras);
  assert.ok(order.get("b12") > order.get("b11"));
  assert.ok(order.get("b13") < order.get("b4"));
});

test("isPopupTitle", () => {
  for (const t of ["Mixer", "Микшер", "Revisions", "Speed", "Metronome", "Count-in"]) {
    assert.ok(core.isPopupTitle(t), t);
  }
  for (const t of ["Search", "Speed up your practice with a very long sentence here ok"]) {
    assert.ok(!core.isPopupTitle(t), t);
  }
});

test("parseSongId", () => {
  assert.equal(core.parseSongId("/a/wsa/metallica-master-of-puppets-tab-s455118"), 455118);
  assert.equal(core.parseSongId("/a/wsa/led-zeppelin-stairway-to-heaven-tab-s27t1?demo=enabled"), 27);
  assert.equal(core.parseSongId("https://www.songsterr.com/a/wsa/x-tab-s9t3#top"), 9);
  assert.equal(core.parseSongId("/a/wsa/metallica-tabs-a5"), null);
  assert.equal(core.parseSongId(null), null);
});

test("parseFavoriteIds понимает объекты и голые id", () => {
  assert.deepEqual([...core.parseFavoriteIds([{ songId: 5 }, { id: "7" }, 9, { title: "x" }])], [5, 7, 9]);
  assert.deepEqual([...core.parseFavoriteIds({ error: "nope" })], []);
});

test("userscript собран из текущего src/core.js (node build.js)", () => {
  const root = path.join(__dirname, "..");
  const user = fs.readFileSync(path.join(root, "songsterr-float.user.js"), "utf8");
  const src = fs.readFileSync(path.join(root, "src", "core.js"), "utf8");
  const pkg = require("../package.json");
  assert.ok(user.endsWith(src), "songsterr-float.user.js устарел — запусти node build.js");
  assert.match(user, new RegExp(`@version\\s+${pkg.version.replace(/\./g, "\\.")}\\n`));
});
