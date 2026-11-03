export const STRINGS = ["e", "B", "G", "D", "A", "E"];
export const TUNING = [64, 59, 55, 50, 45, 40];
export type Note = {
  id: string;
  string: number;
  fret: number;
  beat: number;
  length: number;
  confidence?: number;
};
export type Tone = {
  compressor: number;
  drive: number;
  bass: number;
  treble: number;
  chorus: number;
  delay: number;
  feedback: number;
  reverb: number;
  decay: number;
  subdivision: number;
  bypass: string[];
};
export type Analysis = {
  bpm: number | null;
  key: string;
  confidence: number;
  notes: Note[];
  rms: number;
  brightness: number;
  seconds: number;
};
export type Session = {
  version: 1;
  name: string;
  bpm: number;
  bars: number;
  tone: Tone;
  preset: string;
  notes: Note[];
  referenceVolume: number;
  guitarVolume: number;
};
export const PRESETS: {
  name: string;
  tag: string;
  description: string;
  color: string;
  tone: Tone;
}[] = [
  {
    name: "Sunday morning",
    tag: "WORSHIP LEAD",
    description: "Chime, a little grit, and that dotted-eighth repeat.",
    color: "lime",
    tone: {
      compressor: 45,
      drive: 18,
      bass: 48,
      treble: 62,
      chorus: 8,
      delay: 32,
      feedback: 36,
      reverb: 34,
      decay: 3.8,
      subdivision: 0.75,
      bypass: [],
    },
  },
  {
    name: "Cloud of sound",
    tag: "AMBIENT",
    description: "Slow-moving texture with a long, spacious tail.",
    color: "purple",
    tone: {
      compressor: 60,
      drive: 10,
      bass: 44,
      treble: 48,
      chorus: 40,
      delay: 42,
      feedback: 54,
      reverb: 65,
      decay: 7,
      subdivision: 0.75,
      bypass: [],
    },
  },
  {
    name: "Lift the room",
    tag: "BIG CHORUS",
    description: "An open, driven sound for the biggest part of the song.",
    color: "orange",
    tone: {
      compressor: 35,
      drive: 48,
      bass: 55,
      treble: 65,
      chorus: 5,
      delay: 23,
      feedback: 30,
      reverb: 29,
      decay: 3.2,
      subdivision: 0.75,
      bypass: [],
    },
  },
  {
    name: "Still & simple",
    tag: "CLEAN",
    description: "Warm, close, and clear. Leave room for the song.",
    color: "blue",
    tone: {
      compressor: 30,
      drive: 3,
      bass: 53,
      treble: 52,
      chorus: 0,
      delay: 12,
      feedback: 20,
      reverb: 20,
      decay: 2.4,
      subdivision: 1,
      bypass: [],
    },
  },
];
export const uid = () => crypto.randomUUID();
export function noteName(midi: number) {
  return (
    ["C", "C♯", "D", "E♭", "E", "F", "F♯", "G", "A♭", "A", "B♭", "B"][
      ((midi % 12) + 12) % 12
    ] +
    (Math.floor(midi / 12) - 1)
  );
}
export function fingering(
  midi: number,
  previous = 5,
): { string: number; fret: number } | null {
  const positions = TUNING.map((pitch, string) => ({
    string,
    fret: midi - pitch,
  })).filter((p) => p.fret >= 0 && p.fret <= 22);
  return (
    positions.sort(
      (a, b) =>
        Math.abs(a.fret - previous) +
        (a.fret === 0 ? 1 : 0) -
        (Math.abs(b.fret - previous) + (b.fret === 0 ? 1 : 0)),
    )[0] ?? null
  );
}
export function demoNotes(): Note[] {
  return [64, 67, 71, 67, 62, 66, 69, 66, 64, 67, 72, 71, 62, 67, 69, 67].map(
    (midi, i) => ({
      id: uid(),
      ...fingering(midi)!,
      beat: i * 0.5,
      length: 0.4,
      confidence: 1,
    }),
  );
}
export function initialSession(): Session {
  return {
    version: 1,
    name: "A little room for wonder",
    bpm: 76,
    bars: 4,
    tone: structuredClone(PRESETS[0].tone),
    preset: PRESETS[0].name,
    notes: demoNotes(),
    referenceVolume: 65,
    guitarVolume: 65,
  };
}
export function validateSession(value: unknown): Session {
  if (!value || typeof value !== "object")
    throw new Error("This is not a Selah session.");
  const s = value as Session;
  if (
    s.version !== 1 ||
    typeof s.name !== "string" ||
    s.name.length > 200 ||
    !Number.isFinite(s.bpm) ||
    s.bpm < 30 ||
    s.bpm > 240 ||
    !Number.isInteger(s.bars) ||
    s.bars < 1 ||
    s.bars > 128 ||
    !Array.isArray(s.notes) ||
    s.notes.length > 10000 ||
    !s.tone ||
    typeof s.preset !== "string"
  )
    throw new Error("Invalid or unsupported session.");
  for (const n of s.notes)
    if (
      !n ||
      typeof n.id !== "string" ||
      !Number.isInteger(n.string) ||
      n.string < 0 ||
      n.string > 5 ||
      !Number.isInteger(n.fret) ||
      n.fret < 0 ||
      n.fret > 24 ||
      !Number.isFinite(n.beat) ||
      n.beat < 0 ||
      n.beat >= s.bars * 4 ||
      !Number.isFinite(n.length) ||
      n.length <= 0 ||
      n.length > 32
    )
      throw new Error("Session contains an invalid note.");
  for (const [k, max] of Object.entries({
    compressor: 100,
    drive: 100,
    bass: 100,
    treble: 100,
    chorus: 100,
    delay: 100,
    feedback: 75,
    reverb: 100,
    decay: 8,
    subdivision: 2,
  })) {
    const v = s.tone[k as keyof Tone];
    if (typeof v !== "number" || !Number.isFinite(v) || v < 0 || v > max)
      throw new Error("Session contains an invalid effect setting.");
  }
  if (
    s.tone.decay < 0.5 ||
    s.tone.subdivision < 0.25 ||
    !Array.isArray(s.tone.bypass) ||
    !s.tone.bypass.every((x) =>
      ["compressor", "drive", "cabinet", "chorus", "delay", "reverb"].includes(
        x,
      ),
    )
  )
    throw new Error("Invalid effect configuration.");
  for (const v of [s.referenceVolume, s.guitarVolume])
    if (!Number.isFinite(v) || v < 0 || v > 100)
      throw new Error("Invalid volume.");
  return s;
}
export function toTab(notes: Note[], bpm: number, bars: number) {
  let text = `SELAH / GuitarSim AI\nTempo: ${bpm} BPM · 4/4 · Standard tuning\nEditable transcription / arrangement — verify by ear.\n\n`;
  for (let bar = 0; bar < bars; bar++) {
    text += `Bar ${bar + 1}\n`;
    text +=
      STRINGS.map(
        (s, row) =>
          s +
          "|" +
          Array.from({ length: 16 }, (_, step) => {
            const n = notes.find(
              (n) =>
                n.string === row && Math.round(n.beat * 4) === bar * 16 + step,
            );
            return n ? String(n.fret).padEnd(3, "-") : "---";
          }).join("") +
          "|",
      ).join("\n") + "\n\n";
  }
  return text;
}
export function toMidi(notes: Note[], bpm: number): Uint8Array {
  const vlq = (n: number) => {
    const b = [n & 127];
    while ((n = n >>> 7)) b.unshift((n & 127) | 128);
    return b;
  };
  const tempo = Math.round(60_000_000 / bpm);
  const events = notes
    .flatMap((n) => [
      {
        tick: Math.round(n.beat * 480),
        on: true,
        midi: TUNING[n.string] + n.fret,
      },
      {
        tick: Math.round((n.beat + n.length) * 480),
        on: false,
        midi: TUNING[n.string] + n.fret,
      },
    ])
    .sort((a, b) => a.tick - b.tick || Number(a.on) - Number(b.on));
  const track = [
    0,
    255,
    81,
    3,
    (tempo >> 16) & 255,
    (tempo >> 8) & 255,
    tempo & 255,
    0,
    192,
    27,
  ];
  let prev = 0;
  for (const e of events) {
    track.push(...vlq(e.tick - prev), e.on ? 144 : 128, e.midi, e.on ? 90 : 0);
    prev = e.tick;
  }
  track.push(0, 255, 47, 0);
  const len = track.length;
  return new Uint8Array([
    77,
    84,
    104,
    100,
    0,
    0,
    0,
    6,
    0,
    0,
    0,
    1,
    1,
    224,
    77,
    84,
    114,
    107,
    (len >>> 24) & 255,
    (len >>> 16) & 255,
    (len >>> 8) & 255,
    len & 255,
    ...track,
  ]);
}
