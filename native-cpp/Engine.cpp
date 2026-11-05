// SPDX-License-Identifier: AGPL-3.0-or-later
#include "Engine.h"

namespace {
struct Param { const char* id; std::atomic<float> Tone::* member; float low,high; };
const Param params[]={{"input",&Tone::input,-24,36},{"output",&Tone::output,-60,6},
    {"gate",&Tone::gate,-90,-20},{"compression",&Tone::compression,0,100},
    {"drive",&Tone::drive,0,100},{"bass",&Tone::bass,-12,12},{"mid",&Tone::mid,-12,12},
    {"treble",&Tone::treble,-12,12},{"chorus",&Tone::chorus,0,100},{"delay",&Tone::delay,0,100},
    {"feedback",&Tone::feedback,0,85},{"reverb",&Tone::reverb,0,100},
    {"decay",&Tone::decay,0,100},{"tempo",&Tone::tempo,40,240}};
}
Engine::Engine() {
    for(auto& f:frets) f=-1;
    formats.registerBasicFormats(); pluginFormats.addDefaultFormats();
    diskThread.startThread(); pitchWindow.reserve(16384);
}
Engine::~Engine() {
    stop(); transport.setSource(nullptr); reader.reset(); diskThread.stopThread(3000);
}
juce::String Engine::start() {
    if(running()) return {};
    const auto result=devices.initialise(1,2,nullptr,false);
    if(result.isNotEmpty()) return result;
    devices.addAudioCallback(this); attached=true; monitoring=false;
    return {};
}
void Engine::stop() {
    monitoring=false; sequencing=false; transport.stop();
    if(attached) { devices.removeAudioCallback(this); attached=false; }
    stopRecording(); devices.closeAudioDevice();
}
void Engine::mutate(const std::function<void()>& action) {
    const bool resume=attached;
    if(resume) devices.removeAudioCallback(this);
    action();
    if(resume) devices.addAudioCallback(this);
}
void Engine::audioDeviceAboutToStart(juce::AudioIODevice* device) {
    prepareOffline(device->getCurrentSampleRate(),device->getCurrentBufferSizeSamples());
}
void Engine::prepareOffline(double sr,int blockSize) {
    currentRate=sr;
    juce::dsp::ProcessSpec spec{sr,capacity,2};
    oversampling.reset(); oversampling.initProcessing(capacity);
    convolution.prepare(spec); chorus.prepare(spec); chorus.reset();
    reverb.setSampleRate(sr); reverb.reset(); delay.prepare(sr);
    inGain.reset(sr,.02); outGain.reset(sr,.02); driveGain.reset(sr*2,.02);
    inGain.setCurrentAndTargetValue(selah::dbGain(tone.input));
    outGain.setCurrentAndTargetValue(selah::dbGain(tone.output));
    driveGain.setCurrentAndTargetValue(1+tone.drive.load()*.45f);
    envelope=gateGain=0; beatPhase=stepPhase=0; sequenceStep=-1; for(auto& s:strings) s.reset();
    std::fill(std::begin(dcX),std::end(dcX),0); std::fill(std::begin(dcY),std::end(dcY),0);
    for(auto& channel:eq) for(auto& f:channel) f.reset();
    pitchFifo.reset(); pitchWindow.clear();
    transport.prepareToPlay(blockSize,sr);
    for(auto& p:plugins) { p->setRateAndBufferSizeDetails(sr,capacity); p->prepareToPlay(sr,capacity); }
}
void Engine::audioDeviceStopped() {
    transport.releaseResources();
    for(auto& p:plugins) p->releaseResources();
    inputPeak=outputPeak=0;
}
void Engine::audioDeviceIOCallbackWithContext(const float* const* inputs,int numInputs,float* const* outputs,int numOutputs,int count,const juce::AudioIODeviceCallbackContext&) {
    juce::ScopedNoDenormals noDenormals;
    for(int c=0;c<numOutputs;++c) if(outputs[c]) juce::FloatVectorOperations::clear(outputs[c],count);
    if(count>capacity) { ++oversized; return; }
    auto* l=buffer.getWritePointer(0); auto* r=buffer.getWritePointer(1);
    const float* input=numInputs>0 ? inputs[0] : nullptr;
    float inPeak=0;
    for(int i=0;i<count;++i) {
        const float x=input ? selah::safe(input[i]) : 0;
        float sequence=0;
        if(sequencing.load(std::memory_order_relaxed)) {
            const double length=currentRate.load()*60/tone.tempo.load()/4;
            if(sequenceStep<0 || stepPhase>=length) {
                stepPhase=0; sequenceStep=(sequenceStep+1)%16;
                constexpr int tuning[]={64,59,55,50,45,40};
                for(size_t s=0;s<6;++s) { const int fret=frets[s*16+static_cast<size_t>(sequenceStep.load())]; if(fret>=0) strings[s].pluck(currentRate,tuning[s]+fret); }
            }
            ++stepPhase;
            for(auto& s:strings) sequence+=s.tick();
        } else { sequenceStep=-1; stepPhase=0; }
        inPeak=std::max(inPeak,std::abs(x)); l[i]=r[i]=(monitoring.load(std::memory_order_relaxed) ? x : 0)+sequence;
    }
    inputPeak=inPeak;
    int a,n,b,m; pitchFifo.prepareToWrite(count,a,n,b,m);
    for(int i=0;i<n;++i) pitchData[static_cast<size_t>(a+i)]=input ? selah::safe(input[i]) : 0;
    for(int i=0;i<m;++i) pitchData[static_cast<size_t>(b+i)]=input ? selah::safe(input[n+i]) : 0;
    pitchFifo.finishedWrite(n+m);
    const float sr=static_cast<float>(currentRate.load()), threshold=selah::dbGain(tone.gate);
    const float amount=tone.compression.load()*.01f;
    const float attack=std::exp(-1.f/(sr*.005f)), release=std::exp(-1.f/(sr*.12f));
    inGain.setTargetValue(selah::dbGain(tone.input)); outGain.setTargetValue(selah::dbGain(tone.output));
    driveGain.setTargetValue(1+tone.drive.load()*.45f);
    for(int i=0;i<count;++i) {
        l[i]*=inGain.getNextValue(); r[i]=l[i];
        const float level=std::abs(l[i]), c=level>envelope ? attack : release;
        envelope=c*envelope+(1-c)*level;
        const float gateTarget=envelope>threshold ? 1.f : 0.f;
        gateGain+=(gateTarget>gateGain ? .01f : .0005f)*(gateTarget-gateGain);
        if(tone.enabled[0]) { l[i]*=gateGain; r[i]*=gateGain; }
        if(tone.enabled[1] && amount>0) {
            const float db=20*std::log10(std::max(envelope,1e-8f));
            const float reduction=std::max(0.f,db+30.f)*(1-1/(1+amount*7));
            const float gain=selah::dbGain(amount*6-reduction);
            l[i]*=gain; r[i]*=gain;
        }
    }
    juce::dsp::AudioBlock<float> block(buffer.getArrayOfWritePointers(),2,static_cast<size_t>(count));
    if(tone.enabled[2]) {
        auto up=oversampling.processSamplesUp(block);
        const auto model=tone.amp.load();
        for(size_t i=0;i<up.getNumSamples();++i) {
            const float gain=driveGain.getNextValue();
            for(size_t c=0;c<2;++c) {
                float x=up.getChannelPointer(c)[i];
                if(model==0) x=std::tanh(x*gain*.65f)/std::sqrt(gain*.65f);
                else if(model==1) x=(std::tanh(x*gain+.18f)-std::tanh(.18f))/std::sqrt(gain);
                else x=std::tanh(std::tanh(x*gain)*2.2f)*.5f;
                up.getChannelPointer(c)[i]=x;
            }
        }
        oversampling.processSamplesDown(block);
    }
    // Serial host inserts: after amp, before cab and ambience. Structural edits detach callback.
    juce::AudioBuffer<float> view(buffer.getArrayOfWritePointers(),2,count);
    midi.clear();
    for(auto& p:plugins) if(!p->isSuspended()) p->processBlock(view,midi);
    if(tone.enabled[3]) {
        if(hasIR) { juce::dsp::ProcessContextReplacing<float> context(block); convolution.process(context); }
        for(auto& channel:eq) {
            channel[0].peak(sr,120,tone.bass, .7); channel[1].peak(sr,800,tone.mid,.8);
            channel[2].peak(sr,3200,tone.treble,.7); channel[3].lowpass(sr,hasIR ? 18000 : 6500);
        }
        for(int c=0;c<2;++c) for(int i=0;i<count;++i) {
            auto x=buffer.getSample(c,i); for(auto& f:eq[static_cast<size_t>(c)]) x=f.tick(x);
            buffer.setSample(c,i,x);
        }
    }
    if(tone.enabled[4]) {
        chorus.setRate(.65f); chorus.setDepth(.3f); chorus.setCentreDelay(12); chorus.setFeedback(.1f);
        chorus.setMix(tone.chorus.load()*.005f); juce::dsp::ProcessContextReplacing<float> context(block); chorus.process(context);
    }
    if(tone.enabled[5]) {
        const float divisions[]={.5f,.75f,1.f,1.5f};
        const float seconds=60.f/tone.tempo.load()*divisions[std::clamp(tone.division.load(),0,3)];
        for(int i=0;i<count;++i) delay.tick(l[i],r[i],seconds,tone.feedback.load()*.01f,tone.delay.load()*.006f);
    }
    if(tone.enabled[6]) {
        juce::Reverb::Parameters p; p.roomSize=.2f+tone.decay.load()*.0075f; p.damping=.5f;
        p.wetLevel=tone.reverb.load()*.0035f; p.dryLevel=1.f; p.width=1;
        reverb.setParameters(p); reverb.processStereo(l,r,count);
    }
    if(transport.isPlaying()) {
        juce::AudioSourceChannelInfo info(&refBuffer,0,count); transport.getNextAudioBlock(info);
        for(int c=0;c<2;++c) buffer.addFrom(c,0,refBuffer,c,0,count,.5f);
    }
    float peak=0; bool clipping=false;
    for(int i=0;i<count;++i) {
        float click=0;
        if(metronome) {
            const double beat=sr*60/tone.tempo.load();
            if(beatPhase<sr*.025) click=static_cast<float>(.12*std::sin(2*selah::pi*1400*beatPhase/sr)*std::exp(-beatPhase/(sr*.004)));
            beatPhase+=1; if(beatPhase>=beat) beatPhase-=beat;
        }
        const float gain=outGain.getNextValue();
        for(int c=0;c<2;++c) {
            float x=selah::safe(buffer.getSample(c,i)*gain+click);
            const float y=x-dcX[c]+.995f*dcY[c]; dcX[c]=x; dcY[c]=y;
            clipping|=std::abs(y)>1;
            // Always-on finite output guard and ceiling, including when effects are bypassed.
            x=std::clamp(selah::safe(y),-.98f,.98f);
            buffer.setSample(c,i,x); peak=std::max(peak,std::abs(x));
        }
    }
    if(clipping) ++clipped;
    outputPeak=peak;
    if(writer && !writer->write(buffer.getArrayOfReadPointers(),count)) ++recordOverruns;
    for(int c=0;c<numOutputs;++c) if(outputs[c]) juce::FloatVectorOperations::copy(outputs[c],buffer.getReadPointer(c%2),count);
}
juce::String Engine::loadIR(const juce::File& file) {
    if(recording()) return "Stop recording before changing the cabinet.";
    std::unique_ptr<juce::AudioFormatReader> r(formats.createReaderFor(file));
    if(!r || r->lengthInSamples<=0 || r->lengthInSamples>r->sampleRate*10 || r->numChannels>2) return "Choose a mono/stereo audio IR shorter than ten seconds.";
    juce::AudioBuffer<float> ir(static_cast<int>(r->numChannels),static_cast<int>(r->lengthInSamples));
    if(!r->read(&ir,0,ir.getNumSamples(),0,true,true)) return "Cannot read IR.";
    mutate([&] { convolution.loadImpulseResponse(std::move(ir),r->sampleRate,juce::dsp::Convolution::Stereo::yes,
        juce::dsp::Convolution::Trim::yes,juce::dsp::Convolution::Normalise::yes); hasIR=true; irPath=file.getFullPathName(); });
    return {};
}
juce::String Engine::loadReference(const juce::File& file) {
    std::unique_ptr<juce::AudioFormatReader> r(formats.createReaderFor(file));
    if(!r) return "Unsupported reference audio file.";
    const double sr=r->sampleRate;
    mutate([&] { transport.stop(); transport.setSource(nullptr); reader.reset(new juce::AudioFormatReaderSource(r.release(),true));
        transport.setSource(reader.get(),32768,&diskThread,sr); referencePath=file.getFullPathName(); });
    return {};
}
void Engine::playReference(bool play) {
    if(play && reader && running()) { if(transport.getCurrentPosition()>=transport.getLengthInSeconds()) transport.setPosition(0); transport.start(); }
    else transport.stop();
}
juce::String Engine::record(const juce::File& file) {
    if(!running()) return "Start audio before recording.";
    if(recording()) return "Already recording.";
    auto stream=file.createOutputStream(); if(!stream) return "Cannot create recording file.";
    if(!stream->setPosition(0) || !stream->truncate().wasOk()) return "Cannot overwrite recording file.";
    juce::WavAudioFormat wav;
    auto* w=wav.createWriterFor(stream.get(),currentRate,2,24,{},0);
    if(!w) return "Cannot create WAV writer.";
    stream.release();
    mutate([&] { writer=std::make_unique<juce::AudioFormatWriter::ThreadedWriter>(w,diskThread,131072); recordOverruns=0; });
    return {};
}
void Engine::stopRecording() { mutate([&] { writer.reset(); }); }
juce::String Engine::addPlugin(const juce::File& file) {
    if(recording()) return "Stop recording before loading plugins.";
    if(!file.exists()) return "Plugin not found.";
    juce::OwnedArray<juce::PluginDescription> descriptions;
    auto* format=pluginFormats.getFormat(0);
    if(!format) return "VST3 hosting unavailable.";
    format->findAllTypesForFile(descriptions,file.getFullPathName());
    if(descriptions.isEmpty()) return "No compatible VST3 effect found.";
    juce::String error;
    auto p=pluginFormats.createPluginInstance(*descriptions[0],currentRate,capacity,error);
    if(!p) return error;
    juce::AudioProcessor::BusesLayout layout;
    layout.inputBuses.add(juce::AudioChannelSet::stereo()); layout.outputBuses.add(juce::AudioChannelSet::stereo());
    if(!p->setBusesLayout(layout)) return "This host requires a stereo-in/stereo-out VST3 effect.";
    mutate([&] { plugins.push_back(std::move(p)); });
    return {};
}
void Engine::removePlugin(size_t index) {
    if(index<plugins.size() && !recording()) mutate([&] { plugins.erase(plugins.begin()+static_cast<ptrdiff_t>(index)); });
}
juce::var Engine::state() const {
    auto* object=new juce::DynamicObject; object->setProperty("version",3);
    for(const auto& p:params) object->setProperty(p.id,(tone.*p.member).load());
    object->setProperty("amp",tone.amp.load()); object->setProperty("division",tone.division.load());
    juce::Array<juce::var> enabled; for(const auto& e:tone.enabled) enabled.add(e.load()); object->setProperty("enabled",enabled);
    object->setProperty("ir",irPath);
    juce::Array<juce::var> list;
    for(auto& p:plugins) {
        juce::PluginDescription desc; p->fillInPluginDescription(desc); juce::MemoryBlock data; p->getStateInformation(data);
        auto* plugin=new juce::DynamicObject; plugin->setProperty("path",desc.fileOrIdentifier); plugin->setProperty("state",data.toBase64Encoding());
        plugin->setProperty("bypass",p->isSuspended()); list.add(juce::var(plugin));
    }
    object->setProperty("plugins",list);
    juce::Array<juce::var> sequence; for(const auto& f:frets) sequence.add(f.load()); object->setProperty("sequence",sequence);
    return juce::var(object);
}
juce::String Engine::restore(const juce::var& data) {
    if(recording()) return "Stop recording before opening a preset.";
    if(!data.isObject() || static_cast<int>(data["version"])!=3) return "This is not a Selah C++ v3 preset.";
    for(const auto& p:params) {
        const auto v=data[p.id]; const double n=static_cast<double>(v);
        if(!(v.isInt()||v.isDouble()||v.isInt64()) || !std::isfinite(n)||n<p.low||n>p.high) return "Invalid preset parameter: "+juce::String(p.id);
    }
    const auto* enabled=data["enabled"].getArray(); const auto* list=data["plugins"].getArray();
    if(!enabled || enabled->size()!=8 || !list || list->size()>16) return "Invalid preset rack.";
    for(const auto& e:*enabled) if(!e.isBool()) return "Invalid bypass state.";
    const int amp=static_cast<int>(data["amp"]), division=static_cast<int>(data["division"]);
    const auto* sequence=data["sequence"].getArray();
    if(sequence) {
        if(sequence->size()!=96) return "Invalid sequence length.";
        for(const auto& f:*sequence) if(!f.isInt() || static_cast<int>(f)<-1 || static_cast<int>(f)>24) return "Invalid fret in sequence.";
    }
    if(!data["amp"].isInt() || amp<0||amp>2 || !data["division"].isInt()||division<0||division>3) return "Invalid amp or tempo subdivision.";
    const auto ir=data["ir"].toString();
    if(ir.isNotEmpty() && !juce::File::isAbsolutePath(ir)) return "IR path must be absolute.";
    // Validate and instantiate a replacement chain before replacing the current rack.
    std::vector<std::unique_ptr<juce::AudioPluginInstance>> replacement;
    for(const auto& item:*list) {
        if(!item.isObject() || !juce::File::isAbsolutePath(item["path"].toString()) || !item["bypass"].isBool()) return "Invalid plugin entry.";
        juce::OwnedArray<juce::PluginDescription> descriptions;
        pluginFormats.getFormat(0)->findAllTypesForFile(descriptions,item["path"].toString());
        if(descriptions.isEmpty()) return "Missing VST3: "+item["path"].toString();
        juce::String error; auto p=pluginFormats.createPluginInstance(*descriptions[0],currentRate,capacity,error);
        if(!p) return error;
        juce::AudioProcessor::BusesLayout layout; layout.inputBuses.add(juce::AudioChannelSet::stereo()); layout.outputBuses.add(juce::AudioChannelSet::stereo());
        if(!p->setBusesLayout(layout)) return "Incompatible stereo VST3.";
        juce::MemoryBlock bytes;
        if(!bytes.fromBase64Encoding(item["state"].toString()) || bytes.getSize()>16*1024*1024) return "Invalid plugin state.";
        p->setStateInformation(bytes.getData(),static_cast<int>(bytes.getSize())); p->suspendProcessing(static_cast<bool>(item["bypass"]));
        replacement.push_back(std::move(p));
    }
    if(ir.isNotEmpty()) { const auto error=loadIR(juce::File(ir)); if(error.isNotEmpty()) return error; }
    mutate([&] {
        plugins=std::move(replacement);
        for(const auto& p:params) (tone.*p.member)=static_cast<float>(static_cast<double>(data[p.id]));
        for(int i=0;i<8;++i) tone.enabled[static_cast<size_t>(i)]=static_cast<bool>((*enabled)[i]);
        tone.amp=amp; tone.division=division;
        if(sequence) for(size_t i=0;i<frets.size();++i) frets[i]=static_cast<int>((*sequence)[static_cast<int>(i)]);
        if(ir.isEmpty()) { hasIR=false; irPath.clear(); }
    });
    return {};
}
double Engine::readPitch() {
    const int ready=pitchFifo.getNumReady();
    if(ready==0) return 0;
    int a,n,b,m; pitchFifo.prepareToRead(ready,a,n,b,m);
    for(int i=0;i<n;++i) pitchWindow.push_back(pitchData[static_cast<size_t>(a+i)]);
    for(int i=0;i<m;++i) pitchWindow.push_back(pitchData[static_cast<size_t>(b+i)]);
    pitchFifo.finishedRead(n+m);
    const int wanted=static_cast<int>(currentRate.load()*.09);
    if(static_cast<int>(pitchWindow.size())<wanted || !running()) return 0;
    if(static_cast<int>(pitchWindow.size())>wanted) pitchWindow.erase(pitchWindow.begin(),pitchWindow.end()-wanted);
    // Decimate to ~12 kHz to keep autocorrelation off the real-time thread inexpensive.
    const int step=std::max(1,static_cast<int>(currentRate.load()/12000));
    std::vector<float> down; down.reserve(pitchWindow.size()/static_cast<size_t>(step));
    for(size_t i=0;i+static_cast<size_t>(step)<=pitchWindow.size();i+=static_cast<size_t>(step)) {
        float sum=0; for(int j=0;j<step;++j) sum+=pitchWindow[i+static_cast<size_t>(j)]; down.push_back(sum/step);
    }
    return selah::pitch(down.data(),static_cast<int>(down.size()),currentRate.load()/step);
}
