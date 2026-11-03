import { useCallback, useEffect, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import {
  ArrowDownToLine,
  ArrowLeft,
  ArrowRight,
  AudioLines,
  BookOpen,
  Check,
  ChevronDown,
  CircleHelp,
  Clock3,
  Copy,
  ExternalLink,
  FileAudio,
  FolderOpen,
  Guitar,
  Headphones,
  Layers3,
  ListMusic,
  LoaderCircle,
  Mic2,
  Music2,
  Play,
  Plus,
  Power,
  Radio,
  RefreshCw,
  Repeat2,
  Search,
  Send,
  Settings2,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Square,
  Upload,
  Volume2,
  X,
} from "lucide-react";
import {
  PRESETS,
  STRINGS,
  TUNING,
  demoNotes,
  initialSession,
  noteName,
  toMidi,
  toTab,
  uid,
  validateSession,
} from "./music";
import type { Analysis, Note, Session, Tone } from "./music";
import { GuitarEngine, makeDemo, renderWav } from "./audio";
import NativeRack from "./NativeRack";
import Appearance, { useAppearance } from "./Appearance";
import { nativeRequest, nativeUpload } from "./native";
import type { NativeStatus } from "./native";

type Source = {
  title: string;
  url: string;
  publisher: string;
  type: string;
  status: string;
  titleMatch: boolean;
  artistMatch: boolean;
  versionMatch: boolean | null;
  access: string;
  accuracy: string;
  aiEvidence: string;
  checkedAt: string;
  error?: string;
};
type Reply = {
  answer: string;
  tone: Omit<Tone, "bypass"> | null;
  sources: Source[];
  notes: Omit<Note, "id">[];
  bpm: number | null;
};
type Chat = {
  role: "assistant" | "user";
  text: string;
  tone?: Reply["tone"];
  notes?: Reply["notes"];
  bpm?: number | null;
};
const time = (v: number) =>
  `${Math.floor(v / 60)}:${Math.floor(v % 60)
    .toString()
    .padStart(2, "0")}`;
function loadSession() {
  try {
    const saved = localStorage.getItem("selah-session");
    return saved ? validateSession(JSON.parse(saved)) : initialSession();
  } catch {
    return initialSession();
  }
}
function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}
function getPeaks(buffer: AudioBuffer) {
  const data = buffer.getChannelData(0);
  return Array.from({ length: 180 }, (_, i) => {
    const start = Math.floor((i / 180) * data.length),
      end = Math.floor(((i + 1) / 180) * data.length);
    let peak = 0;
    for (
      let j = start;
      j < end;
      j += Math.max(1, Math.floor((end - start) / 100))
    )
      peak = Math.max(peak, Math.abs(data[j]));
    return peak;
  });
}
function IconButton({
  title,
  children,
  onClick,
  active = false,
  disabled = false,
}: {
  title: string;
  children: ReactNode;
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      title={title}
      aria-label={title}
      aria-pressed={active}
      className={`icon-button ${active ? "active" : ""}`}
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </button>
  );
}
function Slider({
  label,
  value,
  onChange,
  max = 100,
  min = 0,
  step = 1,
  suffix = "%",
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
  max?: number;
  min?: number;
  step?: number;
  suffix?: string;
}) {
  return (
    <label className="slider-label">
      <span>
        {label}
        <b>
          {value}
          {suffix}
        </b>
      </span>
      <input
        aria-label={label}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(+e.target.value)}
        style={
          {
            "--value": `${((value - min) / (max - min)) * 100}%`,
          } as CSSProperties
        }
      />
    </label>
  );
}
function Knob({
  value,
  label,
  color,
}: {
  value: number;
  label: string;
  color: string;
}) {
  return (
    <div className="knob-wrap">
      <div className="knob-track" style={{ "--knob": color } as CSSProperties}>
        <div
          className="knob"
          style={{ transform: `rotate(${-135 + value * 2.7}deg)` }}
        >
          <i />
        </div>
      </div>
      <span>{label}</span>
    </div>
  );
}

export default function App() {
  const { appearance, setAppearance, style: appearanceStyle } = useAppearance();
  const [preferencesOpen, setPreferencesOpen] = useState(false);
  const [nativeState, setNativeState] = useState<NativeStatus | null>(null);
  const [nativeEnabled, setNativeEnabled] = useState(
    () => localStorage.getItem("selah-native-mode") !== "false",
  );
  useEffect(() => {
    localStorage.setItem("selah-native-mode", String(nativeEnabled));
  }, [nativeEnabled]);
  const nativeRef = useRef(false);
  nativeRef.current = nativeEnabled;
  const [session, setSession] = useState<Session>(loadSession),
    sessionRef = useRef(session);
  const [workspace, setWorkspace] = useState("studio"),
    [panel, setPanel] = useState("tone"),
    [presetOpen, setPresetOpen] = useState(false);
  const [playing, setPlaying] = useState(false),
    [position, setPosition] = useState(0),
    [loop, setLoop] = useState(true),
    [metronome, setMetronome] = useState(false);
  const [referenceName, setReferenceName] = useState(
      "Sunday sketch · original demo",
    ),
    [peaks, setPeaks] = useState<number[]>([]),
    [duration, setDuration] = useState(0);
  const [analysis, setAnalysis] = useState<Analysis | null>(null),
    [analyzing, setAnalyzing] = useState(false),
    [progress, setProgress] = useState(0),
    [analysisStart, setAnalysisStart] = useState(0),
    [analyzedStart, setAnalyzedStart] = useState(0);
  const [toast, setToast] = useState(""),
    [help, setHelp] = useState(false),
    [exporting, setExporting] = useState(false);
  const [bar, setBar] = useState(0),
    [fret, setFret] = useState(5),
    [selectedNote, setSelectedNote] = useState<string | null>(null);
  const [mic, setMic] = useState(false),
    [devices, setDevices] = useState<MediaDeviceInfo[]>([]),
    [device, setDevice] = useState(""),
    [level, setLevel] = useState(0);
  const [status, setStatus] = useState({
    connected: false,
    installed: false,
    method: "Checking local connection…",
  });
  const [chats, setChats] = useState<Chat[]>([
    {
      role: "assistant",
      text: "Let’s find your sound. Upload a song for a local analysis, or tell me the guitar tone you have in mind. I can help you dial it in.",
    },
  ]);
  const [question, setQuestion] = useState(""),
    [thinking, setThinking] = useState(false),
    [song, setSong] = useState(""),
    [artist, setArtist] = useState(""),
    [version, setVersion] = useState(""),
    [sources, setSources] = useState<Source[]>([]),
    [sourceMessage, setSourceMessage] = useState("");
  const audio = useRef<GuitarEngine | null>(null),
    reference = useRef<AudioBuffer | null>(null),
    worker = useRef<Worker | null>(null),
    fileInput = useRef<HTMLInputElement>(null),
    importInput = useRef<HTMLInputElement>(null),
    timer = useRef<ReturnType<typeof setInterval> | null>(null),
    playPosition = useRef(0),
    chatEnd = useRef<HTMLDivElement>(null);
  const notify = useCallback((message: string) => setToast(message), []);
  const stop = useCallback(() => {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
    audio.current?.stop();
    if (nativeRef.current)
      void nativeRequest("transport", { playing: false }).catch(() => {});
    setPlaying(false);
  }, []);
  const refreshNative = useCallback(async () => {
    try {
      const response = await fetch("/api/native/status");
      if (!response.ok) return;
      const state = (await response.json()) as NativeStatus;
      setNativeState(state);
      if (nativeRef.current) {
        setPosition(state.position ?? 0);
        setPlaying(!!state.playing);
        setLevel(Math.min(100, (state.outputPeak ?? 0) * 100));
      }
    } catch {
      /* The browser fallback remains usable without native audio. */
    }
  }, []);
  useEffect(() => {
    void refreshNative();
    const poll = setInterval(
      () => void refreshNative(),
      nativeEnabled ? 350 : 2500,
    );
    return () => clearInterval(poll);
  }, [nativeEnabled, refreshNative]);
  useEffect(() => {
    if (!nativeEnabled || !nativeState?.available || nativeState.editorOpen)
      return;
    const timer = setTimeout(
      () =>
        void nativeRequest("configure", {
          tone: session.tone,
          bpm: session.bpm,
          referenceVolume: session.referenceVolume,
          guitarVolume: session.guitarVolume,
        }).catch((error) => notify(String(error))),
      350,
    );
    return () => clearTimeout(timer);
  }, [
    session.tone,
    session.bpm,
    session.referenceVolume,
    session.guitarVolume,
    nativeEnabled,
    nativeState?.available,
    nativeState?.editorOpen,
    notify,
  ]);
  const chooseNative = (enabled: boolean) => {
    stop();
    audio.current?.stopInput();
    setMic(false);
    setNativeEnabled(enabled);
    if (!enabled) void nativeRequest("stop").catch(() => {});
  };
  const engine = useCallback(async () => {
    if (!audio.current) {
      audio.current = new GuitarEngine(
        sessionRef.current.tone,
        sessionRef.current.bpm,
      );
      audio.current.volumes(
        sessionRef.current.referenceVolume,
        sessionRef.current.guitarVolume,
      );
    }
    await audio.current.resume();
    return audio.current;
  }, []);
  const update = (patch: Partial<Session>) =>
    setSession((s) => ({ ...s, ...patch }));
  const updateTone = (key: keyof Tone, value: number) =>
    setSession((s) => ({
      ...s,
      preset: "Custom tone",
      tone: { ...s.tone, [key]: value },
    }));
  const refreshStatus = useCallback(async () => {
    try {
      const r = await fetch("/api/status");
      if (!r.ok) throw new Error();
      setStatus(await r.json());
    } catch {
      setStatus({
        connected: false,
        installed: false,
        method: "Start the local server with npm run dev.",
      });
    }
  }, []);
  useEffect(() => {
    sessionRef.current = session;
    try {
      localStorage.setItem("selah-session", JSON.stringify(session));
    } catch {
      /* Download a session if browser storage is full. */
    }
    audio.current?.rack.update(session.tone, session.bpm);
    audio.current?.volumes(session.referenceVolume, session.guitarVolume);
  }, [session]);
  useEffect(() => {
    void refreshStatus();
    const c = new OfflineAudioContext(1, 1, 22050),
      buffer = makeDemo(c, demoNotes(), 76);
    reference.current = buffer;
    setPeaks(getPeaks(buffer));
    setDuration(buffer.duration);
    return () => {
      if (timer.current) clearInterval(timer.current);
      audio.current?.dispose();
      audio.current = null;
      worker.current?.terminate();
    };
  }, [refreshStatus]);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 5000);
    return () => clearTimeout(t);
  }, [toast]);
  useEffect(() => {
    chatEnd.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [chats, thinking]);
  useEffect(() => {
    if (nativeEnabled) return;
    if (!playing && !mic) {
      setLevel(0);
      return;
    }
    const t = setInterval(() => {
      const a = audio.current?.analyser;
      if (!a) return;
      const data = new Uint8Array(a.frequencyBinCount);
      a.getByteTimeDomainData(data);
      setLevel(
        Math.min(
          100,
          Math.sqrt(
            data.reduce((sum, x) => sum + ((x - 128) / 128) ** 2, 0) /
              data.length,
          ) * 220,
        ),
      );
    }, 100);
    return () => clearInterval(t);
  }, [playing, mic, nativeEnabled]);
  const startPlayback = async () => {
    if (nativeRef.current) {
      try {
        if (playing) {
          stop();
          return;
        }
        if (!nativeState?.running) {
          setWorkspace("audio");
          notify(
            "Start native audio in Audio & VST3, then play the arrangement.",
          );
          return;
        }
        await nativeRequest("prepare", session);
        await nativeRequest("transport", {
          playing: true,
          loop,
          metronome,
          position,
        });
        setPlaying(true);
        await refreshNative();
      } catch (error) {
        notify(error instanceof Error ? error.message : String(error));
      }
      return;
    }
    if (playing) {
      stop();
      return;
    }
    try {
      const e = await engine(),
        s = sessionRef.current,
        beatSeconds = 60 / s.bpm,
        cycle = loop
          ? s.bars * 4 * beatSeconds
          : Math.max(
              reference.current?.duration ?? 0,
              s.bars * 4 * beatSeconds,
            );
      const offset = position >= cycle ? 0 : position,
        start = e.context.currentTime + 0.08 - offset;
      let scheduledUntil = offset - 0.001,
        refCycle = -1;
      setPlaying(true);
      const tick = () => {
        const elapsed = Math.max(offset, e.context.currentTime - start),
          currentCycle = Math.floor(elapsed / cycle);
        if (!loop && elapsed >= cycle) {
          stop();
          setPosition(0);
          playPosition.current = 0;
          return;
        }
        const until = elapsed + 0.12;
        for (
          let c = Math.floor(Math.max(0, scheduledUntil) / cycle);
          c <= Math.floor(until / cycle);
          c++
        ) {
          if (!loop && c > 0) continue;
          for (const n of s.notes) {
            const at = c * cycle + n.beat * beatSeconds;
            if (at > scheduledUntil && at <= until)
              e.note(
                TUNING[n.string] + n.fret,
                Math.max(e.context.currentTime, start + at),
                n.length * beatSeconds,
              );
          }
          if (metronome)
            for (let beat = 0; beat * beatSeconds < cycle; beat++) {
              const at = c * cycle + beat * beatSeconds;
              if (at > scheduledUntil && at <= until)
                e.click(
                  Math.max(e.context.currentTime, start + at),
                  beat % 4 === 0,
                );
            }
        }
        if (refCycle !== currentCycle && reference.current) {
          const local = elapsed % cycle;
          e.playReference(
            reference.current,
            local,
            Math.max(e.context.currentTime, start + elapsed),
            cycle - local,
          );
          refCycle = currentCycle;
        }
        scheduledUntil = until;
        const local = elapsed % cycle;
        playPosition.current = local;
        setPosition(local);
      };
      tick();
      timer.current = setInterval(tick, 25);
    } catch (err) {
      notify(err instanceof Error ? err.message : "Could not start audio.");
    }
  };
  const seek = (seconds: number) => {
    stop();
    setPosition(seconds);
    playPosition.current = seconds;
    if (nativeRef.current && nativeState?.running)
      void nativeRequest("transport", {
        playing: false,
        position: seconds,
      }).catch((error) => notify(String(error)));
  };
  const applyPreset = (index: number) => {
    update({
      tone: structuredClone(PRESETS[index].tone),
      preset: PRESETS[index].name,
    });
    setPresetOpen(false);
    notify(`${PRESETS[index].name} loaded`);
  };
  const upload = async (file?: File) => {
    if (!file) return;
    if (file.size > 150 * 1024 * 1024)
      return notify("Choose an audio file under 150 MB.");
    stop();
    worker.current?.terminate();
    setAnalyzing(false);
    try {
      const e = await engine(),
        buffer = await e.context.decodeAudioData(await file.arrayBuffer());
      reference.current = buffer;
      setReferenceName(file.name);
      setDuration(buffer.duration);
      setPeaks(getPeaks(buffer));
      setAnalysis(null);
      setAnalysisStart(0);
      setPosition(0);
      setSong(file.name.replace(/\.[^.]+$/, ""));
      if (nativeState?.available) {
        try {
          await nativeUpload(file, "reference");
        } catch (error) {
          notify(`Loaded for analysis; native reference: ${String(error)}`);
          return;
        }
      }
      notify(
        "Song loaded locally. Choose Analyze to create an editable draft.",
      );
    } catch {
      notify(
        "This audio format could not be decoded. Try WAV, MP3, FLAC, or M4A supported by your browser.",
      );
    }
  };
  const analyzeSong = async () => {
    const buffer = reference.current;
    if (!buffer || analyzing) return;
    setAnalyzing(true);
    setProgress(0);
    worker.current?.terminate();
    try {
      const start = Math.max(
          0,
          Math.min(analysisStart, Math.max(0, buffer.duration - 0.5)),
        ),
        seconds = Math.min(90, buffer.duration - start),
        rate = 11025;
      const c = new OfflineAudioContext(1, Math.ceil(seconds * rate), rate),
        source = c.createBufferSource();
      source.buffer = buffer;
      source.connect(c.destination);
      source.start(0, start, seconds);
      const mono = (await c.startRendering()).getChannelData(0).slice(),
        w = new Worker(new URL("./analysis.worker.ts", import.meta.url), {
          type: "module",
        });
      worker.current = w;
      w.onmessage = (event) => {
        if (event.data.progress !== undefined)
          setProgress(Math.round(event.data.progress * 100));
        if (event.data.error) {
          setAnalyzing(false);
          notify(event.data.error);
          w.terminate();
        }
        if (event.data.result) {
          const result = event.data.result as Analysis;
          setAnalysis(result);
          setAnalyzedStart(start);
          setAnalyzing(false);
          setProgress(100);
          w.terminate();
          notify(
            `Analysis ready: ${result.notes.length} possible melody notes. Review before using.`,
          );
        }
      };
      w.onerror = () => {
        setAnalyzing(false);
        notify("Analysis failed. Try a shorter WAV or a guitar-only stem.");
        w.terminate();
      };
      w.postMessage({ samples: mono, sampleRate: rate }, [mono.buffer]);
    } catch (e) {
      setAnalyzing(false);
      notify(String(e));
    }
  };
  const useDraft = () => {
    if (!analysis?.notes.length)
      return notify(
        "No clear melody detected. Try an isolated guitar recording.",
      );
    stop();
    const bpm = analysis.bpm ?? session.bpm;
    const beatOffset = (analyzedStart * bpm) / 60;
    const notes = analysis.notes.map((n) => ({
      ...n,
      beat: n.beat + beatOffset,
    }));
    const bars = Math.ceil(
      Math.max(...notes.map((n) => n.beat + n.length)) / 4,
    );
    if (bars > 128)
      return notify(
        "This excerpt is beyond the 128-bar editor. Analyze an earlier excerpt.",
      );
    update({ bpm, bars: Math.max(1, bars), notes });
    setBar(Math.floor(beatOffset / 4));
    setWorkspace("tabs");
    notify(
      "Draft loaded. Notes are estimates; compare them with the recording.",
    );
  };
  const matchTone = () => {
    if (!analysis) return;
    const index = analysis.brightness > 0.32 ? 2 : analysis.rms < 0.08 ? 1 : 0;
    applyPreset(index);
    notify(
      "Starting preset selected from level and brightness. Delay and reverb are stylistic defaults, not detected effects.",
    );
  };
  const toggleMic = async () => {
    if (nativeRef.current) {
      try {
        if (!nativeState?.running) {
          setWorkspace("audio");
          notify("Select your ASIO device and start native audio first.");
          return;
        }
        await nativeRequest("monitor", { enabled: !nativeState.monitor });
        await refreshNative();
      } catch (error) {
        notify(String(error));
      }
      return;
    }
    if (mic) {
      audio.current?.stopInput();
      setMic(false);
      return;
    }
    try {
      const e = await engine();
      await e.startInput(device);
      setMic(true);
      setDevices(
        (await navigator.mediaDevices.enumerateDevices()).filter(
          (d) => d.kind === "audioinput",
        ),
      );
    } catch (err) {
      notify(
        err instanceof Error ? err.message : "Audio input is unavailable.",
      );
    }
  };
  const ask = async (prompt = question, mode = "tone") => {
    if (!prompt.trim() || thinking) return;
    if (mode === "sources" && (!song.trim() || !artist.trim()))
      return notify(
        "Add the song title and artist so source matches can be checked.",
      );
    setThinking(true);
    if (mode === "tone") {
      setChats((c) => [...c, { role: "user", text: prompt }]);
      setQuestion("");
    }
    try {
      const r = await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt,
          mode,
          song,
          artist,
          version,
          context: {
            name: session.name,
            bpm: session.bpm,
            tone: session.tone,
            noteCount: session.notes.length,
            analysis: analysis ? { ...analysis, notes: undefined } : null,
            history: chats
              .slice(-6)
              .map((c) => ({ role: c.role, text: c.text })),
          },
        }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error ?? "The assistant is unavailable.");
      const reply = data as Reply;
      if (mode === "sources") {
        setSources(reply.sources);
        setSourceMessage(reply.answer);
      } else
        setChats((c) => [
          ...c,
          {
            role: "assistant",
            text: reply.answer,
            tone: reply.tone,
            notes: reply.notes,
            bpm: reply.bpm,
          },
        ]);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Connection failed.";
      if (mode === "tone")
        setChats((c) => [...c, { role: "assistant", text: message }]);
      else setSourceMessage(message);
    } finally {
      setThinking(false);
    }
  };
  const exportSession = () =>
    download(
      new Blob([JSON.stringify(session, null, 2)], {
        type: "application/json",
      }),
      "my-session.guitarsim.json",
    );
  const importSession = async (file?: File) => {
    if (!file) return;
    try {
      if (file.size > 3_000_000) throw new Error("Session file is too large.");
      const s = validateSession(JSON.parse(await file.text()));
      stop();
      setSession(s);
      setBar(0);
      setSelectedNote(null);
      notify("Session restored. Reload its reference audio separately.");
    } catch (err) {
      notify(err instanceof Error ? err.message : "Could not load session.");
    }
  };
  const exportAudio = async () => {
    setExporting(true);
    try {
      if (nativeEnabled) {
        const response = await fetch("/api/native/render", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(session),
        });
        if (!response.ok) {
          const result = await response.json();
          throw new Error(result.error || "Native render failed.");
        }
        download(await response.blob(), "selah-native-rack.wav");
      } else download(await renderWav(session), "selah-arrangement.wav");
      notify(
        "Processed guitar arrangement exported. Reference audio is excluded.",
      );
    } catch (err) {
      notify(String(err));
    } finally {
      setExporting(false);
    }
  };
  const toggleStep = (row: number, step: number) => {
    stop();
    const beat = bar * 4 + step / 4;
    const existing = session.notes.find(
      (n) =>
        n.string === row && Math.round(n.beat * 4) === Math.round(beat * 4),
    );
    update({
      notes: existing
        ? session.notes.filter((n) => n.id !== existing.id)
        : [
            ...session.notes,
            { id: uid(), string: row, fret, beat, length: 0.25 },
          ],
    });
  };
  const selected = session.notes.find((n) => n.id === selectedNote),
    currentStep = Math.floor(((position * session.bpm) / 60) * 4),
    patternSeconds = (session.bars * 4 * 60) / session.bpm;
  const effectCards = [
    {
      key: "compressor",
      name: "Sustain",
      kind: "COMPRESSOR",
      value: session.tone.compressor,
      color: "#e4b678",
      detail: "Even every note",
      control: "Compression",
    },
    {
      key: "drive",
      name: "Daybreak",
      kind: "OVERDRIVE",
      value: session.tone.drive,
      color: "#d4ec8c",
      detail: "A warm edge",
      control: "Drive amount",
    },
    {
      key: "chorus",
      name: "Undertow",
      kind: "CHORUS",
      value: session.tone.chorus,
      color: "#88bdbb",
      detail: "A little movement",
      control: "Chorus mix",
    },
    {
      key: "delay",
      name: "Afterglow",
      kind: "DELAY",
      value: session.tone.delay,
      color: "#c1aae3",
      detail: `${Math.round((60000 / session.bpm) * session.tone.subdivision)} ms · tempo synced`,
      control: "Delay mix",
    },
    {
      key: "reverb",
      name: "Wide open",
      kind: "REVERB",
      value: session.tone.reverb,
      color: "#d5a09e",
      detail: `${session.tone.decay.toFixed(1)} s · room to breathe`,
      control: "Reverb mix",
    },
  ];
  return (
    <div
      className="app-shell"
      style={appearanceStyle}
      data-contrast={appearance.contrast}
      data-density={appearance.compact ? "compact" : "comfortable"}
      data-sidebar={appearance.sidebar}
      data-assistant={appearance.assistant}
    >
      <aside className="sidebar">
        <a className="brand" href="#" onClick={(e) => e.preventDefault()}>
          <div className="brand-symbol">
            <i />
            <i />
            <i />
            <i />
          </div>
          <span>
            selah<span className="brand-dot">.</span>
            <small>GUITAR STUDIO</small>
          </span>
        </a>
        <div className="nav-label">YOUR WORKSPACE</div>
        <nav aria-label="Workspaces">
          {[
            { id: "studio", icon: SlidersHorizontal, label: "Device rack" },
            { id: "tabs", icon: ListMusic, label: "Tabs & sequencer" },
            { id: "audio", icon: AudioLines, label: "Audio & VST3" },
            { id: "sources", icon: Search, label: "Find song resources" },
            { id: "presets", icon: Layers3, label: "Tone collection" },
          ].map((n) => (
            <button
              key={n.id}
              className={`nav-item ${workspace === n.id ? "selected" : ""}`}
              onClick={() => setWorkspace(n.id)}
            >
              <n.icon size={18} />
              {n.label}
              {workspace === n.id && <span className="nav-dot" />}
            </button>
          ))}
        </nav>
        <div className="sidebar-divider" />
        <div className="nav-label">CURRENT SESSION</div>
        <div className="session-item">
          <span className="small-art">
            <Music2 size={17} />
          </span>
          <span>
            {session.name}
            <small>Saved on this device</small>
          </span>
          <span className="tiny-dot" />
        </div>
        <button
          className="subtle sidebar-open"
          onClick={() => importInput.current?.click()}
        >
          <FolderOpen size={15} /> Open session
        </button>
        <div className="sidebar-bottom">
          <div className="local-card">
            <span className="local-icon">
              <ShieldCheck size={19} />
            </span>
            <b>Your sound. Your space.</b>
            <p>
              Audio stays on your device.
              <br />
              Made for the way you worship.
            </p>
          </div>
          <button className="subtle" onClick={() => setHelp(true)}>
            <CircleHelp size={17} /> Getting started <ExternalLink size={12} />
          </button>
          <div className="profile">
            <span>MK</span>
            <div>
              My studio<small>FREE & OPEN SOURCE</small>
            </div>
            <button
              className="icon-button"
              aria-label="Customize workspace"
              onClick={() => setPreferencesOpen(true)}
            >
              <Settings2 size={16} />
            </button>
          </div>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumb">
            Workspace <span>/</span>
            <b>
              {workspace === "studio"
                ? "Device rack"
                : workspace === "tabs"
                  ? "Tabs & sequencer"
                  : workspace === "audio"
                    ? "Audio & VST3"
                    : workspace === "sources"
                      ? "Song resources"
                      : "Tone collection"}
            </b>
          </div>
          <div className="top-actions">
            <span className="engine-top-status">
              {nativeEnabled
                ? `${nativeState?.driver ?? "NATIVE"} · ${((nativeState?.sampleRate ?? 48000) / 1000).toFixed(1)}k · ${nativeState?.blockSize ?? 256}`
                : "BROWSER AUDIO"}
            </span>
            <button
              className="button small"
              aria-label="Workspace preferences"
              onClick={() => setPreferencesOpen(true)}
            >
              <SlidersHorizontal size={14} /> View
            </button>
            <span className="local-badge">
              <span />
              LOCAL SESSION
            </span>
            <button className="button small" onClick={exportSession}>
              <ArrowDownToLine size={14} /> Save session
            </button>
          </div>
        </header>
        <div className="studio-layout">
          <main className="workspace">
            <div className="page-heading">
              <div>
                <div className="eyebrow">SELAH / GUITAR WORKSTATION 2</div>
                <h1>
                  {workspace === "studio"
                    ? "Device rack"
                    : workspace === "tabs"
                      ? "Arrangement"
                      : workspace === "audio"
                        ? "Audio & VST3"
                        : workspace === "sources"
                          ? "Song resources"
                          : "Preset browser"}
                </h1>
                <p>
                  {workspace === "studio"
                    ? "Shape your signal. Save the sound. Build your next set."
                    : workspace === "tabs"
                      ? "Write a part, play it back, and make it your own."
                      : workspace === "audio"
                        ? "Native ASIO I/O, cabinet convolution, and your VST3 effects."
                        : workspace === "sources"
                          ? "Free resources first. Real links. Transparent checks."
                          : "Thoughtful starting points for your next Sunday."}
                </p>
              </div>
              <span className="heading-icon">
                <AudioLines size={28} />
              </span>
            </div>
            {workspace === "audio" ? (
              <NativeRack
                session={session}
                setTone={(tone, bpm) =>
                  update({
                    tone,
                    preset: "Custom tone",
                    ...(bpm ? { bpm } : {}),
                  })
                }
                state={nativeState}
                enabled={nativeEnabled}
                setEnabled={chooseNative}
                refresh={refreshNative}
                notify={notify}
              />
            ) : workspace === "presets" ? (
              <section className="collection-grid">
                {PRESETS.map((p, i) => (
                  <button
                    key={p.name}
                    className={`preset-tile ${p.color}`}
                    onClick={() => {
                      applyPreset(i);
                      setWorkspace("studio");
                    }}
                  >
                    <div className="preset-art">
                      <AudioLines size={60} />
                      <span>0{i + 1}</span>
                    </div>
                    <small>{p.tag}</small>
                    <h2>{p.name}</h2>
                    <p>{p.description}</p>
                    <span className="preset-use">
                      Load tone <ArrowRight size={16} />
                    </span>
                  </button>
                ))}
              </section>
            ) : workspace === "sources" ? (
              <section className="panel source-panel">
                <div className="panel-heading">
                  <div>
                    <Search size={17} />
                    <h2>Find tabs & arrangements</h2>
                  </div>
                  <span className="tag">LIVE WEB SEARCH</span>
                </div>
                <p className="muted">
                  Search with your ChatGPT account. Sources are checked against
                  the title and artist; version and free access are reported
                  separately. No page check can certify that every note is
                  correct.
                </p>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    void ask(
                      `Find free guitar tabs, chord charts, and arrangement resources for ${song} by ${artist}${version ? `, specifically ${version}` : ""}. Verify identity, version, access and source credibility.`,
                      "sources",
                    );
                  }}
                >
                  <div className="source-form">
                    <label>
                      Song title
                      <input
                        value={song}
                        onChange={(e) => setSong(e.target.value)}
                        placeholder="e.g. Goodness of God"
                        required
                        minLength={3}
                        maxLength={150}
                      />
                    </label>
                    <label>
                      Artist
                      <input
                        value={artist}
                        onChange={(e) => setArtist(e.target.value)}
                        placeholder="e.g. Bethel Music"
                        required
                        minLength={2}
                        maxLength={150}
                      />
                    </label>
                    <label>
                      Version / recording (optional)
                      <input
                        value={version}
                        onChange={(e) => setVersion(e.target.value)}
                        placeholder="e.g. live, acoustic, album year"
                        maxLength={150}
                      />
                    </label>
                  </div>
                  <button
                    className="button primary"
                    disabled={thinking || !status.connected}
                  >
                    {thinking ? (
                      <LoaderCircle className="spin" size={16} />
                    ) : (
                      <Search size={16} />
                    )}{" "}
                    Find free resources
                  </button>
                </form>
                {!status.connected && (
                  <p className="connection-note">
                    Connect the local assistant first: run{" "}
                    <code>codex login</code>, then use Refresh in the assistant
                    panel.
                  </p>
                )}
                <div className="verification-explainer">
                  <ShieldCheck size={20} />
                  <div>
                    <b>Source identity ≠ transcription accuracy</b>
                    <p>
                      Identity checks inspect page text independently. Blocked
                      pages stay unconfirmed. Chords, user tabs, paid charts,
                      and official arrangements are labeled separately. Open and
                      compare the actual part before importing an arrangement.
                    </p>
                  </div>
                </div>
                {sourceMessage && (
                  <p className="source-answer">{sourceMessage}</p>
                )}
                <div className="source-results">
                  {sources.map((source, i) => (
                    <article className="source-result" key={i}>
                      <div className="source-result-top">
                        <span
                          className={`source-status ${source.status === "Song identity matched" ? "matched" : ""}`}
                        >
                          <ShieldCheck size={13} />
                          {source.status}
                        </span>
                        <small>{source.type}</small>
                      </div>
                      <h3>{source.title}</h3>
                      <p>{source.publisher}</p>
                      <div className="source-checks">
                        <span>{source.titleMatch ? "✓" : "?"} Title</span>
                        <span>{source.artistMatch ? "✓" : "?"} Artist</span>
                        <span>
                          {source.versionMatch === null
                            ? "—"
                            : source.versionMatch
                              ? "✓"
                              : "?"}{" "}
                          Version
                        </span>
                      </div>
                      <p className="source-evidence">{source.aiEvidence}</p>
                      <small>
                        Access: {source.access}
                        <br />
                        Notes: {source.accuracy}
                        <br />
                        Checked {new Date(source.checkedAt).toLocaleString()}
                      </small>
                      {source.error && <p className="muted">{source.error}</p>}
                      {/^https:\/\//.test(source.url) && (
                        <a
                          className="button small"
                          href={source.url}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          Open source <ExternalLink size={13} />
                        </a>
                      )}
                    </article>
                  ))}
                </div>
                {!sources.length && !sourceMessage && (
                  <div className="source-empty">
                    <BookOpen size={36} />
                    <h3>A good part starts with a good source.</h3>
                    <p>Add the exact song and artist to get started.</p>
                  </div>
                )}
              </section>
            ) : (
              <>
                <section
                  className="panel reference-panel"
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    void upload(e.dataTransfer.files[0]);
                  }}
                >
                  <div className="panel-heading">
                    <div>
                      <FileAudio size={17} />
                      <h2>Your reference</h2>
                      <span className="tag">
                        {referenceName.includes("original demo")
                          ? "DEMO"
                          : "LOCAL AUDIO"}
                      </span>
                    </div>
                    <button
                      className="button small"
                      onClick={() => fileInput.current?.click()}
                    >
                      <Upload size={14} /> Upload song
                    </button>
                  </div>
                  <div className="track-info">
                    <div className="track-art">
                      <AudioLines size={26} />
                    </div>
                    <div>
                      <b>{referenceName}</b>
                      <span>
                        {referenceName.includes("original demo")
                          ? "An original guitar sketch. Or drop your own song here."
                          : "On your device · nothing uploaded to a server"}
                      </span>
                    </div>
                    <div className="track-metadata">
                      <span>
                        <Clock3 size={13} />
                        {time(duration)}
                      </span>
                      <span>{analysis?.key ?? "E A D G B e"}</span>
                    </div>
                  </div>
                  <div
                    className="waveform"
                    role="slider"
                    aria-label="Reference playback position"
                    aria-valuemin={0}
                    aria-valuemax={Math.round(duration)}
                    aria-valuenow={Math.min(
                      Math.round(position),
                      Math.round(duration),
                    )}
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === "ArrowRight")
                        seek(Math.min(duration, position + 5));
                      if (e.key === "ArrowLeft")
                        seek(Math.max(0, position - 5));
                    }}
                    onClick={(e) => {
                      const bounds = e.currentTarget.getBoundingClientRect();
                      seek(
                        ((e.clientX - bounds.left) / bounds.width) * duration,
                      );
                    }}
                  >
                    <div className="wave-bars">
                      {peaks.map((p, i) => (
                        <i
                          key={i}
                          className={
                            i / peaks.length < position / duration
                              ? "passed"
                              : ""
                          }
                          style={{
                            height: `${Math.max(5, Math.min(94, p * 180))}%`,
                          }}
                        />
                      ))}
                    </div>
                    <div
                      className="wave-cursor"
                      style={{
                        left: `${Math.min(100, (position / (duration || 1)) * 100)}%`,
                      }}
                    />
                    <div className="wave-times">
                      <span>0:00</span>
                      <span>{time(duration / 4)}</span>
                      <span>{time(duration / 2)}</span>
                      <span>{time(duration * 0.75)}</span>
                      <span>{time(duration)}</span>
                    </div>
                  </div>
                  <div className="reference-footer">
                    <span>
                      <ShieldCheck size={13} /> Local analysis · best with an
                      isolated guitar stem
                    </span>
                    <div>
                      <label className="excerpt-label">
                        From{" "}
                        <input
                          aria-label="Analysis start in seconds"
                          type="number"
                          min={0}
                          max={Math.max(0, duration - 0.5)}
                          step={1}
                          value={analysisStart}
                          onChange={(e) =>
                            setAnalysisStart(
                              Math.max(
                                0,
                                Math.min(duration - 0.5, +e.target.value),
                              ),
                            )
                          }
                        />
                        s
                      </label>
                      <button
                        className="button analyze-button"
                        disabled={analyzing}
                        onClick={() => void analyzeSong()}
                      >
                        {analyzing ? (
                          <LoaderCircle size={14} className="spin" />
                        ) : (
                          <Sparkles size={14} />
                        )}{" "}
                        {analyzing ? `Analyzing ${progress}%` : "Analyze song"}
                      </button>
                    </div>
                  </div>
                  {analysis && (
                    <div className="analysis-result">
                      <div>
                        <span className="tiny-dot" />
                        <b>Draft ready</b>
                        <span>
                          {analysis.bpm
                            ? `~${analysis.bpm} BPM`
                            : "Tempo uncertain"}{" "}
                          · {analysis.key} · {analysis.notes.length} possible
                          notes
                        </span>
                      </div>
                      <p>
                        First {Math.round(analysis.seconds)}s from{" "}
                        {time(analyzedStart)}. Melody detection only; a full mix
                        can confuse vocals, bass and guitar. Key is a
                        pitch-profile estimate.
                      </p>
                      <div>
                        <button
                          className="button small"
                          onClick={useDraft}
                          disabled={!analysis.notes.length}
                        >
                          Load tab draft <ArrowRight size={13} />
                        </button>
                        <button className="subtle" onClick={matchTone}>
                          Suggest starting tone
                        </button>
                      </div>
                    </div>
                  )}
                </section>
                {workspace === "studio" && (
                  <>
                    <div className="studio-engine-strip">
                      <span
                        className={`engine-indicator ${nativeState?.running ? "on" : ""}`}
                      />
                      <span>
                        {nativeEnabled
                          ? `${nativeState?.driver ?? "Native engine"} · CPU ${nativeState?.cpuLoad?.toFixed(1) ?? "0"}%`
                          : "Browser preview engine"}
                      </span>
                      <span>
                        {nativeEnabled
                          ? `${nativeState?.plugins?.length ?? 0} VST3 effects · ${nativeState?.irLoaded ? "Cabinet IR" : "Filter cabinet"}`
                          : "Choose native audio for ASIO + VST3 processing"}
                      </span>
                      <button
                        className="button small"
                        onClick={() => setWorkspace("audio")}
                      >
                        Audio setup <ArrowRight size={12} />
                      </button>
                    </div>
                    <div className="section-title">
                      <div>
                        <h2>Your signal chain</h2>
                        <span>One good tone. Five little ingredients.</span>
                      </div>
                      <div className="preset-selector">
                        <button
                          className="button small"
                          onClick={() => setPresetOpen(!presetOpen)}
                        >
                          <span className="tiny-dot" />
                          {session.preset}
                          <ChevronDown size={13} />
                        </button>
                        {presetOpen && (
                          <div className="preset-menu">
                            {PRESETS.map((p, i) => (
                              <button
                                key={p.name}
                                onClick={() => applyPreset(i)}
                              >
                                {p.name}
                                <small>{p.tag}</small>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="chain-routing">
                      <span>
                        <Guitar size={14} /> INPUT
                      </span>
                      <i />
                      <span>COMP</span>
                      <i />
                      <span>DRIVE</span>
                      <i />
                      <span>AMP / EQ</span>
                      <i />
                      <span>CHORUS</span>
                      <i />
                      <span>DELAY</span>
                      <i />
                      <span>REVERB</span>
                      <i />
                      <span>
                        <Headphones size={14} /> OUT
                      </span>
                    </div>
                    <div className="pedal-grid">
                      {effectCards.map((p, i) => {
                        const bypass = session.tone.bypass.includes(p.key);
                        return (
                          <article
                            key={p.key}
                            className={`pedal ${bypass ? "bypassed" : ""}`}
                            style={
                              { "--pedal-color": p.color } as CSSProperties
                            }
                          >
                            <div className="pedal-top">
                              <span>0{i + 1}</span>
                              <button
                                title={`${bypass ? "Enable" : "Bypass"} ${p.kind.toLowerCase()}`}
                                aria-label={`${bypass ? "Enable" : "Bypass"} ${p.kind.toLowerCase()}`}
                                aria-pressed={!bypass}
                                onClick={() =>
                                  update({
                                    tone: {
                                      ...session.tone,
                                      bypass: bypass
                                        ? session.tone.bypass.filter(
                                            (k) => k !== p.key,
                                          )
                                        : [...session.tone.bypass, p.key],
                                    },
                                  })
                                }
                              >
                                <Power size={13} />
                              </button>
                            </div>
                            <Knob
                              value={p.value}
                              label={p.kind}
                              color={p.color}
                            />
                            <h3>{p.name}</h3>
                            <p>{p.detail}</p>
                            <input
                              aria-label={p.control}
                              type="range"
                              min={0}
                              max={100}
                              value={p.value}
                              onChange={(e) =>
                                updateTone(p.key as keyof Tone, +e.target.value)
                              }
                            />
                            <div className="pedal-bottom">
                              <span className="pedal-led" />
                              {bypass ? "BYPASSED" : `${p.value}%`}
                              <span className="screw" />
                            </div>
                          </article>
                        );
                      })}
                    </div>
                    <section className="panel amp-panel">
                      <div className="amp-visual">
                        <div className="amp-brand">
                          selah<span>CHIME 30</span>
                        </div>
                        <div className="amp-grille" />
                        <span className="amp-light" />
                      </div>
                      <div className="amp-controls">
                        <div>
                          <h3>A little British chime.</h3>
                          <p>Cabinet-style filtering · warm, open EQ</p>
                        </div>
                        <div className="amp-sliders">
                          <Slider
                            label="Bass"
                            value={session.tone.bass}
                            onChange={(n) => updateTone("bass", n)}
                          />
                          <Slider
                            label="Treble"
                            value={session.tone.treble}
                            onChange={(n) => updateTone("treble", n)}
                          />
                          <Slider
                            label="Delay feedback"
                            value={session.tone.feedback}
                            max={75}
                            onChange={(n) => updateTone("feedback", n)}
                          />
                          <Slider
                            label="Reverb decay"
                            value={session.tone.decay}
                            min={0.5}
                            max={8}
                            step={0.1}
                            suffix="s"
                            onChange={(n) => updateTone("decay", n)}
                          />
                        </div>
                        <label className="delay-subdivision">
                          Delay rhythm
                          <select
                            aria-label="Delay rhythm"
                            value={session.tone.subdivision}
                            onChange={(e) =>
                              updateTone("subdivision", +e.target.value)
                            }
                          >
                            <option value={0.25}>Sixteenth note</option>
                            <option value={0.5}>Eighth note</option>
                            <option value={0.75}>Dotted eighth</option>
                            <option value={1}>Quarter note</option>
                            <option value={1.5}>Dotted quarter</option>
                            <option value={2}>Half note</option>
                          </select>
                        </label>
                      </div>
                    </section>
                  </>
                )}
                <section className="panel sequencer-panel">
                  <div className="panel-heading">
                    <div>
                      <ListMusic size={17} />
                      <h2>
                        {workspace === "tabs"
                          ? "Tabs & sequencer"
                          : "The sketchpad"}
                      </h2>
                      <span className="tag">4/4 · STANDARD</span>
                    </div>
                    <div className="segmented">
                      <button
                        className={panel === "tone" ? "selected" : ""}
                        onClick={() => setPanel("tone")}
                      >
                        Sequencer
                      </button>
                      <button
                        className={panel === "tabs" ? "selected" : ""}
                        onClick={() => setPanel("tabs")}
                      >
                        Tab editor
                      </button>
                    </div>
                  </div>
                  <div className="sequence-toolbar">
                    <div>
                      <IconButton
                        title="Previous bar"
                        disabled={bar === 0}
                        onClick={() => setBar(bar - 1)}
                      >
                        <ArrowLeft size={13} />
                      </IconButton>
                      <b>
                        Bar {bar + 1} <span>/ {session.bars}</span>
                      </b>
                      <IconButton
                        title="Next bar"
                        disabled={bar >= session.bars - 1}
                        onClick={() => setBar(bar + 1)}
                      >
                        <ArrowRight size={13} />
                      </IconButton>
                      <button
                        className="subtle"
                        disabled={session.bars >= 128}
                        onClick={() => {
                          stop();
                          update({ bars: session.bars + 1 });
                          setBar(session.bars);
                        }}
                      >
                        <Plus size={13} /> Add bar
                      </button>
                    </div>
                    <label>
                      Add fret{" "}
                      <input
                        aria-label="Fret for new notes"
                        type="number"
                        min={0}
                        max={24}
                        value={fret}
                        onChange={(e) =>
                          setFret(
                            Math.max(
                              0,
                              Math.min(24, Math.round(+e.target.value)),
                            ),
                          )
                        }
                      />
                    </label>
                  </div>
                  {panel === "tone" ? (
                    <div className="sequence-grid">
                      <div className="beat-numbers">
                        <span />
                        {Array.from({ length: 16 }, (_, i) => (
                          <span key={i}>{i % 4 === 0 ? i / 4 + 1 : "·"}</span>
                        ))}
                      </div>
                      {STRINGS.map((s, row) => (
                        <div key={row} className="sequence-row">
                          <span className="string-label">{s}</span>
                          {Array.from({ length: 16 }, (_, step) => {
                            const note = session.notes.find(
                              (n) =>
                                n.string === row &&
                                Math.round(n.beat * 4) === bar * 16 + step,
                            );
                            return (
                              <button
                                key={step}
                                aria-label={`${s} string, bar ${bar + 1}, step ${step + 1}${note ? `, fret ${note.fret}, remove note` : `, add fret ${fret}`}`}
                                aria-pressed={!!note}
                                className={`step ${step % 4 === 0 ? "beat-start" : ""} ${note ? "has-note" : ""} ${playing && currentStep % (session.bars * 16) === bar * 16 + step ? "playhead" : ""}`}
                                onClick={() => toggleStep(row, step)}
                              >
                                {note ? note.fret : ""}
                              </button>
                            );
                          })}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <>
                      <div className="tab-paper">
                        {STRINGS.map((s, row) => (
                          <div className="tab-line" key={row}>
                            <span>{s}</span>
                            <div>
                              {Array.from({ length: 16 }, (_, step) => {
                                const note = session.notes.find(
                                  (n) =>
                                    n.string === row &&
                                    Math.round(n.beat * 4) === bar * 16 + step,
                                );
                                return (
                                  <button
                                    aria-label={`Edit ${s} string step ${step + 1}${note ? ` fret ${note.fret}` : ""}`}
                                    className={
                                      note?.id === selectedNote
                                        ? "selected"
                                        : ""
                                    }
                                    key={step}
                                    onClick={() => {
                                      if (note) setSelectedNote(note.id);
                                      else toggleStep(row, step);
                                    }}
                                  >
                                    {note ? note.fret : "—"}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        ))}
                      </div>
                      {selected && (
                        <div className="note-editor">
                          <span>
                            Selected note{" "}
                            <b>
                              {noteName(
                                TUNING[selected.string] + selected.fret,
                              )}
                            </b>
                          </span>
                          <label>
                            Fret
                            <input
                              aria-label="Selected note fret"
                              type="number"
                              min={0}
                              max={24}
                              value={selected.fret}
                              onChange={(e) => {
                                stop();
                                update({
                                  notes: session.notes.map((n) =>
                                    n.id === selected.id
                                      ? {
                                          ...n,
                                          fret: Math.max(
                                            0,
                                            Math.min(
                                              24,
                                              Math.round(+e.target.value),
                                            ),
                                          ),
                                        }
                                      : n,
                                  ),
                                });
                              }}
                            />
                          </label>
                          <label>
                            Length (beats)
                            <input
                              aria-label="Selected note length"
                              type="number"
                              min={0.25}
                              max={8}
                              step={0.25}
                              value={selected.length}
                              onChange={(e) => {
                                stop();
                                update({
                                  notes: session.notes.map((n) =>
                                    n.id === selected.id
                                      ? {
                                          ...n,
                                          length: Math.max(
                                            0.25,
                                            Math.min(8, +e.target.value),
                                          ),
                                        }
                                      : n,
                                  ),
                                });
                              }}
                            />
                          </label>
                          <button
                            className="subtle"
                            onClick={() => {
                              stop();
                              update({
                                notes: session.notes.filter(
                                  (n) => n.id !== selected.id,
                                ),
                              });
                              setSelectedNote(null);
                            }}
                          >
                            Remove
                          </button>
                        </div>
                      )}
                    </>
                  )}
                  <div className="sequence-footer">
                    <span>
                      <span className="tiny-dot" />
                      Click a step to add or remove a note. Both views share the
                      same part.
                    </span>
                    <button
                      className="subtle"
                      onClick={() => {
                        stop();
                        update({
                          notes: session.notes.filter(
                            (n) => Math.floor(n.beat / 4) !== bar,
                          ),
                        });
                      }}
                    >
                      Clear bar
                    </button>
                  </div>
                </section>
                {workspace === "tabs" && (
                  <section className="panel exports-panel">
                    <div>
                      <h3>Take your part with you.</h3>
                      <p>
                        Export the shared arrangement as a tab, MIDI, or
                        processed guitar audio.
                      </p>
                    </div>
                    <div>
                      <button
                        className="button small"
                        onClick={() =>
                          download(
                            new Blob(
                              [toTab(session.notes, session.bpm, session.bars)],
                              { type: "text/plain" },
                            ),
                            "selah-tabs.txt",
                          )
                        }
                      >
                        <ArrowDownToLine size={14} /> Tabs
                      </button>
                      <button
                        className="button small"
                        onClick={() =>
                          download(
                            new Blob(
                              [
                                toMidi(session.notes, session.bpm).slice()
                                  .buffer as ArrayBuffer,
                              ],
                              { type: "audio/midi" },
                            ),
                            "selah-arrangement.mid",
                          )
                        }
                      >
                        <ArrowDownToLine size={14} /> MIDI
                      </button>
                      <button
                        className="button small"
                        disabled={exporting}
                        onClick={() => void exportAudio()}
                      >
                        {exporting ? (
                          <LoaderCircle className="spin" size={14} />
                        ) : (
                          <ArrowDownToLine size={14} />
                        )}{" "}
                        WAV
                      </button>
                    </div>
                  </section>
                )}
              </>
            )}
            <div className="workspace-footnote">
              <span>PLAY WITH PURPOSE.</span>
              <span>Selah / GuitarSim AI · Free & open source</span>
            </div>
          </main>
          <aside className="assistant-panel">
            <div className="assistant-header">
              <div className="assistant-symbol">
                <Sparkles size={19} />
              </div>
              <div>
                <h2>Your tone companion</h2>
                <span>POWERED BY YOUR CHATGPT ACCOUNT</span>
              </div>
            </div>
            <div
              className={`assistant-connection ${status.connected ? "connected" : ""}`}
            >
              <span className="tiny-dot" />
              {status.connected
                ? "ChatGPT connected · no API key"
                : "Local assistant not connected"}
              <button
                title="Refresh assistant connection"
                aria-label="Refresh assistant connection"
                onClick={() => void refreshStatus()}
              >
                <RefreshCw size={12} />
              </button>
            </div>
            <div className="assistant-note">
              <Headphones size={16} />
              <p>
                A second pair of ears.
                <br />
                <span>A starting point for your sound.</span>
              </p>
            </div>
            <div className="chat-messages" aria-live="polite">
              {chats.map((chat, i) => (
                <div key={i} className={`chat-message ${chat.role}`}>
                  <div className="chat-who">
                    {chat.role === "assistant" ? (
                      <>
                        <Sparkles size={12} /> SELAH
                      </>
                    ) : (
                      "YOU"
                    )}
                  </div>
                  <p>{chat.text}</p>
                  {chat.tone && (
                    <button
                      className="button apply-tone"
                      onClick={() => {
                        update({
                          tone: { ...chat.tone!, bypass: [] },
                          preset: "Companion tone",
                        });
                        notify("Companion tone applied. Adjust it by ear.");
                      }}
                    >
                      <Check size={14} /> Apply suggested tone
                    </button>
                  )}
                  {!!chat.notes?.length && (
                    <button
                      className="button apply-tone"
                      onClick={() => {
                        stop();
                        update({
                          notes: chat.notes!.map((n) => ({ ...n, id: uid() })),
                          bpm: chat.bpm ?? session.bpm,
                          bars: 4,
                        });
                        setBar(0);
                        setWorkspace("tabs");
                        notify(
                          "Original practice part loaded into tabs and sequencer.",
                        );
                      }}
                    >
                      <ListMusic size={14} /> Load practice arrangement
                    </button>
                  )}
                </div>
              ))}
              {thinking && (
                <div className="chat-thinking">
                  <LoaderCircle size={14} className="spin" />
                  {workspace === "sources"
                    ? "Searching and checking sources…"
                    : "Finding a little inspiration…"}
                </div>
              )}
              <div ref={chatEnd} />
            </div>
            <div className="prompt-suggestions">
              <span>A PLACE TO START</span>
              {[
                "Give me a spacious worship lead tone",
                "How do I use dotted-eighth delay?",
                "Write an original 4-bar worship arpeggio",
              ].map((q) => (
                <button key={q} disabled={thinking} onClick={() => void ask(q)}>
                  {q}
                  <ArrowRight size={13} />
                </button>
              ))}
            </div>
            <form
              className="chat-compose"
              onSubmit={(e) => {
                e.preventDefault();
                void ask();
              }}
            >
              <textarea
                aria-label="Ask the tone companion"
                placeholder="Describe the sound in your head…"
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                maxLength={6000}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void ask();
                  }
                }}
              />
              <div>
                <span>
                  <span className="tiny-dot" /> Session settings included
                </span>
                <button
                  aria-label="Send message"
                  disabled={thinking || !question.trim()}
                >
                  <Send size={15} />
                </button>
              </div>
            </form>
            <div className="assistant-disclosure">
              Questions & settings go to OpenAI when sent.
              <br />
              Audio stays here. Suggestions need your ears.
            </div>
            {!status.connected && (
              <div className="setup-hint">
                <b>Use your ChatGPT account</b>
                <p>
                  Install the free Codex CLI, run <code>codex login</code>, and
                  complete sign-in. Your plan’s access and limits apply.
                </p>
                <button className="subtle" onClick={() => setHelp(true)}>
                  Setup instructions <ArrowRight size={12} />
                </button>
              </div>
            )}
          </aside>
        </div>
        <footer className="transport">
          <div className="transport-track">
            <span className="small-art">
              <Music2 size={18} />
            </span>
            <div>
              <input
                className="session-title-input"
                aria-label="Session name"
                maxLength={200}
                value={session.name}
                onChange={(e) => update({ name: e.target.value })}
              />
              <span>{session.preset}</span>
            </div>
          </div>
          <div className="transport-controls">
            <IconButton title="Return to start" onClick={() => seek(0)}>
              <ArrowLeft size={17} />
            </IconButton>
            <button
              className="play-button"
              aria-label={playing ? "Pause playback" : "Play arrangement"}
              onClick={() => void startPlayback()}
            >
              {playing ? (
                <Square size={16} fill="currentColor" />
              ) : (
                <Play size={19} fill="currentColor" />
              )}
            </button>
            <IconButton
              title="Loop arrangement"
              active={loop}
              onClick={() => {
                stop();
                setLoop(!loop);
              }}
            >
              <Repeat2 size={18} />
            </IconButton>
            <div className="transport-time">
              <b>{time(position)}</b>
              <span>
                /{" "}
                {time(
                  loop ? patternSeconds : Math.max(duration, patternSeconds),
                )}
              </span>
            </div>
            <label className="bpm-input">
              <input
                aria-label="Tempo BPM"
                type="number"
                min={30}
                max={240}
                value={session.bpm}
                onChange={(e) => {
                  stop();
                  update({
                    bpm: Math.max(
                      30,
                      Math.min(240, Math.round(+e.target.value)),
                    ),
                  });
                }}
              />
              <span>BPM</span>
            </label>
            <IconButton
              title="Metronome"
              active={metronome}
              onClick={() => {
                stop();
                setMetronome(!metronome);
              }}
            >
              <Radio size={17} />
            </IconButton>
          </div>
          <div className="transport-mixer">
            <div className="input-controls">
              <button
                className={`mic-button ${(nativeEnabled ? nativeState?.monitor : mic) ? "enabled" : ""}`}
                onClick={() => void toggleMic()}
                title="Use headphones before enabling live guitar monitoring"
              >
                <Mic2 size={15} />
                {(nativeEnabled ? nativeState?.monitor : mic)
                  ? "Input on"
                  : "Guitar input"}
              </button>
              {!nativeEnabled && devices.length > 0 && (
                <select
                  aria-label="Audio input device"
                  value={device}
                  disabled={mic}
                  onChange={(e) => setDevice(e.target.value)}
                >
                  <option value="">Default input</option>
                  {devices.map((d) => (
                    <option key={d.deviceId} value={d.deviceId}>
                      {d.label}
                    </option>
                  ))}
                </select>
              )}
            </div>
            <div className="output-meter" title="Output signal">
              {Array.from({ length: 14 }, (_, i) => (
                <i key={i} className={(level / 100) * 14 > i ? "lit" : ""} />
              ))}
            </div>
            <IconButton
              title="Show mixer"
              active={help}
              onClick={() => setHelp(true)}
            >
              <Volume2 size={18} />
            </IconButton>
          </div>
        </footer>
      </div>
      <input
        ref={fileInput}
        type="file"
        accept="audio/*,.wav,.mp3,.m4a,.flac,.ogg"
        hidden
        onChange={(e) => {
          void upload(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
      <input
        ref={importInput}
        type="file"
        accept=".json"
        hidden
        onChange={(e) => {
          void importSession(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
      {toast && (
        <div role="status" className="toast">
          <Check size={16} />
          {toast}
          <button
            aria-label="Dismiss notification"
            onClick={() => setToast("")}
          >
            <X size={14} />
          </button>
        </div>
      )}
      {preferencesOpen && (
        <Appearance
          value={appearance}
          setValue={setAppearance}
          onClose={() => setPreferencesOpen(false)}
        />
      )}
      {help && (
        <div className="modal-backdrop" onClick={() => setHelp(false)}>
          <section
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-label="Getting started and mixer"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="panel-heading">
              <h2>A little setup. Then, just play.</h2>
              <IconButton title="Close help" onClick={() => setHelp(false)}>
                <X size={18} />
              </IconButton>
            </div>
            <p>
              Upload a reference, analyze up to 90 seconds at a time, and review
              its melody draft. A guitar-only stem gives better results than a
              finished mix. Tone matching suggests a starting preset; it cannot
              recover an exact pedalboard.
            </p>
            <h3>Connect your ChatGPT account</h3>
            <p>
              Install Node.js 22 or newer and the free official Codex CLI, then
              sign in yourself:
            </p>
            <div className="code-block">
              <code>
                npm install -g @openai/codex
                <br />
                codex login
              </code>
              <button
                aria-label="Copy setup commands"
                onClick={() => {
                  void navigator.clipboard
                    .writeText("npm install -g @openai/codex\ncodex login")
                    .then(() => notify("Commands copied."))
                    .catch(() =>
                      notify(
                        "Copy is unavailable; select the commands manually.",
                      ),
                    );
                }}
              >
                <Copy size={16} />
              </button>
            </div>
            <p>
              No API key is used. An eligible ChatGPT/Codex account is required
              and plan usage limits apply. This connects to Codex using your
              account, not to this existing chat’s history.
            </p>
            <button
              className="button small"
              onClick={() => void refreshStatus()}
            >
              <RefreshCw size={14} /> Refresh connection
            </button>
            <h3>ASIO & VST3</h3>
            <p>
              Open Audio & VST3 to select your interface, channels, sample rate,
              and buffer. Start audio with monitoring off, then enable Guitar
              monitor when your headphones are connected. Add compatible 64-bit
              VST3 effects and a cabinet IR there. Use View to customize the
              black workspace.
            </p>
            <button
              className="button small"
              onClick={() => {
                setHelp(false);
                setWorkspace("audio");
              }}
            >
              Open audio setup <ArrowRight size={14} />
            </button>
            <h3>Input & mix</h3>
            <p>
              Connect a guitar through an audio interface and enable Guitar
              input. Use headphones to avoid feedback. Reference audio plays
              dry; the synth guitar and live input use your effects rack.
            </p>
            <div className="mixer-sliders">
              <Slider
                label="Reference volume"
                value={session.referenceVolume}
                onChange={(n) => update({ referenceVolume: n })}
              />
              <Slider
                label="Guitar volume"
                value={session.guitarVolume}
                onChange={(n) => update({ guitarVolume: n })}
              />
            </div>
            <p className="muted">
              Session files save notes and tones; reference audio stays
              separate. WAV exports contain your processed sequence. Web search
              returns links and identity checks, never a guarantee of accurate
              tabs.
            </p>
            <a
              className="subtle"
              href="https://learn.chatgpt.com/docs/auth"
              target="_blank"
              rel="noopener noreferrer"
            >
              Official sign-in documentation <ExternalLink size={13} />
            </a>
          </section>
        </div>
      )}
    </div>
  );
}
