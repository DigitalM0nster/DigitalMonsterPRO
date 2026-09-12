"""Separate original-tempo music edits and movement-led sound design."""
from functools import lru_cache
import hashlib
import json
import subprocess
import wave

import numpy as np

from showreel import ROOT

RATE = 48000
REFERENCES = ROOT/'output/showreels/music/references'
TRACKS = {
    'nipigas': dict(id='kyCdLGCdPGA', title='Big Energy / Infraction',
        file='Big Energy Instrumental 7m12s-8m30s.wav', offset=432, start=8.223,
        bpm=110, beats=[4, 8, 8, 4, 8, 8, 4, 8], slug='big-energy-fresh-beat'),
    'ostankino': dict(id='5YNODBlYteI', title='Durban / Infraction',
        file='5YNODBlYteI.webm', offset=0, start=16.693,
        bpm=115, beats=[4, 4, 8, 4, 8, 8, 4, 8], slug='durban-afrobeat'),
    'mmk-1': dict(id='NRxnR9jy3jI', title='Until You Disconnect / Infraction, Alexi Action',
        file='NRxnR9jy3jI.webm', offset=0, start=23.773,
        bpm=130, beats=[4, 8, 8, 8, 4, 8, 8, 8], slug='until-you-disconnect-brazilian-phonk'),
    'belka-production': dict(id='xTIOX-_pwvY', title='Dance Baby / Infraction',
        file='xTIOX-_pwvY.webm', offset=0, start=7.023,
        bpm=94, beats=[4, 4, 8, 4, 8, 8, 4, 8], slug='dance-baby-rnb'),
}


def decode(ffmpeg, path, start=0, duration=None, rate=RATE, channels=2, filters=None):
    command = [ffmpeg, '-v', 'error', '-i', str(path)]
    chain = [f'atrim=start={start}', 'asetpts=PTS-STARTPTS']
    if filters:
        chain.append(filters)
    command += ['-af', ','.join(chain)]
    if duration is not None:
        command += ['-t', str(duration)]
    command += ['-ar', str(rate), '-ac', str(channels), '-f', 'f32le', 'pipe:1']
    return np.frombuffer(subprocess.check_output(command), '<f4').reshape(-1, channels).copy()


def music_timing(project, ffmpeg, folder, track_override=None):
    track = track_override or TRACKS[project]
    path = REFERENCES/track['file']
    # Refine real transient attacks at 1 ms, then quantize the picture to 60 fps.
    signal = decode(ffmpeg, path, rate=12000, channels=1,
                    filters='highpass=f=250,lowpass=f=6000')[:, 0]
    power = np.r_[0, np.cumsum(signal.astype(float)**2)]
    window, hop = 120, 12
    indices = np.arange(0, len(signal)-window, hop)
    envelope = np.sqrt((power[indices+window]-power[indices])/window)
    attacks = np.maximum(envelope-np.r_[np.zeros(6), envelope[:-6]], 0)
    times = (indices+window/2)/12000
    nominal = track['start']+np.r_[0, np.cumsum(track['beats'])]*60/track['bpm']
    cues = []
    for point in nominal:
        candidates = np.flatnonzero(np.abs(times-point) < .08)
        nearest = candidates[np.argmax(attacks[candidates])]
        cues.append(float(times[nearest]))
    frames = np.round((np.array(cues)-cues[0])*60).astype(int)
    errors = np.abs(frames/60-(np.array(cues)-cues[0]))
    frames[-1] += 120  # Resolved musical tail and established black/silence holds.
    result = dict(project=project, track=track, source_start=cues[0],
        original_source_start=track['offset']+cues[0], source_attacks=cues,
        cuts=frames.tolist(), frames=int(frames[-1]), duration=float(frames[-1]/60),
        max_cut_rounding_ms=float(errors.max()*1000), tempo_adjustment=1.0,
        source_sha256=hashlib.sha256(path.read_bytes()).hexdigest())
    assert np.all(np.diff(frames)>60) and errors.max() <= 1/120+.00001
    (folder/'timing.json').write_text(json.dumps(result, indent=2), encoding='utf-8')
    return result


SFX = {
    'paper': ('public/audio/card_movement.mp3', 'highpass=f=450,lowpass=f=6500'),
    'air': ('public/audio/capability_flight_air.wav', 'highpass=f=200,lowpass=f=5500'),
    'switch': ('public/audio/glitch_button.mp3', 'highpass=f=500,lowpass=f=5000'),
    'soft': ('public/audio/capability_line_silk.wav', 'highpass=f=500,lowpass=f=7000'),
    'lock': ('public/audio/digital_sound.mp3', 'highpass=f=500,lowpass=f=4500'),
    'weight': ('public/audio/portfolio_leave_transition.mp3', 'highpass=f=100,lowpass=f=1600'),
}


def write_wav(path, samples):
    with wave.open(str(path), 'wb') as target:
        target.setnchannels(2)
        target.setsampwidth(2)
        target.setframerate(RATE)
        target.writeframes(np.round(np.clip(samples, -1, 1)*32767).astype('<i2').tobytes())


def soundtrack(ffmpeg, timing, events, folder):
    count = timing['frames']*800
    track = timing['track']
    music = decode(ffmpeg, REFERENCES/track['file'], timing['source_start'], timing['duration'])
    assert len(music) == count
    music *= 10**(-5/20)/max(np.max(np.abs(music)), 1e-8)
    stem = np.zeros_like(music)

    @lru_cache(maxsize=12)
    def effect(kind):
        file, filters = SFX[kind]
        data = decode(ffmpeg, ROOT/file, duration=2, filters=filters).mean(axis=1)
        # Trim silent preroll; use the actual sound, not a tone synthesized per beat.
        hot = np.flatnonzero(np.abs(data)>max(np.max(np.abs(data))*.04, .00001))
        if len(hot):
            data = data[max(0, hot[0]-240):min(len(data), hot[-1]+2400)]
        return data/max(np.max(np.abs(data)), 1e-8)

    for event in events:
        source = effect(event['kind'])
        length = max(480, round(event['duration']*RATE))
        # A short resampled texture follows the duration of its visual gesture.
        sound = np.interp(np.linspace(0, len(source)-1, length), np.arange(len(source)), source)
        fade = min(length//3, 1920)
        sound[:fade] *= np.sin(np.linspace(0, np.pi/2, fade))**2
        sound[-fade:] *= np.cos(np.linspace(0, np.pi/2, fade))**2
        pan = np.linspace(event.get('pan_from', 0), event.get('pan_to', 0), length)
        stereo = sound[:, None]*np.column_stack((np.cos((pan+1)*np.pi/4), np.sin((pan+1)*np.pi/4)))
        stereo *= 10**(event.get('db', -22)/20)
        start = max(0, round(event['time']*RATE))
        stop = min(count, start+length)
        stem[start:stop] += stereo[:stop-start]
    assert np.sqrt(np.mean(stem**2)) > .0001, 'No animation sound was mixed'
    mix = music+stem
    peak = float(np.max(np.abs(mix)))
    gain = min(1, 10**(-2/20)/max(peak, 1e-8))
    mix *= gain
    envelope = np.ones(count)
    envelope[:384] = np.linspace(0, 1, 384)
    tail_end = count-round(.35*RATE)
    tail_start = tail_end-round(2.75*RATE)
    envelope[tail_start:tail_end] = np.cos(np.linspace(0, np.pi/2, tail_end-tail_start))**2
    envelope[tail_end:] = 0
    mix *= envelope[:, None]
    stem *= envelope[:, None]*gain
    write_wav(folder/'music-and-motion-sfx.wav', mix)
    write_wav(folder/'motion-sfx-stem.wav', stem)
    result = dict(track=track['title'], youtube=f"https://www.youtube.com/watch?v={track['id']}",
        track_page=f"https://inaudio.org/track/{track['slug']}/", source_start=timing['original_source_start'],
        tempo_adjustment=1.0, music_gain_db=-5, mix_peak_dbfs=float(20*np.log10(np.max(np.abs(mix)))),
        motion_sfx_rms=float(np.sqrt(np.mean(stem**2))), events=events,
        audio_sha256=hashlib.sha256((folder/'music-and-motion-sfx.wav').read_bytes()).hexdigest(),
        source_sha256=timing['source_sha256'],
        credit=f"Music from InAudio / {track['title']}. Original user-selected reference.",
        publication='Private review export. Original author commercial-use terms remain applicable; no license was purchased.')
    (folder/'music-credit.json').write_text(json.dumps(result, indent=2), encoding='utf-8')
    return result
