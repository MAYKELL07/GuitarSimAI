# Selah 3 — Native C++ guitar workstation

Selah is being rebuilt as a **native C++ desktop application** using JUCE 8.
The new app has no Electron, browser, JavaScript, Python audio process or local HTTP server.

> **Native rewrite preview.** Guitar Rig 7 is the quality target, not a verified parity claim.
> See [feature coverage and limits](docs/NATIVE_STATUS.md) before replacing a working rig.

## Windows software

Download **Selah-cpp-windows-x64.zip** from [Releases](https://github.com/MAYKELL07/GuitarSimAI/releases),
extract it and run **Selah.exe**. Native CI also publishes the portable ZIP as a
[workflow artifact](https://github.com/MAYKELL07/GuitarSimAI/actions/workflows/native-cpp.yml).
The native package is distinct from older Electron releases named Selah-windows-x64.zip.

1. Open **Audio setup** and select your audio interface, input channel, stereo outputs,
   sample rate and buffer. Windows ASIO and WASAPI use the actual installed devices.
2. Start audio if it is stopped. With headphones connected, enable **Monitor ON**.
   Monitoring starts off. Set interface gain/Hi-Z first; start with the output low.
3. Choose a factory tone and adjust the native rack controls. Load your cabinet WAV/AIFF
   IR for convolution; without an IR, the cabinet uses a simple filtered response.
4. **Add VST3** loads a trusted local 64-bit stereo effect. **VST3 rack** opens its
   editor, bypasses or removes it. Inserts sit between the amp and cabinet.
5. **Save preset** stores tone, bypass, plugin state, IR path, pattern and notebook.
   **A/B** capture/recall full racks; Shift-click replaces a snapshot. Plugins and IR
   files must remain installed. This format is separate from the previous app's sessions.
6. **Load reference / Play reference**, **Click**, **Step sequencer**, and **Record WAV**
   support practice and capture. Recordings are 24-bit stereo WAVs of the final mix.
   The sequencer supports six strings, frets 0–24, 16th notes and MIDI export.

The rack includes a gate, compressor, three original 2x oversampled amp voices,
three-band tone EQ, cabinet convolution, stereo chorus, tempo ping-pong delay,
stereo algorithmic reverb and an always-on output ceiling. A raw-input tuner and
I/O meters remain active with monitoring muted. The footer shows CPU, rate, buffer,
driver-reported latency, ceiling hits, record drops and unsupported buffer faults.

## Build from C++ source

Install **Visual Studio 2022 Build Tools** with **Desktop development with C++** and
**Windows SDK**, plus **CMake 3.22+** and Git. From the repository directory:

```powershell
cmake --preset windows
cmake --build --preset windows --parallel 2
ctest --preset windows
.\build\windows\Selah_artefacts\Release\Selah.exe
```

CMake fetches a pinned JUCE 8.0.12 commit on the first configure. A local ignored
checkout at `native-cpp/JUCE` can be used for offline work. The release uses the
static MSVC runtime. No Node.js or Python installation is needed to build or run
the new application. MinGW is unsupported by this JUCE version; use MSVC on Windows.
The `ninja` preset is available for supported native toolchains on other platforms,
but those platforms are not currently validated or packaged.

```powershell
# Offline whole-engine regression check, without opening audio hardware:
.\build\windows\Selah_artefacts\Release\Selah.exe --self-test "$PWD\build\engine-report.txt"
# Render the actual native UI, without opening audio hardware:
.\build\windows\Selah_artefacts\Release\Selah.exe --screenshot "$PWD\build\native-ui.png"
```

## Migration and validation

The old desktop implementation remains in this repository to preserve existing work;
its Node scripts launch the **legacy** app. It is not a runtime dependency of Selah 3.
Its previous documentation is preserved in [legacy desktop documentation](docs/legacy-desktop.md).

The native rewrite does **not** yet include the former account-backed AI companion,
song search, automatic transcription, multi-bar arrangement editor, spectrum EQ,
parallel routing, neural captures, or Guitar Rig's model/content library. The native
amp voices are original saturation algorithms. A production quality comparison
requires calibrated listening tests, hardware latency measurements and broader
plugin compatibility testing. Read [native status and validation](docs/NATIVE_STATUS.md)
for concrete coverage, tests and limitations.

## Licence

The new C++ app is **AGPL-3.0-or-later**: [native licence](native-cpp/LICENSE).
JUCE is used under its AGPL option; a commercial JUCE licence may be required for
closed-source distribution. [Native dependency notices](native-cpp/THIRD_PARTY.md).
Original web code retains the root MIT licence; the older Python engine retains
its own licence. No Guitar Rig artwork, proprietary models, IRs or plugins are bundled.
