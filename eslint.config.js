"use strict";
const js = require("@eslint/js");
const globals = require("globals");

module.exports = [
  { ignores: ["dist/", "node_modules/", ".worktrees/", "songsterr-float.user.js"] },
  js.configs.recommended,
  {
    files: ["src/**/*.js"],
    languageOptions: {
      sourceType: "script",
      globals: {
        ...globals.browser,
        GM_addStyle: "readonly",
        content: "readonly", // Firefox: fetch от имени страницы
        module: "readonly",  // экспорт для тестов
      },
    },
  },
  {
    files: ["build.js", "eslint.config.js", "test/**/*.js"],
    languageOptions: { sourceType: "commonjs", globals: globals.node },
  },
];
