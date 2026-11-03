export type NativePlugin = {
  id: string;
  name: string;
  path: string;
  bypass: boolean;
  latencySamples: number;
};
export type NativeStatus = {
  available: boolean;
  running: boolean;
  driver: string | null;
  inputDevice: number | null;
  outputDevice: number | null;
  inputChannel: number;
  outputChannels: number[];
  inputGain: number;
  outputGain: number;
  gateThreshold: number;
  sampleRate: number;
  blockSize: number;
  monitor: boolean;
  inputLatencyMs: number;
  outputLatencyMs: number;
  cpuLoad: number;
  maxCpuLoad: number;
  xruns: number;
  lockMisses: number;
  clipped: number;
  inputPeak: number;
  outputPeak: number;
  error: string;
  playing: boolean;
  position: number;
  order: string[];
  plugins: NativePlugin[];
  irLoaded: boolean;
  editorOpen: string | null;
  gpu: boolean;
};
export type NativeDevice = {
  id: number;
  name: string;
  api: string;
  inputs: number;
  outputs: number;
  defaultRate: number;
};
export async function nativeRequest<T = NativeStatus>(
  command: string,
  data: unknown = {},
): Promise<T> {
  const response = await fetch("/api/native/request", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ command, data }),
  });
  const result = await response.json();
  if (!response.ok || (result.error && result.available === undefined))
    throw new Error(result.error ?? "Native audio command failed.");
  return result as T;
}
export async function nativeUpload(file: File, kind: "ir" | "reference") {
  const response = await fetch("/api/native/upload", {
    method: "POST",
    headers: {
      "Content-Type": "application/octet-stream",
      "X-Selah-Kind": kind,
      "X-Selah-Filename": encodeURIComponent(file.name),
    },
    body: file,
  });
  const result = await response.json();
  if (!response.ok)
    throw new Error(result.error ?? "Could not load local audio.");
  return result;
}
