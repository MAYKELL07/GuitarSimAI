import { TUNING } from "./music";
import type { Tone, Note, Session } from "./music";

export function pluck(
  context: BaseAudioContext,
  midi: number,
  duration = 1,
): AudioBuffer {
  const sampleRate = context.sampleRate,
    length = Math.ceil(Math.max(0.3, duration + 0.25) * sampleRate);
  const buffer = context.createBuffer(1, length, sampleRate),
    out = buffer.getChannelData(0),
    period = Math.round(sampleRate / (440 * 2 ** ((midi - 69) / 12)));
  // A deterministic Karplus–Strong string; no downloaded samples or copyrighted demo.
  const ring = new Float32Array(period);
  let seed = midi * 13579 + 1;
  for (let i = 0; i < period; i++) {
    seed = (seed * 16807) % 2147483647;
    ring[i] = ((seed / 2147483647) * 2 - 1) * 0.65;
  }
  for (let i = 0; i < length; i++) {
    const index = i % period;
    out[i] =
      ring[index] *
      Math.min(1, i / (sampleRate * 0.003)) *
      Math.min(1, (length - i) / (sampleRate * 0.04));
    ring[index] = 0.497 * (ring[index] + ring[(index + 1) % period]);
  }
  return buffer;
}
function impulse(c: BaseAudioContext, seconds: number) {
  const buffer = c.createBuffer(
    2,
    Math.ceil(c.sampleRate * seconds),
    c.sampleRate,
  );
  let seed = 13;
  for (let ch = 0; ch < 2; ch++) {
    const data = buffer.getChannelData(ch);
    for (let i = 0; i < data.length; i++) {
      seed = (seed * 16807) % 2147483647;
      data[i] = ((seed / 2147483647) * 2 - 1) * (1 - i / data.length) ** 2.5;
    }
  }
  return buffer;
}
export class Rack {
  input: GainNode;
  output: GainNode;
  private c: BaseAudioContext;
  private comp: DynamicsCompressorNode;
  private drive: WaveShaperNode;
  private bass: BiquadFilterNode;
  private treble: BiquadFilterNode;
  private chorus: DelayNode;
  private chorusWet: GainNode;
  private lfo: OscillatorNode;
  private delay: DelayNode;
  private delayWet: GainNode;
  private feedback: GainNode;
  private reverb: ConvolverNode;
  private reverbWet: GainNode;
  private dry: GainNode;
  private lastDrive = -1;
  private lastDecay = -1;
  constructor(c: BaseAudioContext, tone: Tone, bpm: number) {
    this.c = c;
    this.input = c.createGain();
    this.output = c.createGain();
    this.comp = c.createDynamicsCompressor();
    this.drive = c.createWaveShaper();
    this.bass = c.createBiquadFilter();
    this.bass.type = "lowshelf";
    this.bass.frequency.value = 220;
    this.treble = c.createBiquadFilter();
    this.treble.type = "highshelf";
    this.treble.frequency.value = 2500;
    const hp = c.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 70;
    const cab = c.createBiquadFilter();
    cab.type = "lowpass";
    cab.frequency.value = 6500;
    cab.Q.value = 0.7;
    this.chorus = c.createDelay(0.1);
    this.chorus.delayTime.value = 0.018;
    this.chorusWet = c.createGain();
    this.lfo = c.createOscillator();
    this.lfo.frequency.value = 0.7;
    const depth = c.createGain();
    depth.gain.value = 0.003;
    this.lfo.connect(depth).connect(this.chorus.delayTime);
    this.lfo.start();
    const chorusSum = c.createGain(),
      delaySum = c.createGain();
    this.delay = c.createDelay(4);
    this.delayWet = c.createGain();
    this.feedback = c.createGain();
    const delayFilter = c.createBiquadFilter();
    delayFilter.type = "lowpass";
    delayFilter.frequency.value = 4000;
    this.reverb = c.createConvolver();
    this.reverbWet = c.createGain();
    this.dry = c.createGain();
    this.input
      .connect(this.comp)
      .connect(this.drive)
      .connect(hp)
      .connect(this.bass)
      .connect(this.treble)
      .connect(cab);
    cab.connect(chorusSum);
    cab.connect(this.chorus).connect(this.chorusWet).connect(chorusSum);
    chorusSum.connect(delaySum);
    chorusSum
      .connect(this.delay)
      .connect(delayFilter)
      .connect(this.delayWet)
      .connect(delaySum);
    delayFilter.connect(this.feedback).connect(this.delay);
    delaySum.connect(this.dry).connect(this.output);
    delaySum.connect(this.reverb).connect(this.reverbWet).connect(this.output);
    this.update(tone, bpm);
  }
  update(t: Tone, bpm: number) {
    const active = (key: string, value: number) =>
      t.bypass.includes(key) ? 0 : value;
    const comp = active("compressor", t.compressor),
      drive = active("drive", t.drive);
    this.comp.threshold.value = -8 - comp * 0.28;
    this.comp.ratio.value = 1 + comp * 0.06;
    this.comp.attack.value = 0.006;
    this.comp.release.value = 0.2;
    if (drive !== this.lastDrive) {
      const curve = new Float32Array(4096),
        k = drive / 5;
      for (let i = 0; i < curve.length; i++) {
        const x = (i * 2) / (curve.length - 1) - 1;
        curve[i] = k ? Math.tanh(x * (1 + k)) / Math.tanh(1 + k) : x;
      }
      this.drive.curve = curve;
      this.drive.oversample = "2x";
      this.lastDrive = drive;
    }
    this.bass.gain.value = t.bypass.includes("cabinet")
      ? 0
      : (t.bass - 50) * 0.24;
    this.treble.gain.value = t.bypass.includes("cabinet")
      ? 0
      : (t.treble - 50) * 0.24;
    this.chorusWet.gain.value = active("chorus", t.chorus) / 200;
    this.delay.delayTime.setTargetAtTime(
      Math.min(3.9, (60 / bpm) * t.subdivision),
      this.c.currentTime,
      0.03,
    );
    this.delayWet.gain.value = active("delay", t.delay) / 100;
    this.feedback.gain.value = active("delay", Math.min(75, t.feedback)) / 100;
    if (this.lastDecay !== t.decay) {
      this.reverb.buffer = impulse(this.c, t.decay);
      this.lastDecay = t.decay;
    }
    this.reverbWet.gain.value = (active("reverb", t.reverb) / 100) * 1.5;
    this.dry.gain.value = 1 - active("reverb", t.reverb) / 200;
    this.output.gain.value = 0.55;
  }
}
export class GuitarEngine {
  context = new AudioContext({ latencyHint: "interactive" });
  rack: Rack;
  master: GainNode;
  reference: GainNode;
  guitar: GainNode;
  analyser: AnalyserNode;
  private sources = new Set<AudioBufferSourceNode>();
  private mic?: MediaStream;
  private micSource?: MediaStreamAudioSourceNode;
  constructor(tone: Tone, bpm: number) {
    const c = this.context;
    this.rack = new Rack(c, tone, bpm);
    this.master = c.createGain();
    this.reference = c.createGain();
    this.guitar = c.createGain();
    this.analyser = c.createAnalyser();
    this.analyser.fftSize = 1024;
    const limiter = c.createDynamicsCompressor();
    limiter.threshold.value = -3;
    limiter.knee.value = 0;
    limiter.ratio.value = 20;
    limiter.attack.value = 0.001;
    limiter.release.value = 0.08;
    this.rack.output.connect(this.guitar).connect(this.master);
    this.reference.connect(this.master);
    this.master.connect(limiter).connect(this.analyser).connect(c.destination);
    this.master.gain.value = 0.7;
  }
  async resume() {
    await this.context.resume();
  }
  volumes(reference: number, guitar: number) {
    this.reference.gain.setTargetAtTime(
      reference / 100,
      this.context.currentTime,
      0.02,
    );
    this.guitar.gain.setTargetAtTime(
      guitar / 100,
      this.context.currentTime,
      0.02,
    );
  }
  note(midi: number, when = this.context.currentTime, duration = 0.6) {
    const source = this.context.createBufferSource();
    source.buffer = pluck(this.context, midi, duration);
    source.connect(this.rack.input);
    source.start(when);
    this.track(source);
  }
  click(when: number, accent: boolean) {
    const osc = this.context.createOscillator(),
      gain = this.context.createGain();
    osc.frequency.value = accent ? 1200 : 800;
    gain.gain.setValueAtTime(0.08, when);
    gain.gain.exponentialRampToValueAtTime(0.0001, when + 0.05);
    osc.connect(gain).connect(this.master);
    osc.start(when);
    osc.stop(when + 0.05);
    osc.onended = () => {
      osc.disconnect();
      gain.disconnect();
    };
  }
  playReference(
    buffer: AudioBuffer,
    offset: number,
    when: number,
    duration: number,
  ) {
    if (offset >= buffer.duration || duration <= 0) return;
    const source = this.context.createBufferSource();
    source.buffer = buffer;
    source.connect(this.reference);
    source.start(when, offset, Math.min(duration, buffer.duration - offset));
    this.track(source);
  }
  private track(s: AudioBufferSourceNode) {
    this.sources.add(s);
    s.onended = () => {
      this.sources.delete(s);
      s.disconnect();
    };
  }
  stop() {
    for (const s of this.sources) {
      try {
        s.stop();
      } catch {
        /* already ended */
      }
      s.disconnect();
    }
    this.sources.clear();
  }
  async startInput(deviceId?: string) {
    this.stopInput();
    this.mic = await navigator.mediaDevices.getUserMedia({
      audio: {
        deviceId: deviceId ? { exact: deviceId } : undefined,
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
        channelCount: 1,
      },
    });
    this.micSource = this.context.createMediaStreamSource(this.mic);
    this.micSource.connect(this.rack.input);
  }
  stopInput() {
    this.micSource?.disconnect();
    this.mic?.getTracks().forEach((t) => t.stop());
    this.mic = undefined;
  }
  dispose() {
    this.stop();
    this.stopInput();
    void this.context.close();
  }
}
export function makeDemo(
  c: BaseAudioContext,
  notes: Note[],
  bpm: number,
): AudioBuffer {
  const seconds = (16 * 60) / bpm,
    result = c.createBuffer(1, Math.ceil(seconds * c.sampleRate), c.sampleRate),
    data = result.getChannelData(0);
  for (const note of notes) {
    const sample = pluck(
        c,
        TUNING[note.string] + note.fret,
        0.7,
      ).getChannelData(0),
      start = Math.round(((note.beat * 60) / bpm) * c.sampleRate);
    for (let i = 0; i < sample.length && start + i < data.length; i++)
      data[start + i] += sample[i] * 0.8;
  }
  return result;
}
export async function renderWav(s: Session): Promise<Blob> {
  const seconds = (s.bars * 4 * 60) / s.bpm + s.tone.decay + 3;
  if (seconds > 600)
    throw new Error(
      "Keep WAV exports under 10 minutes. Export a shorter arrangement or use MIDI.",
    );
  const c = new OfflineAudioContext(2, Math.ceil(seconds * 44100), 44100),
    rack = new Rack(c, s.tone, s.bpm),
    gain = c.createGain();
  gain.gain.value = (0.7 * s.guitarVolume) / 100;
  const limiter = c.createDynamicsCompressor();
  limiter.threshold.value = -3;
  limiter.ratio.value = 20;
  rack.output.connect(gain).connect(limiter).connect(c.destination);
  for (const n of s.notes) {
    const source = c.createBufferSource();
    source.buffer = pluck(
      c,
      TUNING[n.string] + n.fret,
      (n.length * 60) / s.bpm,
    );
    source.connect(rack.input);
    source.start((n.beat * 60) / s.bpm);
  }
  return encodeWav(await c.startRendering());
}
export function encodeWav(buffer: AudioBuffer) {
  const length = buffer.length * buffer.numberOfChannels * 2,
    ab = new ArrayBuffer(44 + length),
    view = new DataView(ab);
  const str = (at: number, s: string) =>
    [...s].forEach((ch, i) => view.setUint8(at + i, ch.charCodeAt(0)));
  str(0, "RIFF");
  view.setUint32(4, 36 + length, true);
  str(8, "WAVE");
  str(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, buffer.numberOfChannels, true);
  view.setUint32(24, buffer.sampleRate, true);
  view.setUint32(28, buffer.sampleRate * buffer.numberOfChannels * 2, true);
  view.setUint16(32, buffer.numberOfChannels * 2, true);
  view.setUint16(34, 16, true);
  str(36, "data");
  view.setUint32(40, length, true);
  const channels = Array.from({ length: buffer.numberOfChannels }, (_, i) =>
    buffer.getChannelData(i),
  );
  for (let i = 0; i < buffer.length; i++)
    for (let ch = 0; ch < channels.length; ch++) {
      const v = Math.max(-1, Math.min(1, channels[ch][i]));
      view.setInt16(
        44 + (i * channels.length + ch) * 2,
        v < 0 ? v * 32768 : v * 32767,
        true,
      );
    }
  return new Blob([ab], { type: "audio/wav" });
}
