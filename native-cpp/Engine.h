// SPDX-License-Identifier: AGPL-3.0-or-later
#pragma once
#include <juce_audio_utils/juce_audio_utils.h>
#include <juce_dsp/juce_dsp.h>
#include "Dsp.h"

struct Tone {
    std::atomic<float> input{0}, output{-12}, gate{-65}, compression{30}, drive{20}, bass{0}, mid{0}, treble{0},
        chorus{0}, delay{22}, feedback{32}, reverb{22}, decay{45}, tempo{100};
    std::atomic<int> amp{0}, division{1};
    std::array<std::atomic<bool>,8> enabled{{true,true,true,true,true,true,true,true}};
};
class Engine : public juce::AudioIODeviceCallback {
public:
    Tone tone;
    juce::AudioDeviceManager devices;
    juce::AudioFormatManager formats;
    juce::AudioPluginFormatManager pluginFormats;
    std::vector<std::unique_ptr<juce::AudioPluginInstance>> plugins;
    std::atomic<bool> monitoring{false}, metronome{false};
    std::atomic<bool> sequencing{false};
    std::array<std::atomic<int>,96> frets;
    std::atomic<int> sequenceStep{-1};
    std::atomic<float> inputPeak{0},outputPeak{0};
    std::atomic<int> clipped{0}, oversized{0}, recordOverruns{0};
    std::atomic<double> currentRate{48000};
    juce::String irPath, referencePath;
    Engine(); ~Engine() override;
    juce::String start();
    void stop();
    bool running() const { return devices.getCurrentAudioDevice()!=nullptr; }
    void mutate(const std::function<void()>&);
    juce::String loadIR(const juce::File&);
    juce::String loadReference(const juce::File&);
    void playReference(bool);
    bool referencePlaying() const { return transport.isPlaying(); }
    juce::String record(const juce::File&);
    void stopRecording();
    bool recording() const { return writer!=nullptr; }
    juce::String addPlugin(const juce::File&);
    void removePlugin(size_t);
    juce::var state() const;
    juce::String restore(const juce::var&);
    double readPitch();
    void prepareOffline(double sampleRate,int blockSize);
    void audioDeviceAboutToStart(juce::AudioIODevice*) override;
    void audioDeviceStopped() override;
    void audioDeviceIOCallbackWithContext(const float* const*,int,float* const*,int,int,const juce::AudioIODeviceCallbackContext&) override;
private:
    static constexpr int capacity=16384;
    juce::AudioBuffer<float> buffer{2,capacity}, refBuffer{2,capacity};
    juce::dsp::Oversampling<float> oversampling{2,1,juce::dsp::Oversampling<float>::filterHalfBandPolyphaseIIR,true};
    juce::dsp::Convolution convolution;
    juce::dsp::Chorus<float> chorus;
    juce::Reverb reverb;
    selah::StereoDelay delay;
    std::array<std::array<selah::Biquad,4>,2> eq;
    juce::LinearSmoothedValue<float> inGain, outGain, driveGain;
    float envelope=0, gateGain=0, dcX[2]{},dcY[2]{};
    double beatPhase=0;
    double stepPhase=0;
    std::array<selah::PluckedString,6> strings;
    juce::MidiBuffer midi;
    juce::TimeSliceThread diskThread{"Selah audio disk"};
    juce::AudioTransportSource transport;
    std::unique_ptr<juce::AudioFormatReaderSource> reader;
    std::unique_ptr<juce::AudioFormatWriter::ThreadedWriter> writer;
    juce::AbstractFifo pitchFifo{32768};
    std::array<float,32768> pitchData{};
    std::vector<float> pitchWindow;
    bool attached=false,hasIR=false;
};
