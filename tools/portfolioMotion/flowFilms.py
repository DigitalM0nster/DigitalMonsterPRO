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
from flowMotion import Flow

PROJECTS = ['nipigas', 'hubarch', 'ostankino', 'mmk-1', 'belka-production']
BEATS = {'nipigas': [4, 4, 4, 4, 4, 8, 4, 8], 'hubarch': [4, 8, 4, 4, 8, 8, 4, 8],
         'ostankino': [4, 4, 4, 4, 8, 8, 4, 8], 'mmk-1': [4, 4, 8, 4, 4, 8, 4, 8],
         'belka-production': [4, 4, 4, 4, 4, 8, 4, 8]}


def folder_for(project):
    folder = ROOT/f'output/showreels/{project}/flow-v3'
    folder.mkdir(parents=True, exist_ok=True)
    return folder


def prepare(project, ffmpeg):
    folder = folder_for(project)
    track = copy.deepcopy(TRACKS[project]) if project != 'hubarch' else dict(
        id='TpZwt4w9TnM', title='First Light / Infraction', file='TpZwt4w9TnM.webm',
        offset=0, start=12.931, bpm=130, slug='first-light-technology')
    track['beats'] = BEATS[project]
    timing = music_timing(project, ffmpeg, folder, track_override=track)
    return Flow(project, timing), folder


def inspect(story, folder):
    verification = story.check()
    board = Image.new('RGB', (1920, 1080), '#030910')
    cuts = story.timing['cuts']
    for stage in range(8):
        at = cuts[stage]/60+.85
        picture = story.render(at)
        picture.save(folder/f'composition-{stage:02d}.jpg', quality=95)
        x, y = stage%4*480, stage//4*540
        board.paste(picture.resize((480, 270), Image.Resampling.LANCZOS), (x, y))
        later = min(cuts[stage+1]/60-.72, at+1)
        board.paste(story.render(later).resize((480, 270), Image.Resampling.LANCZOS), (x, y+270))
    board.save(folder/'storyboard.jpg', quality=94)
    # Raster check in addition to state continuity: no large one-frame jump at
    # the boundary where the previous generation abruptly replaced the hero.
    raster = []
    for at, _, kind, width in story.keys[1:]:
        frames = [np.asarray(story.render(at+offset/60).resize((480, 270)), dtype=float)
                  for offset in (-1, 0, 1)]
        delta = [float(np.mean(np.abs(b-a))) for a, b in zip(frames, frames[1:])]
        assert max(delta) < 7, ('frame jump at transition arrival', at, delta)
        raster.append(dict(at=at, adjacent_frame_differences=delta))
    verification['rendered_arrival_checks'] = raster
    (folder/'motion-check.json').write_text(json.dumps(verification, indent=2), encoding='utf-8')
    print(f'{story.project}: continuous boundaries verified, {story.timing["duration"]:.2f}s', flush=True)


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
            if (frame+1)%300 == 0:
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
    audio = soundtrack(ffmpeg, story.timing, story.events(), folder)
    target = folder/('motion-preview-7s.mp4' if preview else f'{story.project}-flow-v3.mp4')
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
    ready = ROOT/'output/showreels/ready-flow-v3'
    ready.mkdir(exist_ok=True)
    titles = ['01-Nipigas', '02-Hubarch', '03-Ostankino', '04-MMK-1', '05-Belka-production']
    manifest = []
    for project, title in zip(PROJECTS, titles):
        folder = folder_for(project)
        check = json.loads((folder/'export-check.json').read_text(encoding='utf-8'))
        target = ready/f'{title}.mp4'
        shutil.copy2(folder/f'{project}-flow-v3.mp4', target)
        check.update(file=target.name, sha256=hashlib.sha256(target.read_bytes()).hexdigest())
        manifest.append(check)
    assert len({p['music']['source_sha256'] for p in manifest}) == 5
    (ready/'manifest.json').write_text(json.dumps(manifest, indent=2), encoding='utf-8')
    archive = ROOT/'output/showreels/portfolio-flow-v3.zip'
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
