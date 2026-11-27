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
  const narrow = css.slice(css.lastIndexOf(`@media (max-width: ${core.G.wideMin - 1}px)`));
  assert.match(narrow, /\[data-fixpopup\][^{]*\{[^}]*bottom: var\(--panel-bottom\)/);
});

test("плашка инструментов: в строке с доком от края до дока, иначе — над доком", () => {
  const css = core.buildCss();
  const side = 2 * core.G.pillOffset + core.G.toolsMin + core.G.panelGap + core.G.barWidth;
  assert.match(css, new RegExp(`@media \\(min-width: ${side}px\\) \\{\\n\\._5pcfpW_controlsTopPanelRow \\{[^}]*width: var\\(--tools-width\\)`));
  assert.match(css, new RegExp(`@media \\(max-width: ${side - 1}px\\) \\{\\n\\._5pcfpW_controlsTopPanelRow \\{[^}]*bottom: var\\(--panel-bottom\\)`));
  assert.match(css, /body:has\(\._5pcfpW_controlsTopPanelRow\) #controls \{[^}]*left: max\(/);
  // фон плашки — и когда рядом лежит скрытый бургер (без входа)
  assert.match(css, /\._5pcfpW_controlsTopPanelRow > :is\(:only-child, \._5pcfpW_controlsTopPanel\)[^{]*\{[^}]*background: var\(--pill-bg\)/);
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

test("автообновление userscript смотрит в репо из package.json", () => {
  const user = fs.readFileSync(path.join(__dirname, "..", "songsterr-float.user.js"), "utf8");
  const { repo } = require("../package.json").config;
  const raw = `https://raw.githubusercontent.com/${repo}/main/songsterr-float.user.js`;
  assert.match(user, new RegExp(`@updateURL\\s+${raw.replace(/[.]/g, "\\.")}\\n`));
  assert.match(user, new RegExp(`@downloadURL\\s+${raw.replace(/[.]/g, "\\.")}\\n`));
  assert.match(user, /@grant\s+none\n/);
});

test("BPM: адрес JSON партии, базовый темп, скорость", () => {
  assert.deepEqual(
    core.parsePartUrl("https://dqsljvtekg760.cloudfront.net/19/10176590/v0-3-2-XiKCEsImE2PPybWf/0.json"),
    { song: 19, revision: 10176590 }
  );
  assert.equal(core.parsePartUrl("https://www.songsterr.com/api/video-points/19/10176590/list"), null);
  assert.equal(core.parsePartUrl("https://www.songsterr.com/api/meta/19/10/x/1.json"), null);

  const tempo = [{ measure: 8, position: 0, bpm: 140 }, { measure: 0, position: 0, bpm: 123, type: 4 }];
  assert.equal(core.parseBaseBpm({ automations: { tempo } }), 123);
  assert.equal(core.parseBaseBpm({ automations: {} }), null);
  assert.equal(core.parseBaseBpm(null), null);

  assert.equal(core.parseSpeed("Speed 100%"), 100);
  assert.equal(core.parseSpeed("Скорость 72,5 %"), 72.5);
  assert.equal(core.parseSpeed("Speed"), null);
  assert.equal(core.bpmAtSpeed(123, 50), 62);
});

test("видео-панель на узком экране — не шире половины дока, по центру", () => {
  const css = core.buildCss();
  assert.match(css, new RegExp(`@media \\(max-width: ${core.G.wideMin - 1}px\\) \\{\\n\\.oCvYpa_panel \\{[^}]*max-width: 50% !important;[^}]*margin: 0 auto`));
});

test("полный ряд кнопок дока влезает в одну строку", () => {
  const { G } = core;
  const buttons = core.MAIN_GROUPS.flat().length - 1; // без play
  const seps = core.MAIN_GROUPS.length - 1;
  const playWidth = 115; // play + переключатель ORIG/SYNTH
  const items = 1 + buttons + seps;
  const row = playWidth + buttons * G.btnSize + seps * (1 + 2 * G.sepSpace) + (items - 1) * G.btnGap;
  assert.ok(row <= G.barWidth - 2 * G.dockInset, `ряд ${row}px не влезает в док ${G.barWidth}px`);
});

test("BPM на кнопке скорости по центру места над плашкой скорости", () => {
  const css = core.buildCss();
  assert.match(css, /#control-speed \[data-fx-bpm\]::before \{[^}]*flex: 1 1 auto[^}]*align-items: center/);
});

test("док: транспонирование, аккорды и печать спрятаны", () => {
  const css = core.buildCss();
  assert.match(css, /#controls \.idrtTa_controls > :is\(#c-transpose, #c-detectchords, #c-print\) \{\n {2}display: none !important;/);
  for (const id of core.HIDDEN_IDS) assert.ok(!core.MAIN_GROUPS.flat().includes(id), id);
});

test("пресеты скорости: ползунок идёт равными долями между родными пресетами", () => {
  const stops = [15, 25, 50, 75, 100, 125, 150, 175];
  assert.equal(core.speedToSlider(100, stops), (4 / 7) * 100);
  assert.equal(core.speedToSlider(15, stops), 0);
  assert.equal(core.speedToSlider(175, stops), 100);
  assert.equal(core.speedToSlider(60, stops), ((2 + 10 / 25) / 7) * 100);
  assert.equal(core.speedToSlider(5, stops), 0);
  assert.equal(core.speedToSlider(300, stops), 100);
  assert.deepEqual(core.SPEED.presets, [50, 60, 70, 80, 90, 100]);
});

test("верхняя плашка: по ширине содержимого, без New tab / Inbox / Help, у пунктов один отступ", () => {
  const css = core.buildCss();
  assert.match(css, /#tablist \{[^}]*width: max-content/);
  assert.match(css, /#tablist :is\(#menu-newtab, #menu-inbox, #bottombar-help\), #tablist \._0meAjW_itemWrapper:has\(> :is\(#menu-newtab, #menu-inbox, #bottombar-help\)\) \{\n {2}display: none/);
  assert.match(css, /#tablist a\._0meAjW_item, #tablist \._0meAjW_profile \{[^}]*margin: 0 !important;[^}]*padding: 0 var\(--nav-pad\)/);
});
