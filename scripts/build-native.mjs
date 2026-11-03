import { spawnSync } from "node:child_process";
import { cpSync, mkdirSync, existsSync } from "node:fs";
import path from "node:path";
const python = path.resolve(".native-venv/Scripts/python.exe");
function run(args) {
  const result = spawnSync(python, args, {
    stdio: "inherit",
    windowsHide: true,
    shell: false,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
if (!existsSync(python)) throw new Error("Run npm run native:setup first.");
run(["-m", "pip", "install", "pyinstaller==6.22.3"]);
run([
  "-m",
  "PyInstaller",
  "--noconfirm",
  "--clean",
  "--onedir",
  "--name",
  "SelahAudio",
  "--distpath",
  "native-dist",
  "--workpath",
  "native-build",
  "--specpath",
  "native-build",
  "--collect-all",
  "pedalboard",
  "--collect-all",
  "_sounddevice_data",
  "--copy-metadata",
  "pedalboard",
  "--copy-metadata",
  "sounddevice",
  "--copy-metadata",
  "numpy",
  "--copy-metadata",
  "cffi",
  "native/engine.py",
]);
mkdirSync("native-dist/SelahAudio/source", { recursive: true });
cpSync("native", "native-dist/SelahAudio/source/native", { recursive: true });
cpSync("native/LICENSE", "native-dist/SelahAudio/LICENSE");
cpSync("third_party", "native-dist/SelahAudio/third_party", {
  recursive: true,
});
const base = spawnSync(python, ["-c", "import sys; print(sys.base_prefix)"], {
  encoding: "utf8",
  windowsHide: true,
  shell: false,
}).stdout?.trim();
if (base && existsSync(path.join(base, "LICENSE.txt")))
  cpSync(
    path.join(base, "LICENSE.txt"),
    "native-dist/SelahAudio/third_party/licenses/CPYTHON-LICENSE.txt",
  );
if (existsSync("THIRD_PARTY_NOTICES.md"))
  cpSync(
    "THIRD_PARTY_NOTICES.md",
    "native-dist/SelahAudio/THIRD_PARTY_NOTICES.md",
  );
console.log(
  "Packaged native runtime includes source and dependency license metadata.",
);
