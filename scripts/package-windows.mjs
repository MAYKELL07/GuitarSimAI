import { packager } from "@electron/packager";
import { mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
await mkdir("release", { recursive: true });
if (!existsSync("native-dist/SelahAudio/SelahAudio.exe"))
  throw new Error(
    "Build the native audio runtime with npm run native:build first.",
  );
const dirs = await packager({
  dir: ".",
  name: "Selah",
  platform: "win32",
  arch: "x64",
  out: "release",
  overwrite: true,
  asar: true,
  prune: true,
  extraResource: ["native-dist/SelahAudio"],
  ignore: [
    /^\/\.(?:git|playwright-cli|guitarsim|native-venv)(?:\/|$)/,
    /^\/(?:src|tests|output|release|scripts|node_modules|native-dist|native-build)(?:\/|$)/,
    /^\/(?:vite\.config\.ts|tsconfig\.json|package-lock\.json|.*\.tsbuildinfo)$/,
  ],
  appCopyright: "Copyright (c) 2026 GuitarSim AI contributors",
  executableName: "Selah",
  win32metadata: {
    CompanyName: "GuitarSim AI",
    FileDescription: "Selah — GuitarSim AI",
    ProductName: "Selah Guitar Studio",
  },
});
console.log(`Portable app: ${path.resolve(dirs[0])}`);
