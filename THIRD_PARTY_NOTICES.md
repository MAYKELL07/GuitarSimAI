# Third-party software in Selah 2

The original Selah UI, browser DSP and Node/Electron bridge are MIT licensed (see the root LICENSE). The separate native audio executable and its source in `native/` are GPL-3.0-or-later and use Spotify Pedalboard. Its GPL license is in `native/LICENSE`; dependency notices are included in `third_party/licenses` and in the packaged runtime’s dependency metadata.

## Native runtime

- **Pedalboard 0.9.26**, Spotify AB, GPLv3. [Exact release source](https://github.com/spotify/pedalboard/tree/v0.9.26), [build instructions](https://github.com/spotify/pedalboard#building-from-source). Its JUCE, VST3 SDK, Rubber Band, FFTW, LAME, libgsm and other compiled dependency notices are preserved in `third_party/licenses/PEDALBOARD-NOTICE.txt`. Upstream source with pinned submodules is offered beside the binary release as `Selah-native-upstream-source.tar.gz`.
- **python-sounddevice 0.5.6**, Matthias Geier, MIT. [Source](https://github.com/spatialaudio/python-sounddevice/tree/0.5.6). The Windows wheel supplies PortAudio binaries, including the optional ASIO-enabled DLL used here. [Binary build recipes](https://github.com/spatialaudio/portaudio-binaries), [PortAudio source](https://github.com/PortAudio/portaudio). PortAudio copyright Ross Bencina and Phil Burk, MIT. ASIO is a technology of Steinberg Media Technologies GmbH; the corresponding vendor SDK terms and notices apply to that technology. Selah does not install or redistribute interface manufacturers’ ASIO drivers.
- **NumPy 2.5.4**, BSD and bundled component licenses. [Source](https://github.com/numpy/numpy/tree/v2.5.4). Its complete wheel license metadata, including bundled numerical libraries, accompanies the native runtime.
- **CFFI**, MIT; **CPython 3.12**, PSF; **PyInstaller**, GPL with its bootloader distribution exception. Bundled package license metadata and upstream license terms remain applicable. Building the executable does not require a paid compiler or a paid JUCE license; Selah uses Pedalboard’s existing open-source distribution rather than a separate current JUCE SDK integration.

## Desktop UI

React and ReactDOM (MIT), Lucide (ISC), Pitchy (0BSD), Electron (MIT plus Chromium/third-party notices), and the other npm dependencies retain their respective licenses. Electron’s own LICENSE and LICENSES.chromium.html accompany the Windows executable. Common UI license texts are in `third_party/licenses`.

## External plugins and models

Third-party VST3 effects, model files and cabinet IRs are **not bundled**. The app links to official developer downloads, and users load their own installed plugins and files under each developer’s license. No paid plugin, activation, capture pack, or commercial recording is included. A free edition may have optional paid upgrades. VST is a trademark and ASIO a technology of Steinberg Media Technologies GmbH.
