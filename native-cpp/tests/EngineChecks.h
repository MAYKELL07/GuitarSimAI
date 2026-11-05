// SPDX-License-Identifier: AGPL-3.0-or-later
#pragma once
#include "../Engine.h"
inline juce::String runEngineChecks() {
    Engine engine;
    auto saved=engine.state(); engine.tone.drive=91;
    if(engine.restore(saved).isNotEmpty() || engine.tone.drive!=20) return "Preset round-trip failed";
    auto bad=juce::JSON::parse(juce::JSON::toString(saved)); bad.getDynamicObject()->setProperty("drive",500);
    if(engine.restore(bad).isEmpty() || engine.tone.drive!=20) return "Invalid parameter accepted or state changed on rejection";
    bad=juce::JSON::parse(juce::JSON::toString(saved)); bad.getDynamicObject()->setProperty("enabled",juce::Array<juce::var>{true});
    if(engine.restore(bad).isEmpty()) return "Invalid rack accepted";
    for(double sr:{44100.,48000.,96000.,192000.}) {
        engine.prepareOffline(sr,256); engine.monitoring=true; engine.tone.input=36; engine.tone.drive=100;
        juce::AudioBuffer<float> input(1,256),output(2,256);
        for(int model=0;model<3;++model) {
            engine.tone.amp=model;
            for(int block=0;block<40;++block) {
                for(int i=0;i<256;++i) input.setSample(0,i,static_cast<float>(3*std::sin(2*selah::pi*110*(block*256+i)/sr)));
                if(block==0) input.setSample(0,0,std::numeric_limits<float>::quiet_NaN());
                engine.audioDeviceIOCallbackWithContext(input.getArrayOfReadPointers(),1,output.getArrayOfWritePointers(),2,256,{});
                for(int c=0;c<2;++c) for(int i=0;i<256;++i) {
                    auto sample=output.getSample(c,i); if(!std::isfinite(sample)||std::abs(sample)>.981f) return "Nonfinite or unsafe output";
                }
            }
        }
        engine.audioDeviceStopped();
    }
    engine.prepareOffline(48000,256); engine.monitoring=false; engine.tone.input=0;
    juce::AudioBuffer<float> input(1,256),output(2,256); input.clear();
    for(int block=0;block<20;++block) engine.audioDeviceIOCallbackWithContext(input.getArrayOfReadPointers(),1,output.getArrayOfWritePointers(),2,256,{});
    if(output.getMagnitude(0,256)>1e-6f) return "Silence emits output";
    engine.frets[0]=12; engine.sequencing=true;
    double energy=0;
    for(int block=0;block<20;++block) {
        engine.audioDeviceIOCallbackWithContext(input.getArrayOfReadPointers(),1,output.getArrayOfWritePointers(),2,256,{});
        energy+=output.getRMSLevel(0,0,256);
    }
    if(energy<.0001) return "Native sequencer did not generate audio";
    engine.sequencing=false; engine.audioDeviceStopped();
    juce::AudioBuffer<float> oversized(2,16385);
    oversized.clear(); oversized.addSample(0,0,1);
    engine.audioDeviceIOCallbackWithContext(nullptr,0,oversized.getArrayOfWritePointers(),2,16385,{});
    if(engine.oversized!=1 || oversized.getMagnitude(0,16385)!=0) return "Oversized callback must emit silence";
    return {};
}
