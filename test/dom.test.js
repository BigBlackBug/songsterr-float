"use strict";
/* Поведение src/core.js на странице: скрипт запускается в jsdom так же, как
   контент-скрипт, а API сайта подменяется моком fetch. */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const { JSDOM, VirtualConsole } = require("jsdom");

const CODE = fs.readFileSync(path.join(__dirname, "..", "src", "core.js"), "utf8");

function setup(body, routes = {}) {
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
  assert.deepEqual(seps, ["10", "20", "30"]);
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
