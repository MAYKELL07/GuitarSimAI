# Validation record

Delivered version: 2.0.0, 3 November 2026. Windows x64, Node 24, Python 3.12, Chromium and Electron. Earlier browser-only checks remain listed below.

## Version 2 native audio and workspace checks

- Seven additional native tests pass: control/routing rejection; preserving DSP state during knob changes; finite stereo synthesis with correct duration; selected-input routing; muting invalid plugin output; real convolution with embedded-IR preset restoration and 24-bit PCM export; rack/preset round trips and preserving the current rack on a failed restore.
- PortAudio enumerates the ASIO API with available device entries. ASIO4ALL opened at **44.1 kHz / 256 samples**, monitoring disabled, and reported **5.8 ms input + 5.8 ms output**. These values are driver reports, not a measured analog round trip.
- A legally downloaded **TDR Nova 2.2.3 x64 VST3** was loaded from its official no-installer package in a private, ignored local test directory. Parameter read/write, serialized plugin-state restoration, and native WAV rendering were exercised. This external plugin is not bundled in the release.
- A generated guitar part was processed through the native chain including TDR Nova while ASIO4ALL streamed at very low output level. In the short 1.5-second observation the engine reported nonzero processed output, no driver flags, no configuration gaps, no clipping, and no callback errors. This is a short functional test, not a long-session reliability benchmark or a physical guitar/loopback measurement.
- Workspace customization persisted hidden companion state, a custom accent, and 110% interface scale in the browser. Black workspace screenshots were inspected. Native controls and the ASIO device selection rendered.
- The new native runtime is packaged separately from the renderer, with native source and license notices. The self-contained `SelahAudio.exe` was started directly through the bridge and successfully reported the ASIO devices without using the development Python interpreter. A plugin failure can stop the audio process; the desktop shell exposes Restart rather than silently claiming a continuing audio stream.

## Automated checks

- TypeScript production compilation and Vite bundle complete successfully.
- Nine Node test cases pass: known E4 transcription and silence; synthetic 120 BPM recovery; playable fingering; corrupt session rejection; MIDI tempo/track events; text-tab timing; title/artist/version/access checks; URL restrictions; HTTP origin/host/content-type boundaries.
- Full npm audit reports zero known vulnerabilities with the committed lockfile. Build-tool glob/minimatch dependencies are overridden to patched versions.

## Browser checks

- Production app and ChatGPT account status render.
- Transport produces a nonzero output signal and can pause.
- A step added in the sequencer appears in the tab editor; fret and note length can be changed.
- Text tabs, MIDI, and processed PCM WAV downloads complete.
- A saved JSON session can be restored through the file chooser.
- A locally generated 4-second E4 WAV uploads, decodes, and produces a usable analysis result in the worker; loading the draft preserves the correct sounding MIDI pitch (64).
- The 390-pixel mobile layout has no document-level horizontal overflow. Desktop and mobile screenshots were inspected.
- Song-resource search controls render with the verification explanation.
- A packaged Windows executable opens its own desktop window and serves the app locally. A stable desktop port preserves the browser origin for session autosave across launches.

## Live account-backed integration

These were real requests through the official Codex CLI using an existing ChatGPT login, without an API key:

1. A warm clean worship tone at 76 BPM returned usable, bounded effect parameters, including dotted-eighth delay.
2. A web search for “Goodness of God” / “Bethel Music” returned actual artist/publisher chord-resource pages. Independent fetches matched song and artist. One source’s free access remained independently unconfirmed; both remained unverified for note accuracy.
3. An original four-bar G–D–Em–C practice arpeggio returned 32 playable note events at 76 BPM through the structured arrangement schema.

## Limits of this validation

Synthetic tests establish basic pitch/timing/data correctness, not transcription accuracy across all worship recordings. No physical guitar signal chain, analog round-trip latency, arbitrary full-mix guitar isolation, exact commercial amp/effect matching, universal VST compatibility, or complete third-party score accuracy has been certified. GPU DSP is not provided or verified. The UI and README explicitly describe these limitations.

The desktop release is portable and unsigned. ChatGPT access and limits remain controlled by the user’s OpenAI account. No account credentials, commercial songs, or private sessions are included in the repository or release.
