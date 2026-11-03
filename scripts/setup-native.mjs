import { spawnSync } from "node:child_process";
import path from "node:path";
import { existsSync } from "node:fs";
const root = process.cwd();
const python = path.join(
  root,
  ".native-venv",
  process.platform === "win32" ? "Scripts/python.exe" : "bin/python",
);
function run(exe, args) {
  const result = spawnSync(exe, args, {
    stdio: "inherit",
    windowsHide: true,
    shell: false,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
if (!existsSync(python))
  run(process.env.SELAH_SYSTEM_PYTHON || "python", [
    "-m",
    "venv",
    path.join(root, ".native-venv"),
  ]);
run(python, [
  "-m",
  "pip",
  "install",
  "-r",
  path.join(root, "native", "requirements.txt"),
]);
console.log(
  "Native CPU/ASIO/VST3 runtime ready. No audio device has been opened.",
);
