import { build } from "esbuild";
import process from "process";
import builtins from "builtin-modules";

const prod = process.argv[2] === "production";
const watch = process.argv[2] === "watch";

build({
  entryPoints: ["src/index.ts"],
  bundle: true,
  external: ["obsidian", ...builtins],
  format: "cjs",
  watch,
  target: "es2018",
  minify: prod ? true : false,
  logLevel: "info",
  sourcemap: prod ? false : "inline",
  allowOverwrite: true,
  treeShaking: true,
  outfile: "main.js",
}).catch(() => process.exit(1));
