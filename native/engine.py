"""Selah native CPU audio/VST3 engine. GPL-3.0-or-later.

JSON-lines control over inherited pipes; no network listener or audio through HTTP.
DSP runs in Pedalboard's compiled JUCE processors, device I/O in PortAudio ASIO.
Python coordinates callback buffers and control; buffer deadlines are measured,
not guaranteed. No driver/device is opened until an explicit start command.
"""

import os

os.environ["SD_ENABLE_ASIO"] = "1"
import sys
import json
import time
import math
import queue
import threading
import pathlib
import base64
import traceback
import tempfile
import hashlib
import numpy as np
import sounddevice as sd
import pedalboard as pb
from pedalboard.io import AudioFile

DEFAULT_TONE = dict(
    compressor=45,
    drive=18,
    bass=48,
    treble=62,
    chorus=8,
    delay=32,
    feedback=36,
    reverb=34,
    decay=3.8,
    subdivision=0.75,
    bypass=[],
)
DEFAULT_ORDER = ["gate", "compressor", "drive", "cabinet", "chorus", "delay", "reverb"]


def finite(value, low, high, name):
    if (
        isinstance(value, bool)
        or not isinstance(value, (float, int))
        or not math.isfinite(value)
        or not low <= value <= high
    ):
        raise ValueError(f"{name} must be between {low} and {high}.")
    return value


class Engine:
    def __init__(self):
        self.stream = None
        self.lock = threading.RLock()
        self.plugins = []
        self.order = list(DEFAULT_ORDER)
        self.tone = dict(DEFAULT_TONE)
        self.bpm = 76
        self.sample_rate = 48000
        self.block_size = 256
        self.input_gain = 0.0
        self.output_gain = -6.0
        self.gate_threshold = -65.0
        self.input_channel = 0
        self.logical_input_channel = 0
        self.input_device = None
        self.output_device = None
        self.output_channels = [0, 1]
        self.asio_active = False
        self.ir = None
        self.monitor = False
        self.xruns = 0
        self.lock_misses = 0
        self.callback_error = ""
        self.input_peak = 0.0
        self.output_peak = 0.0
        self.processing_load = 0.0
        self.max_load = 0.0
        self.clipped = 0
        self.playing = False
        self.loop = True
        self.position_samples = 0
        self.sequence = np.zeros((2, 1), np.float32)
        self.sequence_notes = []
        self.bars = 4
        self.reference = None
        self.reference_path = None
        self.reference_volume = 0.65
        self.guitar_volume = 0.65
        self.metronome = False
        self.close_editor = threading.Event()
        self.editor_open = None
        self.ir_path = None
        self.ir_data = None
        self.rebuild()

    def devices(self):
        apis = sd.query_hostapis()
        return [
            {
                "id": i,
                "name": d["name"],
                "api": apis[d["hostapi"]]["name"],
                "inputs": d["max_input_channels"],
                "outputs": d["max_output_channels"],
                "defaultRate": d["default_samplerate"],
            }
            for i, d in enumerate(sd.query_devices())
        ]

    def rebuild(self):
        t = self.tone
        blocks = {
            "gate": [
                pb.NoiseGate(
                    threshold_db=self.gate_threshold,
                    ratio=4,
                    attack_ms=3,
                    release_ms=120,
                )
            ],
            "compressor": [
                pb.Compressor(
                    threshold_db=-8 - t["compressor"] * 0.28,
                    ratio=1 + t["compressor"] * 0.06,
                    attack_ms=6,
                    release_ms=200,
                )
            ],
            "drive": (
                [
                    pb.Distortion(drive_db=t["drive"] * 0.3),
                    pb.Gain(gain_db=-t["drive"] * 0.16),
                ]
                if t["drive"]
                else []
            ),
            "cabinet": [
                pb.HighpassFilter(cutoff_frequency_hz=70),
                pb.LowShelfFilter(
                    cutoff_frequency_hz=220, gain_db=(t["bass"] - 50) * 0.24
                ),
                pb.HighShelfFilter(
                    cutoff_frequency_hz=2500, gain_db=(t["treble"] - 50) * 0.24
                ),
            ],
            "chorus": [
                pb.Chorus(
                    rate_hz=0.7,
                    depth=0.25,
                    centre_delay_ms=18,
                    feedback=0.1,
                    mix=t["chorus"] / 200,
                )
            ],
            "delay": [
                pb.Delay(
                    delay_seconds=60 / self.bpm * t["subdivision"],
                    feedback=t["feedback"] / 100,
                    mix=t["delay"] / 100,
                )
            ],
            "reverb": [
                pb.Reverb(
                    room_size=min(0.98, t["decay"] / 8),
                    damping=0.45,
                    wet_level=t["reverb"] / 100,
                    dry_level=1 - t["reverb"] / 200,
                    width=1,
                )
            ],
        }
        if self.ir:
            blocks["cabinet"].append(self.ir)
        else:
            blocks["cabinet"].append(pb.LowpassFilter(cutoff_frequency_hz=6500))
        blocks.update(
            {p["id"]: [] if p["bypass"] else [p["plugin"]] for p in self.plugins}
        )
        self.blocks = blocks
        self.input_plugin = pb.Gain(gain_db=self.input_gain)
        chain = [self.input_plugin]
        for key in self.order:
            if key not in t["bypass"]:
                chain.extend(blocks.get(key, []))
        self.board = pb.Pedalboard(chain)
        self.output_plugin = pb.Gain(gain_db=self.output_gain)
        self.final = pb.Pedalboard(
            [self.output_plugin, pb.Limiter(threshold_db=-1, release_ms=60)]
        )
        # Warm the processor graph away from the stream callback.
        plugin_latency = sum(
            max(0, p["plugin"].reported_latency_samples)
            for p in self.plugins
            if not p["bypass"]
        )
        warm_size = min(262144, max(8192, plugin_latency + self.block_size))
        self.board.process(
            np.zeros((2, warm_size), np.float32),
            self.sample_rate,
            buffer_size=self.block_size,
            reset=True,
        )
        self.final.process(
            np.zeros((2, self.block_size), np.float32),
            self.sample_rate,
            buffer_size=self.block_size,
            reset=True,
        )

    def configure(self, data):
        with self.lock:
            tone = data.get("tone", self.tone)
            for key in DEFAULT_TONE:
                if key == "bypass":
                    if not isinstance(tone.get(key), list) or not all(
                        x in DEFAULT_ORDER for x in tone[key]
                    ):
                        raise ValueError("Invalid bypass list.")
                else:
                    finite(
                        tone.get(key),
                        0.5 if key == "decay" else 0.25 if key == "subdivision" else 0,
                        (
                            8
                            if key == "decay"
                            else (
                                2
                                if key == "subdivision"
                                else 75 if key == "feedback" else 100
                            )
                        ),
                        key,
                    )
            bpm = finite(data.get("bpm", self.bpm), 30, 240, "Tempo")
            structural = tone["bypass"] != self.tone["bypass"] or (
                tone["drive"] == 0
            ) != (self.tone["drive"] == 0)
            self.tone = dict(tone)
            self.bpm = bpm
            for key, low, high in [
                ("inputGain", -36, 24),
                ("outputGain", -60, 12),
                ("gateThreshold", -90, 0),
            ]:
                if key in data:
                    setattr(
                        self,
                        {
                            "inputGain": "input_gain",
                            "outputGain": "output_gain",
                            "gateThreshold": "gate_threshold",
                        }[key],
                        finite(data[key], low, high, key),
                    )
            if "order" in data:
                expected = set(DEFAULT_ORDER + [p["id"] for p in self.plugins])
                if (
                    not isinstance(data["order"], list)
                    or len(data["order"]) != len(expected)
                    or set(data["order"]) != expected
                ):
                    raise ValueError("Rack order must contain each block exactly once.")
                self.order = data["order"]
                structural = True
            if "referenceVolume" in data:
                self.reference_volume = (
                    finite(data["referenceVolume"], 0, 100, "Reference volume") / 100
                )
            if "guitarVolume" in data:
                self.guitar_volume = (
                    finite(data["guitarVolume"], 0, 100, "Guitar volume") / 100
                )
            if structural:
                self.rebuild()
            else:
                # Keep reverb/delay history and plugin states across knob edits.
                t = self.tone
                self.input_plugin.gain_db = self.input_gain
                self.output_plugin.gain_db = self.output_gain
                self.blocks["gate"][0].threshold_db = self.gate_threshold
                self.blocks["compressor"][0].threshold_db = -8 - t["compressor"] * 0.28
                self.blocks["compressor"][0].ratio = 1 + t["compressor"] * 0.06
                if self.blocks["drive"]:
                    self.blocks["drive"][0].drive_db = t["drive"] * 0.3
                    self.blocks["drive"][1].gain_db = -t["drive"] * 0.16
                self.blocks["cabinet"][1].gain_db = (t["bass"] - 50) * 0.24
                self.blocks["cabinet"][2].gain_db = (t["treble"] - 50) * 0.24
                self.blocks["chorus"][0].mix = t["chorus"] / 200
                self.blocks["delay"][0].delay_seconds = 60 / self.bpm * t["subdivision"]
                self.blocks["delay"][0].feedback = t["feedback"] / 100
                self.blocks["delay"][0].mix = t["delay"] / 100
                self.blocks["reverb"][0].room_size = min(0.98, t["decay"] / 8)
                self.blocks["reverb"][0].wet_level = t["reverb"] / 100
                self.blocks["reverb"][0].dry_level = 1 - t["reverb"] / 200
        return self.status()

    def stop(self):
        stream, self.stream = self.stream, None
        if stream:
            stream.stop()
            stream.close()
        self.monitor = False
        self.playing = False
        return self.status()

    def start(self, data):
        self.stop()
        rate = int(finite(data.get("sampleRate", 48000), 44100, 192000, "Sample rate"))
        if rate not in [44100, 48000, 88200, 96000, 192000]:
            raise ValueError("Unsupported sample rate.")
        block = int(finite(data.get("blockSize", 256), 32, 2048, "Buffer size"))
        if block not in [32, 64, 128, 256, 512, 1024, 2048]:
            raise ValueError("Use a supported power-of-two buffer size.")
        input_id = data.get("inputDevice")
        output_id = data.get("outputDevice")
        if not isinstance(input_id, int) or not isinstance(output_id, int):
            raise ValueError("Select input and output devices.")
        inp, out = sd.query_devices(input_id), sd.query_devices(output_id)
        apis = sd.query_hostapis()
        if inp["hostapi"] != out["hostapi"]:
            raise ValueError("Input and output must use the same driver API.")
        is_asio = apis[inp["hostapi"]]["name"] == "ASIO"
        self.asio_active = is_asio
        if is_asio and input_id != output_id:
            raise ValueError("ASIO requires input and output on the same device.")
        channel = int(
            finite(
                data.get("inputChannel", 0),
                0,
                max(0, inp["max_input_channels"] - 1),
                "Input channel",
            )
        )
        outputs = data.get("outputChannels", [0, 1])
        if (
            not isinstance(outputs, list)
            or len(outputs) != 2
            or len(set(outputs)) != 2
            or not all(
                isinstance(v, int) and 0 <= v < out["max_output_channels"]
                for v in outputs
            )
        ):
            raise ValueError("Select two distinct supported output channels.")
        self.sample_rate, self.block_size = rate, block
        self.input_channel = 0 if is_asio else channel
        self.logical_input_channel = channel
        self.input_device, self.output_device = input_id, output_id
        self.output_channels = outputs
        self.xruns = self.lock_misses = self.clipped = 0
        self.callback_error = ""
        self.max_load = self.processing_load = 0
        self.sequence = self.synth_sequence(self.sequence_notes, self.bpm, self.bars)
        if self.reference_path:
            self.read_reference(self.reference_path)
        self.rebuild()
        in_channels, out_channels = (
            (1, 2) if is_asio else (channel + 1, max(outputs) + 1)
        )
        self.input_buffer = np.zeros((2, block), np.float32)
        self.mix_buffer = np.zeros((2, block), np.float32)
        self.block_indices = np.arange(block, dtype=np.int64)
        self.monitor = bool(data.get("monitor", True))
        extra = (
            (
                sd.AsioSettings(channel_selectors=[channel]),
                sd.AsioSettings(channel_selectors=outputs),
            )
            if is_asio
            else None
        )
        self.stream = sd.Stream(
            device=(input_id, output_id),
            channels=(in_channels, out_channels),
            samplerate=rate,
            blocksize=block,
            dtype="float32",
            latency="low",
            callback=self.callback,
            extra_settings=extra,
        )
        try:
            self.stream.start()
        except Exception:
            self.stream.close()
            self.stream = None
            self.monitor = False
            raise
        return self.status()

    def callback(self, indata, outdata, frames, timing, flags):
        outdata.fill(0)
        if flags:
            self.xruns += 1
        if frames != self.block_size:
            self.callback_error = "Driver returned a different buffer size. Restart with its preferred size."
            return
        if not self.lock.acquire(blocking=False):
            self.lock_misses += 1
            return
        started = time.perf_counter()
        try:
            work, mix = self.input_buffer, self.mix_buffer
            work.fill(0)
            mix.fill(0)
            if self.monitor:
                work[0] = indata[:, self.input_channel]
                work[1] = work[0]
            self.input_peak = float(np.max(np.abs(work)))
            if self.playing:
                length = self.sequence.shape[1]
                if not self.loop and self.reference is not None:
                    length = max(length, self.reference.shape[1])
                at = self.block_indices + self.position_samples
                if self.loop:
                    at %= length
                mask = at < self.sequence.shape[1]
                work[:, mask] += self.sequence[:, at[mask]]
                if self.reference is not None:
                    mask = at < self.reference.shape[1]
                    mix[:, mask] = self.reference[:, at[mask]] * self.reference_volume
                if self.metronome:
                    mask = (at % int(self.sample_rate * 60 / self.bpm)) < int(
                        self.sample_rate * 0.025
                    )
                    mix[:, mask] += 0.04 * np.sin(
                        2 * np.pi * 1000 * at[mask] / self.sample_rate
                    )
                self.position_samples += frames
                if self.loop:
                    self.position_samples %= length
                elif self.position_samples >= length:
                    self.playing = False
                    self.position_samples = 0
            processed = self.board.process(
                work, self.sample_rate, buffer_size=frames, reset=False
            )
            if processed.shape != work.shape:
                self.callback_error = "A plugin buffered audio instead of returning a full live block. Bypass it for live monitoring."
                self.xruns += 1
                return
            if not np.isfinite(processed).all():
                self.callback_error = "Invalid plugin audio; output muted."
                self.xruns += 1
                return
            mix += processed * self.guitar_volume
            result = self.final.process(
                mix, self.sample_rate, buffer_size=frames, reset=False
            )
            if result.shape != work.shape or not np.isfinite(result).all():
                self.callback_error = "Invalid plugin audio; output muted."
                self.xruns += 1
                return
            self.callback_error = ""
            peak = float(np.max(np.abs(result)))
            self.output_peak = peak
            if peak >= 1:
                self.clipped += 1
            np.clip(result, -1, 1, out=result)
            if self.asio_active:
                outdata[:] = result.T
            else:
                outdata[:, self.output_channels[0]] = result[0]
                outdata[:, self.output_channels[1]] = result[1]
        except Exception as error:
            self.callback_error = str(error)
            self.xruns += 1
            outdata.fill(0)
        finally:
            load = (time.perf_counter() - started) / (frames / self.sample_rate)
            self.processing_load = self.processing_load * 0.9 + load * 0.1
            self.max_load = max(self.max_load, load)
            self.lock.release()

    def synth_sequence(self, notes, bpm, bars):
        result = np.zeros(
            (2, max(1, round(bars * 4 * 60 / bpm * self.sample_rate))), np.float32
        )
        tuning = [64, 59, 55, 50, 45, 40]
        for n in notes:
            string = int(finite(n.get("string"), 0, 5, "String"))
            fret = finite(n.get("fret"), 0, 24, "Fret")
            beat = finite(n.get("beat"), 0, bars * 4, "Beat")
            duration = finite(n.get("length"), 0.01, 32, "Note length") * 60 / bpm
            start = round(beat * 60 / bpm * self.sample_rate)
            count = min(
                round((duration + 0.1) * self.sample_rate), result.shape[1] - start
            )
            if count <= 0:
                continue
            t = np.arange(count, dtype=np.float32) / self.sample_rate
            freq = 440 * 2 ** ((tuning[string] + fret - 69) / 12)
            # Original harmonic pluck, rendered on control thread before playback.
            wave = np.zeros(count, np.float32)
            for harmonic in range(1, 9):
                if freq * harmonic < self.sample_rate * 0.45:
                    wave += (
                        np.sin(2 * np.pi * freq * harmonic * t)
                        * np.exp(-t * (2 + harmonic * 0.7))
                        / harmonic**1.5
                    )
            wave *= (
                0.12
                * np.minimum(t / 0.003, 1)
                * np.minimum((count / self.sample_rate - t) / 0.03, 1)
            )
            result[:, start : start + count] += wave
        return result

    def prepare(self, data):
        if self.playing:
            raise ValueError("Stop playback before changing the arrangement.")
        notes = data.get("notes", [])
        if not isinstance(notes, list) or len(notes) > 10000:
            raise ValueError("Invalid arrangement.")
        bpm = finite(data.get("bpm", self.bpm), 30, 240, "Tempo")
        bars = int(finite(data.get("bars", 4), 1, 128, "Bars"))
        if bars * 4 * 60 / bpm > 600:
            raise ValueError("Keep native arrangements under ten minutes.")
        rendered = self.synth_sequence(notes, bpm, bars)
        with self.lock:
            self.sequence_notes, self.bars, self.bpm = notes, bars, bpm
            self.sequence = rendered
            self.reference_volume = (
                finite(data.get("referenceVolume", 65), 0, 100, "Reference volume")
                / 100
            )
            self.guitar_volume = (
                finite(data.get("guitarVolume", 65), 0, 100, "Guitar volume") / 100
            )
            self.rebuild()
        return self.status()

    def read_reference(self, filename):
        path = pathlib.Path(filename)
        if not path.is_file() or path.stat().st_size > 150 * 1024 * 1024:
            raise ValueError("Reference must be an existing audio file under 150 MB.")
        with AudioFile(str(path)).resampled_to(self.sample_rate) as audio:
            if audio.duration > 1800:
                raise ValueError("Reference exceeds 30 minutes.")
            samples = audio.read(audio.frames)
        if samples.shape[0] == 1:
            samples = np.repeat(samples, 2, axis=0)
        if not np.isfinite(samples).all():
            raise ValueError("Reference audio contains invalid floating-point samples.")
        with self.lock:
            self.reference = np.ascontiguousarray(samples[:2], dtype=np.float32)
            self.reference_path = str(path)
        return {"name": path.name, "seconds": samples.shape[1] / self.sample_rate}

    def status(self):
        running = bool(self.stream and self.stream.active)
        latency = list(self.stream.latency) if running else [0, 0]
        return dict(
            available=True,
            running=running,
            driver=(
                sd.query_hostapis()[sd.query_devices(self.input_device)["hostapi"]][
                    "name"
                ]
                if self.input_device is not None
                else None
            ),
            inputDevice=self.input_device,
            outputDevice=self.output_device,
            inputChannel=self.logical_input_channel,
            outputChannels=self.output_channels,
            inputGain=self.input_gain,
            outputGain=self.output_gain,
            gateThreshold=self.gate_threshold,
            sampleRate=self.sample_rate,
            blockSize=self.block_size,
            monitor=self.monitor,
            inputLatencyMs=round(latency[0] * 1000, 2),
            outputLatencyMs=round(latency[1] * 1000, 2),
            latencyLabel="Driver reported I/O; excludes converters and unreported plugin latency",
            cpuLoad=round(self.processing_load * 100, 2),
            maxCpuLoad=round(self.max_load * 100, 2),
            xruns=self.xruns,
            lockMisses=self.lock_misses,
            clipped=self.clipped,
            inputPeak=self.input_peak,
            outputPeak=self.output_peak,
            error=self.callback_error,
            playing=self.playing,
            position=self.position_samples / self.sample_rate,
            order=self.order,
            irLoaded=bool(self.ir),
            editorOpen=self.editor_open,
            precision="32-bit float / native CPU",
            gpu=False,
            plugins=[
                dict(
                    id=p["id"],
                    name=p["plugin"].name,
                    path=p["path"],
                    bypass=p["bypass"],
                    latencySamples=p["plugin"].reported_latency_samples,
                )
                for p in self.plugins
            ],
        )

    def load(self, data):
        if self.stream:
            raise ValueError("Stop the native engine before loading plugins.")
        path = pathlib.Path(data.get("path", ""))
        if path.suffix.lower() != ".vst3" or not path.exists():
            raise ValueError("Choose an installed .vst3 file or bundle.")
        if len(self.plugins) >= 16:
            raise ValueError("This rack supports up to 16 external VST3 effects.")
        plugin = pb.load_plugin(
            str(path), plugin_name=data.get("pluginName"), initialization_timeout=15
        )
        if not plugin.is_effect:
            raise ValueError(
                "This guitar rack accepts effect plugins, not MIDI instruments."
            )
        item = dict(
            id=f"vst-{time.time_ns()}", path=str(path), plugin=plugin, bypass=False
        )
        self.plugins.append(item)
        # New effects start immediately before the time-based effects.
        self.order.insert(self.order.index("cabinet"), item["id"])
        self.rebuild()
        return self.status()

    def dispatch(self, cmd, data):
        if cmd == "status":
            return self.status()
        if cmd == "devices":
            return self.devices()
        if cmd == "configure":
            return self.configure(data)
        if cmd == "start":
            return self.start(data)
        if cmd == "stop":
            return self.stop()
        if cmd == "prepare":
            return self.prepare(data)
        if cmd == "reference":
            return self.read_reference(data["path"])
        if cmd == "transport":
            if not self.stream and data.get("playing"):
                raise ValueError("Start the native engine first.")
            self.loop = bool(data.get("loop", True))
            self.metronome = bool(data.get("metronome", False))
            if "position" in data:
                self.position_samples = round(
                    finite(data["position"], 0, 1800, "Position") * self.sample_rate
                )
            self.playing = bool(data.get("playing", False))
            return self.status()
        if cmd == "monitor":
            self.monitor = bool(data.get("enabled", False))
            return self.status()
        if cmd == "load":
            return self.load(data)
        if cmd == "closeEditor":
            self.close_editor.set()
            return self.status()
        if cmd in ["remove", "bypass", "parameters", "parameter", "editor"]:
            item = next((p for p in self.plugins if p["id"] == data.get("id")), None)
            if not item:
                raise ValueError("Plugin is no longer in this rack.")
            plugin = item["plugin"]
            if cmd == "parameters":
                return [
                    dict(
                        key=k,
                        value=float(v.raw_value),
                        display=str(getattr(plugin, k)),
                        label=v.label or "",
                    )
                    for k, v in plugin.parameters.items()
                ]
            if cmd == "editor":
                self.editor_open = item["id"]
                self.close_editor.clear()
                return item
            with self.lock:
                if cmd == "remove":
                    if self.stream or self.editor_open:
                        raise ValueError(
                            "Stop audio and close the plugin editor before removing plugins."
                        )
                    self.plugins.remove(item)
                    self.order.remove(item["id"])
                elif cmd == "bypass":
                    item["bypass"] = bool(data.get("bypass", True))
                elif cmd == "parameter":
                    key = data.get("key")
                    if key not in plugin.parameters:
                        raise ValueError("Unknown plugin parameter.")
                    plugin.parameters[key].raw_value = finite(
                        data.get("value"), 0, 1, "Normalized parameter"
                    )
                if cmd != "parameter":
                    self.rebuild()
            return self.status()
        if cmd == "ir":
            if self.stream:
                raise ValueError("Stop the engine before changing the cabinet IR.")
            path = pathlib.Path(data.get("path", ""))
            if (
                path.suffix.lower() not in [".wav", ".aif", ".aiff"]
                or not path.is_file()
                or path.stat().st_size > 32 * 1024 * 1024
            ):
                raise ValueError("Choose a WAV/AIFF impulse response under 32 MB.")
            with AudioFile(str(path)) as f:
                if f.duration > 10:
                    raise ValueError("Cabinet IR must be no longer than 10 seconds.")
            self.ir = pb.Convolution(str(path), mix=1.0)
            self.ir_path = str(path)
            self.ir_data = path.read_bytes()
            self.rebuild()
            return self.status()
        if cmd == "clearIR":
            if self.stream:
                raise ValueError("Stop the engine before changing the cabinet IR.")
            self.ir = None
            self.ir_path = None
            self.ir_data = None
            self.rebuild()
            return self.status()
        if cmd == "snapshot":
            if self.stream or self.editor_open:
                raise ValueError(
                    "Stop the engine and close editors before saving a native preset."
                )
            return dict(
                version=1,
                tone=self.tone,
                bpm=self.bpm,
                order=self.order,
                inputGain=self.input_gain,
                outputGain=self.output_gain,
                gateThreshold=self.gate_threshold,
                irData=(
                    base64.b64encode(self.ir_data).decode("ascii")
                    if self.ir_data
                    else None
                ),
                irExtension=pathlib.Path(self.ir_path).suffix if self.ir_path else None,
                plugins=[
                    dict(
                        id=p["id"],
                        path=p["path"],
                        bypass=p["bypass"],
                        state=base64.b64encode(p["plugin"].raw_state).decode("ascii"),
                    )
                    for p in self.plugins
                ],
            )
        if cmd == "restore":
            if self.stream or self.editor_open:
                raise ValueError(
                    "Stop the engine and close editors before restoring a preset."
                )
            preset = data.get("preset")
            if (
                not isinstance(preset, dict)
                or preset.get("version") != 1
                or len(preset.get("plugins", [])) > 16
            ):
                raise ValueError("Invalid native preset.")
            staging = Engine()
            staging.sample_rate = self.sample_rate
            staging.block_size = self.block_size
            for item in preset.get("plugins", []):
                staging.load(item)
                loaded = staging.plugins[-1]
                old_id = loaded["id"]
                loaded["id"] = item["id"]
                staging.order[staging.order.index(old_id)] = item["id"]
                loaded["bypass"] = bool(item.get("bypass"))
                raw = base64.b64decode(item["state"], validate=True)
                if len(raw) > 16 * 1024 * 1024:
                    raise ValueError("Plugin state is too large.")
                loaded["plugin"].raw_state = raw
            if preset.get("irData"):
                raw_ir = base64.b64decode(preset["irData"], validate=True)
                if len(raw_ir) > 32 * 1024 * 1024:
                    raise ValueError("Cabinet IR exceeds 32 MB.")
                ext = preset.get("irExtension", ".wav")
                if ext not in [".wav", ".aif", ".aiff"]:
                    raise ValueError("Invalid cabinet IR format.")
                cache = pathlib.Path(tempfile.gettempdir()) / "selah-native-local"
                cache.mkdir(exist_ok=True)
                ir_file = cache / (
                    "preset-ir-" + hashlib.sha256(raw_ir).hexdigest() + ext
                )
                ir_file.write_bytes(raw_ir)
                staging.dispatch("ir", {"path": str(ir_file)})
            staging.configure(preset)
            self.plugins, self.order, self.tone = (
                staging.plugins,
                staging.order,
                staging.tone,
            )
            self.bpm, self.input_gain, self.output_gain, self.gate_threshold = (
                staging.bpm,
                staging.input_gain,
                staging.output_gain,
                staging.gate_threshold,
            )
            self.ir, self.ir_path, self.ir_data = (
                staging.ir,
                staging.ir_path,
                staging.ir_data,
            )
            self.rebuild()
            return self.status()
        if cmd == "render":
            if self.stream or self.editor_open:
                raise ValueError(
                    "Stop native audio and close plugin editors before exporting the native rack."
                )
            path = (
                pathlib.Path(tempfile.gettempdir())
                / f"selah-native-render-{os.getpid()}.wav"
            )
            self.board.process(
                np.zeros((2, 8192), np.float32),
                self.sample_rate,
                buffer_size=8192,
                reset=True,
            )
            self.final.reset()
            with AudioFile(
                str(path),
                "w",
                samplerate=self.sample_rate,
                num_channels=2,
                bit_depth=24,
            ) as output:
                length = self.sequence.shape[1] + int(
                    self.sample_rate * (self.tone["decay"] + 3)
                )
                for start in range(0, length, 8192):
                    count = min(8192, length - start)
                    chunk = np.zeros((2, count), np.float32)
                    available = max(0, min(count, self.sequence.shape[1] - start))
                    if available:
                        chunk[:, :available] = self.sequence[
                            :, start : start + available
                        ]
                    processed = self.board.process(
                        chunk, self.sample_rate, buffer_size=8192, reset=False
                    )
                    if processed.shape[1] != count:
                        raise ValueError(
                            "A plugin returned a buffered block. This plugin requires a different offline render configuration."
                        )
                    if not np.isfinite(processed).all():
                        raise ValueError("Invalid plugin audio; native export stopped.")
                    rendered = self.final.process(
                        processed * self.guitar_volume,
                        self.sample_rate,
                        buffer_size=8192,
                        reset=False,
                    )
                    if rendered.shape[1] != count or not np.isfinite(rendered).all():
                        raise ValueError("Invalid native render output.")
                    output.write(np.clip(rendered, -1, 1))
            return {"path": str(path), "sampleRate": self.sample_rate, "bitDepth": 24}
        raise ValueError("Unknown native audio command.")


def main():
    engine = Engine()
    commands = queue.Queue()
    output_lock = threading.Lock()

    def respond(value):
        with output_lock:
            sys.stdout.write(json.dumps(value, allow_nan=False) + "\n")
            sys.stdout.flush()

    def execute(request):
        try:
            result = engine.dispatch(request.get("command"), request.get("data") or {})
            respond({"id": request.get("id"), "result": result})
        except Exception as error:
            respond({"id": request.get("id"), "error": str(error)})

    def reader():
        for line in sys.stdin:
            try:
                request = json.loads(line)
                if request.get("command") == "shutdown":
                    engine.close_editor.set()
                    engine.stop()
                    commands.put(None)
                    return
                # Polls and stop/close commands remain responsive while a native
                # plugin editor owns the message loop on the main thread.
                if request.get("command") in [
                    "status",
                    "stop",
                    "closeEditor",
                    "monitor",
                ]:
                    execute(request)
                else:
                    commands.put(request)
            except Exception as error:
                respond({"id": None, "error": str(error)})
        engine.close_editor.set()
        commands.put(None)

    threading.Thread(target=reader, daemon=True).start()
    respond({"event": "ready", "version": "2.0.0", "asioEnabled": True})
    try:
        while True:
            request = commands.get()
            if request is None:
                break
            if request.get("command") == "editor":
                try:
                    item = engine.dispatch("editor", request.get("data") or {})
                    respond({"id": request.get("id"), "result": {"opened": True}})
                    item["plugin"].show_editor(engine.close_editor)
                except Exception as error:
                    respond({"event": "editorError", "error": str(error)})
                finally:
                    engine.editor_open = None
            else:
                execute(request)
    finally:
        engine.stop()


if __name__ == "__main__":
    main()
