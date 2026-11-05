// SPDX-License-Identifier: AGPL-3.0-or-later
#include "MainComponent.h"
#include "Sequencer.h"
namespace {
const juce::Colour bg{0xff101216},panel{0xff1a1d23},line{0xff30343d},text{0xffe6e8ed},muted{0xff8a929f},mint{0xff9cddb7};
juce::Font font(float size,bool bold=false) { return juce::Font(juce::FontOptions(size,bold ? juce::Font::bold : juce::Font::plain)); }
struct Preset { const char* name; const char* tag; float drive,bass,mid,treble,chorus,delay,feedback,reverb,decay; int amp,division; };
const Preset presets[]={
    {"Glass cathedral","WORSHIP",14,-1,1,3,12,34,38,42,65,0,1},
    {"Velvet clean","CLEAN",3,2,-1,-2,0,8,18,18,32,0,2},
    {"Sunday rhythm","EDGE OF BREAKUP",30,-2,2,1,0,18,26,26,48,1,1},
    {"Blue hour","BLUES",38,2,3,-2,0,12,20,16,30,1,2},
    {"Copper stack","ROCK",62,-2,3,2,0,0,20,10,20,1,2},
    {"Black current","HIGH GAIN",82,-4,1,2,0,8,15,9,20,2,2},
    {"Neon chorus","MODULATION",8,-1,-1,3,65,20,26,22,44,0,2},
    {"Distant shores","AMBIENT",15,-2,0,-1,32,50,62,65,90,0,3},
    {"Dotted horizon","RHYTHMIC",22,-1,2,2,8,42,44,28,58,0,1},
    {"Pocket funk","PERCUSSIVE",2,-3,2,4,0,0,0,8,15,0,0},
    {"Singing wire","LEAD",60,-1,4,0,12,28,35,30,58,2,2},
    {"Dry DI","UTILITY",0,0,0,0,0,0,0,0,0,0,2}
};
class PluginWindow final : public juce::DocumentWindow {
public:
    PluginWindow(juce::AudioPluginInstance& p) : DocumentWindow(p.getName(),panel,closeButton) {
        setUsingNativeTitleBar(true);
        if(auto* editor=p.createEditorIfNeeded()) setContentOwned(editor,true);
        else setContentOwned(new juce::GenericAudioProcessorEditor(p),true);
        centreWithSize(getWidth(),getHeight()); setResizable(true,false); setVisible(true);
    }
    void closeButtonPressed() override { setVisible(false); }
};
}
RackLook::RackLook() {
    setColour(juce::ResizableWindow::backgroundColourId,bg);
    setColour(juce::TextButton::buttonColourId,panel); setColour(juce::TextButton::textColourOffId,text);
    setColour(juce::TextButton::buttonOnColourId,mint.darker(.6f)); setColour(juce::TextButton::textColourOnId,juce::Colours::white);
    setColour(juce::Label::textColourId,text); setColour(juce::ComboBox::backgroundColourId,juce::Colour(0xff111318));
    setColour(juce::ComboBox::outlineColourId,line); setColour(juce::ComboBox::textColourId,text);
    setColour(juce::Slider::textBoxOutlineColourId,juce::Colours::transparentBlack);
    setColour(juce::Slider::textBoxTextColourId,text); setColour(juce::Slider::textBoxBackgroundColourId,juce::Colours::transparentBlack);
    setColour(juce::TextEditor::backgroundColourId,bg); setColour(juce::TextEditor::textColourId,text);
    setColour(juce::PopupMenu::backgroundColourId,panel); setColour(juce::PopupMenu::textColourId,text);
}
void RackLook::drawRotarySlider(juce::Graphics& g,int x,int y,int w,int h,float pos,float startAngle,float endAngle,juce::Slider& s) {
    auto rect=juce::Rectangle<float>(static_cast<float>(x),static_cast<float>(y),static_cast<float>(w),static_cast<float>(h)).reduced(6);
    const auto size=std::min(rect.getWidth(),rect.getHeight()); rect=rect.withSizeKeepingCentre(size,size);
    const auto center=rect.getCentre(); const float radius=size*.5f;
    g.setColour(juce::Colour(0xff0d0f13)); g.fillEllipse(rect);
    juce::Path track; track.addCentredArc(center.x,center.y,radius-2,radius-2,0,startAngle,endAngle,true);
    g.setColour(line); g.strokePath(track,juce::PathStrokeType(2.5f));
    const float angle=startAngle+pos*(endAngle-startAngle);
    juce::Path fill; fill.addCentredArc(center.x,center.y,radius-2,radius-2,0,startAngle,angle,true);
    g.setColour(s.findColour(juce::Slider::rotarySliderFillColourId)); g.strokePath(fill,juce::PathStrokeType(2.5f));
    g.setColour(juce::Colour(0xff292d35)); g.fillEllipse(rect.reduced(7));
    g.setColour(text); g.drawLine(center.x+std::sin(angle)*radius*.35f,center.y-std::cos(angle)*radius*.35f,
        center.x+std::sin(angle)*radius*.65f,center.y-std::cos(angle)*radius*.65f,2);
}
Module::Module(juce::String title,juce::String detail,juce::Colour accent,std::atomic<bool>& enabled)
    : name(title),subtitle(detail),colour(accent),active(enabled) {
    addAndMakeVisible(power); power.setToggleState(active,juce::dontSendNotification);
    power.onClick=[this] { active=power.getToggleState(); repaint(); };
    if(name.startsWith("08")) power.setVisible(false);
    addChildComponent(action); addChildComponent(choice);
}
void Module::add(juce::String label,std::atomic<float>& value,float low,float high,float step,juce::String suffix) {
    Control c{std::make_unique<juce::Slider>(),std::make_unique<juce::Label>(),&value};
    c.slider->setSliderStyle(juce::Slider::RotaryHorizontalVerticalDrag);
    c.slider->setTextBoxStyle(juce::Slider::TextBoxBelow,false,72,20); c.slider->setRange(low,high,step);
    c.slider->setValue(value,juce::dontSendNotification); c.slider->setTextValueSuffix(suffix);
    c.slider->setDoubleClickReturnValue(true,value); c.slider->setColour(juce::Slider::rotarySliderFillColourId,colour);
    c.slider->onValueChange=[p=c.slider.get(),&value] { value=static_cast<float>(p->getValue()); };
    c.label->setText(label.toUpperCase(),juce::dontSendNotification); c.label->setFont(font(10,true)); c.label->setJustificationType(juce::Justification::centred);
    c.label->setColour(juce::Label::textColourId,muted); addAndMakeVisible(*c.slider); addAndMakeVisible(*c.label); controls.push_back(std::move(c));
}
void Module::sync() {
    power.setToggleState(active,juce::dontSendNotification);
    for(auto& c:controls) c.slider->setValue(c.value->load(),juce::dontSendNotification);
    repaint();
}
void Module::paint(juce::Graphics& g) {
    auto b=getLocalBounds().toFloat().reduced(.5f); g.setColour(panel); g.fillRoundedRectangle(b,8);
    g.setColour(active ? colour.withAlpha(.45f) : line); g.drawRoundedRectangle(b,8,1);
    g.setColour(active ? colour : muted); g.fillRoundedRectangle(0,16,3,static_cast<float>(getHeight()-32),1);
    g.setFont(font(17,true)); g.drawText(name,20,18,210,25,juce::Justification::centredLeft);
    g.setColour(muted); g.setFont(font(11)); g.drawText(subtitle,20,46,210,40,juce::Justification::topLeft,true);
}
void Module::resized() {
    power.setBounds(getWidth()-68,12,62,24);
    const int start=240, width=78;
    for(size_t i=0;i<controls.size();++i) {
        int x=start+static_cast<int>(i)*width;
        controls[i].label->setBounds(x,10,width,17); controls[i].slider->setBounds(x,28,width,83);
    }
    action.setBounds(20,82,195,25); choice.setBounds(20,82,195,25);
}
MainComponent::MainComponent() {
    setLookAndFeel(&look); setSize(1360,860);
    auto addButton=[this](juce::TextButton& b) { addAndMakeVisible(b); };
    for(auto* b:{&start,&monitor,&audio,&save,&open,&ir,&vst,&pluginList,&reference,&play,&record,&click,&snapshotA,&snapshotB,&notes,&arrange}) addButton(*b);
    addAndMakeVisible(status); addAndMakeVisible(tuner); addAndMakeVisible(presetTitle); addAndMakeVisible(tempo);
    status.setFont(font(12)); status.setColour(juce::Label::textColourId,muted);
    tuner.setFont(font(17,true)); tuner.setColour(juce::Label::textColourId,mint);
    presetTitle.setFont(font(25,true));
    tempo.setSliderStyle(juce::Slider::IncDecButtons); tempo.setTextBoxStyle(juce::Slider::TextBoxLeft,false,65,26);
    tempo.setRange(40,240,1); tempo.setValue(100); tempo.setTextValueSuffix(" BPM");
    tempo.onValueChange=[this] { engine.tone.tempo=static_cast<float>(tempo.getValue()); };
    viewport.setViewedComponent(&rack,false); viewport.setScrollBarsShown(true,false); addAndMakeVisible(viewport);
    auto module=[&](juce::String name,juce::String detail,juce::Colour color,int index)->Module& {
        auto m=std::make_unique<Module>(name,detail,color,engine.tone.enabled[static_cast<size_t>(index)]); rack.addAndMakeVisible(*m); modules.push_back(std::move(m)); return *modules.back();
    };
    auto& gate=module("01 / Input & gate","Keep the attack. Quiet the space.",mint,0);
    gate.add("Preamp",engine.tone.input,-24,36,1," dB"); gate.add("Threshold",engine.tone.gate,-90,-20,1," dB");
    auto& comp=module("02 / Compressor","A little weight behind every note.",juce::Colour(0xffe7c48b),1);
    comp.add("Amount",engine.tone.compression,0,100,1," %");
    auto& amp=module("03 / Amplifier","2x oversampling / three voices",juce::Colour(0xffdf957b),2);
    amp.add("Drive",engine.tone.drive,0,100,1," %");
    amp.choice.addItemList({"American / clean","British / crunch","Modern / high gain"},1); amp.choice.setVisible(true); amp.choice.setSelectedId(1);
    amp.choice.onChange=[this,&amp] { engine.tone.amp=amp.choice.getSelectedId()-1; };
    auto& cab=module("04 / Cabinet & EQ","Convolution IR / three-band tone",juce::Colour(0xffb9c989),3);
    cab.add("Bass",engine.tone.bass,-12,12,.5," dB"); cab.add("Mid",engine.tone.mid,-12,12,.5," dB"); cab.add("Treble",engine.tone.treble,-12,12,.5," dB");
    cab.action.setButtonText("Load cabinet IR..."); cab.action.setVisible(true); cab.action.onClick=[this] { ir.triggerClick(); };
    auto& chorus=module("05 / Stereo chorus","Slow movement. A wider horizon.",juce::Colour(0xff8bb9df),4);
    chorus.add("Mix",engine.tone.chorus,0,100,1," %");
    auto& delay=module("06 / Ping-pong delay","Tempo-locked stereo repeats",juce::Colour(0xffb1a2e5),5);
    delay.add("Mix",engine.tone.delay,0,100,1," %"); delay.add("Feedback",engine.tone.feedback,0,85,1," %");
    delay.choice.addItemList({"Eighth note","Dotted eighth","Quarter note","Dotted quarter"},1); delay.choice.setVisible(true); delay.choice.setSelectedId(2);
    delay.choice.onChange=[this,&delay] { engine.tone.division=delay.choice.getSelectedId()-1; };
    auto& reverb=module("07 / Space reverb","Stereo algorithmic ambience",juce::Colour(0xffcc9dcc),6);
    reverb.add("Mix",engine.tone.reverb,0,100,1," %"); reverb.add("Size",engine.tone.decay,0,100,1," %");
    auto& out=module("08 / Master output","Always-on output ceiling / -0.18 dBFS",mint,7);
    out.add("Output",engine.tone.output,-60,6,1," dB");
    for(size_t i=0;i<std::size(presets);++i) {
        auto b=std::make_unique<juce::TextButton>(presets[i].name); b->setTooltip(presets[i].tag);
        b->onClick=[this,i] { factoryPreset(static_cast<int>(i)); }; addAndMakeVisible(*b); presetButtons.push_back(std::move(b));
    }
    start.onClick=[this] {
        if(engine.running()) { engine.stop(); report("Audio stopped. Recordings have been flushed to disk."); }
        else report(engine.start()); sync();
    };
    monitor.onClick=[this] { if(!engine.running()) { report("Start audio, then enable monitoring."); return; } engine.monitoring=!engine.monitoring; sync(); };
    audio.onClick=[this] { showAudio(); };
    ir.onClick=[this] { choose("Load cabinet impulse response","*.wav;*.aif;*.aiff",false,[this](juce::File f) { report(engine.loadIR(f)); }); };
    reference.onClick=[this] { choose("Load reference audio","*.wav;*.aif;*.aiff;*.flac;*.mp3;*.ogg",false,[this](juce::File f) { report(engine.loadReference(f)); }); };
    play.onClick=[this] { engine.playReference(!engine.referencePlaying()); sync(); };
    record.onClick=[this] {
        if(engine.recording()) { engine.stopRecording(); report("24-bit stereo WAV saved."); sync(); }
        else choose("Record processed output to WAV","*.wav",true,[this](juce::File f) { report(engine.record(f.withFileExtension("wav"))); sync(); });
    };
    click.onClick=[this] { engine.metronome=!engine.metronome; sync(); };
    save.onClick=[this] { choose("Save Selah preset","*.selah.json",true,[this](juce::File f) {
        if(!f.hasFileExtension("json")) f=f.withFileExtension("selah.json");
        auto data=engine.state(); data.getDynamicObject()->setProperty("name",presetName); data.getDynamicObject()->setProperty("notes",notebook);
        const auto json=juce::JSON::toString(data);
        if(json.getNumBytesAsUTF8()>24*1024*1024) { report("Preset exceeds the 24 MB limit; remove large-state plugins first."); return; }
        report(f.replaceWithText(json) ? juce::String{} : "Cannot save preset.");
    }); };
    open.onClick=[this] { choose("Open Selah C++ preset","*.json",false,[this](juce::File f) {
        if(f.getSize()>24*1024*1024) { report("Preset is larger than 24 MB."); return; }
        pluginWindows.clear(); auto data=juce::JSON::parse(f); const auto error=engine.restore(data); report(error);
        if(error.isEmpty()) { presetName=data["name"].toString(); notebook=data["notes"].toString(); sync(); }
    }); };
    vst.onClick=[this] { choose("Load a trusted 64-bit VST3 effect","*.vst3",false,[this](juce::File f) { pluginWindows.clear(); report(engine.addPlugin(f)); }); };
    pluginList.onClick=[this] { showPlugins(); };
    notes.onClick=[this] { showNotes(); };
    arrange.onClick=[this] {
        juce::DialogWindow::LaunchOptions options; options.content.setOwned(new Sequencer(engine)); options.dialogTitle="Arrangement / native plucked-string sequencer";
        options.dialogBackgroundColour=panel; options.useNativeTitleBar=true; options.resizable=true; options.componentToCentreAround=this; dialogs.emplace_back(options.launchAsync());
    };
    snapshotA.onClick=[this] { snapshot(0); }; snapshotB.onClick=[this] { snapshot(1); };
    snapshotA.setTooltip("Click to capture; click again to recall. Shift-click replaces."); snapshotB.setTooltip(snapshotA.getTooltip());
    factoryPreset(0); report("Native C++ engine ready. Open Audio setup, select your interface, then Start audio."); startTimerHz(12);
}
MainComponent::~MainComponent() { shuttingDown=true; stopTimer(); for(auto& dialog:dialogs) if(dialog) delete dialog.getComponent(); pluginWindows.clear(); engine.stop(); setLookAndFeel(nullptr); }
void MainComponent::report(const juce::String& error) { status.setText(error.isEmpty() ? "Ready / changes applied locally" : error,juce::dontSendNotification); }
void MainComponent::choose(juce::String title,juce::String patterns,bool saving,std::function<void(juce::File)> callback) {
    if(chooser) return;
    chooser=std::make_unique<juce::FileChooser>(title,juce::File::getSpecialLocation(juce::File::userDocumentsDirectory),patterns,true);
    auto flags=juce::FileBrowserComponent::canSelectFiles|(saving ? juce::FileBrowserComponent::saveMode|juce::FileBrowserComponent::warnAboutOverwriting : juce::FileBrowserComponent::openMode);
    if(patterns=="*.vst3") flags|=juce::FileBrowserComponent::canSelectDirectories;
    chooser->launchAsync(flags,[safe=juce::Component::SafePointer<MainComponent>(this),callback](const juce::FileChooser& fc) {
        if(!safe) return; const auto f=fc.getResult();
        if(f!=juce::File{}) callback(f);
        juce::MessageManager::callAsync([safe] { if(safe) safe->chooser.reset(); });
    });
}
void MainComponent::sync() {
    for(auto& m:modules) m->sync();
    modules[2]->choice.setSelectedId(engine.tone.amp+1,juce::dontSendNotification);
    modules[5]->choice.setSelectedId(engine.tone.division+1,juce::dontSendNotification);
    tempo.setValue(engine.tone.tempo,juce::dontSendNotification); presetTitle.setText(presetName,juce::dontSendNotification);
    start.setButtonText(engine.running() ? "Stop audio" : "Start audio");
    monitor.setButtonText(engine.monitoring ? "Monitor ON" : "Monitor OFF"); monitor.setToggleState(engine.monitoring,juce::dontSendNotification);
    play.setButtonText(engine.referencePlaying() ? "Pause reference" : "Play reference"); record.setButtonText(engine.recording() ? "Stop recording" : "Record WAV");
    record.setToggleState(engine.recording(),juce::dontSendNotification); click.setButtonText(engine.metronome ? "Click ON" : "Click OFF");
    for(auto* b:{&audio,&save,&open,&vst,&ir,&pluginList,&snapshotA,&snapshotB}) b->setEnabled(!engine.recording());
    repaint();
}
void MainComponent::factoryPreset(int index) {
    const auto& p=presets[index]; auto& t=engine.tone;
    t.drive=p.drive; t.bass=p.bass; t.mid=p.mid; t.treble=p.treble; t.chorus=p.chorus; t.delay=p.delay; t.feedback=p.feedback; t.reverb=p.reverb; t.decay=p.decay; t.amp=p.amp; t.division=p.division;
    for(auto& e:t.enabled) e=true;
    if(index==11) for(size_t i=0;i<7;++i) t.enabled[i]=false;
    presetName=p.name; sync(); report("Factory tone loaded. User cabinet IR and VST3 inserts are retained.");
}
void MainComponent::snapshot(int index) {
    if(snapshots[index].isVoid() || juce::ModifierKeys::getCurrentModifiers().isShiftDown()) {
        snapshots[index]=engine.state(); report("Snapshot captured. Click again to recall; Shift-click replaces it.");
    } else { pluginWindows.clear(); report(engine.restore(snapshots[index])); sync(); }
}
void MainComponent::showAudio() {
    if(engine.recording()) return;
    // Open the actual driver dialog. Initialisation is explicit; monitoring stays off.
    if(!engine.running()) report(engine.start());
    engine.monitoring=false; sync();
    auto* selector=new juce::AudioDeviceSelectorComponent(engine.devices,1,1,2,2,false,false,true,false);
    selector->setSize(620,500);
    juce::DialogWindow::LaunchOptions options; options.content.setOwned(selector); options.dialogTitle="Audio setup / interface, driver, sample rate & buffer";
    options.dialogBackgroundColour=panel; options.useNativeTitleBar=true; options.resizable=false; options.componentToCentreAround=this; dialogs.emplace_back(options.launchAsync());
}
void MainComponent::showPlugins() {
    juce::PopupMenu menu;
    if(engine.plugins.empty()) menu.addItem(1,"No inserts / Add VST3...",true);
    for(size_t i=0;i<engine.plugins.size();++i) {
        auto& p=engine.plugins[i]; juce::PopupMenu sub;
        sub.addItem(100+static_cast<int>(i)*4,"Open editor");
        sub.addItem(101+static_cast<int>(i)*4,"Bypass",true,p->isSuspended());
        sub.addItem(102+static_cast<int>(i)*4,"Remove");
        menu.addSubMenu(juce::String(static_cast<int>(i)+1)+" / "+p->getName()+" / "+juce::String(p->getLatencySamples())+" samples",sub);
    }
    menu.showMenuAsync(juce::PopupMenu::Options().withTargetComponent(&pluginList),[safe=juce::Component::SafePointer<MainComponent>(this)](int id) {
        if(!safe || id==0) return;
        if(id==1) { safe->vst.triggerClick(); return; }
        auto index=static_cast<size_t>((id-100)/4); if(index>=safe->engine.plugins.size()) return;
        auto& p=*safe->engine.plugins[index];
        if((id-100)%4==0) { safe->pluginWindows.clear(); safe->pluginWindows.add(new PluginWindow(p)); }
        if((id-100)%4==1) safe->engine.mutate([&] { p.suspendProcessing(!p.isSuspended()); });
        if((id-100)%4==2) { safe->pluginWindows.clear(); safe->engine.removePlugin(index); }
    });
}
void MainComponent::showNotes() {
    auto* editor=new juce::TextEditor; editor->setMultiLine(true); editor->setReturnKeyStartsNewLine(true); editor->setFont(font(15));
    editor->setText(notebook.isEmpty() ? "Session notes / tablature\n\ne|----------------|\nB|----------------|\nG|----------------|\nD|----------------|\nA|----------------|\nE|----------------|\n\nNotes are stored with Save preset.\n" : notebook);
    editor->onTextChange=[safe=juce::Component::SafePointer<MainComponent>(this),editor] { if(safe) safe->notebook=editor->getText(); };
    editor->setSize(720,460);
    juce::DialogWindow::LaunchOptions options; options.content.setOwned(editor); options.dialogTitle="Session notebook / tabs";
    options.dialogBackgroundColour=panel; options.useNativeTitleBar=true; options.resizable=true; options.componentToCentreAround=this; dialogs.emplace_back(options.launchAsync());
}
void MainComponent::timerCallback() {
    const auto hz=engine.readPitch();
    if(hz>0) {
        const double midi=69+12*std::log2(hz/440); const int note=static_cast<int>(std::round(midi));
        const juce::String names[]={"C","C#","D","D#","E","F","F#","G","G#","A","A#","B"};
        tuner.setText(names[(note%12+12)%12]+juce::String(note/12-1)+"    "+juce::String((midi-note)*100,0)+" cents    "+juce::String(hz,1)+" Hz",juce::dontSendNotification);
    } else tuner.setText("TUNER / Pluck one string",juce::dontSendNotification);
    start.setButtonText(engine.running() ? "Stop audio" : "Start audio");
    play.setButtonText(engine.referencePlaying() ? "Pause reference" : "Play reference");
    repaint(juce::Rectangle<int>(0,getHeight()-80,getWidth(),80));
}
void MainComponent::paint(juce::Graphics& g) {
    g.fillAll(bg); g.setColour(juce::Colour(0xff14171c)); g.fillRect(0,0,226,getHeight());
    g.setColour(line); g.drawHorizontalLine(77,0,static_cast<float>(getWidth())); g.drawVerticalLine(225,0,static_cast<float>(getHeight()-84));
    g.setColour(text); g.setFont(font(27,true)); g.drawText("S E L A H",24,20,190,31,juce::Justification::centredLeft);
    g.setColour(muted); g.setFont(font(10,true)); g.drawText("NATIVE GUITAR WORKSTATION",250,20,330,20,juce::Justification::centredLeft);
    g.setFont(font(11,true)); g.drawText("TONE COLLECTION",24,100,180,22,juce::Justification::centredLeft);
    g.setFont(font(11)); g.drawText("12 starting points. Your own sound.",24,125,190,20,juce::Justification::centredLeft);
    g.setColour(mint); g.setFont(font(10,true)); g.drawText("THE SIGNAL PATH",250,91,200,18,juce::Justification::centredLeft);
    g.setColour(muted); g.setFont(font(11)); g.drawText("INPUT  >  GATE  >  COMP  >  AMP  >  VST3  >  CAB  >  CHORUS  >  DELAY  >  SPACE",250,151,getWidth()-270,24,juce::Justification::centredLeft);
    g.setColour(line); g.drawHorizontalLine(getHeight()-84,0,static_cast<float>(getWidth()));
    g.setColour(muted); g.setFont(font(10));
    g.drawText("3.0 / C++   |   No browser runtime",24,getHeight()-132,195,20,juce::Justification::centredLeft);
    auto meter=[&](int x,float value,const juce::String& label) {
        const int y=getHeight()-64; g.setColour(muted); g.setFont(font(10,true)); g.drawText(label,x,y-2,65,16,juce::Justification::centredLeft);
        g.setColour(line); g.fillRoundedRectangle(static_cast<float>(x),static_cast<float>(y+21),150,5,2);
        g.setColour(value>.9f ? juce::Colour(0xffdf957b) : mint);
        const float normalized=std::clamp((20*std::log10(std::max(value,.001f))+60)/60,0.f,1.f);
        g.fillRoundedRectangle(static_cast<float>(x),static_cast<float>(y+21),150*normalized,5,2);
    };
    meter(24,engine.inputPeak,"INPUT"); meter(195,engine.outputPeak,"OUTPUT");
    juce::String info="Audio stopped";
    if(auto* device=engine.devices.getCurrentAudioDevice()) {
        info=juce::String(device->getCurrentSampleRate()/1000.,1)+" kHz / "+juce::String(device->getCurrentBufferSizeSamples())+" samples / CPU "+juce::String(engine.devices.getCpuUsage()*100,1)+"%";
        info+=" / I/O "+juce::String(1000.*(device->getInputLatencyInSamples()+device->getOutputLatencyInSamples())/device->getCurrentSampleRate(),1)+" ms";
    }
    g.setColour(muted); g.setFont(font(11)); g.drawText(info,370,getHeight()-40,getWidth()-390,20,juce::Justification::centredLeft);
    if(engine.clipped>0 || engine.recordOverruns>0 || engine.oversized>0) {
        g.setColour(juce::Colour(0xffdf957b)); g.drawText("Ceiling hits: "+juce::String(engine.clipped.load())+" / Record drops: "+juce::String(engine.recordOverruns.load())+" / Buffer faults: "+juce::String(engine.oversized.load()),370,getHeight()-21,getWidth()-390,18,juce::Justification::centredLeft);
    }
}
void MainComponent::resized() {
    int right=getWidth()-20;
    for(auto* b:{&audio,&monitor,&start}) { b->setBounds(right-116,24,110,30); right-=124; }
    presetTitle.setBounds(248,112,getWidth()-660,34);
    save.setBounds(getWidth()-260,114,112,30); open.setBounds(getWidth()-140,114,118,30);
    const int presetSpacing=std::min(36,(getHeight()-390)/12);
    for(size_t i=0;i<presetButtons.size();++i) presetButtons[i]->setBounds(18,160+static_cast<int>(i)*presetSpacing,190,presetSpacing-5);
    notes.setBounds(24,getHeight()-178,178,30); arrange.setBounds(24,getHeight()-216,178,30);
    const int contentWidth=getWidth()-270;
    viewport.setBounds(246,190,contentWidth,getHeight()-390);
    rack.setSize(contentWidth-18,static_cast<int>(modules.size())*128);
    for(size_t i=0;i<modules.size();++i) modules[i]->setBounds(0,static_cast<int>(i)*128,rack.getWidth(),118);
    const int y=getHeight()-184;
    vst.setBounds(246,y,112,28); pluginList.setBounds(366,y,112,28); ir.setBounds(486,y,130,28);
    snapshotA.setBounds(628,y,32,28); snapshotB.setBounds(666,y,32,28); tempo.setBounds(getWidth()-174,y,152,28);
    reference.setBounds(246,y+39,130,28); play.setBounds(384,y+39,130,28); record.setBounds(522,y+39,130,28); click.setBounds(660,y+39,90,28);
    status.setBounds(246,y+74,getWidth()-270,20);
    tuner.setBounds(370,getHeight()-73,getWidth()-390,27);
}
