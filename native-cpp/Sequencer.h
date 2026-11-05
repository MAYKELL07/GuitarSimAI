// SPDX-License-Identifier: AGPL-3.0-or-later
#pragma once
#include "Engine.h"
class Sequencer final : public juce::Component,private juce::Timer {
public:
    explicit Sequencer(Engine& e) : engine(e) {
        addAndMakeVisible(play); addAndMakeVisible(clear); addAndMakeVisible(exportMidi); addAndMakeVisible(help);
        play.onClick=[this] { if(engine.running()) engine.sequencing=!engine.sequencing; };
        clear.onClick=[this] { for(auto& f:engine.frets) f=-1; refresh(); };
        exportMidi.onClick=[this] { saveMidi(); };
        help.setText("One bar / 16th notes / standard tuning. Enter fret 0-24; empty = rest. Start audio in the main window to play.",juce::dontSendNotification);
        for(size_t i=0;i<cells.size();++i) {
            auto& c=cells[i]; addAndMakeVisible(c); c.setInputRestrictions(2,"0123456789");
            c.setJustification(juce::Justification::centred); c.setSelectAllWhenFocused(true);
            c.onTextChange=[this,i] { const auto t=cells[i].getText(); engine.frets[i]=t.isEmpty() ? -1 : juce::jlimit(0,24,t.getIntValue()); };
        }
        refresh(); setSize(920,420); startTimerHz(15);
    }
    ~Sequencer() override { engine.sequencing=false; }
    void paint(juce::Graphics& g) override {
        g.fillAll(juce::Colour(0xff14171c)); g.setColour(juce::Colour(0xff9cddb7));
        g.setFont(juce::Font(juce::FontOptions(13)));
        const char* strings[]={"e","B","G","D","A","E"};
        for(int row=0;row<6;++row) g.drawText(strings[row],12,85+row*42,24,32,juce::Justification::centred);
        const int width=(getWidth()-58)/16;
        for(int col=0;col<16;++col) g.drawText(juce::String(col+1),42+col*width,58,width-4,22,juce::Justification::centred);
    }
    void resized() override {
        play.setBounds(16,14,120,30); clear.setBounds(146,14,100,30); exportMidi.setBounds(256,14,130,30);
        const int width=(getWidth()-58)/16;
        for(int row=0;row<6;++row) for(int col=0;col<16;++col) cells[static_cast<size_t>(row*16+col)].setBounds(42+col*width,85+row*42,width-4,32);
        help.setBounds(16,350,getWidth()-32,44);
    }
private:
    Engine& engine;
    std::array<juce::TextEditor,96> cells;
    juce::TextButton play{"Play pattern"},clear{"Clear"},exportMidi{"Export MIDI"};
    juce::Label help;
    std::unique_ptr<juce::FileChooser> chooser;
    void refresh() { for(size_t i=0;i<cells.size();++i) cells[i].setText(engine.frets[i]<0 ? "" : juce::String(engine.frets[i].load()),false); }
    void timerCallback() override {
        play.setButtonText(engine.sequencing ? "Stop pattern" : "Play pattern");
        for(size_t i=0;i<cells.size();++i) cells[i].setColour(juce::TextEditor::outlineColourId,
            engine.sequencing && static_cast<int>(i%16)==engine.sequenceStep ? juce::Colour(0xff9cddb7) : juce::Colour(0xff30343d));
    }
    void saveMidi() {
        chooser=std::make_unique<juce::FileChooser>("Export pattern as MIDI",juce::File{},"*.mid");
        chooser->launchAsync(juce::FileBrowserComponent::saveMode|juce::FileBrowserComponent::canSelectFiles|juce::FileBrowserComponent::warnAboutOverwriting,
            [safe=juce::Component::SafePointer<Sequencer>(this)](const juce::FileChooser& fc) {
            if(!safe || fc.getResult()==juce::File{}) return;
            juce::MidiMessageSequence track;
            track.addEvent(juce::MidiMessage::tempoMetaEvent(static_cast<int>(60000000/safe->engine.tone.tempo.load())));
            constexpr int tuning[]={64,59,55,50,45,40};
            for(size_t i=0;i<96;++i) {
                int fret=safe->engine.frets[i]; if(fret<0) continue;
                const int note=tuning[i/16]+fret; const double time=static_cast<double>(i%16)*240;
                auto on=juce::MidiMessage::noteOn(1,note,static_cast<juce::uint8>(100)); on.setTimeStamp(time); track.addEvent(on);
                auto off=juce::MidiMessage::noteOff(1,note); off.setTimeStamp(time+220); track.addEvent(off);
            }
            track.updateMatchedPairs(); juce::MidiFile midi; midi.setTicksPerQuarterNote(960); midi.addTrack(track);
            auto stream=fc.getResult().withFileExtension("mid").createOutputStream();
            if(stream && stream->setPosition(0) && stream->truncate().wasOk()) midi.writeTo(*stream);
        });
    }
};
