import { spawn } from "node:child_process";
import { startServer } from "./index.mjs";
await startServer(5174);
const vite = spawn(process.execPath, ["node_modules/vite/bin/vite.js"], {
  stdio: "inherit",
  windowsHide: true,
});
vite.on("exit", (code) => process.exit(code ?? 0));
process.on("SIGINT", () => {
  vite.kill();
  process.exit(0);
});
