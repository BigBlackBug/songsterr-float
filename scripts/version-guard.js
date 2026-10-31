#!/usr/bin/env node
"use strict";
/* Каждый коммит в main несёт новую версию: Tampermonkey обновляет userscript,
   только когда растёт @version.
 *
 *   node scripts/version-guard.js install     — включить хуки из .githooks (npm install делает это сам)
 *   node scripts/version-guard.js pre-commit  — коммит в main без поднятой версии → поднять патч,
 *                                               пересобрать и добавить в тот же коммит
 *   node scripts/version-guard.js pre-push    — не пускать в main коммиты, где версия не выросла
 */
const cp = require("child_process");
const fs = require("fs");
const path = require("path");

const MAIN = "main";
// файлы, где живёт номер версии (сборка разносит его из package.json)
const VERSIONED = ["package.json", "package-lock.json", "extension/manifest.json", "songsterr-float.user.js"];
const ZERO = /^0+$/;

/* ---------- версии ---------- */

function parse(v) {
  const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(String(v));
  if (!m) throw new Error(`версия «${v}» не в формате X.Y.Z`);
  return m.slice(1).map(Number);
}

function compare(a, b) {
  const x = parse(a);
  const y = parse(b);
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] - y[i];
  return 0;
}

function bumpPatch(v) {
  const [major, minor, patch] = parse(v);
  return `${major}.${minor}.${patch + 1}`;
}

/* ---------- git ---------- */

const git = (args, opts = {}) => cp.execFileSync("git", args, { encoding: "utf8", ...opts }).trim();

function tryGit(args) {
  try {
    return git(args, { stdio: ["ignore", "pipe", "ignore"] });
  } catch {
    return null;
  }
}

// версия из package.json в ревизии: "HEAD", "<sha>", "" (индекс)
function versionAt(rev) {
  const text = tryGit(["show", `${rev}:package.json`]);
  return text ? JSON.parse(text).version : null;
}

/* ---------- команды ---------- */

function install() {
  if (tryGit(["rev-parse", "--is-inside-work-tree"]) !== "true") return; // скачали архивом, не git
  git(["config", "core.hooksPath", ".githooks"]);
}

function setVersion(root, version) {
  const edit = (file, fn) => {
    const p = path.join(root, file);
    if (!fs.existsSync(p)) return;
    const json = JSON.parse(fs.readFileSync(p, "utf8"));
    fn(json);
    fs.writeFileSync(p, JSON.stringify(json, null, 2) + "\n");
  };

  edit("package.json", (j) => (j.version = version));
  edit("package-lock.json", (j) => {
    j.version = version;
    if (j.packages && j.packages[""]) j.packages[""].version = version;
  });
  edit("extension/manifest.json", (j) => (j.version = version));
}

function preCommit() {
  if (tryGit(["symbolic-ref", "--short", "HEAD"]) !== MAIN) return;

  const prev = versionAt("HEAD");
  if (!prev) return; // самый первый коммит

  const root = git(["rev-parse", "--show-toplevel"]);
  let staged = versionAt("");

  if (compare(staged, prev) < 0) {
    fail(`версия ${staged} меньше, чем в предыдущем коммите (${prev})`);
  }

  if (compare(staged, prev) === 0) {
    // правим файлы в рабочей копии — там не должно быть чужих неотмеченных правок
    const dirty = VERSIONED.filter(
      (f) => fs.existsSync(path.join(root, f)) && tryGit(["diff", "--quiet", "--", f]) === null
    );
    if (dirty.length) {
      fail(
        `коммит в ${MAIN} должен поднять версию, но в ${dirty.join(", ")} есть неотмеченные изменения.\n` +
        `Добавь их (git add) или подними версию сам: npm version patch --no-git-tag-version`
      );
    }
    staged = bumpPatch(prev);
    setVersion(root, staged);
    console.log(`[version-guard] ${prev} → ${staged}`);
  }

  // userscript и манифест должны нести ту же версию — пересобираем, если отстали
  const userscript = tryGit(["show", ":songsterr-float.user.js"]) || "";
  const built = (/@version\s+(\S+)/.exec(userscript) || [])[1];
  if (built !== staged) {
    cp.execFileSync(process.execPath, [path.join(root, "build.js")], { cwd: root, stdio: "inherit" });
  }

  const toAdd = VERSIONED.filter((f) => fs.existsSync(path.join(root, f)));
  git(["add", "--", ...toAdd]);
}

// stdin pre-push: "<local ref> <local sha> <remote ref> <remote sha>" на строку
function prePush(input) {
  const problems = [];

  for (const line of input.split("\n")) {
    const [, localSha, remoteRef, remoteSha] = line.trim().split(/\s+/);
    if (remoteRef !== `refs/heads/${MAIN}` || !localSha || ZERO.test(localSha)) continue;

    const range = remoteSha && !ZERO.test(remoteSha) ? `${remoteSha}..${localSha}` : localSha;
    const list = tryGit(["rev-list", "--first-parent", range]);
    if (list === null) {
      console.warn(`[version-guard] не смог перечислить ${range} — сделай git fetch; проверка пропущена`);
      continue;
    }

    for (const sha of list.split("\n").filter(Boolean)) {
      const v = versionAt(sha);
      const p = versionAt(`${sha}^`);
      if (v && p && compare(v, p) <= 0) {
        problems.push(`${sha.slice(0, 7)} ${tryGit(["log", "-1", "--format=%s", sha])} — версия ${v}, до него ${p}`);
      }
    }
  }

  if (problems.length) {
    fail(
      `в ${MAIN} уходят коммиты без новой версии:\n  ${problems.join("\n  ")}\n` +
      `Подними version в package.json (npm version patch --no-git-tag-version), npm run build, и закоммить.`
    );
  }
}

function fail(message) {
  console.error(`[version-guard] ${message}`);
  process.exit(1);
}

module.exports = { parse, compare, bumpPatch };

if (require.main === module) {
  const cmd = process.argv[2];
  try {
    if (cmd === "install") install();
    else if (cmd === "pre-commit") preCommit();
    else if (cmd === "pre-push") prePush(fs.readFileSync(0, "utf8"));
    else fail(`неизвестная команда: ${cmd || "(пусто)"}`);
  } catch (e) {
    fail(e.message);
  }
}
