import { PitchDetector } from "pitchy";
import { fingering } from "./music";
import type { Analysis, Note } from "./music";
export function estimateTempo(
  envelope: number[],
  framesPerSecond: number,
): number | null {
  if (envelope.length < framesPerSecond * 4) return null;
  const mean = envelope.reduce((a, b) => a + b, 0) / envelope.length;
  const onset = envelope.map((v, i) =>
    Math.max(0, v - (envelope[i - 1] ?? v) - mean * 0.03),
  );
  if (onset.reduce((a, b) => a + b * b, 0) < 0.000001) return null;
  let score = 0,
    best = 0;
  for (let bpm = 55; bpm <= 180; bpm++) {
    const lag = (framesPerSecond * 60) / bpm;
    let sum = 0;
    for (let i = Math.ceil(lag); i < onset.length; i++) {
      const p = i - lag,
        lo = Math.floor(p),
        fraction = p - lo;
      sum +=
        onset[i] *
        (onset[lo] * (1 - fraction) + (onset[lo + 1] ?? 0) * fraction);
    }
    if (sum > score) {
      score = sum;
      best = bpm;
    }
  }
  return score > 0 ? best : null;
}
export function estimateKey(hist: number[]): string {
  if (
    hist.reduce((a, b) => a + b, 0) < 4 ||
    hist.filter((v) => v >= 2).length < 5
  )
    return "Uncertain";
  const major = [
    6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88,
  ];
  const minor = [
    6.33, 2.68, 3.52, 5.38, 2.6, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17,
  ];
  let best = -Infinity,
    key = "Uncertain";
  const mean = hist.reduce((a, b) => a + b, 0) / 12;
  for (let root = 0; root < 12; root++)
    for (const [profile, mode] of [
      [major, "major"],
      [minor, "minor"],
    ] as const) {
      const pm = profile.reduce((a, b) => a + b, 0) / 12;
      const score = hist.reduce(
        (sum, v, i) => sum + (v - mean) * (profile[(i - root + 12) % 12] - pm),
        0,
      );
      if (score > best) {
        best = score;
        key =
          ["C", "C♯", "D", "E♭", "E", "F", "F♯", "G", "A♭", "A", "B♭", "B"][
            root
          ] +
          " " +
          mode;
      }
    }
  return key;
}
export function analyze(
  samples: Float32Array,
  sampleRate: number,
  progress?: (n: number) => void,
): Analysis {
  const size = 2048,
    hop = 256,
    detector = PitchDetector.forFloat32Array(size),
    histogram = Array<number>(12).fill(0),
    envelope: number[] = [];
  const frames: { midi: number; time: number; confidence: number }[] = [];
  let sumSquares = 0,
    difference = 0;
  for (let i = 0; i < samples.length; i++) {
    sumSquares += samples[i] ** 2;
    if (i) difference += (samples[i] - samples[i - 1]) ** 2;
  }
  const rms = Math.sqrt(sumSquares / Math.max(1, samples.length));
  for (let offset = 0; offset + size < samples.length; offset += hop) {
    const frame = samples.subarray(offset, offset + size);
    let energy = 0;
    for (const s of frame) energy += s * s;
    const level = Math.sqrt(energy / size);
    envelope.push(level);
    if (level > Math.max(0.006, rms * 0.12)) {
      const [pitch, clarity] = detector.findPitch(frame, sampleRate);
      const midi = Math.round(69 + 12 * Math.log2(pitch / 440));
      if (clarity >= 0.88 && midi >= 40 && midi <= 88) {
        histogram[midi % 12] += clarity;
        frames.push({ midi, time: offset / sampleRate, confidence: clarity });
      }
    }
    if (offset % (hop * 100) === 0) progress?.(offset / samples.length);
  }
  const bpm = estimateTempo(envelope, sampleRate / hop),
    beatDuration = 60 / (bpm ?? 76);
  const notes: Note[] = [];
  let previousFret = 5;
  for (let i = 0; i < frames.length;) {
    const first = frames[i];
    let j = i + 1;
    while (
      j < frames.length &&
      frames[j].midi === first.midi &&
      frames[j].time - frames[j - 1].time < 0.08
    )
      j++;
    const duration = frames[j - 1].time - first.time + hop / sampleRate;
    if (duration > 0.075) {
      const pos = fingering(first.midi, previousFret);
      if (pos) {
        previousFret = pos.fret;
        notes.push({
          id: `detected-${i}`,
          ...pos,
          beat: Math.round((first.time / beatDuration) * 4) / 4,
          length: Math.max(0.25, Math.round((duration / beatDuration) * 4) / 4),
          confidence: first.confidence,
        });
      }
    }
    i = j;
  }
  return {
    bpm,
    key: estimateKey(histogram),
    confidence: frames.length / Math.max(1, envelope.length),
    notes,
    rms,
    brightness: Math.min(
      1,
      Math.sqrt(difference / Math.max(sumSquares, 0.000001)),
    ),
    seconds: samples.length / sampleRate,
  };
}
