import { packager } from "@electron/packager";
import { mkdir } from "node:fs/promises";
import path from "node:path";
await mkdir("release", { recursive: true });
const dirs = await packager({
  dir: ".",
  name: "Selah",
  platform: "win32",
  arch: "x64",
  out: "release",
  overwrite: true,
  asar: true,
  prune: true,
  ignore: [
    /^\/\.(?:git|playwright-cli|guitarsim)(?:\/|$)/,
    /^\/(?:src|tests|output|release|scripts|node_modules)(?:\/|$)/,
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
