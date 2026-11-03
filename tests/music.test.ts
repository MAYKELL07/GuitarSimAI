import test from "node:test";
import assert from "node:assert/strict";
import { analyze, estimateTempo } from "../src/analysis";
import {
  fingering,
  initialSession,
  toMidi,
  toTab,
  TUNING,
  validateSession,
} from "../src/music";

test("melody transcription detects a known guitar-range pitch and ignores silence", () => {
  const rate = 11025,
    samples = Float32Array.from(
      { length: rate * 3 },
      (_, i) => 0.3 * Math.sin((2 * Math.PI * 329.6276 * i) / rate),
    );
  const result = analyze(samples, rate);
  assert.ok(result.notes.length > 0);
  assert.equal(TUNING[result.notes[0].string] + result.notes[0].fret, 64);
  assert.ok(result.confidence > 0.9);
  assert.equal(
    result.key,
    "Uncertain",
    "one sustained pitch cannot establish a key",
  );
  const silent = analyze(new Float32Array(rate * 4), rate);
  assert.equal(silent.notes.length, 0);
  assert.equal(silent.bpm, null);
  assert.equal(silent.key, "Uncertain");
});
test("tempo estimator recovers a synthetic 120 BPM pulse train", () => {
  const envelope = Array.from({ length: 1000 }, (_, i) =>
    i % 25 === 0 ? 1 : 0.01,
  );
  const bpm = estimateTempo(envelope, 50);
  assert.ok(bpm !== null && Math.abs(bpm - 120) <= 1, `got ${bpm}`);
});
test("fingering always maps back to the detected note within a playable range", () => {
  for (let midi = 40; midi <= 86; midi++) {
    const pos = fingering(midi);
    assert.ok(pos);
    assert.equal(TUNING[pos.string] + pos.fret, midi);
    assert.ok(pos.fret >= 0 && pos.fret <= 22);
  }
  assert.equal(fingering(20), null);
});
test("session import rejects corrupted and nonfinite audio data", () => {
  assert.doesNotThrow(() => validateSession(initialSession()));
  const a = initialSession();
  a.tone.feedback = 10000;
  assert.throws(() => validateSession(a));
  const b = initialSession();
  b.notes[0].string = 6;
  assert.throws(() => validateSession(b));
  const c = initialSession();
  c.notes[0].length = NaN;
  assert.throws(() => validateSession(c));
  const d = initialSession();
  d.tone.bypass = ["unknown-effect"];
  assert.throws(() => validateSession(d));
});
test("MIDI exports tempo and valid note-on/off events in a complete track", () => {
  const s = initialSession(),
    bytes = toMidi(s.notes, 120),
    dv = new DataView(bytes.buffer as ArrayBuffer);
  assert.equal(Buffer.from(bytes.slice(0, 4)).toString(), "MThd");
  assert.equal(dv.getUint16(12), 480);
  assert.equal(dv.getUint32(18), bytes.length - 22);
  assert.deepEqual([...bytes.slice(-4)], [0, 255, 47, 0]);
  assert.ok(Buffer.from(bytes).includes(Buffer.from([255, 81, 3, 7, 161, 32])));
  assert.equal([...bytes].filter((v) => v === 144).length, s.notes.length);
  assert.equal([...bytes].filter((v) => v === 128).length, s.notes.length);
});
test("tab export preserves string, fret, beat and bar location", () => {
  const text = toTab(
    [{ id: "one", string: 0, fret: 12, beat: 4.25, length: 0.5 }],
    76,
    2,
  );
  const bars = text.split("Bar ");
  assert.ok(bars[2].includes("e|---12-"));
  assert.ok(!bars[1].includes("12-"));
});
