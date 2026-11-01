// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require("eslint-config-expo/flat");

module.exports = defineConfig([
  expoConfig,
  {
    // functions/ is linted/typechecked as its own project; .claude/ holds other branches' worktrees.
    ignores: ["dist/*", "functions/*", ".claude/*"],
  }
]);
