import { spawnSync } from "node:child_process";
import path from "node:path";
const python = path.resolve(
  ".native-venv",
  process.platform === "win32" ? "Scripts/python.exe" : "bin/python",
);
const result = spawnSync(
  python,
  ["-m", "unittest", "discover", "-s", "native/tests", "-v"],
  { stdio: "inherit", windowsHide: true, shell: false },
);
if (result.error) throw result.error;
process.exit(result.status ?? 1);
