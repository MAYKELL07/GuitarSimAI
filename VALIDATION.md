# Validation record

Delivered version: 1.0.0, 3 November 2026. Windows x64, Node 24, Chromium and Electron.

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

Synthetic tests establish basic pitch/timing/data correctness, not transcription accuracy across all worship recordings. No physical guitar interface, ASIO latency, arbitrary full-mix guitar isolation, exact commercial amp/effect matching, or complete third-party score accuracy has been certified. The UI and README explicitly describe these limitations.

The desktop release is portable and unsigned. ChatGPT access and limits remain controlled by the user’s OpenAI account. No account credentials, commercial songs, or private sessions are included in the repository or release.
