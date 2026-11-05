// SPDX-License-Identifier: AGPL-3.0-or-later
#pragma once
#include "Engine.h"

class RackLook final : public juce::LookAndFeel_V4 {
public:
    RackLook();
    void drawRotarySlider(juce::Graphics&,int,int,int,int,float,float,float,juce::Slider&) override;
};

class Module final : public juce::Component {
public:
    Module(juce::String title,juce::String detail,juce::Colour accent,std::atomic<bool>& enabled);
    void add(juce::String name,std::atomic<float>& value,float low,float high,float step=1,juce::String suffix={});
    void sync();
    void paint(juce::Graphics&) override;
    void resized() override;
    juce::TextButton action;
    juce::ComboBox choice;
private:
    juce::String name,subtitle;
    juce::Colour colour;
    std::atomic<bool>& active;
    juce::ToggleButton power{"ON"};
    struct Control { std::unique_ptr<juce::Slider> slider; std::unique_ptr<juce::Label> label; std::atomic<float>* value; };
    std::vector<Control> controls;
};

class MainComponent final : public juce::Component, private juce::Timer {
public:
    MainComponent(); ~MainComponent() override;
    void paint(juce::Graphics&) override;
    void resized() override;
private:
    Engine engine;
    RackLook look;
    juce::Viewport viewport;
    juce::Component rack;
    std::vector<std::unique_ptr<Module>> modules;
    std::vector<std::unique_ptr<juce::TextButton>> presetButtons;
    juce::TextButton start{"Start audio"},monitor{"Monitor OFF"},audio{"Audio setup"},save{"Save preset"},open{"Open preset"},
        ir{"Load cabinet IR"},vst{"Add VST3"},pluginList{"VST3 rack"},reference{"Load reference"},play{"Play reference"},
        record{"Record WAV"},click{"Click OFF"},snapshotA{"A"},snapshotB{"B"},notes{"Notes / tabs"},arrange{"Step sequencer"};
    juce::Slider tempo;
    juce::Label status,tuner,presetTitle;
    juce::String presetName="Glass cathedral";
    juce::var snapshots[2];
    std::unique_ptr<juce::FileChooser> chooser;
    juce::OwnedArray<juce::DocumentWindow> pluginWindows;
    std::vector<juce::Component::SafePointer<juce::DialogWindow>> dialogs;
    juce::TextEditor* noteEditor=nullptr;
    juce::String notebook;
    bool shuttingDown=false;
    void timerCallback() override;
    void sync();
    void report(const juce::String&);
    void choose(juce::String title,juce::String patterns,bool saving,std::function<void(juce::File)>);
    void factoryPreset(int);
    void showAudio();
    void showPlugins();
    void showNotes();
    void snapshot(int);
    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR(MainComponent)
};
