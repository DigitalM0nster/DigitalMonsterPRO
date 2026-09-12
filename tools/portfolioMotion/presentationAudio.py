"""Quiet harmonic bed, digital-wave ambience, and motion-led spatial Foley."""
import json
import numpy as np
from individualMusic import RATE, decode, write_wav, SFX
from showreel import ROOT


def make_audio(ffmpeg, folder, duration, gestures, variant=0, music_enabled=True, wave_gain=1,
               movement_style='legacy', movement_gain=1):
    n = round(duration*RATE); t = np.arange(n)/RATE
    rng = np.random.default_rng(605+variant*37)
    music = np.zeros((n,2),np.float32)
    # Barely audible sustained harmony; no drum loop or trailer-style impacts.
    chords = [(57,64,68,71),(53,60,64,69),(55,62,66,69),(52,59,64,68)]
    if variant:
        shifts={1:2,2:-2,3:5,4:-5,5:7,6:-3}
        chords=[tuple(n+shifts[variant] for n in chord) for chord in chords[variant%4:]+chords[:variant%4]]
    for k,start in enumerate(np.arange(-1,duration,8) if music_enabled else []):
        a=max(0,round(start*RATE));b=min(n,round((start+10)*RATE));local=t[a:b]-start
        env=np.minimum(np.clip(local/2,0,1),np.clip((10-local)/2,0,1))**2
        for j,midi in enumerate(chords[k%len(chords)]):
            f=440*2**((midi-69)/12)
            for ch in range(2):
                tone=np.sin(2*np.pi*f*(1+(ch-.5)*.0009)*local+j*.8)
                tone+=.12*np.sin(2*np.pi*f*2*local+j)
                music[a:b,ch]+=(tone*env*.00332).astype(np.float32)
    # Band-shaped noise follows the same slow phase as the visible blue ribbons.
    waves=np.zeros((n,2),np.float32)
    frequencies=np.fft.rfftfreq(n,1/RATE)
    shape=(np.clip(frequencies/240,0,1)**2)*np.exp(-frequencies/2700)/np.sqrt(np.maximum(100,frequencies))
    for ch in range(2):
        spectrum=np.fft.rfft(rng.normal(size=n))*shape
        noise=np.fft.irfft(spectrum,n).astype(np.float32)
        noise/=max(1e-6,float(np.sqrt(np.mean(noise*noise))))
        swell=.32+.68*(.5+.5*np.sin(t*(.64*.27)+ch*.45))**2
        waves[:,ch]=noise*swell*.008*wave_gain
    movement=np.zeros_like(music); events=[]; prepared={}
    for k,g in enumerate(gestures):
        at,span,pan,kind,gain=g
        dry_cards=movement_style=='cards'
        path,filters=('public/audio/card_movement.mp3','highpass=f=700,lowpass=f=4200') if dry_cards else SFX[kind]
        if kind not in prepared:
            raw=decode(ffmpeg,ROOT/path,0,rate=RATE,channels=2,filters=filters)
            raw/=max(1e-6,float(np.max(np.abs(raw))));prepared[kind]=raw
        raw=prepared[kind]
        # A short, dry swipe of the actual card recording, not a stretched air/wave bed.
        audible_span=min(span,{'lock':.065,'switch':.10,'soft':.16,'paper':.20,'air':.23,'weight':.21}[kind]) if dry_cards else span
        count=round(audible_span*RATE)
        peak_index=int(np.argmax(np.mean(raw*raw,axis=1)))
        lead=round(.012*RATE) if dry_cards else count//2
        begin=max(0,min(len(raw)-count,peak_index-lead))
        signal=np.zeros((count,2));section=raw[begin:begin+count]
        signal[:len(section)]=section
        if dry_cards:
            local=np.arange(count)/RATE
            env=(1-np.exp(-local/.0035))*np.exp(-local/(audible_span*.25))
            env*=np.clip((audible_span-local)/.016,0,1)
            # Keep an identical peak reference before applying the requested 1/3 gain.
            signal*=env[:,None]
            signal/=max(1e-6,float(np.max(np.abs(signal))))
            at+=min(.10,span*.10) if kind not in ('lock','switch') else 0
        else:
            signal*=np.sin(np.linspace(0,np.pi,count))[:,None]**1.6
        signal*=10**(gain/20)*movement_gain
        signal[:,0]*=np.sqrt((1-pan)/2);signal[:,1]*=np.sqrt((1+pan)/2)
        a=max(0,round(at*RATE));b=min(n,a+count);movement[a:b]+=signal[:b-a]
        events.append(dict(start=at,duration=audible_span,gesture_duration=span,pan=pan,kind=kind,
                           source=path,peak_db=gain+20*np.log10(movement_gain)))
    envelope=np.minimum(np.clip(t/1.25,0,1),np.clip((duration-.45-t)/2.6,0,1))**1.5
    mix=(music+waves+movement)*envelope[:,None]
    assert np.max(np.abs(mix))<.5
    target=folder/'quiet-presentation.wav';write_wav(target,mix)
    report={'music':'Original quiet sustained harmony, no beat grid' if music_enabled else 'Isolated wave ambience and motion Foley','wave_ambience':'Band-shaped stereo wave noise with slow ribbon-linked swell',
            'music_rms_dbfs':float(20*np.log10(np.sqrt(np.mean(music**2)))) if music_enabled else None,
            'wave_rms_dbfs':float(20*np.log10(np.sqrt(np.mean(waves**2)))),
            'movement_style':movement_style,'movement_gain':movement_gain,
            'movement_rms_dbfs':float(20*np.log10(max(1e-12,np.sqrt(np.mean(movement**2))))),
            'mix_peak_dbfs':float(20*np.log10(np.max(np.abs(mix)))),'events':events}
    (folder/'audio-check.json').write_text(json.dumps(report,indent=2),'utf-8')
    return target
