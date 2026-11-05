# Selah 2 — GuitarSim AI

A free, open-source guitar workstation with native ASIO input/output, 64-bit VST3 effects, cabinet convolution, and a customizable black workspace. Reference audio, editable tabs and the sequencer share one app with an assistant using **your ChatGPT account through the official Codex CLI, without an API key**.

![Selah guitar workstation with its worship effects rack and account companion](docs/studio.png)

![Signal designer with colored modules and the selected effect editor](docs/signal-designer.png)

Version 2.1 adds a numbered serial signal grid inspired by hardware editor workflows. Select a block to edit its tone or VST3 parameters, drag blocks to reorder the native chain, and use tone undo/redo. Four local tone snapshots (A–D) capture on first click, recall on later clicks, and replace on right-click. Snapshots store built-in tone values and bypass only; use Save rack for VST states, routing and IRs. Parallel routing and full Guitar Rig feature parity are not implemented.

The **Audio setup** button is always in the top bar; **ASIO settings** also appears in the signal designer. Both open Selah’s Audio & VST3 configuration for driver, channels, sample rate and buffer size.

The **device rack** is the main surface. **Effects** and **Companion AI** share a switchable right panel. Installed VST3 effects already in the rack are hidden from the library by default; enable **Show effects already in rack** to add another instance. The tuner appears as a hideable input module. Audio setup, Arrangement, Song resources, and Tone collection open as dialogs over the rack; Escape returns to the rack.

**Plugin controls** are available directly inside the selected VST3 rack module, with parameter search and continuous edits. The plugin's original vendor editor still opens in a separate native window: Pedalboard does not expose a parent-window embedding API. These generic in-rack controls do not reproduce the vendor artwork or controls the plugin does not expose.

**Tone collection** contains 32 starting points across clean, blues, drive, worship, ambient, modulation, and delay styles. Search by style, title, song or artist. **Tone notes & song examples** reveals the recipe and, for the two referenced tones, manufacturer sources and listening examples. These are approximations, not captures of the original rig. Built-in modules use standard effect-type names; loaded VST3s retain their actual plugin names.

**Song resources** includes a MusicBrainz recording search without an AI account, then title/artist/version selection for the existing live AI source search. Results retain distinct versions. Web chart and tutorial search links remain available if the catalog is unavailable. Catalog calls have a timeout, a shared rate limit and a short cache; catalog metadata does not verify chart accuracy.

For quiet interfaces, **Input preamp** offers clean gain up to +36 dB before the gate and effects, with 0/+12/+24/+36 dB shortcuts. The guitar input meter shows the signal before this boost, including while monitoring is muted. Start at +12 dB and reduce gain if the sound distorts. A silent raw input requires checking the mixer’s USB send and input channel; software gain cannot recover a missing signal.

**Noise reduction** learns two seconds of input with strings muted. The compiled Pedalboard/JUCE downward expander quiets pauses with zero added buffering and no lookahead, plus narrow filters for steady whistles. Noise underneath held notes can remain. Lower strength for quiet sustain. Optional Reduce hiss rolls off highs above 6 kHz. Device buffers and external effects can still add latency. Learn again after changing input or sample rate; profiles last for the engine session.

The hardware rack has **Move** drag handles on every module. Drop before another module or at the bottom to place it last. **Add effect** opens a searchable installed VST3 library that scans automatically on opening and returning to the app. Drag a library effect onto a module to insert it there, or click +. Stop audio and close plugin editors before adding effects. Custom scan folders are saved in Audio settings.

**Guitar tuner** in Audio & VST3 reads the selected raw input before preamp, noise EQ and effects, including with Guitar monitor OFF. Start audio and pluck one open string. Auto chooses the nearest standard guitar string; choose a string manually if needed. **Tune up** means tighten slightly, **Tune down** means loosen slightly, and **In tune** means within 5 cents using A4 = 440 Hz. String 6 is the thick low E and string 1 is the thin high E. Silence or an unclear pitch clears the reading. When the selected string is far from the detected octave, check the string before tightening.

Native spectrum telemetry refreshes about every 33 ms in Smooth mode or 80 ms in Eco mode; pitch analysis refreshes every 80 ms of incoming audio independently of the main workspace. The tuner analyzes the latest 100 ms of raw input. Native tone/EQ edits send continuously while dragging, with one request in flight and only the newest pending edit retained. **Reduce hiss** provides a separate, switchable high-frequency roll-off above 6 kHz without learning; it can soften guitar brightness. Noise learning now distinguishes an unsampled input from a completed sample with no steady tone detected.

The **hardware rack** is the default view, with colored faceplates, rotary controls, bypass buttons, and a serial signal-flow sidebar. **Console** keeps the newer focused editor, navigation, typography, session menu, and Arrangement workspace. Both views share the same tone, VST3 chain, EQ, and saved session; the view choice persists on this device.

The **Parametric EQ** below the rack supports **4, 6, 8 or 12 bands**, individual colored response curves, a combined curve, per-band readouts, numeric frequency/gain/Q edits, and 30/60 fps analyzer display modes. Adding bands preserves existing filters and distributes new flat bands across the spectrum; reducing the count discards higher-numbered bands. A WebGL2 spectrum renderer with peak decay uses graphics acceleration where supported, falling back to SVG. The display rate is separate from the audio sample rate, configured in Audio setup. EQ runs inside the cabinet stage in both engines and adds no extra buffering; bypassing the cabinet also bypasses EQ. Native spectrum is final output; the built-in analyzer is post-EQ.

![Native ASIO configuration, metering, and VST3 device rack](docs/native-rack.png)

## Get the Windows app

Download **Selah-windows-x64.zip** from [Releases](https://github.com/MAYKELL07/GuitarSimAI/releases), extract the entire folder, and open **Selah.exe**. The portable app includes its runtime; Node.js is only needed separately if you install the Codex CLI for AI features. The release is unsigned.

The app and all audio tools are free. AI features require an eligible ChatGPT/Codex account and use that account’s access and usage limits. A ChatGPT subscription is not included or sold by this project. No OpenAI API key, paid audio plugin, or paid tab subscription is required by the app.

## Run from source

Install Node.js **22.12 or newer** and Git, then:

```sh
git clone https://github.com/MAYKELL07/GuitarSimAI.git
cd GuitarSimAI
npm ci
npm run dev
```

`npm run dev`, `npm start`, and `npm run desktop` now build and open the Windows application. There is no separate website launch command. The app keeps its internal local service private to its own desktop session, and closing the app closes that service and its audio engine. The built-in audio engine remains available inside the app when native audio is disabled.

For native audio from source, install Python 3.12 and run `npm run native:setup`. To package Windows x64 with its self-contained native runtime, use `npm run package:win`. Open `release/Selah-win32-x64/Selah.exe` from the complete output folder; do not move the executable away from its resources.

## ASIO, VST3, and the black workspace

1. Open **Audio & VST3**. Select **ASIO**, your connected interface, guitar input channel, stereo outputs, sample rate, and buffer. Start at **256 samples**; use 512 if your plugin chain misses deadlines. A vendor’s installed driver only appears when PortAudio can actually open/enumerate that device; installed-but-disconnected driver names are not invented as selectable hardware.
2. Select **Start audio**. Monitoring starts **off**. Connect headphones, set your interface’s instrument/Hi-Z input and gain appropriately, then enable **Guitar monitor**. The native engine is automatically selected for input and arrangement playback. The footer transport, sequencer and loaded reference now use that output device. The driver is never silently replaced by browser audio if opening fails.
3. Use **Get free plugins** for official developer downloads: NAM, BYOD, Chow Matrix, Chow Tape Model, and the standard TDR Nova edition. Install the **64-bit Windows VST3** edition, stop audio, then **Scan folders → Add to rack**. The app lists installed bundles without executing them during a scan. Recognizable 32-bit Windows modules are omitted. Other plugin formats, instruments, and every possible shell/container plugin are not covered.
4. Reorder blocks with the arrows, bypass effects, adjust exposed parameters, or select **Open UI** for the plugin’s own editor. Close that editor before changing the rack from Selah. New plugins are placed before the cabinet stage; move delays/reverbs later as desired. **Load WAV / AIFF IR** replaces the native filter cabinet with convolution plus its EQ/filter stage. If an amp plugin already includes a cabinet simulation, bypass the extra cabinet block to avoid doubling it.
5. **Save rack / Open rack** saves/restores native effect order, built-in values, VST3 internal states and embedded cabinet IR audio. Stop audio and close editors first. Installed plugins are still required to restore their states. Keep trusted native presets under 24 MB. **Save session** separately preserves the reference name, notes, tempo and basic tone settings; reopen reference audio after restarting.
6. Use **… → Workspace preferences** for the black/graphite surface, six accent colors or a custom color, interface scale (85–125%), spacing, sidebar/companion visibility and widths. Settings and device choices persist on the device. The session name is editable in the footer.

The native rack uses compiled **Pedalboard/JUCE DSP on the CPU**, float32 audio buffers, PortAudio/ASIO device I/O, a selectable sample rate up to 192 kHz when the device supports it, and a final limiter. Native WAV exports are **24-bit PCM**, with the external VST3 chain and cabinet IR included. Stop native audio before offline export; reference audio and live input are excluded from the exported sequence. The built-in engine retains its original 16-bit WAV export.

CPU DSP budget, peak load, driver-reported I/O latency, driver flags, configuration gaps and clipping are shown. Driver-reported latency is **not** a loopback measurement and excludes converters and unreported plugin latency. Plugin latency is listed per block. Python coordinates streaming/control around compiled processors, so this release does not promise a hard real-time deadline at tiny buffers. Structural changes can interrupt audio; stop audio for loading plugins and IRs. Native plugin crashes are isolated from the desktop UI; use **Restart** to recover and reopen your saved rack.

The host uses WebGL for spectrum display when available; its audio DSP remains on the CPU. A plugin that implements GPU processing can manage that internally; GPU processing was not tested. High sample rates or oversampling options inside a plugin cost CPU and can increase latency. For hardware-like amp realism, use an appropriate neural capture, a good cabinet IR, compatible plugin settings and calibrated input gain. Tone quality is not certified as equal to a named premium hardware pedal.

## Connect ChatGPT without an API key

```sh
npm install -g @openai/codex
codex login
codex login status
```

Complete the official browser sign-in yourself. Then select **Refresh assistant connection** in Selah. Use a current Codex CLI supporting `exec`, `--ignore-user-config`, `--ephemeral`, `--output-schema`, and live `--search`. An existing ChatGPT sign-in can be reused; Selah never reads, copies, exports, or publishes your login credentials.

This is an account-backed **Codex companion**, not an embedded ChatGPT website and not this chat’s conversation history. Recent messages are sent as context within the current app session. AI-key environment variables are removed from the child process and ChatGPT authentication is required. If the CLI is not on PATH, set `CODEX_BIN` to the full path to its native executable.

Official references: [ChatGPT/Codex authentication](https://learn.chatgpt.com/docs/auth) and [non-interactive runs and structured output](https://learn.chatgpt.com/docs/non-interactive-mode). Eligibility and limits are controlled by OpenAI.

## What you can do

- **Upload reference audio.** Decode browser-supported WAV, MP3, FLAC, M4A, or OGG files locally, up to 150 MB. Seek in the waveform and mix the dry reference with the processed guitar part. Uncheck Loop to hear the entire recording.
- **Analyze a passage.** Choose a starting second and analyze up to 90 seconds in a Web Worker. Get a tempo estimate, possible key, and an editable monophonic melody draft. Load the draft into both tabs and the sequencer.
- **Shape your guitar tone.** Compression, soft-clipped drive, cabinet-style high/low filtering, bass/treble EQ, modulated chorus, tempo-synced delay, feedback, and convolution reverb. Bypass pedals individually. Four worship-oriented starting presets are included.
- **Play real guitar.** Connect an audio interface, use headphones, enable Guitar input, and grant audio input permission. Disable input to choose a different device. Input is processed through the same rack as the synthesized guitar.
- **Write a part.** Six strings in standard tuning, up to 128 bars of 4/4, a 16-step grid per bar, editable frets and note lengths, looped playback, tempo control, metronome, and a deterministic plucked-string synth.
- **Ask your companion.** Request a tone and explicitly apply its proposed settings. Request an **original 4-bar practice arrangement** and load the proposed notes directly into the tab editor and sequencer.
- **Find free song resources.** Enter the song, artist, and optional live/acoustic/release version. AI performs a live web search; a separate checker fetches the returned page to inspect identity and access. Open the original chart or tab at its source.
- **Export.** Text guitar tabs, standard MIDI (including tempo), processed guitar-sequence WAV, or a portable JSON session. Session settings are autosaved in the current app profile. Reference audio is kept separately and must be reopened after a restart.

The included “Sunday sketch” is a synthesized original demo, not a commercial recording.

## What verification means

Resource cards distinguish **source identity** from **musical accuracy**:

| Check | What it establishes |
| --- | --- |
| Song title | Requested title appears in the page’s title or main heading. |
| Artist | Artist text appears on the fetched page. |
| Version | Requested version text appears on the page; otherwise unconfirmed. |
| Access | Explicit free-access wording, an identified access restriction, or unconfirmed. |
| Accuracy | Always unverified against the actual recording unless you compare it yourself. |

The AI’s source description is shown separately from independent page checks. Search favors free sources; access can change. Blocked, redirected, non-HTML, or unavailable pages are not presented as verified. Chord charts are distinguished from lead tabs and official resources from user submissions in the source description. Complete third-party charts are not scraped into the app. Open the source, follow its terms, and arrange/review your own part in the shared editor.

**A matching page is not proof that its notes or timing are correct.** The app cannot certify an exact arrangement from a link alone, and an original AI exercise is not a transcription of that song.

## Honest audio limitations

An arbitrary mastered recording does not reveal a uniquely recoverable pedalboard. Selah offers useful editable starting points, not an exact amp/pedal model recovery system. Its “Suggest starting tone” button uses simple measured level/brightness to choose a stylistic preset; delay and reverb are defaults, not measured effect parameters.

Pitchy detects a **single predominant pitch**. In a full mix, vocals or bass may dominate. It does not isolate guitar, transcribe polyphonic chords, or recover all instruments. Guitar-only stems work best. Tempo can be half or double the intended tempo; key estimation can be ambiguous. Review frets, note lengths, key, and tempo by ear. Load a draft, then adjust BPM and edit the shared arrangement. WAV exports contain the synthesized guitar arrangement with effects, excluding reference audio and live input.

Live input latency depends on your interface, OS, and browser. The browser preview uses Web Audio. The separate native CPU engine hosts ASIO and VST3; it does not include a trained amp model or promise parity with a commercial pedalboard. Hardware monitoring has to be checked on your actual audio interface.

## Privacy and local service

Audio decode, pitch analysis, effects, sequencing, and rendering happen locally. With native mode, uploaded reference audio or IR files are transferred to the local engine on the same computer; they are not uploaded to an external server. Questions, session metadata, recent companion messages, and analysis summaries are sent to OpenAI only when you request an AI action; **audio samples are not sent**. Web search sends the song/artist/version query, and source verification visits returned public HTTPS pages. Fonts may load from Google Fonts; fallback system fonts work offline.

The assistant service binds to `127.0.0.1`, checks Host and Origin, rejects cross-site requests, limits request sizes, uses structured responses, runs Codex in a temporary read-only workspace with shell tools disabled, and ignores the user’s Codex project configuration for those runs. Keep it local; this service is not designed for public hosting. The public GitHub repository contains source and app binaries, not songs, credentials, or private sessions.

## Development and checks

```sh
npm test
npm run build
npm audit
```

Tests cover known-pitch transcription, silence, synthetic tempo, fingering, malformed session rejection, MIDI/tab exports, source identity/access distinctions, URL restrictions, and local-service request boundaries. Browser verification exercises playback signal, uploads, analysis, shared note editing, WAV/MIDI/tab downloads, session restore, and responsive layouts. Live ChatGPT tone, source-search, and original-arrangement requests were also exercised during development. See [VALIDATION.md](VALIDATION.md) for the delivered build’s validation record.

## Technology and license

React, TypeScript, Vite, Electron, Web Audio, [Pitchy](https://github.com/ianprime0509/pitchy) (0BSD), and Lucide (ISC). No proprietary audio assets or song recordings are bundled. The original UI/browser/bridge code is [MIT licensed](LICENSE). The separate native engine is [GPL-3.0-or-later](native/LICENSE), with runtime dependency notices included. See [third-party notices](THIRD_PARTY_NOTICES.md). Dependencies and external plugins retain their respective licenses.
