import { useState } from "react";
import type { CSSProperties } from "react";
import {
  Activity,
  AudioLines,
  Box,
  Cpu,
  Guitar,
  Headphones,
  Plus,
  Power,
  SlidersHorizontal,
  Sparkles,
  Waves,
  ArrowRight,
  Undo2,
  Redo2,
  ExternalLink,
} from "lucide-react";
import type { Tone, Session } from "./music";
import type { NativeStatus } from "./native";
import { nativeRequest } from "./native";
const modules = {
  gate: {
    name: "Noise gate",
    category: "DYNAMICS",
    color: "#90a7bd",
    icon: Activity,
    keys: [],
  },
  compressor: {
    name: "Studio compressor",
    category: "DYNAMICS",
    color: "#66b5fa",
    icon: SlidersHorizontal,
    keys: ["compressor"],
  },
  drive: {
    name: "Daybreak drive",
    category: "DISTORTION",
    color: "#f5a24b",
    icon: Waves,
    keys: ["drive"],
  },
  cabinet: {
    name: "Cabinet & EQ",
    category: "CABINET",
    color: "#ee7373",
    icon: Box,
    keys: ["bass", "treble"],
  },
  chorus: {
    name: "Undertow chorus",
    category: "MODULATION",
    color: "#b694f5",
    icon: AudioLines,
    keys: ["chorus"],
  },
  delay: {
    name: "Afterglow delay",
    category: "DELAY",
    color: "#60cebc",
    icon: Waves,
    keys: ["delay", "feedback", "subdivision"],
  },
  reverb: {
    name: "Wide open reverb",
    category: "REVERB",
    color: "#90cde5",
    icon: Sparkles,
    keys: ["reverb", "decay"],
  },
} as const;
const labels: Record<string, string> = {
  compressor: "Compression",
  drive: "Drive",
  bass: "Bass",
  treble: "Treble",
  chorus: "Chorus mix",
  delay: "Delay mix",
  feedback: "Feedback",
  subdivision: "Delay rhythm (beats)",
  reverb: "Reverb mix",
  decay: "Decay (seconds)",
};
type Props = {
  session: Session;
  state: NativeStatus | null;
  setTone: (tone: Tone) => void;
  refresh: () => Promise<void>;
  notify: (message: string) => void;
  openAudio: () => void;
  addEffect?: () => void;
};
export default function SignalGrid({
  session,
  state,
  setTone,
  refresh,
  notify,
  openAudio,
  addEffect = openAudio,
}: Props) {
  const [selected, setSelected] = useState("drive"),
    [dragged, setDragged] = useState(""),
    [undo, setUndo] = useState<Tone[]>([]),
    [redo, setRedo] = useState<Tone[]>([]),
    [parameters, setParameters] = useState<
      { key: string; value: number; display: string }[]
    >([]);
  const [snapshots, setSnapshots] = useState<(Tone | null)[]>(() => {
    try {
      const stored = JSON.parse(
        localStorage.getItem("selah-tone-snapshots") ?? "[null,null,null,null]",
      );
      return Array.from({ length: 4 }, (_, index) => {
        const tone = stored?.[index];
        return tone &&
          Array.isArray(tone.bypass) &&
          Object.keys(session.tone).every(
            (key) => key === "bypass" || typeof tone[key] === "number",
          )
          ? tone
          : null;
      });
    } catch {
      return [null, null, null, null];
    }
  });
  const order = state?.order?.length ? state.order : Object.keys(modules),
    plugin = state?.plugins?.find((p) => p.id === selected),
    definition = modules[selected as keyof typeof modules];
  async function act(task: () => Promise<unknown>) {
    try {
      await task();
      await refresh();
    } catch (error) {
      notify(error instanceof Error ? error.message : String(error));
    }
  }
  const commit = (tone: Tone, remember = true) => {
    if (remember) {
      setUndo((history) => [
        ...history.slice(-39),
        structuredClone(session.tone),
      ]);
      setRedo([]);
    }
    setTone(tone);
  };
  const select = (id: string) => {
    setSelected(id);
    setParameters([]);
    if (state?.plugins.some((p) => p.id === id))
      void act(async () =>
        setParameters(await nativeRequest("parameters", { id })),
      );
  };
  const bypass = () => {
    if (plugin)
      void act(() =>
        nativeRequest("bypass", { id: plugin.id, bypass: !plugin.bypass }),
      );
    else
      commit({
        ...session.tone,
        bypass: session.tone.bypass.includes(selected)
          ? session.tone.bypass.filter((key) => key !== selected)
          : [...session.tone.bypass, selected],
      });
  };
  const reorder = (target: string) => {
    if (!dragged || dragged === target || !state?.available) return;
    const next = order.filter((id) => id !== dragged);
    next.splice(next.indexOf(target), 0, dragged);
    void act(() =>
      nativeRequest("configure", {
        order: next,
        tone: session.tone,
        bpm: session.bpm,
      }),
    );
    setDragged("");
  };
  return (
    <section className="signal-workbench panel">
      <header className="signal-toolbar">
        <div>
          <Guitar size={17} />
          <b>Signal designer</b>
          <span>LIVE SERIAL RACK</span>
        </div>
        <div>
          <button
            title="Undo rack tone edit"
            aria-label="Undo rack tone edit"
            disabled={!undo.length}
            onClick={() => {
              const previous = undo.at(-1)!;
              setRedo((history) => [...history, session.tone]);
              setUndo(undo.slice(0, -1));
              commit(previous, false);
            }}
          >
            <Undo2 size={15} />
          </button>
          <button
            title="Redo rack tone edit"
            aria-label="Redo rack tone edit"
            disabled={!redo.length}
            onClick={() => {
              setUndo((history) => [...history, session.tone]);
              commit(redo.at(-1)!, false);
              setRedo(redo.slice(0, -1));
            }}
          >
            <Redo2 size={15} />
          </button>
          <button className="button small" onClick={openAudio}>
            <SlidersHorizontal size={13} /> ASIO settings
          </button>
        </div>
      </header>
      <div className="signal-preset-bar">
        <div>
          <small>CURRENT SOUND</small>
          <b>{session.preset}</b>
        </div>
        <div className="tone-snapshots">
          <span>TONE SNAPSHOTS</span>
          {snapshots.map((tone, index) => (
            <button
              key={index}
              className={tone ? "stored" : ""}
              title={
                tone
                  ? "Recall tone; right-click to replace"
                  : "Capture current tone"
              }
              onContextMenu={(event) => {
                event.preventDefault();
                const next = [...snapshots];
                next[index] = structuredClone(session.tone);
                setSnapshots(next);
                localStorage.setItem(
                  "selah-tone-snapshots",
                  JSON.stringify(next),
                );
                notify(
                  "Tone snapshot replaced. VST states are saved separately with Save rack.",
                );
              }}
              onClick={() => {
                if (tone) commit(structuredClone(tone));
                else {
                  const next = [...snapshots];
                  next[index] = structuredClone(session.tone);
                  setSnapshots(next);
                  localStorage.setItem(
                    "selah-tone-snapshots",
                    JSON.stringify(next),
                  );
                  notify("Tone captured. Click again to recall.");
                }
              }}
            >
              {String.fromCharCode(65 + index)}
            </button>
          ))}
        </div>
      </div>
      <div className="signal-canvas">
        <div className="signal-endpoint">
          <Guitar size={19} />
          <div>
            GUITAR INPUT
            <small>
              {state?.running
                ? `${state.driver} · ${state.sampleRate / 1000} kHz`
                : "Engine stopped / browser preview"}
            </small>
          </div>
          <span className="signal-end-led" />
        </div>
        <div className="signal-block-grid">
          {order.map((id, index) => {
            const def = modules[id as keyof typeof modules],
              vst = state?.plugins.find((p) => p.id === id),
              Icon = def?.icon ?? Cpu,
              off = vst ? vst.bypass : session.tone.bypass.includes(id);
            return (
              <button
                key={id}
                draggable={!!state?.available && !state.editorOpen}
                onDragStart={() => setDragged(id)}
                onDragOver={(event) => event.preventDefault()}
                onDrop={() => reorder(id)}
                onClick={() => select(id)}
                aria-label={`Edit ${vst?.name ?? def?.name ?? id}`}
                aria-pressed={selected === id}
                className={`signal-block ${selected === id ? "selected" : ""} ${off ? "off" : ""}`}
                style={
                  { "--block-color": def?.color ?? "#bd89f0" } as CSSProperties
                }
              >
                <span className="signal-block-top">
                  <small>{String(index + 1).padStart(2, "0")}</small>
                  <span>{off ? "BYPASSED" : "ON"}</span>
                </span>
                <Icon size={29} />
                <b>{vst?.name ?? def?.name ?? id}</b>
                <small>{vst ? "EXTERNAL VST3" : def?.category}</small>
                <span className="signal-block-wire">
                  <ArrowRight size={12} />
                </span>
              </button>
            );
          })}
          <button className="signal-add" onClick={addEffect}>
            <Plus size={23} />
            <span>Add VST3 / IR</span>
          </button>
        </div>
        <div className="signal-endpoint output">
          <Headphones size={19} />
          <div>
            STEREO OUTPUT
            <small>
              {state?.running
                ? `DSP ${state.cpuLoad.toFixed(1)}% · ${state.xruns} driver flags`
                : "Native CPU processing available in Audio & VST3"}
            </small>
          </div>
          <span className="signal-end-led" />
        </div>
        <p className="signal-routing-note">
          Signal follows numbered blocks in order across the rows. Drag a block
          onto another to reorder the native rack. Parallel paths are not
          implemented.
        </p>
      </div>
      <div
        className="signal-inspector"
        style={
          { "--block-color": definition?.color ?? "#bd89f0" } as CSSProperties
        }
      >
        <header>
          <div>
            <small>{plugin ? "EXTERNAL VST3" : definition?.category}</small>
            <h3>{plugin?.name ?? definition?.name}</h3>
          </div>
          <button
            className="button small"
            disabled={!!state?.editorOpen}
            onClick={bypass}
          >
            <Power size={13} />
            {(plugin ? plugin.bypass : session.tone.bypass.includes(selected))
              ? "Enable"
              : "Bypass"}
          </button>
          {plugin && (
            <button
              className="button small"
              onClick={() =>
                void act(() => nativeRequest("editor", { id: plugin.id }))
              }
            >
              Open plugin UI <ExternalLink size={12} />
            </button>
          )}
        </header>
        <div className="signal-controls">
          {definition?.keys.map((key) => {
            const maximum =
                key === "feedback"
                  ? 75
                  : key === "decay"
                    ? 8
                    : key === "subdivision"
                      ? 2
                      : 100,
              minimum =
                key === "decay" ? 0.5 : key === "subdivision" ? 0.25 : 0,
              value = session.tone[key];
            return (
              <label key={key}>
                <span>
                  {labels[key]}
                  <b>
                    {value}
                    {key === "decay"
                      ? " s"
                      : key === "subdivision"
                        ? " beats"
                        : "%"}
                  </b>
                </span>
                <input
                  aria-label={`Rack ${labels[key]}`}
                  type="range"
                  min={minimum}
                  max={maximum}
                  step={
                    key === "decay" ? 0.1 : key === "subdivision" ? 0.25 : 1
                  }
                  value={value}
                  onChange={(event) =>
                    commit({ ...session.tone, [key]: +event.target.value })
                  }
                />
                <small>
                  {key === "subdivision"
                    ? `${Math.round((60000 / session.bpm) * value)} ms at ${session.bpm} BPM`
                    : "Native & browser tone control"}
                </small>
              </label>
            );
          })}
          {plugin &&
            parameters.slice(0, 12).map((parameter) => (
              <label key={parameter.key}>
                <span>
                  {parameter.key.replaceAll("_", " ")}
                  <b>{Math.round(parameter.value * 100)}%</b>
                </span>
                <input
                  aria-label={`VST ${parameter.key}`}
                  type="range"
                  min={0}
                  max={1}
                  step={0.001}
                  value={parameter.value}
                  onChange={(event) =>
                    setParameters((values) =>
                      values.map((p) =>
                        p.key === parameter.key
                          ? { ...p, value: +event.target.value }
                          : p,
                      ),
                    )
                  }
                  onPointerUp={() =>
                    void act(() =>
                      nativeRequest("parameter", {
                        id: plugin.id,
                        key: parameter.key,
                        value: parameter.value,
                      }),
                    )
                  }
                  onKeyUp={() =>
                    void act(() =>
                      nativeRequest("parameter", {
                        id: plugin.id,
                        key: parameter.key,
                        value: parameter.value,
                      }),
                    )
                  }
                />
              </label>
            ))}
          {selected === "gate" && (
            <p>
              Input trim, gate threshold, and output gain are available in Audio
              & VST3. Select ASIO settings to edit them.
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
