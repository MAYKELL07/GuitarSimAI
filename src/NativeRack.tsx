import { useEffect, useRef, useState } from "react";
import {
  Activity,
  ArrowDown,
  ArrowDownToLine,
  ArrowUp,
  AudioLines,
  Check,
  Cpu,
  ExternalLink,
  FolderOpen,
  LoaderCircle,
  Plus,
  Power,
  RefreshCw,
  SlidersHorizontal,
  VolumeX,
  X,
} from "lucide-react";
import type { NativeDevice, NativeStatus } from "./native";
import { nativeRequest, nativeUpload } from "./native";
import type { Session, Tone } from "./music";

const blockNames: Record<string, string> = {
  gate: "Noise gate",
  compressor: "Compressor",
  drive: "Drive",
  cabinet: "Cabinet / IR",
  chorus: "Chorus",
  delay: "Tempo delay",
  reverb: "Reverb",
};
const freePlugins = [
  {
    name: "Neural Amp Modeler",
    maker: "Steven Atkinson",
    tag: "AMP MODELS",
    description:
      "Load neural amp / pedal captures and cabinet IRs. Capture quality and input calibration matter.",
    url: "https://github.com/sdatkinson/NeuralAmpModelerPlugin/releases/tag/v0.7.13",
    source: "Open source · free",
    note: "Verified legacy Windows binary. Models must support this plugin version.",
  },
  {
    name: "BYOD",
    maker: "Chowdhury DSP",
    tag: "MODULAR PEDALBOARD",
    description:
      "Build distortion and tone-shaping circuits inside a configurable effect graph.",
    url: "https://chowdsp.com/products.html#byod",
    source: "Open source · free base plugin",
    note: "Optional paid add-on packs are not required.",
  },
  {
    name: "Chow Matrix",
    maker: "Chowdhury DSP",
    tag: "DELAY / AMBIENT",
    description:
      "Branching, modulated delay lines for rhythmic repeats and ambient textures.",
    url: "https://chowdsp.com/products.html",
    source: "Open source · free",
    note: "Choose the Windows VST3 installer.",
  },
  {
    name: "TDR Nova",
    maker: "Tokyo Dawn Labs",
    tag: "DYNAMIC EQ",
    description:
      "Four dynamic EQ bands, compression, and filters for shaping a guitar mix.",
    url: "https://www.tokyodawn.net/tdr-nova/",
    source: "Freeware · standard edition",
    note: "The paid Gentleman’s Edition is a separate product.",
  },
  {
    name: "Chow Tape Model",
    maker: "Chowdhury DSP",
    tag: "TAPE / SATURATION",
    description:
      "Tape-machine modeling, saturation, wow, and flutter for color and movement.",
    url: "https://chowdsp.com/products.html",
    source: "Open source · free",
    note: "Download from the official product page.",
  },
];
function db(value: number) {
  return value > 0.00001
    ? `${Math.max(-100, 20 * Math.log10(value)).toFixed(1)} dBFS`
    : "−∞ dBFS";
}
type AudioSettings = {
  api: string;
  input: number;
  output: number;
  channel: number;
  outLeft: number;
  outRight: number;
  rate: number;
  buffer: number;
  trim: number;
  master: number;
  gate: number;
};
const audioDefaults: AudioSettings = {
  api: "ASIO",
  input: -1,
  output: -1,
  channel: 0,
  outLeft: 0,
  outRight: 1,
  rate: 48000,
  buffer: 256,
  trim: 0,
  master: -6,
  gate: -65,
};
function savedAudio(): AudioSettings {
  try {
    const data = JSON.parse(
      localStorage.getItem("selah-native-settings") ?? "{}",
    );
    const result = { ...audioDefaults };
    for (const key of Object.keys(audioDefaults) as (keyof AudioSettings)[]) {
      if (
        typeof data[key] === typeof audioDefaults[key] &&
        (typeof data[key] !== "number" || Number.isFinite(data[key]))
      )
        Object.assign(result, { [key]: data[key] });
    }
    return result;
  } catch {
    return audioDefaults;
  }
}
export default function NativeRack({
  session,
  setTone,
  state,
  enabled,
  setEnabled,
  refresh,
  notify,
}: {
  session: Session;
  setTone: (tone: Tone, bpm?: number) => void;
  state: NativeStatus | null;
  enabled: boolean;
  setEnabled: (v: boolean) => void;
  refresh: () => Promise<void>;
  notify: (s: string) => void;
}) {
  const saved = useRef(savedAudio());
  const [devices, setDevices] = useState<NativeDevice[]>([]),
    [api, setApi] = useState(saved.current.api),
    [input, setInput] = useState(saved.current.input),
    [output, setOutput] = useState(saved.current.output),
    [channel, setChannel] = useState(saved.current.channel),
    [outLeft, setOutLeft] = useState(saved.current.outLeft),
    [outRight, setOutRight] = useState(saved.current.outRight),
    [rate, setRate] = useState(saved.current.rate),
    [buffer, setBuffer] = useState(saved.current.buffer);
  const [busy, setBusy] = useState(""),
    [folder, setFolder] = useState(""),
    [catalog, setCatalog] = useState(false),
    [found, setFound] = useState<{ name: string; path: string }[]>([]),
    [selected, setSelected] = useState(""),
    [trim, setTrim] = useState(saved.current.trim),
    [master, setMaster] = useState(saved.current.master),
    [gate, setGate] = useState(saved.current.gate);
  const [parameterPlugin, setParameterPlugin] = useState(""),
    [parameters, setParameters] = useState<
      { key: string; value: number; display: string; label: string }[]
    >([]),
    [filter, setFilter] = useState("");
  const irInput = useRef<HTMLInputElement>(null),
    presetInput = useRef<HTMLInputElement>(null);
  const running = !!state?.running;
  const run = async (action: string, task: () => Promise<unknown>) => {
    setBusy(action);
    try {
      await task();
      await refresh();
    } catch (e) {
      notify(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy("");
    }
  };
  const getDevices = async () => {
    const ds = await nativeRequest<NativeDevice[]>("devices");
    setDevices(ds);
    const preferred = state?.running ? state.driver : saved.current.api;
    const desired = ds.some((d) => d.api === preferred && d.inputs)
      ? preferred!
      : ds.some((d) => d.api === "ASIO" && d.inputs && d.outputs)
        ? "ASIO"
        : ds.some((d) => d.api === "Windows WASAPI")
          ? "Windows WASAPI"
          : (ds[0]?.api ?? "ASIO");
    setApi(desired);
    const first =
      ds.find(
        (d) =>
          d.api === desired &&
          d.inputs &&
          d.id === (state?.running ? state.inputDevice : saved.current.input),
      ) ?? ds.find((d) => d.api === desired && d.inputs);
    const last =
      ds.find(
        (d) =>
          d.api === desired &&
          d.outputs &&
          d.id === (state?.running ? state.outputDevice : saved.current.output),
      ) ?? ds.find((d) => d.api === desired && d.outputs);
    setInput(first?.id ?? -1);
    setOutput(desired === "ASIO" ? (first?.id ?? -1) : (last?.id ?? -1));
    if (state?.running) {
      setRate(state.sampleRate);
      setBuffer(state.blockSize);
      setChannel(state.inputChannel ?? 0);
      setOutLeft(state.outputChannels?.[0] ?? 0);
      setOutRight(state.outputChannels?.[1] ?? 1);
    }
    if (state?.inputGain !== undefined) setTrim(state.inputGain);
    if (state?.outputGain !== undefined) setMaster(state.outputGain);
    if (state?.gateThreshold !== undefined) setGate(state.gateThreshold);
  };
  useEffect(() => {
    localStorage.setItem(
      "selah-native-settings",
      JSON.stringify({
        api,
        input,
        output,
        channel,
        outLeft,
        outRight,
        rate,
        buffer,
        trim,
        master,
        gate,
      }),
    );
  }, [
    api,
    input,
    output,
    channel,
    outLeft,
    outRight,
    rate,
    buffer,
    trim,
    master,
    gate,
  ]);
  const scan = async () => {
    const result = await nativeRequest<{ plugins: typeof found }>("scan", {
      roots: folder.trim() ? [folder.trim()] : [],
    });
    setFound(result.plugins);
    if (result.plugins.length && !selected) setSelected(result.plugins[0].path);
    notify(
      `${result.plugins.length} VST3 bundles found. Plugins load only when you add them.`,
    );
  };
  useEffect(() => {
    if (state?.available && !devices.length) void run("devices", getDevices);
  }, [state?.available]);
  const changeApi = (value: string) => {
    setApi(value);
    const inp = devices.find((d) => d.api === value && d.inputs),
      out = devices.find((d) => d.api === value && d.outputs);
    setInput(inp?.id ?? -1);
    setOutput(value === "ASIO" ? (inp?.id ?? -1) : (out?.id ?? -1));
    setChannel(0);
    setOutLeft(0);
    setOutRight(1);
  };
  const inputDevice = devices.find((d) => d.id === input),
    outputDevice = devices.find((d) => d.id === output);
  const savePreset = async () => {
    const preset = await nativeRequest<object>("snapshot");
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(preset, null, 2)], { type: "application/json" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = "my-pedalboard.selah-rack.json";
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
    notify(
      "Native rack preset saved, including VST3 state and the cabinet IR.",
    );
  };
  const loadPreset = async (file?: File) => {
    if (!file) return;
    if (file.size > 24 * 1024 * 1024)
      throw new Error("Rack preset exceeds 24 MB.");
    const preset = JSON.parse(await file.text());
    const restored = await nativeRequest("restore", { preset });
    setTone(preset.tone, preset.bpm);
    setTrim(restored.inputGain);
    setMaster(restored.outputGain);
    setGate(restored.gateThreshold);
  };
  const move = async (id: string, direction: number) => {
    if (!state) return;
    const order = [...state.order],
      index = order.indexOf(id),
      target = index + direction;
    if (target < 0 || target >= order.length) return;
    [order[index], order[target]] = [order[target], order[index]];
    await nativeRequest("configure", {
      tone: session.tone,
      bpm: session.bpm,
      order,
    });
  };
  const available = !!state?.available;
  return (
    <div className="native-workspace">
      <section className="native-engine-panel panel">
        <header className="native-panel-heading">
          <div>
            <span className={`engine-indicator ${running ? "on" : ""}`} />
            <h2>Audio engine</h2>
            <span className="tag">NATIVE CPU · FLOAT32</span>
          </div>
          <div>
            <button
              className="subtle"
              disabled={!!busy}
              onClick={() =>
                void run("refresh", async () => {
                  await nativeRequest("restart");
                  await nativeRequest("configure", {
                    tone: session.tone,
                    bpm: session.bpm,
                    inputGain: trim,
                    outputGain: master,
                    gateThreshold: gate,
                  });
                  await getDevices();
                })
              }
            >
              <RefreshCw size={13} /> Restart
            </button>
            <button className="button small" onClick={() => setCatalog(true)}>
              <Plus size={13} /> Get free plugins
            </button>
          </div>
        </header>
        {!available && (
          <div className="native-alert">
            {state?.error || "Starting local audio runtime…"}
            <span>
              Core browser audio remains available. Native audio requires the
              full desktop package or the source runtime.
            </span>
          </div>
        )}
        <div className="engine-config">
          <label>
            Driver API
            <select
              aria-label="Native driver API"
              value={api}
              disabled={running || !!busy}
              onChange={(e) => changeApi(e.target.value)}
            >
              {[...new Set(["ASIO", ...devices.map((d) => d.api)])].map(
                (name) => (
                  <option key={name}>{name}</option>
                ),
              )}
            </select>
          </label>
          <label>
            Input device
            <select
              aria-label="Native input device"
              value={input}
              disabled={running || !!busy}
              onChange={(e) => {
                const id = +e.target.value;
                setInput(id);
                if (api === "ASIO") setOutput(id);
                setChannel(0);
              }}
            >
              <option value={-1}>Select input</option>
              {devices
                .filter((d) => d.api === api && d.inputs > 0)
                .map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
            </select>
          </label>
          <label>
            Output device
            <select
              aria-label="Native output device"
              value={output}
              disabled={running || api === "ASIO" || !!busy}
              onChange={(e) => setOutput(+e.target.value)}
            >
              <option value={-1}>Select output</option>
              {devices
                .filter((d) => d.api === api && d.outputs > 0)
                .map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
            </select>
          </label>
          <label>
            Sample rate
            <select
              aria-label="Native sample rate"
              disabled={running || !!busy}
              value={rate}
              onChange={(e) => setRate(+e.target.value)}
            >
              {[44100, 48000, 88200, 96000, 192000].map((n) => (
                <option key={n} value={n}>
                  {(n / 1000).toFixed(1)} kHz
                </option>
              ))}
            </select>
          </label>
          <label>
            Buffer
            <select
              aria-label="Native buffer size"
              disabled={running || !!busy}
              value={buffer}
              onChange={(e) => setBuffer(+e.target.value)}
            >
              {[32, 64, 128, 256, 512, 1024, 2048].map((n) => (
                <option key={n} value={n}>
                  {n} samples
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="engine-routing-controls">
          <label>
            Guitar channel
            <select
              aria-label="Guitar input channel"
              disabled={running}
              value={channel}
              onChange={(e) => setChannel(+e.target.value)}
            >
              {Array.from({ length: inputDevice?.inputs ?? 1 }, (_, i) => (
                <option key={i} value={i}>
                  Input {i + 1}
                </option>
              ))}
            </select>
          </label>
          <label>
            Output L
            <select
              aria-label="Native output left channel"
              disabled={running}
              value={outLeft}
              onChange={(e) => setOutLeft(+e.target.value)}
            >
              {Array.from({ length: outputDevice?.outputs ?? 2 }, (_, i) => (
                <option key={i} value={i}>
                  {i + 1}
                </option>
              ))}
            </select>
          </label>
          <label>
            Output R
            <select
              aria-label="Native output right channel"
              disabled={running}
              value={outRight}
              onChange={(e) => setOutRight(+e.target.value)}
            >
              {Array.from({ length: outputDevice?.outputs ?? 2 }, (_, i) => (
                <option key={i} value={i}>
                  {i + 1}
                </option>
              ))}
            </select>
          </label>
          <label className="native-transport-choice">
            <input
              type="checkbox"
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
            />{" "}
            Route arrangement playback here
          </label>
        </div>
        <div className="engine-action-row">
          <button
            className={`button ${running ? "" : "primary"}`}
            disabled={!!busy || !available || input < 0 || output < 0}
            onClick={() =>
              void run("start", async () => {
                if (running) {
                  await nativeRequest("stop");
                  return;
                }
                await nativeRequest("configure", {
                  tone: session.tone,
                  bpm: session.bpm,
                  inputGain: trim,
                  outputGain: master,
                  gateThreshold: gate,
                });
                await nativeRequest("prepare", session);
                await nativeRequest("start", {
                  inputDevice: input,
                  outputDevice: output,
                  inputChannel: channel,
                  outputChannels: [outLeft, outRight],
                  sampleRate: rate,
                  blockSize: buffer,
                  monitor: false,
                });
                setEnabled(true);
              })
            }
          >
            {busy === "start" ? (
              <LoaderCircle size={14} className="spin" />
            ) : (
              <Power size={14} />
            )}{" "}
            {running ? "Stop audio" : "Start audio"}
          </button>
          <button
            className={`button ${state?.monitor ? "monitor-enabled" : ""}`}
            disabled={!running || !!busy}
            onClick={() =>
              void run("monitor", async () =>
                nativeRequest("monitor", { enabled: !state?.monitor }),
              )
            }
          >
            {state?.monitor ? <AudioLines size={14} /> : <VolumeX size={14} />}{" "}
            Guitar monitor {state?.monitor ? "ON" : "OFF"}
          </button>
          <span>
            Use headphones. Start muted; enable monitoring when ready.
          </span>
        </div>
        <div className="engine-meter-grid">
          <div className="engine-metric">
            <span>
              DSP load <Cpu size={12} />
            </span>
            <b>
              {(state?.cpuLoad ?? 0).toFixed(1)}
              <small>%</small>
            </b>
            <div className="metric-track">
              <i style={{ width: `${Math.min(100, state?.cpuLoad ?? 0)}%` }} />
            </div>
            <small>Peak {(state?.maxCpuLoad ?? 0).toFixed(1)}%</small>
          </div>
          <div className="engine-metric">
            <span>Driver I/O</span>
            <b>
              {(
                (state?.inputLatencyMs ?? 0) + (state?.outputLatencyMs ?? 0)
              ).toFixed(1)}
              <small>ms</small>
            </b>
            <small>
              Input {state?.inputLatencyMs ?? 0} · Output{" "}
              {state?.outputLatencyMs ?? 0}
            </small>
            <small>Not a measured round-trip latency</small>
          </div>
          <div className="engine-metric">
            <span>Guitar input</span>
            <b>{db(state?.inputPeak ?? 0)}</b>
            <div className="metric-track">
              <i
                style={{
                  width: `${Math.min(100, (state?.inputPeak ?? 0) * 100)}%`,
                }}
              />
            </div>
            <small>Selected input channel</small>
          </div>
          <div className="engine-metric">
            <span>Output / stability</span>
            <b>{db(state?.outputPeak ?? 0)}</b>
            <small>
              {state?.xruns ?? 0} driver flags · {state?.lockMisses ?? 0} update
              gaps
            </small>
            <small>{state?.clipped ?? 0} clipped blocks</small>
          </div>
        </div>
        {state?.error && available && (
          <div className="native-alert">{state.error}</div>
        )}
      </section>
      <section className="panel native-rack-panel">
        <header className="native-panel-heading">
          <div>
            <Activity size={16} />
            <h2>Device rack</h2>
            <span className="tag">SERIAL SIGNAL FLOW</span>
          </div>
          <div>
            <button
              className="button small"
              disabled={running || !!busy || !available}
              onClick={() => void run("save", savePreset)}
            >
              <ArrowDownToLine size={13} /> Save rack
            </button>
            <button
              className="button small"
              disabled={running || !!busy || !available}
              onClick={() => presetInput.current?.click()}
            >
              <FolderOpen size={13} /> Open rack
            </button>
          </div>
        </header>
        <p className="native-section-note">
          Reorder every block, add your VST3 effects, and load a real cabinet
          impulse response. Browser pedal controls also update these native
          built-in effects.
        </p>
        <div className="native-gain-row">
          {[
            {
              name: "Input trim",
              key: "inputGain",
              value: trim,
              set: setTrim,
              min: -36,
              max: 24,
            },
            {
              name: "Gate threshold",
              key: "gateThreshold",
              value: gate,
              set: setGate,
              min: -90,
              max: 0,
            },
            {
              name: "Master output",
              key: "outputGain",
              value: master,
              set: setMaster,
              min: -60,
              max: 12,
            },
          ].map((control) => (
            <label key={control.key}>
              {control.name}
              <span>{control.value} dB</span>
              <input
                aria-label={control.name}
                type="range"
                min={control.min}
                max={control.max}
                value={control.value}
                onChange={(e) => control.set(+e.target.value)}
                onPointerUp={() =>
                  void run("gain", async () =>
                    nativeRequest("configure", {
                      [control.key]: control.value,
                    }),
                  )
                }
                onKeyUp={() =>
                  void run("gain", async () =>
                    nativeRequest("configure", {
                      [control.key]: control.value,
                    }),
                  )
                }
              />
            </label>
          ))}
        </div>
        <div className="native-chain">
          {(state?.order.length ? state.order : Object.keys(blockNames)).map(
            (id, index) => {
              const plugin = state?.plugins.find((p) => p.id === id),
                bypass = plugin
                  ? plugin.bypass
                  : session.tone.bypass.includes(id);
              return (
                <div
                  className={`native-device ${bypass ? "is-bypassed" : ""}`}
                  key={id}
                >
                  <div className="native-device-index">
                    {String(index + 1).padStart(2, "0")}
                  </div>
                  <button
                    className={`native-device-power ${!bypass ? "on" : ""}`}
                    disabled={!!busy || !available || !!state?.editorOpen}
                    aria-label={`${bypass ? "Enable" : "Bypass"} ${plugin?.name ?? blockNames[id]}`}
                    onClick={() =>
                      void run("bypass", async () => {
                        if (plugin)
                          return nativeRequest("bypass", {
                            id,
                            bypass: !bypass,
                          });
                        const tone = {
                          ...session.tone,
                          bypass: bypass
                            ? session.tone.bypass.filter((key) => key !== id)
                            : [...session.tone.bypass, id],
                        };
                        setTone(tone);
                        return nativeRequest("configure", {
                          tone,
                          bpm: session.bpm,
                        });
                      })
                    }
                  >
                    <Power size={13} />
                  </button>
                  <div className="native-device-name">
                    <b>{plugin?.name ?? blockNames[id] ?? id}</b>
                    <span>
                      {plugin
                        ? "VST3 · " +
                          plugin.latencySamples +
                          " samples reported latency"
                        : id === "cabinet"
                          ? state?.irLoaded
                            ? "CONVOLUTION IR LOADED"
                            : "FILTER CABINET · LOAD AN IR FOR A REAL CAB"
                          : "BUILT-IN · NATIVE CPU"}
                    </span>
                  </div>
                  {plugin && (
                    <div className="native-device-actions">
                      <button
                        className="button small"
                        disabled={!!busy || !!state?.editorOpen}
                        onClick={() =>
                          void run("editor", async () =>
                            nativeRequest("editor", { id }),
                          )
                        }
                      >
                        Open UI <ExternalLink size={11} />
                      </button>
                      <button
                        title="Show plugin parameters"
                        className="icon-button"
                        disabled={!!busy || !!state?.editorOpen}
                        onClick={() =>
                          void run("parameters", async () => {
                            setParameters(
                              await nativeRequest("parameters", { id }),
                            );
                            setParameterPlugin(id);
                          })
                        }
                      >
                        <SlidersHorizontal size={14} />
                      </button>
                      <button
                        title="Remove plugin"
                        className="icon-button"
                        disabled={running || !!busy || !!state?.editorOpen}
                        onClick={() =>
                          void run("remove", async () =>
                            nativeRequest("remove", { id }),
                          )
                        }
                      >
                        <X size={14} />
                      </button>
                    </div>
                  )}
                  <div className="rack-reorder">
                    <button
                      aria-label={`Move ${plugin?.name ?? blockNames[id]} up`}
                      disabled={
                        index === 0 ||
                        !!busy ||
                        !available ||
                        !!state?.editorOpen
                      }
                      onClick={() => void run("move", () => move(id, -1))}
                    >
                      <ArrowUp size={12} />
                    </button>
                    <button
                      aria-label={`Move ${plugin?.name ?? blockNames[id]} down`}
                      disabled={
                        index === (state?.order.length ?? 7) - 1 ||
                        !!busy ||
                        !available ||
                        !!state?.editorOpen
                      }
                      onClick={() => void run("move", () => move(id, 1))}
                    >
                      <ArrowDown size={12} />
                    </button>
                  </div>
                </div>
              );
            },
          )}
        </div>
        {state?.editorOpen && (
          <div className="editor-open-note">
            <span>
              Native plugin editor is open. Edit the effect there; close it
              before changing the rack.
            </span>
            <button
              className="button small"
              onClick={() =>
                void run("close", async () => nativeRequest("closeEditor"))
              }
            >
              Close editor
            </button>
          </div>
        )}
        <div className="ir-controls">
          <span>
            <AudioLines size={16} /> Cabinet impulse response
          </span>
          <button
            className="button small"
            disabled={running || !!busy || !available}
            onClick={() => irInput.current?.click()}
          >
            <FolderOpen size={13} /> Load WAV / AIFF IR
          </button>
          {state?.irLoaded && (
            <button
              className="subtle"
              disabled={running || !!busy}
              onClick={() =>
                void run("clear", async () => nativeRequest("clearIR"))
              }
            >
              Clear IR
            </button>
          )}
          <span className="native-fineprint">
            Up to 10 seconds · native convolution
          </span>
        </div>
      </section>
      <section className="panel native-plugin-browser">
        <header className="native-panel-heading">
          <div>
            <FolderOpen size={16} />
            <h2>VST3 browser</h2>
          </div>
          <span className="tag">64-BIT WINDOWS</span>
        </header>
        <div className="plugin-scan-row">
          <input
            aria-label="Additional VST3 scan folder"
            value={folder}
            onChange={(e) => setFolder(e.target.value)}
            placeholder="Optional additional VST3 folder…"
          />
          <button
            className="button"
            disabled={!!busy || !available}
            onClick={() => void run("scan", scan)}
          >
            {busy === "scan" ? (
              <LoaderCircle size={14} className="spin" />
            ) : (
              <RefreshCw size={14} />
            )}{" "}
            Scan folders
          </button>
        </div>
        <p className="native-fineprint">
          Scans Common Files/VST3, your user VST3 folder, and the extra folder
          above. Scanning lists bundles without executing them. Stop audio
          before adding effects.
        </p>
        {!!found.length && (
          <div className="plugin-add-row">
            <select
              aria-label="Discovered VST3 plugin"
              value={selected}
              onChange={(e) => setSelected(e.target.value)}
            >
              {found.map((plugin) => (
                <option key={plugin.path} value={plugin.path}>
                  {plugin.name}
                </option>
              ))}
            </select>
            <button
              className="button primary"
              disabled={!selected || running || !!busy || !!state?.editorOpen}
              onClick={() =>
                void run("load", async () =>
                  nativeRequest("load", { path: selected }),
                )
              }
            >
              {busy === "load" ? (
                <LoaderCircle className="spin" size={14} />
              ) : (
                <Plus size={14} />
              )}{" "}
              Add to rack
            </button>
          </div>
        )}
        <p className="native-fineprint">
          VST3 effects only. Compatibility varies by plugin. A failing plugin is
          isolated from the desktop UI; use Restart to recover. Plugin-owned GPU
          processing is controlled by that plugin; this engine runs DSP on the
          CPU.
        </p>
      </section>
      <input
        hidden
        ref={irInput}
        type="file"
        accept=".wav,.aif,.aiff"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file)
            void run("ir", async () => {
              await nativeUpload(file, "ir");
              notify("Cabinet impulse response loaded.");
            });
          e.target.value = "";
        }}
      />
      <input
        hidden
        ref={presetInput}
        type="file"
        accept=".json"
        onChange={(e) => {
          const file = e.target.files?.[0];
          void run("preset", () => loadPreset(file));
          e.target.value = "";
        }}
      />
      {catalog && (
        <div className="modal-backdrop" onClick={() => setCatalog(false)}>
          <section
            className="modal plugin-catalog"
            role="dialog"
            aria-modal="true"
            aria-label="Free plugin downloads"
            onClick={(e) => e.stopPropagation()}
          >
            <header className="native-panel-heading">
              <div>
                <Plus size={17} />
                <h2>Expand your pedalboard</h2>
              </div>
              <button
                className="icon-button"
                aria-label="Close plugin catalog"
                onClick={() => setCatalog(false)}
              >
                <X size={18} />
              </button>
            </header>
            <p>
              Free options from their official developers. Install the Windows
              VST3 edition, then scan its folder. Paid upgrades are optional.
              These links do not imply that every version has been tested in
              this host.
            </p>
            <div className="plugin-catalog-grid">
              {freePlugins.map((plugin) => (
                <article key={plugin.name}>
                  <span className="tag">{plugin.tag}</span>
                  <h3>{plugin.name}</h3>
                  <small>
                    {plugin.maker} · {plugin.source}
                  </small>
                  <p>{plugin.description}</p>
                  <small>{plugin.note}</small>
                  <a
                    className="button small"
                    href={plugin.url}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Official download <ExternalLink size={12} />
                  </a>
                </article>
              ))}
            </div>
            <p className="native-fineprint">
              A neural model, cabinet IR, plugin oversampling, and calibrated
              input can improve realism. No preset or plugin catalog guarantees
              equivalence to a particular hardware pedal.
            </p>
          </section>
        </div>
      )}
      {parameterPlugin && (
        <div className="modal-backdrop" onClick={() => setParameterPlugin("")}>
          <section
            className="modal parameter-modal"
            role="dialog"
            aria-modal="true"
            aria-label="VST3 parameters"
            onClick={(e) => e.stopPropagation()}
          >
            <header className="native-panel-heading">
              <h2>Plugin parameters</h2>
              <button
                aria-label="Close parameter editor"
                className="icon-button"
                onClick={() => setParameterPlugin("")}
              >
                <X size={18} />
              </button>
            </header>
            <input
              aria-label="Filter plugin parameters"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Filter parameters…"
            />
            <p className="native-fineprint">
              Normalized host controls (0–100%). Open the plugin UI for its
              native units and advanced options.
            </p>
            {parameters
              .filter((p) => p.key.toLowerCase().includes(filter.toLowerCase()))
              .slice(0, 120)
              .map((p) => (
                <label className="native-parameter" key={p.key}>
                  <span>
                    {p.key.replaceAll("_", " ")}
                    <small>
                      {p.display} {p.label}
                    </small>
                  </span>
                  <input
                    aria-label={p.key}
                    type="range"
                    min={0}
                    max={1}
                    step={0.001}
                    value={p.value}
                    onChange={(e) =>
                      setParameters((ps) =>
                        ps.map((v) =>
                          v.key === p.key
                            ? { ...v, value: +e.target.value }
                            : v,
                        ),
                      )
                    }
                    onPointerUp={() =>
                      void run("parameter", async () =>
                        nativeRequest("parameter", {
                          id: parameterPlugin,
                          key: p.key,
                          value: p.value,
                        }),
                      )
                    }
                    onKeyUp={() =>
                      void run("parameter", async () =>
                        nativeRequest("parameter", {
                          id: parameterPlugin,
                          key: p.key,
                          value: p.value,
                        }),
                      )
                    }
                  />
                </label>
              ))}
          </section>
        </div>
      )}
      {busy && (
        <div className="native-working">
          <LoaderCircle size={13} className="spin" />{" "}
          {busy === "load"
            ? "Loading native plugin…"
            : busy === "devices"
              ? "Enumerating audio devices…"
              : "Updating audio engine…"}
        </div>
      )}
      <div className="native-bottom-note">
        <Check size={13} /> Native audio is local. Device and plugin paths stay
        on this computer.
      </div>
    </div>
  );
}
