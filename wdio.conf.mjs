import path from "node:path";
import { obsidianBetaAvailable } from "wdio-obsidian-service";

const rootDir = path.resolve(".");
const cacheDir = path.join(rootDir, ".obsidian-cache");
const vaultPath = path.join(rootDir, "test", "vaults", "rollover");

const capabilities = [];

// Pin Templater to a known stable release. Latest as of 2026-05-06 is 2.20.2,
// but we deliberately pin to a slightly older known-stable tag for
// reproducibility — bumping this should be a deliberate decision.
const TEMPLATER_VERSION = "2.19.3";

const pluginsList = [
  rootDir,
  { repo: "SilentVoid13/Templater", version: TEMPLATER_VERSION },
];

capabilities.push({
  browserName: "obsidian",
  browserVersion: "1.11.5",
  "wdio:obsidianOptions": {
    cacheDir,
    installerVersion: "latest",
    plugins: pluginsList,
    vault: vaultPath,
  },
});

const includeCatalyst = process.env.OBSIDIAN_CATALYST === "1";
if (includeCatalyst && (await obsidianBetaAvailable(cacheDir))) {
  capabilities.push({
    browserName: "obsidian",
    browserVersion: "latest-beta",
    "wdio:obsidianOptions": {
      cacheDir,
      installerVersion: "latest",
      plugins: pluginsList,
      vault: vaultPath,
    },
  });
}

export const config = {
  runner: "local",
  specs: ["./test/specs/**/*.e2e.js"],
  maxInstances: 1,
  capabilities,
  logLevel: "info",
  services: ["obsidian"],
  reporters: ["spec", "obsidian"],
  framework: "mocha",
  mochaOpts: {
    timeout: 120000,
  },
};
