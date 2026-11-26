"use strict";
/* Поведение src/core.js на странице: скрипт запускается в jsdom так же, как
   контент-скрипт, а API сайта подменяется моком fetch. */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const { JSDOM, VirtualConsole } = require("jsdom");

const CODE = fs.readFileSync(path.join(__dirname, "..", "src", "core.js"), "utf8");

function setup(body, routes = {}, prepare = () => {}) {
  const dom = new JSDOM(`<!doctype html><html><head></head><body>${body}</body></html>`, {
    url: "https://www.songsterr.com/a/wsa/song-tab-s1",
    pretendToBeVisual: true,
    runScripts: "outside-only",
    virtualConsole: new VirtualConsole(), // CSS с :has jsdom разбирает с предупреждениями
  });
  const { window } = dom;
  const calls = [];

  window.fetch = async (url, opts = {}) => {
    const method = opts.method || "GET";
    calls.push(`${method} ${url}`);
    const route = routes[`${method} ${url}`] ?? routes[method] ?? { status: 404 };
    const { status = 200, json = null } = typeof route === "function" ? route() : route;
    return { ok: status >= 200 && status < 300, status, json: async () => json };
  };

  prepare(window);
  window.eval(CODE);
  return { window, document: window.document, calls };
}

// дождаться rAF-обработки мутаций и промисов fetch
const settle = (window) =>
  new Promise((resolve) => window.requestAnimationFrame(() => setTimeout(resolve, 0)))
    .then(() => new Promise((resolve) => setTimeout(resolve, 0)))
    .then(() => new Promise((resolve) => window.requestAnimationFrame(() => setTimeout(resolve, 0))));

const SEARCH = `
  <div id="panel-search">
    <a href="/a/wsa/one-tab-s1"><div>One</div></a>
    <a href="/a/wsa/two-tab-s2t3"><div>Two</div></a>
    <a href="/a/wsa/some-artist-tabs-a7"><div>Artist</div></a>
  </div>`;

test("звёздочки в поиске отражают избранное", async () => {
  const { window, document, calls } = setup(SEARCH, { "GET /api/favorites": { json: [{ songId: 2 }] } });
  await settle(window);

  const stars = [...document.querySelectorAll("#panel-search .fx-star")];
  assert.equal(stars.length, 2, "у строки артиста звёздочки нет");
  assert.equal(stars[0].getAttribute("aria-pressed"), "false");
  assert.equal(stars[1].getAttribute("aria-pressed"), "true");
  assert.deepEqual(calls, ["GET /api/favorites"]);
});

test("клик по звёздочке добавляет в избранное и не открывает таб", async () => {
  const { window, document, calls } = setup(SEARCH, {
    "GET /api/favorites": { json: [{ songId: 2 }] },
    PUT: { status: 200 },
    DELETE: { status: 204 },
  });
  await settle(window);

  let opened = 0;
  document.querySelectorAll("#panel-search a").forEach((a) => a.addEventListener("click", () => opened++));

  const [star1, star2] = document.querySelectorAll("#panel-search .fx-star");
  const click = new window.MouseEvent("click", { bubbles: true, cancelable: true });
  star1.dispatchEvent(click);
  await settle(window);

  assert.equal(opened, 0);
  assert.ok(click.defaultPrevented, "переход по ссылке отменён");
  assert.equal(star1.getAttribute("aria-pressed"), "true");
  assert.ok(calls.includes("PUT /api/favorites/1"));

  star2.dispatchEvent(new window.MouseEvent("click", { bubbles: true, cancelable: true }));
  await settle(window);
  assert.equal(star2.getAttribute("aria-pressed"), "false");
  assert.ok(calls.includes("DELETE /api/favorites/2"));
});

test("ошибка API откатывает звёздочку", async () => {
  const { window, document } = setup(SEARCH, {
    "GET /api/favorites": { json: [] },
    PUT: { status: 500 },
  });
  window.console.warn = () => {};
  await settle(window);

  const star = document.querySelector("#panel-search .fx-star");
  star.dispatchEvent(new window.MouseEvent("click", { bubbles: true, cancelable: true }));
  await settle(window);

  assert.equal(star.getAttribute("aria-pressed"), "false");
  assert.equal(star.hasAttribute("aria-busy"), false);
});

test("без входа (401) звёздочек нет", async () => {
  const { window, document } = setup(SEARCH, { "GET /api/favorites": { status: 401 } });
  await settle(window);
  assert.equal(document.querySelectorAll(".fx-star").length, 0);
});

test("избранное перечитывается при каждом открытии поиска", async () => {
  const { window, document, calls } = setup("", { "GET /api/favorites": { json: [] } });
  await settle(window);
  assert.deepEqual(calls, []);

  for (let i = 0; i < 2; i++) {
    document.body.insertAdjacentHTML("beforeend", SEARCH);
    await settle(window);
    document.getElementById("panel-search").remove();
    await settle(window);
  }
  assert.deepEqual(calls, ["GET /api/favorites", "GET /api/favorites"]);
});

test("окно скорости не закрывается кликом мимо: атрибут-исключение на <html>", async () => {
  const { window, document } = setup("");
  const root = document.documentElement;

  document.body.insertAdjacentHTML("beforeend", '<div role="dialog" data-tab-control="speed">Speed</div>');
  await settle(window);
  assert.equal(root.getAttribute("data-floating-direction"), "fx-pin");

  document.querySelector('[data-tab-control="speed"]').remove();
  await settle(window);
  assert.equal(root.hasAttribute("data-floating-direction"), false);
});

test("чужой data-floating-direction на <html> не трогаем", async () => {
  const { window, document } = setup("");
  const root = document.documentElement;
  root.setAttribute("data-floating-direction", "up");

  document.body.insertAdjacentHTML("beforeend", '<div data-tab-control="speed"></div>');
  await settle(window);
  document.querySelector('[data-tab-control="speed"]').remove();
  await settle(window);

  assert.equal(root.getAttribute("data-floating-direction"), "up");
});

test("док: разделители между группами кнопок", async () => {
  const ids = ["c-play", "c-loop", "mixer-button", "c-solo", "c-transpose", "c-export", "c-settings"];
  const items = ids.map((id) => `<div id="${id}" class="idrtTa_item"></div>`).join("");
  const { window, document } = setup(`<aside id="controls"><div class="idrtTa_controls">${items}</div></aside>`);
  await settle(window);

  const seps = [...document.querySelectorAll(".idrtTa_controls > .fx-sep")].map((s) => s.style.order);
  assert.deepEqual(seps, ["10", "20", "30"], "группа без первой кнопки (тюнера) — разделитель всё равно есть");
});

test("окна дока встают над настоящей высотой дока, даже если он перенёсся во второй ряд", async () => {
  let notify = null;
  const prepare = (window) => {
    window.ResizeObserver = class {
      constructor(cb) { notify = cb; }
      observe() {}
      disconnect() {}
    };
  };
  const { window, document } = setup('<aside id="controls"><div class="idrtTa_controls"></div></aside>', {}, prepare);
  await settle(window);
  const bar = document.querySelector(".idrtTa_controls");
  Object.defineProperty(bar, "offsetHeight", { configurable: true, get: () => 118 });
  notify([]);
  assert.equal(document.documentElement.style.getPropertyValue("--fx-dock-h"), "118px");

  const css = [...document.querySelectorAll("style")].map((s) => s.textContent).join("\n");
  assert.match(css, /--panel-bottom: calc\(var\(--dock-bottom\) \+ var\(--fx-dock-h, var\(--dock-height\)\)/);
});

test("смена хэша на сайте: классы находятся заново, CSS пересобирается", async () => {
  const { window, document } = setup(
    '<aside id="controls"><div class="NEWdck_controlsCard"><div class="NEWdck_controls"></div></div></aside>'
  );
  window.console.info = () => {};
  await settle(window);

  const css = [...document.querySelectorAll("style")].map((s) => s.textContent).join("\n");
  assert.match(css, /#controls \.NEWdck_controls \{/);
  assert.doesNotMatch(css, /idrtTa_controls \{/);
});

test("окно из слоя попапов дока (Download) встаёт как окно дока — над доком", async () => {
  const { window, document } = setup('<div class="idrtTa_viewportHost idrtTa_popupsLayer"></div>');
  const rect = window.HTMLElement.prototype.getBoundingClientRect;
  window.HTMLElement.prototype.getBoundingClientRect = function () {
    return this.style.position === "fixed" ? { ...rect.call(this), width: 360 } : rect.call(this);
  };
  await settle(window);

  document.querySelector(".idrtTa_popupsLayer").innerHTML =
    '<div><div class="NxM00W_root" style="position: fixed"><div role="dialog">Choose file format</div></div></div>';
  await settle(window);

  assert.equal(document.querySelector(".NxM00W_root").getAttribute("data-fixpopup"), "1");
  assert.equal(document.querySelector("[role=dialog]").hasAttribute("data-fixpopup"), false);
});

// Кнопка скорости в разметке сайта и подмена Resource Timing: entries — уже загруженные
// ресурсы, emit(url) — новый ресурс через PerformanceObserver
const SPEED = (label) => `
  <div id="c-speed"><button id="control-speed" aria-label="${label}"><div class="x_speed">
    <svg class="x_icon"><use href="/static/controls-sprite.svg#speed"></use></svg><text>${label}</text>
  </div></button></div>`;
const PART = (song, rev) => `https://cdn.example.net/${song}/${rev}/v0-abc/0.json`;

function withTiming(entries) {
  const timing = {};
  timing.prepare = (window) => {
    window.performance.getEntriesByType = (type) => (type === "resource" ? entries.map((name) => ({ name })) : []);
    window.PerformanceObserver = class {
      constructor(cb) { timing.emit = (name) => cb({ getEntries: () => [{ name }] }); }
      observe() {}
    };
  };
  return timing;
}

test("кнопка скорости: темп из JSON партии с учётом скорости", async () => {
  const timing = withTiming([PART(1, 10)]);
  const { window, document, calls } = setup(
    SPEED("Speed 100%"),
    { [`GET ${PART(1, 10)}`]: { json: { automations: { tempo: [{ measure: 0, position: 0, bpm: 123, type: 4 }] } } } },
    timing.prepare
  );
  await settle(window);

  const box = document.querySelector("#control-speed .x_speed");
  assert.equal(box.getAttribute("data-fx-bpm"), "123");
  assert.deepEqual(calls, [`GET ${PART(1, 10)}`]);

  document.getElementById("control-speed").setAttribute("aria-label", "Speed 50%");
  await settle(window);
  assert.equal(box.getAttribute("data-fx-bpm"), "62");

  // повторная загрузка той же ревизии JSON заново не читает
  timing.emit(PART(1, 10));
  await settle(window);
  assert.equal(calls.length, 1);
});

test("кнопка скорости: чужая песня или нет темпа — остаётся иконка", async () => {
  const timing = withTiming([PART(2, 20)]);
  const { window, document } = setup(
    SPEED("Speed 100%"),
    {
      [`GET ${PART(2, 20)}`]: { json: { automations: { tempo: [{ bpm: 90 }] } } },
      [`GET ${PART(1, 11)}`]: { json: { automations: {} } },
    },
    timing.prepare
  );
  await settle(window);
  const box = document.querySelector("#control-speed .x_speed");
  assert.equal(box.hasAttribute("data-fx-bpm"), false, "JSON от песни 2, а открыта песня 1");

  timing.emit(PART(1, 11));
  await settle(window);
  assert.equal(box.hasAttribute("data-fx-bpm"), false);
});

// visualViewport как в браузере: геттер width на прототипе, resize — событие объекта;
// у контейнера таба ширина tabW (в jsdom раскладки нет)
function withViewport({ width = 1024, tabW = 844, stored = null } = {}) {
  const vv = { resizes: 0 };
  vv.prepare = (window) => {
    class VisualViewport extends window.EventTarget {}
    Object.defineProperty(VisualViewport.prototype, "width", { configurable: true, get: () => width });
    window.VisualViewport = VisualViewport;
    window.visualViewport = new VisualViewport();
    window.visualViewport.addEventListener("resize", () => vv.resizes++);
    Object.defineProperty(window.HTMLElement.prototype, "clientWidth", {
      configurable: true, get() { return this.id === "tablature" ? tabW : 0; },
    });
    if (stored) window.localStorage.setItem("fx-tab-zoom", stored);
  };
  return vv;
}
const DOCK_WITH_TAB = `
  <aside id="controls"><div class="idrtTa_controls">
    <div id="c-print" class="idrtTa_item"></div><div id="c-settings" class="idrtTa_item"></div>
  </div></aside>
  <section id="tablature"><div class="w2moHa_multiTrackLinesWrap">
    <svg class="sQA3oa_multiTrackLineGroup" viewBox="0 0 844 197"></svg>
  </div></section>`;

test("размер таба: кнопка открывает окно, пресет и −/+ меняют размер и запоминаются", async () => {
  const vv = withViewport();
  const { window, document } = setup(DOCK_WITH_TAB, {}, vv.prepare);
  await settle(window);

  const btn = document.querySelector(".idrtTa_controls > #fx-zoom > button");
  assert.ok(btn, "кнопка вставлена в док");
  assert.equal(btn.textContent, "100%");
  assert.equal(window.visualViewport.width, 1024, "при 100% ширина настоящая");
  assert.equal(vv.resizes, 0);

  btn.click();
  const pop = document.getElementById("fx-zoom-pop");
  assert.ok(pop, "окно открыто");
  assert.equal(pop.getAttribute("data-fixpopup"), "zoom", "стоит как окна дока");
  assert.equal(btn.getAttribute("aria-expanded"), "true");
  assert.equal(pop.querySelector(".fx-pop-value").textContent, "100%");
  assert.deepEqual([...pop.querySelectorAll("[data-zoom]")].map((b) => b.textContent), ["60%", "70%", "80%", "90%", "100%"]);
  assert.equal(pop.querySelector('[data-zoom="100"]').getAttribute("aria-pressed"), "true");
  assert.equal(pop.querySelector('[data-act="1"]').disabled, true, "больше 100 нельзя");

  pop.querySelector('[data-zoom="80"]').click();
  assert.equal(btn.textContent, "80%");
  assert.equal(window.localStorage.getItem("fx-tab-zoom"), "80");
  assert.equal(vv.resizes, 1, "сайт пересчитывает раскладку");
  assert.equal(window.visualViewport.width, 1024 + 844 * (100 / 80 - 1));
  assert.equal(pop.querySelector('[data-zoom="80"]').getAttribute("aria-pressed"), "true");

  pop.querySelector('[data-act="-1"]').click();
  assert.equal(btn.textContent, "75%", "минус — на 5");
  assert.equal(pop.querySelector(".fx-pop-value").textContent, "75%");
  assert.equal(pop.querySelectorAll('[aria-pressed="true"]').length, 0, "75 — не пресет");

  // строка сжимается только по ширине: высоту держит CSS, SVG тянется без пропорций
  const root = document.documentElement;
  const line = document.querySelector(".sQA3oa_multiTrackLineGroup");
  assert.equal(root.getAttribute("data-fx-zoom"), "75");
  assert.equal(root.style.getPropertyValue("--fx-zoom"), "0.75");
  assert.equal(line.getAttribute("preserveAspectRatio"), "none");

  // новая строка (сайт дорисовал при прокрутке) получает то же
  line.parentElement.insertAdjacentHTML("afterend",
    '<div class="w2moHa_multiTrackLinesWrap"><svg class="sQA3oa_multiTrackLineGroup"></svg></div>');
  await settle(window);
  assert.equal(document.querySelectorAll('[preserveAspectRatio="none"]').length, 2);

  pop.querySelector('[data-zoom="100"]').click();
  assert.equal(window.localStorage.getItem("fx-tab-zoom"), null);
  assert.equal(window.visualViewport.width, 1024);
  assert.equal(root.hasAttribute("data-fx-zoom"), false);
  assert.equal(root.style.getPropertyValue("--fx-zoom"), "");
  assert.equal(document.querySelectorAll("[preserveAspectRatio]").length, 0, "в 100% строки родные");

  pop.querySelector('[data-act="close"]').click();
  assert.equal(document.getElementById("fx-zoom-pop"), null, "✕ закрывает");
  assert.equal(btn.getAttribute("aria-expanded"), "false");
});

test("размер таба: окно закрывается повторным кликом, Esc и кликом мимо", async () => {
  const vv = withViewport();
  const { window, document } = setup(DOCK_WITH_TAB, {}, vv.prepare);
  await settle(window);
  const btn = document.querySelector("#fx-zoom > button");
  const isOpen = () => !!document.getElementById("fx-zoom-pop");

  btn.click();
  assert.ok(isOpen());
  btn.dispatchEvent(new window.MouseEvent("pointerdown", { bubbles: true }));
  btn.click();
  assert.ok(!isOpen(), "повторный клик по кнопке");

  btn.click();
  document.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  assert.ok(!isOpen(), "Esc");

  btn.click();
  document.getElementById("fx-zoom-pop").querySelector(".fx-pop-value")
    .dispatchEvent(new window.MouseEvent("pointerdown", { bubbles: true }));
  assert.ok(isOpen(), "клик внутри окна не закрывает");
  document.getElementById("tablature").dispatchEvent(new window.MouseEvent("pointerdown", { bubbles: true }));
  assert.ok(!isOpen(), "клик мимо");
});

test("размер таба: сохранённый шаг применяется, когда таб появился", async () => {
  const vv = withViewport({ stored: "70" });
  const { window, document } = setup('<aside id="controls"><div class="idrtTa_controls"></div></aside>', {}, vv.prepare);
  await settle(window);
  assert.equal(window.visualViewport.width, 1024, "таба ещё нет");
  assert.equal(vv.resizes, 0);

  document.body.insertAdjacentHTML("beforeend", '<section id="tablature"></section>');
  await settle(window);
  assert.equal(vv.resizes, 1, "таб появился — сайт пересчитывает раскладку");
  assert.equal(window.visualViewport.width, 1024 + 844 * (100 / 70 - 1));
  assert.equal(document.querySelector("#fx-zoom > button").textContent, "70%");

  await settle(window);
  assert.equal(vv.resizes, 1, "ширина та же — повторно не дёргаем");
});

// окно скорости как на сайте: ползунок 0–100 равными долями между пресетами 15…175
const SPEED_POPUP = `
  <div data-tab-control="speed"><div class="DhZNRW_popup">
    <input type="range" aria-label="Speed" aria-valuetext="100%" min="0" max="100" step="any">
    <section><div class="DhZNRW_grid">
      ${[15, 25, 50, 75, 100, 125, 150, 175].map((v) =>
        `<button type="button" class="qzgWxW_button DhZNRW_preset${v === 100 ? " DhZNRW_active" : ""}">${v}%</button>`).join("")}
      <button type="button" aria-label="Fine tuning" class="qzgWxW_button DhZNRW_preset">- | +</button>
    </div></section>
  </div></div>`;

test("пресеты скорости: родные спрятаны, свои 50–100 перед «− | +» ставят скорость ползунком", async () => {
  const { window, document } = setup(SPEED_POPUP);
  await settle(window);
  const grid = document.querySelector(".DhZNRW_grid");
  const slider = document.querySelector('input[type="range"]');

  const ours = [...grid.querySelectorAll("[data-fx-speed]")];
  assert.deepEqual(ours.map((b) => b.textContent), ["50%", "60%", "70%", "80%", "90%", "100%"]);
  assert.equal(grid.querySelectorAll("[data-fx-native]").length, 8, "родные пресеты спрятаны");
  assert.equal(grid.lastElementChild.getAttribute("aria-label"), "Fine tuning", "«− | +» остаётся последней");
  assert.equal(ours[0].className, "qzgWxW_button DhZNRW_preset", "вид родных, без класса активного");
  assert.equal(grid.querySelector('[data-fx-speed="100"]').getAttribute("aria-pressed"), "true");

  let input = 0;
  slider.addEventListener("input", () => input++);
  grid.querySelector('[data-fx-speed="60"]').click();
  assert.equal(input, 1, "React узнаёт о смене через input");
  assert.equal(Number(slider.value), ((2 + 10 / 25) / 7) * 100);

  // сайт обновил ползунок — подсветка переезжает
  slider.setAttribute("aria-valuetext", "60%");
  document.body.appendChild(document.createElement("i"));
  await settle(window);
  assert.equal(grid.querySelector('[data-fx-speed="60"]').getAttribute("aria-pressed"), "true");
  assert.equal(grid.querySelector('[data-fx-speed="100"]').getAttribute("aria-pressed"), "false");

  await settle(window);
  assert.equal(grid.querySelectorAll("[data-fx-speed]").length, 6, "повторно не добавляются");
});
