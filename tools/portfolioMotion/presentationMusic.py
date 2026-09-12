"""Dry card gestures and quieter background v10: retain the approved v6 picture."""
import argparse
import hashlib
import json
import re
import subprocess
from pathlib import Path

import numpy as np

from individualMusic import RATE, REFERENCES, decode, write_wav
from presentationAudio import make_audio
from showreel import ROOT

REVISION = 'presentation-v10'
MUSIC_GAIN = 10**(-24/20) / 2
WAVE_GAIN = 10**(-20/20) / 2
MOVEMENT_GAIN = 1 / 3

TRACKS = {
    'nipigas': ('Big Energy Instrumental', 'kyCdLGCdPGA.webm', 440.223, 1),
    'hubarch': ('First Light', 'TpZwt4w9TnM.webm', 12.931, 2),
    'ostankino': ('Durban', '5YNODBlYteI.webm', 16.693, 0),
    'globtravlink': ('Banda', 'kyCdLGCdPGA.webm', 24, 5),
    'universe-travel': ('Latin Fusion', 'kyCdLGCdPGA.webm', 298, 6),
    'mmk-1': ('Until You Disconnect', 'NRxnR9jy3jI.webm', 23.773, 3),
    'belka-production': ('Dance Baby', 'xTIOX-_pwvY.webm', 7.023, 4),
}


def run(ffmpeg, *args):
    return subprocess.check_output([ffmpeg, '-v', 'error', *map(str, args)], stderr=subprocess.STDOUT)


def picture_hash(ffmpeg, path):
    return run(ffmpeg, '-i', path, '-map', '0:v:0', '-c:v', 'copy', '-f', 'hash', '-hash', 'sha256', '-').decode().strip()


def audio_edit(ffmpeg, project, duration, folder):
    title, source, start, variant = TRACKS[project]
    old = ROOT/'output/showreels'/project/'presentation-v6'
    report = json.loads((old/'audio-check.json').read_text('utf-8'))
    gestures = [(e['start'],e['duration'],e['pan'],e['kind'],e['peak_db']) for e in report['events']]
    foley_path = make_audio(ffmpeg, folder, duration, gestures, variant, music_enabled=False,
                            wave_gain=WAVE_GAIN, movement_style='cards', movement_gain=MOVEMENT_GAIN)
    foley = decode(ffmpeg, foley_path, duration=duration)
    # Continuous original-speed selection, normalized before the motion mix.
    music = decode(ffmpeg, REFERENCES/source, start, duration,
                   filters='loudnorm=I=-18:TP=-2:LRA=11')
    expected = round(duration*RATE)
    if len(music) != expected or len(foley) != expected:
        raise ValueError(f'{project}: incomplete source audio')
    t = np.arange(expected)/RATE
    envelope = np.minimum(np.clip(t/.45,0,1),np.clip((duration-.45-t)/2.4,0,1))**1.5
    # Half the v9 background music level, independently of card gestures.
    music *= MUSIC_GAIN
    mix = music*envelope[:,None] + foley*1.8
    # Preserve musical dynamics; only trim master gain if combined peaks require it.
    gain = min(1,10**(-1.5/20)/max(float(np.max(np.abs(mix))),1e-8))
    mix *= gain
    path = folder/'music-and-motion.wav'
    write_wav(path,mix)
    credit = dict(track=title,artist='Infraction' if project!='mmk-1' else 'Infraction, Alexi Action',
        youtube=f'https://www.youtube.com/watch?v={Path(source).stem}',source_start=start,
        source_sha256=hashlib.sha256((REFERENCES/source).read_bytes()).hexdigest(),tempo=1,
        music_normalization_lufs=-18,music_gain_db=float(20*np.log10(MUSIC_GAIN)),
        music_target_lufs=float(-18+20*np.log10(MUSIC_GAIN)),
        wave_gain_db=float(20*np.log10(WAVE_GAIN)),movement_gain=MOVEMENT_GAIN,
        music_rms_dbfs=float(20*np.log10(np.sqrt(np.mean(music**2)))),master_peak_dbfs=float(20*np.log10(np.max(np.abs(mix)))),
        motion_foley='Dry 65–230 ms card slides from the card movement recording; no air/silk/wave movement recordings. One-third gesture gain, half background gain versus v9.',
        audio_sha256=hashlib.sha256(path.read_bytes()).hexdigest(),
        publication='Local review; original author commercial-use terms remain applicable. No license was purchased.')
    (folder/'music-credit.json').write_text(json.dumps(credit,indent=2),'utf-8')
    return path,credit


def export(ffmpeg, entry):
    project=entry['project'];duration=entry['duration']
    folder=ROOT/'output/showreels'/project/REVISION;folder.mkdir(parents=True,exist_ok=True)
    audio,credit=audio_edit(ffmpeg,project,duration,folder)
    source=Path(entry['master']);master=folder/f'{project}-{REVISION}.mp4'
    public=ROOT/'public/video/portfolio';checks={}
    for quality in ['1080','540']:
        original=source if quality=='1080' else public/f'{project}-presentation-v6-540.mp4'
        target=master if quality=='1080' else folder/f'{project}-{REVISION}-540.mp4'
        run(ffmpeg,'-y','-i',original,'-i',audio,'-map','0:v:0','-map','1:a:0',
            '-c:v','copy','-c:a','aac','-b:a','192k','-ar','48000','-t',duration,
            '-movflags','+faststart',target)
        before=picture_hash(ffmpeg,original);after=picture_hash(ffmpeg,target)
        if before!=after:raise AssertionError(f'{project}: {quality} picture changed')
        decoded=decode(ffmpeg,target,duration=duration)
        if len(decoded)!=round(duration*RATE):raise AssertionError(f'{project}: audio duration mismatch')
        peak=float(np.max(np.abs(decoded)));tail=float(np.max(np.abs(decoded[-round(.25*RATE):])))
        if peak>=1 or tail>.001:raise AssertionError(f'{project}: bad audio peak/tail {peak}/{tail}')
        # Atom order determines immediate playback before the whole download completes.
        data=target.read_bytes();pos=0;atoms=[]
        while pos+8<=len(data):
            size=int.from_bytes(data[pos:pos+4],'big');kind=data[pos+4:pos+8]
            if size==1:size=int.from_bytes(data[pos+8:pos+16],'big')
            if size<=0:break
            atoms.append(kind);pos+=size
        if atoms.index(b'moov')>atoms.index(b'mdat'):raise AssertionError('Missing faststart')
        site_target=public/f'{project}-{REVISION}-{quality}.mp4'
        site_target.write_bytes(data)
        checks[quality]=dict(picture_packet_hash=after,unchanged_picture=True,audio_decode='passed',
            samples=len(decoded),peak_dbfs=float(20*np.log10(peak)),silent_tail_peak=tail,faststart=True)
    result={**entry,'master':str(master),'web':f'/video/portfolio/{project}-{REVISION}-1080.mp4',
        'web_low':f'/video/portfolio/{project}-{REVISION}-540.mp4',
        'sha256':hashlib.sha256(master.read_bytes()).hexdigest(),'music':credit,'music_revision_checks':checks}
    (folder/'export-check.json').write_text(json.dumps(result,indent=2),'utf-8')
    print(f'{project}: both resolutions ready; unchanged picture, audio and tails checked',flush=True)
    return result


def main():
    parser=argparse.ArgumentParser();parser.add_argument('--ffmpeg',required=True);args=parser.parse_args()
    review=ROOT/'output/showreels/presentations-v6'
    original=json.loads((review/'portfolio-manifest.json').read_text('utf-8'))
    # Always remux the preserved v6 masters, including on a repeat run.
    for entry in original:entry['master']=str(ROOT/'output/showreels'/entry['project']/'presentation-v6'/f"{entry['project']}-presentation-v6.mp4")
    results=[export(args.ffmpeg,entry) for entry in original]
    if len({entry['music']['track'] for entry in results})!=7:raise AssertionError('Duplicate music')
    (review/'portfolio-manifest.json').write_text(json.dumps(results,indent=2),'utf-8')
    html=(review/'index.html').read_text('utf-8')
    html=re.sub(r'presentation-v\d+/([a-z0-9-]+)-presentation-v\d+\.mp4',
                lambda match:f'{REVISION}/{match[1]}-{REVISION}.mp4',html)
    (review/'index.html').write_text(html,'utf-8')


if __name__=='__main__':main()
