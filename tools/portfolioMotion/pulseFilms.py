"""Continuous editorial motion, native detail scenes, original music and SFX."""
import argparse
import copy
import hashlib
import json
import shutil
import subprocess
import zipfile

import numpy as np
from PIL import Image, ImageDraw

from showreel import ROOT
from direction import SIZE
from hubarchStory import ease
from individualMusic import TRACKS, music_timing, soundtrack
from portfolioStory import check_ending
from pulseMotion import Pulse
from individualMusic import decode, REFERENCES

PROJECTS = ['nipigas', 'hubarch', 'ostankino', 'mmk-1', 'belka-production']
BEATS = {project: [4, 4, 4, 4, 4, 4, 8, 8] for project in PROJECTS}


def folder_for(project):
    folder = ROOT/f'output/showreels/{project}/pulse-v5'
    folder.mkdir(parents=True, exist_ok=True)
    return folder


def prepare(project, ffmpeg):
    folder = folder_for(project)
    track = copy.deepcopy(TRACKS[project]) if project != 'hubarch' else dict(
        id='TpZwt4w9TnM', title='First Light / Infraction', file='TpZwt4w9TnM.webm',
        offset=0, start=12.931, bpm=130, slug='first-light-technology')
    track['beats'] = BEATS[project]
    timing = music_timing(project, ffmpeg, folder, track_override=track)
    # Every quarter-note attack is measured; half-beat gestures interpolate
    # adjacent measured beats, retaining the original recording's groove.
    signal=decode(ffmpeg,REFERENCES/track['file'],timing['source_start'],timing['duration'],rate=12000,channels=1,filters='highpass=f=180,lowpass=f=6000')[:,0]
    power=np.r_[0,np.cumsum(signal.astype(float)**2)]
    idx=np.arange(0,len(signal)-120,12)
    rms=np.sqrt((power[idx+120]-power[idx])/120)
    attacks=np.maximum(rms-np.r_[np.zeros(6),rms[:-6]],0)
    times=(idx+60)/12000
    beats=[0]
    for beat in range(1,41):
        expected=beat*60/track['bpm']
        candidates=np.flatnonzero(np.abs(times-expected)<.045)
        attack=float(times[candidates[np.argmax(attacks[candidates])]])
        beats.append(round(attack*60))
    timing['beat_frames']=beats
    timing['frames']=beats[-1]+120
    timing['duration']=timing['frames']/60
    measured = json.loads((ROOT/f'output/showreels/{project}/motion-beatmap-v5.json').read_text('utf-8'))
    timing['source_start'] = measured['source_start']
    timing['original_source_start'] = track['offset'] + measured['source_start']
    timing['beat_frames'] = [p['frame'] for p in measured['landmarks'] if p['is_quarter']]
    timing['frames'] = timing['beat_frames'][-1] + 120
    timing['duration'] = timing['frames']/60
    (folder/'timing.json').write_text(json.dumps(timing,indent=2),encoding='utf-8')
    if project == 'ostankino':
        from ostankinoMotion import OstankinoMotion
        return OstankinoMotion(timing), folder
    return Pulse(project, timing), folder


def inspect(story, folder):
    verification=story.check()
    board=Image.new('RGB',(1920,1440),'#030910')
    for n,beat in enumerate(np.linspace(.8,36,16)):
        at=float(np.interp(beat,np.arange(len(story.beats)),story.beats))
        picture=story.render(at)
        picture.save(folder/f'composition-{n:02d}.jpg',quality=94)
        board.paste(picture.resize((480,270),Image.Resampling.LANCZOS),(n%4*480,n//4*360))
        ImageDraw.Draw(board).text((n%4*480+10,n//4*360+278),f'{at:.2f}s / beat {beat:.1f}',fill='white')
    board.save(folder/'storyboard.jpg',quality=94)
    (folder/'motion-check.json').write_text(json.dumps(verification,indent=2),encoding='utf-8')
    print(json.dumps(dict(project=story.project,**{k:v for k,v in verification.items() if k!='keys'})),flush=True)
    assert not verification['scale_flags'], 'Source pixels would be enlarged'
    # Short beat accents may settle between hits; constant drift is not a goal.


def render(story, folder, ffmpeg, preview=False):
    frames = min(story.timing['frames'], 420) if preview else story.timing['frames']
    target = folder/('preview-picture.mp4' if preview else 'picture.mp4')
    process = subprocess.Popen([ffmpeg, '-y', '-v', 'error', '-f', 'rawvideo', '-pix_fmt', 'rgb24',
        '-s', '1920x1080', '-r', '60', '-i', 'pipe:0', '-an', '-c:v', 'libx264', '-preset', 'medium',
        '-crf', '17', '-pix_fmt', 'yuv420p', '-threads', '2', str(target)],
        stdin=subprocess.PIPE, stderr=subprocess.PIPE)
    try:
        for frame in range(frames):
            t = frame/60
            picture = story.render(t)
            tail = np.clip((story.timing['duration']-.6-t)/1.75, 0, 1)
            fade = min(1, t/.1, ease(tail))
            if fade < 1:
                picture = Image.blend(Image.new('RGB', SIZE), picture, max(0, fade))
            process.stdin.write(picture.tobytes())
            if (frame+1)%180 == 0:
                print(f'{story.project}: {frame+1}/{frames} frames', flush=True)
        process.stdin.close()
        error = process.stderr.read().decode(errors='replace')
        if process.wait():
            raise RuntimeError(error)
    except BaseException:
        process.kill()
        process.wait()
        raise
    return target, frames


def assemble(story, folder, ffmpeg, picture, frames, preview=False):
    audio = soundtrack(ffmpeg, story.timing, story.events(ffmpeg), folder)
    target = folder/('motion-preview-7s.mp4' if preview else f'{story.project}-pulse-v5.mp4')
    args = [ffmpeg, '-y', '-v', 'error', '-i', str(picture), '-i', str(folder/'music-and-motion-sfx.wav'),
            '-map', '0:v:0', '-map', '1:a:0', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '256k',
            '-t', str(frames/60)]
    if preview:
        args += ['-af', 'afade=t=out:st=6.8:d=0.2']
    subprocess.run(args+['-movflags', '+faststart', str(target)], check=True)
    result = subprocess.run([ffmpeg, '-v', 'error', '-i', str(target), '-map', '0:v:0', '-map', '0:a:0',
        '-f', 'null', '-', '-progress', 'pipe:1', '-nostats'], capture_output=True, text=True, check=True)
    count = [int(line.split('=')[1]) for line in result.stdout.splitlines() if line.startswith('frame=')][-1]
    assert count == frames
    check = dict(frames=frames, duration=frames/60, full_audio_video_decode='passed', music=audio,
        ending=None if preview else check_ending(ffmpeg, target))
    (folder/('preview-check.json' if preview else 'export-check.json')).write_text(json.dumps(check, indent=2), encoding='utf-8')
    print(f'COMPLETE: {target}', flush=True)


def package():
    ready = ROOT/'output/showreels/ready-pulse-v5'
    ready.mkdir(exist_ok=True)
    titles = ['01-Nipigas', '02-Hubarch', '03-Ostankino', '04-MMK-1', '05-Belka-production']
    manifest = []
    for project, title in zip(PROJECTS, titles):
        folder = folder_for(project)
        check = json.loads((folder/'export-check.json').read_text(encoding='utf-8'))
        check['motion']=json.loads((folder/'motion-check.json').read_text(encoding='utf-8'))
        check['native_artwork']=check['motion'].get('native_sources', 'Unmodified original website captures; perspective scale verified')
        target = ready/f'{title}.mp4'
        shutil.copy2(folder/f'{project}-pulse-v5.mp4', target)
        check.update(file=target.name, sha256=hashlib.sha256(target.read_bytes()).hexdigest())
        manifest.append(check)
    assert len({p['music']['source_sha256'] for p in manifest}) == 5
    (ready/'manifest.json').write_text(json.dumps(manifest, indent=2), encoding='utf-8')
    archive = ROOT/'output/showreels/portfolio-pulse-v5.zip'
    with zipfile.ZipFile(archive, 'w', zipfile.ZIP_STORED) as pack:
        for filename in [f'{title}.mp4' for title in titles]+['manifest.json']:
            pack.write(ready/filename, filename)
    print(f'PACKAGE: {archive}', flush=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--project', choices=PROJECTS)
    parser.add_argument('--ffmpeg', default='ffmpeg')
    parser.add_argument('--render', action='store_true')
    parser.add_argument('--preview', action='store_true')
    parser.add_argument('--assemble', action='store_true')
    parser.add_argument('--package', action='store_true')
    args = parser.parse_args()
    if args.package:
        package()
        return
    story, folder = prepare(args.project, args.ffmpeg)
    if args.assemble:
        assemble(story, folder, args.ffmpeg, folder/'picture.mp4', story.timing['frames'])
        return
    inspect(story, folder)
    if args.render or args.preview:
        picture, frames = render(story, folder, args.ffmpeg, args.preview)
        assemble(story, folder, args.ffmpeg, picture, frames, args.preview)


if __name__ == '__main__':
    main()
