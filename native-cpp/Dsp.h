// SPDX-License-Identifier: AGPL-3.0-or-later
#pragma once
#include <algorithm>
#include <array>
#include <cmath>
#include <vector>

namespace selah {
constexpr double pi = 3.14159265358979323846;
inline float dbGain(float db) { return std::pow(10.0f, db / 20.0f); }
inline float safe(float x) { return std::isfinite(x) ? x : 0.0f; }

struct Biquad {
    double b0=1,b1=0,b2=0,a1=0,a2=0,z1=0,z2=0;
    void reset() { z1=z2=0; }
    void peak(double sr, double hz, double db, double q) {
        hz=std::clamp(hz, 20.0, sr*.45);
        const double a=std::pow(10., db/40.), w=2*pi*hz/sr;
        const double alpha=std::sin(w)/(2*std::clamp(q,.2,10.)), d=1+alpha/a;
        b0=(1+alpha*a)/d; b1=-2*std::cos(w)/d; b2=(1-alpha*a)/d;
        a1=b1; a2=(1-alpha/a)/d;
    }
    void lowpass(double sr, double hz) {
        const double w=2*pi*std::clamp(hz,20.,sr*.45)/sr, c=std::cos(w), a=std::sin(w)/std::sqrt(2.), d=1+a;
        b0=(1-c)*.5/d; b1=(1-c)/d; b2=b0; a1=-2*c/d; a2=(1-a)/d;
    }
    float tick(float x) {
        const double y=b0*x+z1; z1=b1*x-a1*y+z2; z2=b2*x-a2*y;
        return static_cast<float>(y);
    }
};

// Autocorrelation with sub-sample interpolation. Called by UI, never by audio callback.
inline double pitch(const float* samples, int size, double sr) {
    double energy=0, mean=0;
    for(int i=0;i<size;++i) mean+=samples[i];
    mean/=size;
    std::vector<double> x(static_cast<size_t>(size));
    for(int i=0;i<size;++i) { x[i]=samples[i]-mean; energy+=x[i]*x[i]; }
    if(energy/size < 1e-7) return 0;
    const int first=static_cast<int>(sr/1300), last=std::min(size/2,static_cast<int>(sr/55));
    auto correlation=[&](int lag) {
        double sum=0,a=0,b=0;
        for(int i=0;i<size-lag;++i) { sum+=x[i]*x[i+lag]; a+=x[i]*x[i]; b+=x[i+lag]*x[i+lag]; }
        return sum/std::sqrt(std::max(1e-20,a*b));
    };
    double prev=correlation(first), best=0; int bestLag=0;
    for(int lag=first+1;lag<last;++lag) {
        const auto c=correlation(lag), next=correlation(lag+1);
        if(c>prev && c>next && c>.88) { bestLag=lag; best=c; break; }
        prev=c;
    }
    if(bestLag==0) return 0;
    const auto l=correlation(bestLag-1), r=correlation(bestLag+1), d=l-2*best+r;
    const double offset=std::abs(d)>1e-12 ? .5*(l-r)/d : 0;
    return sr/(bestLag+offset);
}

class StereoDelay {
    std::array<std::vector<float>,2> data;
    size_t pos=0;
    double sampleRate=48000;
    float delaySamples=24000;
public:
    void prepare(double sr) { sampleRate=sr; for(auto& c:data)c.assign(static_cast<size_t>(sr*4)+2,0); pos=0; delaySamples=static_cast<float>(sr*.5); }
    void tick(float& l,float& r,float seconds,float feedback,float mix) {
        delaySamples+=.001f*(std::clamp(seconds*static_cast<float>(sampleRate),1.f,static_cast<float>(data[0].size()-2))-delaySamples);
        double read=static_cast<double>(pos)-delaySamples; if(read<0) read+=data[0].size();
        auto i=static_cast<size_t>(read); auto j=(i+1)%data[0].size(); auto f=static_cast<float>(read-i);
        const float dl=data[0][i]*(1-f)+data[0][j]*f, dr=data[1][i]*(1-f)+data[1][j]*f;
        feedback=std::clamp(feedback,0.f,.85f); mix=std::clamp(mix,0.f,1.f);
        data[0][pos]=l+dr*feedback; data[1][pos]=r+dl*feedback;
        l=l*(1-mix)+dl*mix; r=r*(1-mix)+dr*mix; pos=(pos+1)%data[0].size();
    }
};

class PluckedString {
    std::array<float,4096> ring{};
    int length=2,pos=0; unsigned int random=0x12345;
    float level=0;
public:
    void reset() { ring.fill(0); level=0; pos=0; }
    void pluck(double sr,int midi) {
        length=std::clamp(static_cast<int>(sr/(440*std::pow(2.,(midi-69)/12.))),2,4096);
        pos=0; level=1;
        for(int i=0;i<length;++i) { random=random*1664525u+1013904223u; ring[static_cast<size_t>(i)]=(static_cast<float>(random>>8)/16777216.f-.5f)*.35f; }
    }
    float tick() {
        const auto i=static_cast<size_t>(pos),j=static_cast<size_t>((pos+1)%length);
        const float sample=ring[i]; ring[i]=.497f*(sample+ring[j]); pos=(pos+1)%length;
        return sample*level;
    }
};
}
