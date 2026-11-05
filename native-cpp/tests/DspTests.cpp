// SPDX-License-Identifier: AGPL-3.0-or-later
#include "Dsp.h"
#include <iostream>
#include <limits>
#include <cstdlib>
void check(bool ok,const char* message) { if(!ok) { std::cerr<<message<<'\n'; std::exit(1); } }
int main() {
    constexpr double sr=12000;
    std::vector<float> samples(1800);
    for(double frequency:{82.4069,110.,146.832,196.,246.942,329.628,440.,880.}) {
        for(size_t i=0;i<samples.size();++i) samples[i]=static_cast<float>(.4*std::sin(2*selah::pi*frequency*i/sr)+.1*std::sin(4*selah::pi*frequency*i/sr));
        const auto hz=selah::pitch(samples.data(),static_cast<int>(samples.size()),sr);
        check(hz>0 && std::abs(1200*std::log2(hz/frequency))<3,"Tuner error exceeds 3 cents");
    }
    std::fill(samples.begin(),samples.end(),0); check(selah::pitch(samples.data(),static_cast<int>(samples.size()),sr)==0,"Silence must not produce pitch");
    check(selah::safe(std::numeric_limits<float>::infinity())==0,"Inf must become silence");
    check(selah::safe(std::numeric_limits<float>::quiet_NaN())==0,"NaN must become silence");
    for(double rate:{44100.,48000.,96000.,192000.}) {
        selah::Biquad eq; eq.peak(rate,800,0,.7);
        for(int i=0;i<10000;++i) { const float x=std::sin(i*.1f); check(std::abs(eq.tick(x)-x)<1e-6,"Flat EQ alters audio"); }
        eq.reset(); eq.lowpass(rate,6500); double energy=0;
        for(int i=0;i<200000;++i) { float y=eq.tick(i==0?1.f:0.f); check(std::isfinite(y),"Cab filter became unstable"); energy+=y*y; }
        check(energy>0 && energy<1,"Cab filter impulse has invalid energy");
        selah::StereoDelay delay; delay.prepare(rate);
        for(int i=0;i<static_cast<int>(rate*5);++i) { float l=i==0?1.f:0.f,r=l; delay.tick(l,r,.25f,.85f,.5f); check(std::isfinite(l)&&std::abs(l)<=1,"Delay unstable at max feedback"); }
    }
    selah::StereoDelay delay; delay.prepare(48000); float total=0;
    for(int i=0;i<48000;++i) { float l=i==0?1.f:0.f,r=0; delay.tick(l,r,.25f,.5f,1); total+=std::abs(l)+std::abs(r); }
    check(total>1,"Delay did not emit echoes");
    std::cout<<"DSP passed: 8 pitches, silence, finite guard, EQ and delay at four sample rates.\n";
}
