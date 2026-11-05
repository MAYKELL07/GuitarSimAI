// SPDX-License-Identifier: AGPL-3.0-or-later
#include "MainComponent.h"
#include "tests/EngineChecks.h"
class SelahApplication final : public juce::JUCEApplication {
public:
    const juce::String getApplicationName() override { return "Selah"; }
    const juce::String getApplicationVersion() override { return "3.0.0"; }
    bool moreThanOneInstanceAllowed() override { return false; }
    void initialise(const juce::String& commandLine) override {
        if(commandLine.startsWith("--self-test ")) {
            auto result=runEngineChecks();
            juce::File(commandLine.fromFirstOccurrenceOf("--self-test ",false,false).unquoted()).replaceWithText(result.isEmpty() ? "PASS: preset validation, 4 sample rates, 3 amp voices, finite output, silence, sequencer, oversized callback." : "FAIL: "+result);
            setApplicationReturnValue(result.isEmpty() ? 0 : 1); quit(); return;
        }
        window=std::make_unique<Window>();
        // Offline visual QA: no device is opened and no input is monitored.
        if(commandLine.startsWith("--screenshot ")) {
            auto path=commandLine.fromFirstOccurrenceOf("--screenshot ",false,false).unquoted();
            juce::Timer::callAfterDelay(1200,[this,path] {
                auto image=window->getContentComponent()->createComponentSnapshot(window->getContentComponent()->getLocalBounds());
                juce::File file(path); file.getParentDirectory().createDirectory();
                if(auto stream=file.createOutputStream()) { juce::PNGImageFormat png; png.writeImageToStream(image,*stream); }
                quit();
            });
        }
    }
    void shutdown() override { window.reset(); }
    void systemRequestedQuit() override { quit(); }
    void anotherInstanceStarted(const juce::String&) override { if(window) window->toFront(true); }
private:
    class Window final : public juce::DocumentWindow {
    public:
        Window() : DocumentWindow("SELAH / Native guitar workstation",juce::Colour(0xff111318),allButtons) {
            setUsingNativeTitleBar(true); setContentOwned(new MainComponent,true); setResizable(true,false);
            setResizeLimits(1050,720,2400,1600); centreWithSize(1360,900); setVisible(true);
        }
        void closeButtonPressed() override { juce::JUCEApplication::getInstance()->systemRequestedQuit(); }
    };
    std::unique_ptr<Window> window;
};
START_JUCE_APPLICATION(SelahApplication)
