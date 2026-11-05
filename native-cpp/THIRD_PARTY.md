# Native desktop licensing

The new `native-cpp/` application is AGPL-3.0-or-later; see LICENSE in this directory.
The existing MIT licence at the repository root still applies to the original web/bridge code.
The older Python engine retains its own GPL licence. These licences are not replaced.

JUCE 8.0.12 is fetched at commit `29396c22c93392d6738e021b83196283d6e4d850`.
JUCE modules are dual licensed under AGPLv3 and commercial terms. This build uses
the open-source option. A commercial JUCE licence may be required for closed-source
distribution. See https://github.com/juce-framework/JUCE/blob/8.0.12/LICENSE.md.

JUCE embeds third-party code including the Steinberg ASIO SDK (GPLv3 alternative),
VST3 SDK (MIT), FLAC (BSD), Ogg/Vorbis (BSD), HarfBuzz (MIT), SheenBidi (Apache 2.0),
JPEG (IJG), PNG/zlib, and other platform dependencies. Their original notices are
preserved in the pinned JUCE source and referenced by its LICENSE.md, which ships
with the portable package. No proprietary amp models, Guitar Rig assets, cabinet
impulses or commercial plugins are included. External VST3s retain their own terms.

Source: https://github.com/MAYKELL07/GuitarSimAI (the corresponding release tag).
