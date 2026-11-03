import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { readdir, readFile, mkdir, writeFile, open } from "node:fs/promises";
import { createInterface } from "node:readline";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const allowed = new Set([
  "status",
  "devices",
  "configure",
  "start",
  "stop",
  "prepare",
  "transport",
  "monitor",
  "load",
  "remove",
  "bypass",
  "parameters",
  "parameter",
  "editor",
  "closeEditor",
  "ir",
  "clearIR",
  "snapshot",
  "restore",
  "render",
  "reference",
]);
export class NativeEngine {
  child = null;
  pending = new Map();
  sequence = 0;
  fault = null;
  editorOpen = false;
  ready = null;
  uploadPath = null;
  async launch() {
    if (this.child) return this.ready;
    if (this.fault)
      throw new Error(this.fault + " Use Restart engine to recover.");
    const packaged =
      process.resourcesPath &&
      path.join(process.resourcesPath, "SelahAudio", "SelahAudio.exe");
    const python =
      process.env.SELAH_NATIVE_PYTHON ||
      path.join(
        root,
        ".native-venv",
        process.platform === "win32" ? "Scripts/python.exe" : "bin/python",
      );
    if (!(packaged && existsSync(packaged)) && !existsSync(python))
      throw new Error(
        "Native audio runtime is missing. Use the full desktop release, or run npm run native:setup from source.",
      );
    const executable = packaged && existsSync(packaged) ? packaged : python;
    const args =
      executable === packaged
        ? []
        : ["-u", path.join(root, "native", "engine.py")];
    this.child = spawn(executable, args, {
      windowsHide: true,
      shell: false,
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env, SD_ENABLE_ASIO: "1", PYTHONUNBUFFERED: "1" },
    });
    const child = this.child;
    let stderr = "";
    child.stderr.on("data", (b) => {
      stderr = (stderr + b).slice(-3000);
    });
    this.ready = new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.fault = "Native engine startup timed out.";
        child.kill();
        reject(new Error(this.fault));
      }, 30000);
      const lines = createInterface({ input: child.stdout });
      lines.on("line", (line) => {
        let message;
        try {
          message = JSON.parse(line);
        } catch {
          return;
        }
        if (message.event === "ready") {
          clearTimeout(timer);
          resolve();
          return;
        }
        if (message.event === "editorError") {
          this.editorOpen = false;
          return;
        }
        const request = this.pending.get(message.id);
        if (!request) return;
        this.pending.delete(message.id);
        clearTimeout(request.timer);
        if (message.error) request.reject(new Error(message.error));
        else request.resolve(message.result);
      });
      child.on("error", (error) => {
        clearTimeout(timer);
        reject(error);
      });
      child.on("close", (code) => {
        clearTimeout(timer);
        if (this.child !== child) return;
        this.child = null;
        this.editorOpen = false;
        this.fault = `Native audio process stopped (${code}). A plugin or device driver may have failed.`;
        if (/ModuleNotFoundError/.test(stderr))
          this.fault =
            "Native audio dependencies are missing. Run npm run native:setup.";
        for (const request of this.pending.values()) {
          clearTimeout(request.timer);
          request.reject(new Error(this.fault));
        }
        this.pending.clear();
        reject(new Error(this.fault));
      });
    });
    return this.ready;
  }
  async request(command, data = {}) {
    if (command === "restart") {
      this.close();
      this.fault = null;
      return this.request("status");
    }
    if (!allowed.has(command)) throw new Error("Unknown native audio command.");
    if (
      this.editorOpen &&
      !["status", "stop", "monitor", "closeEditor"].includes(command)
    )
      throw new Error(
        "Close the native plugin editor before changing rack structure or parameters here.",
      );
    await this.launch();
    const result = await new Promise((resolve, reject) => {
      const id = ++this.sequence;
      const timer = setTimeout(
        () => {
          this.pending.delete(id);
          reject(
            new Error(
              "Native command timed out. Close any plugin dialog, or restart the engine.",
            ),
          );
        },
        command === "render"
          ? 180000
          : command === "load" || command === "restore"
            ? 60000
            : 20000,
      );
      this.pending.set(id, { resolve, reject, timer });
      this.child.stdin.write(
        JSON.stringify({ id, command, data }) + "\n",
        (error) => {
          if (error) {
            clearTimeout(timer);
            this.pending.delete(id);
            reject(error);
          }
        },
      );
    });
    if (command === "editor") this.editorOpen = true;
    if (command === "closeEditor") this.editorOpen = false;
    if (command === "status") this.editorOpen = !!result.editorOpen;
    return result;
  }
  async status() {
    try {
      return await this.request("status");
    } catch (error) {
      return {
        available: false,
        running: false,
        error: error.message,
        plugins: [],
        order: [],
        gpu: false,
      };
    }
  }
  close() {
    const child = this.child;
    this.child = null;
    this.ready = null;
    this.editorOpen = false;
    if (child) {
      child.stdin.end(JSON.stringify({ id: 0, command: "shutdown" }) + "\n");
      const timer = setTimeout(() => child.kill(), 2000);
      timer.unref();
      child.once("close", () => clearTimeout(timer));
    }
    for (const request of this.pending.values()) {
      clearTimeout(request.timer);
      request.reject(new Error("Native engine stopped."));
    }
    this.pending.clear();
  }
}
export async function scanPlugins(extraRoots = []) {
  if (
    !Array.isArray(extraRoots) ||
    extraRoots.length > 12 ||
    !extraRoots.every((p) => typeof p === "string" && p.length < 1000)
  )
    throw new Error("Invalid plugin folders.");
  const roots = [
    ...new Set([
      path.join(
        process.env.CommonProgramFiles || "C:/Program Files/Common Files",
        "VST3",
      ),
      path.join(
        process.env.LOCALAPPDATA || os.homedir(),
        "Programs/Common/VST3",
      ),
      path.join(root, ".guitarsim/plugins"),
      ...extraRoots.map((p) => path.resolve(p)),
    ]),
  ];
  const found = [],
    visited = new Set();
  async function supportsArchitecture(file) {
    let handle;
    try {
      handle = await open(file, "r");
      const header = Buffer.alloc(64);
      await handle.read(header, 0, 64, 0);
      if (header.toString("ascii", 0, 2) !== "MZ") return true;
      const pe = Buffer.alloc(6);
      await handle.read(pe, 0, 6, header.readUInt32LE(60));
      return (
        pe.toString("ascii", 0, 4) !== "PE\u0000\u0000" ||
        pe.readUInt16LE(4) === 0x8664
      );
    } catch {
      return true;
    } finally {
      await handle?.close();
    }
  }
  async function walk(dir, depth) {
    if (depth > 5 || found.length >= 500 || visited.has(dir)) return;
    visited.add(dir);
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.isSymbolicLink()) continue;
      const file = path.join(dir, entry.name);
      if (
        entry.name.toLowerCase().endsWith(".vst3") &&
        (!entry.isFile() || (await supportsArchitecture(file)))
      )
        found.push({ name: entry.name.slice(0, -5), path: file });
      else if (entry.isDirectory()) await walk(file, depth + 1);
    }
  }
  for (const dir of roots) await walk(dir, 0);
  return { roots, plugins: found.sort((a, b) => a.name.localeCompare(b.name)) };
}
export async function localAudioUpload(req, engine, kind, name) {
  const max = kind === "ir" ? 32 * 1024 * 1024 : 150 * 1024 * 1024;
  const ext = path.extname(name).toLowerCase();
  if (
    !(
      kind === "ir"
        ? [".wav", ".aif", ".aiff"]
        : [".wav", ".mp3", ".flac", ".aif", ".aiff", ".ogg", ".m4a"]
    ).includes(ext)
  )
    throw new Error("Unsupported audio file type.");
  const status = await engine.status();
  if (kind === "ir" && status.running)
    throw new Error("Stop the native engine before loading a cabinet IR.");
  if (!status.available) throw new Error(status.error);
  const chunks = [];
  let bytes = 0;
  for await (const chunk of req) {
    bytes += chunk.length;
    if (bytes > max) throw new Error("Audio upload exceeds its size limit.");
    chunks.push(chunk);
  }
  const directory = path.join(os.tmpdir(), "selah-native-local");
  await mkdir(directory, { recursive: true });
  const target = path.join(directory, `${kind}-${process.pid}${ext}`);
  await writeFile(target, Buffer.concat(chunks));
  // This is a local-device transfer only, never sent to OpenAI or a remote host.
  if (kind === "ir") return engine.request("ir", { path: target });
  return engine.request("reference", { path: target });
}
