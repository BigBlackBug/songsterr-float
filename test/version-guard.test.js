"use strict";
/* scripts/version-guard.js: сравнение версий и настоящие git-хуки во временном репозитории. */
const test = require("node:test");
const assert = require("node:assert/strict");
const cp = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const { compare, bumpPatch, parse } = require("../scripts/version-guard.js");

const ROOT = path.join(__dirname, "..");
const PROJECT_FILES = [
  "package.json", "package-lock.json", "build.js", "songsterr-float.user.js",
  "src", "extension", "scripts", ".githooks",
];

test("compare и bumpPatch", () => {
  assert.ok(compare("1.0.1", "1.0.0") > 0);
  assert.ok(compare("1.10.0", "1.9.9") > 0);
  assert.ok(compare("2.0.0", "10.0.0") < 0);
  assert.equal(compare("1.2.3", "1.2.3"), 0);
  assert.equal(bumpPatch("1.0.9"), "1.0.10");
  assert.throws(() => parse("1.0"), /X\.Y\.Z/);
});

// временный репозиторий с копией проекта и включёнными хуками
function makeRepo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "songsterr-float-vg-"));
  for (const f of PROJECT_FILES) fs.cpSync(path.join(ROOT, f), path.join(dir, f), { recursive: true });

  const env = {
    ...process.env,
    GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@example.com",
    GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@example.com",
  };
  const run = (cmd, args) =>
    cp.spawnSync(cmd, args, { cwd: dir, env, encoding: "utf8" });
  const git = (...args) => {
    const r = run("git", args);
    if (r.status !== 0) throw new Error(`git ${args.join(" ")}: ${r.stderr}`);
    return r.stdout.trim();
  };

  git("init", "-q", "-b", "main");
  git("config", "commit.gpgsign", "false");
  assert.equal(run("node", ["scripts/version-guard.js", "install"]).status, 0);
  git("add", "-A");
  git("commit", "-q", "-m", "init");

  const version = (rev = "HEAD") => JSON.parse(git("show", `${rev}:package.json`)).version;
  const touch = (msg) => {
    fs.appendFileSync(path.join(dir, "src", "core.js"), `// ${msg}\n`);
    git("add", "src/core.js");
  };
  const cleanup = () => fs.rmSync(dir, { recursive: true, force: true });

  return { dir, git, run, version, touch, cleanup };
}

test("pre-commit: коммит в main сам поднимает патч и пересобирает userscript", (t) => {
  const repo = makeRepo();
  t.after(repo.cleanup);
  const before = repo.version();

  repo.touch("change");
  repo.git("commit", "-q", "-m", "change");

  const after = bumpPatch(before);
  assert.equal(repo.version(), after);
  assert.match(repo.git("show", "HEAD:songsterr-float.user.js"), new RegExp(`@version\\s+${after.replace(/\./g, "\\.")}\\n`));
  assert.equal(JSON.parse(repo.git("show", "HEAD:extension/manifest.json")).version, after);
  assert.equal(JSON.parse(repo.git("show", "HEAD:package-lock.json")).version, after);
  assert.equal(repo.git("status", "--porcelain", "--untracked-files=no"), "", "всё попало в коммит");
});

test("pre-commit: версию, поднятую вручную, не трогает", (t) => {
  const repo = makeRepo();
  t.after(repo.cleanup);
  const [major, minor] = parse(repo.version());
  const manual = `${major}.${minor + 1}.0`;

  const pkgPath = path.join(repo.dir, "package.json");
  const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
  pkg.version = manual;
  fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n");
  repo.git("add", "package.json");
  repo.git("commit", "-q", "-m", "feature");

  assert.equal(repo.version(), manual);
  assert.match(repo.git("show", "HEAD:songsterr-float.user.js"), new RegExp(`@version\\s+${manual.replace(/\./g, "\\.")}\\n`));
});

test("pre-commit: в других ветках версию не трогает", (t) => {
  const repo = makeRepo();
  t.after(repo.cleanup);
  const before = repo.version();

  repo.git("switch", "-q", "-c", "feature");
  repo.touch("wip");
  repo.git("commit", "-q", "-m", "wip");

  assert.equal(repo.version(), before);
});

test("pre-push: не пускает в main коммит без новой версии", (t) => {
  const repo = makeRepo();
  t.after(repo.cleanup);
  const remote = fs.mkdtempSync(path.join(os.tmpdir(), "songsterr-float-vg-remote-"));
  t.after(() => fs.rmSync(remote, { recursive: true, force: true }));

  repo.git("init", "-q", "--bare", remote);
  repo.git("remote", "add", "origin", remote);
  repo.git("push", "-q", "origin", "main");

  repo.touch("bumped");
  repo.git("commit", "-q", "-m", "bumped");
  repo.git("push", "-q", "origin", "main");

  repo.touch("sneaky");
  repo.git("commit", "-q", "--no-verify", "-m", "sneaky");
  const push = repo.run("git", ["push", "-q", "origin", "main"]);

  assert.notEqual(push.status, 0);
  assert.match(push.stderr, /sneaky — версия/);
  assert.equal(repo.git("--git-dir", remote, "log", "-1", "--format=%s", "main"), "bumped");
});
