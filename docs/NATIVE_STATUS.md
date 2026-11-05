# Native C++ migration and validation

Selah 3 is a native JUCE desktop application, not an Electron wrapper or a web view.
The UI, device callback, DSP, preset handling, reference playback, WAV recorder,
tuner, plucked-string step sequencer and MIDI writer are C++.

## Implemented

- Native Windows window and device settings, ASIO/WASAPI through JUCE, selected
  active input channel, stereo output, selectable driver rate and buffer.
- Explicit audio start; monitor defaults off. The raw-input meter and tuner remain
  active when guitar monitoring is muted.
- Input gain, gate, envelope compressor, three original saturation voices with
  2x IIR oversampling, tone EQ, cabinet IR convolution, stereo chorus, ping-pong
  delay with tempo subdivisions, algorithmic reverb, output gain and hard ceiling.
- A serial VST3 insert chain between amp and cabinet, vendor or generic editors,
  bypass, remove, state save/restore and reported plugin latency.
- WAV/AIFF cabinet IRs, reference-file transport, a 24-bit stereo WAV output recorder
  with a background FIFO and visible dropped-block counter.
- Twelve factory tone starting points, two full-rack snapshots, bounded JSON preset
  parsing, embedded VST state, notebook/tab text and 16-step standard-tuning patterns.
- Native Karplus-Strong pattern playback through the rack; Standard MIDI File export.

## Material limits versus the previous app and Guitar Rig 7

This is a native rewrite preview, not certified Guitar Rig 7 parity. Built-in amp
voices are original waveshapers rather than circuit models or neural captures.
The fallback cabinet is a simple EQ/low-pass; load an actual IR for cabinet response.
The output ceiling is a hard clamp, not a mastering-grade lookahead limiter.

VST3 scan/load is synchronous and in-process; a broken plugin can freeze or crash
the app. Only stereo effects are supported, with serial insertion before the cab;
no parallel routing, plugin reordering, sidechains, plugin delay compensation,
MIDI control/automation, capture player or seamless preset changes. Structural
changes detach and reprepare the device callback and may interrupt playback/tails.
IR files are referenced by absolute path and must remain installed. Plugins must
remain installed too. Only trusted local presets and plugins should be opened.

The former Codex account companion, web song search, reference transcription,
multi-bar note editor and 4-12-band spectrum EQ have not been ported into C++.
The notebook is text, not automatic transcription. Old v2 JSON presets are not
silently interpreted as native v3 presets. Reference audio is not embedded in presets.
The sequencer's plucked string is a practice sound, not a sampled guitar instrument.

Input monitoring uses the first active input selected in Audio setup. The callback
preallocates processing buffers to 16,384 frames; larger callbacks emit silence and
increment the buffer-fault indicator. Drivers and hosted plugins can still allocate
or block internally. No hard real-time guarantee is made. Reported I/O latency
excludes converters and external plugin latency and is not a loopback measurement.
The reference player runs at half level into the output stage; recordings capture
the final mix, including reference, metronome and sequencer when enabled.

## Automated validation

`SelahDspTests` checks all six open guitar strings plus 440/880 Hz within 3 cents,
silence rejection, NaN/Inf sanitisation, flat-EQ identity, filter impulse stability,
bounded max-feedback delay at 44.1/48/96/192 kHz, and finite, decaying plucked-string
output. These tests passed locally
with Clang on Windows on 2026-11-05.

`Selah --self-test <absolute-report-file>` runs the entire native engine offline:
strict preset rejection/round trip, all three amp voices at four sample rates,
high-input/NaN output guarding, silence, pattern sound and oversized callback
handling. It does not initialise hardware. CTest runs this check in Windows CI.

`Selah --screenshot <absolute-png-file>` renders the actual native UI without
opening a device, for layout review. This is not a simulated HTML screenshot.

The application translation units also passed local Clang syntax checks against
the pinned JUCE headers (with the ignored checkout's unsupported-MinGW guard
temporarily suppressed only for this check). This does not build or link JUCE and
does not establish a supported MinGW build. The unmodified dependency is retained.
On 2026-11-05, after the user approved installing Microsoft Build Tools, the
unmodified JUCE dependency and native application built successfully with MSVC
19.44.35229.0, Visual Studio 2022 Build Tools and Windows SDK 10.0.26100.0.
`ctest --preset windows --timeout 120` passed both DSP and whole-engine suites.
Computer Use verified native-window startup and factory preset recall: selecting
Velvet clean changed the title and the drive parameter from 14 to 3.
Window startup now fits the primary display's usable area, avoiding a clipped
title bar on shorter displays. The portable package includes the engine test
report and a SHA-256 executable digest in build-info.json.

GitHub Actions remains blocked by an account billing lock; the preview binary is
a local MSVC Release build, not a successful hosted-CI artifact. The build tools
were installed after explicit user approval. The executable is unsigned.

Before a stable release, manual hardware checks remain required: driver opening,
selected input/output channels, measured loopback latency, sustained playing at
small buffers, IR audition, recording and disk-overrun recovery, multiple vendor
VST3 editors, plugin-state recall, and blind/level-matched amp listening tests.
