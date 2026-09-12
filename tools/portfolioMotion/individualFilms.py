"""Render, verify and package the four individual music/motion films."""
import argparse
import hashlib
import json
import shutil
import subprocess
import zipfile

import numpy as np
from PIL import Image, ImageDraw, ImageFont

from direction import SIZE
from hubarchStory import ease
from individualMotion import MotionStory, LABELS, sound_events
from individualMusic import TRACKS, music_timing, soundtrack
from portfolioStory import check_ending
from showreel import ROOT


def folder_for(project):
    folder = ROOT/f'output/showreels/{project}/individual-motion-v2'
    folder.mkdir(parents=True, exist_ok=True)
    return folder


def storyboard(story, folder):
    checks = story.validate()
    board = Image.new('RGB', (1920, 640), '#060b10')
    draw = ImageDraw.Draw(board)
    font = ImageFont.truetype('C:/Windows/Fonts/segoeui.ttf', 18)
    for shot in range(8):
        picture = story.render(shot, .56)
        picture.save(folder/f'shot-{shot+1:02d}.jpg', quality=94)
        x, y = shot%4*480, shot//4*320
        board.paste(picture.resize((480, 270), Image.Resampling.LANCZOS), (x, y))
        draw.text((x+10, y+278), LABELS[story.project][shot], font=font, fill='white')
    board.save(folder/'storyboard.jpg', quality=94)
    (folder/'geometry-check.json').write_text(json.dumps(checks, ensure_ascii=False, indent=2), encoding='utf-8')
    print(f'{story.project}: composition verified; {story.timing["duration"]:.2f}s', flush=True)


def render_shot(story, shot, ffmpeg, folder):
    start, stop = story.timing['cuts'][shot:shot+2]
    process = subprocess.Popen([ffmpeg, '-y', '-v', 'error', '-f', 'rawvideo', '-pix_fmt', 'rgb24',
        '-s', '1920x1080', '-r', '60', '-i', 'pipe:0', '-an', '-c:v', 'libx264',
        '-preset', 'medium', '-crf', '17', '-pix_fmt', 'yuv420p', '-threads', '2',
        str(folder/f'scene-{shot:02d}.mp4')], stdin=subprocess.PIPE, stderr=subprocess.PIPE)
    try:
        for frame in range(start, stop):
            u = (frame-start)/(stop-start)
            t = frame/60
            picture = story.render(shot, u)
            tail = np.clip((story.timing['duration']-.6-t)/1.75, 0, 1)
            fade = min(1, t/.10, ease(tail))
            if fade < 1:
                picture = Image.blend(Image.new('RGB', SIZE), picture, max(0, fade))
            process.stdin.write(picture.tobytes())
        process.stdin.close()
        error = process.stderr.read().decode(errors='replace')
        if process.wait():
            raise RuntimeError(error)
    except BaseException:
        process.kill()
        process.wait()
        raise
    print(f'{story.project}: scene {shot+1}/8 ({stop-start} frames)', flush=True)


def assemble(project, timing, ffmpeg, folder):
    audio = soundtrack(ffmpeg, timing, sound_events(project, timing), folder)
    concat = folder/'concat.txt'
    concat.write_text('\n'.join(f"file 'scene-{i:02d}.mp4'" for i in range(8)), encoding='utf-8')
    movie = folder/f'{project}-individual-motion-v2.mp4'
    subprocess.run([ffmpeg, '-y', '-v', 'error', '-f', 'concat', '-safe', '0', '-i', str(concat),
        '-i', str(folder/'music-and-motion-sfx.wav'), '-map', '0:v:0', '-map', '1:a:0',
        '-c:v', 'copy', '-c:a', 'aac', '-b:a', '256k', '-t', str(timing['duration']),
        '-movflags', '+faststart', str(movie)], check=True)
    decoded = subprocess.run([ffmpeg, '-v', 'error', '-i', str(movie), '-map', '0:v:0', '-map', '0:a:0',
        '-f', 'null', '-', '-progress', 'pipe:1', '-nostats'], capture_output=True, text=True, check=True)
    frames = [int(line.split('=')[1]) for line in decoded.stdout.splitlines() if line.startswith('frame=')][-1]
    assert frames == timing['frames'], (frames, timing['frames'])
    check = dict(frames=frames, duration=timing['duration'], full_video_audio_decode='passed',
        ending=check_ending(ffmpeg, movie), music=audio, direction=LABELS[project])
    (folder/'export-check.json').write_text(json.dumps(check, ensure_ascii=False, indent=2), encoding='utf-8')
    print(f'{project}: COMPLETE {movie.name}', flush=True)


def hubarch_sound(ffmpeg):
    """Add motion SFX while retaining every approved encoded picture packet."""
    from hubarchMusicCues import SOURCE_START, CUT_FRAMES, FRAMES
    source = ROOT/'output/showreels/hubarch/story-refined-v4/hubarch-showreel-first-light-v4.mp4'
    assert hashlib.sha256(source.read_bytes()).hexdigest() == '504525c65653a28a3c670e82fe1eb7600a102356c32da16c3df9163a67b88d5c'
    folder = folder_for('hubarch')
    track = dict(id='TpZwt4w9TnM', title='First Light / Infraction', file='TpZwt4w9TnM.webm',
                 offset=0, slug='first-light-technology')
    path = ROOT/'output/showreels/music/references'/track['file']
    timing = dict(track=track, source_start=SOURCE_START, original_source_start=SOURCE_START,
        frames=FRAMES, duration=FRAMES/60, source_sha256=hashlib.sha256(path.read_bytes()).hexdigest())
    gestures = [(1, .04, 'air', 1.1, -.6, .6), (2, .02, 'soft', .65, -.2, .2),
                (3, .05, 'soft', 1.1, 0, -.3), (3, .57, 'paper', .9, -.3, 0),
                (5, .05, 'air', 1.2, -.6, .5), (6, .02, 'soft', 1.3, .4, -.4)]
    events = [dict(time=(CUT_FRAMES[shot]+(CUT_FRAMES[shot+1]-CUT_FRAMES[shot])*u)/60,
                   duration=duration, kind=kind, pan_from=left, pan_to=right, db=-24,
                   scene=shot+1, visual='approved row movement / photo lift')
              for shot, u, kind, duration, left, right in gestures]
    credit = soundtrack(ffmpeg, timing, events, folder)
    target = folder/'hubarch-individual-motion-v2.mp4'
    subprocess.run([ffmpeg, '-y', '-v', 'error', '-i', str(source), '-i', str(folder/'music-and-motion-sfx.wav'),
        '-map', '0:v:0', '-map', '1:a:0', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '256k',
        '-movflags', '+faststart', str(target)], check=True)
    def picture_hash(path):
        return subprocess.check_output([ffmpeg, '-v', 'error', '-i', str(path), '-map', '0:v:0',
            '-c:v', 'copy', '-f', 'hash', '-hash', 'sha256', 'pipe:1']).decode().strip()
    assert picture_hash(source) == picture_hash(target)
    check = dict(frames=FRAMES, duration=FRAMES/60, music=credit, ending=check_ending(ffmpeg, target),
                 approved_picture_packets='sha256 identical', direction='Approved Hubarch film; movement SFX added')
    (folder/'export-check.json').write_text(json.dumps(check, indent=2), encoding='utf-8')
    print('hubarch: approved picture unchanged; movement SFX mixed', flush=True)


def package(ffmpeg):
    ready = ROOT/'output/showreels/ready-individual-v2'
    ready.mkdir(exist_ok=True)
    manifest = []
    names = [('nipigas', '01-Nipigas'), ('hubarch', '02-Hubarch'), ('ostankino', '03-Ostankino'),
             ('mmk-1', '04-MMK-1'), ('belka-production', '05-Belka-production')]
    track_ids, audio_hashes = [], []
    for project, name in names:
        folder = folder_for(project)
        source = folder/f'{project}-individual-motion-v2.mp4'
        check = json.loads((folder/'export-check.json').read_text(encoding='utf-8'))
        credit = check['music']
        track_id = 'TpZwt4w9TnM' if project == 'hubarch' else TRACKS[project]['id']
        audio_hashes.append(credit['audio_sha256'])
        track_ids.append(track_id)
        target = ready/f'{name}.mp4'
        shutil.copy2(source, target)
        manifest.append(dict(file=target.name, frames=check['frames'], duration=check['duration'],
            track_id=track_id, music=credit, sha256=hashlib.sha256(target.read_bytes()).hexdigest(),
            ending=check_ending(ffmpeg, target)))
    assert len(set(track_ids)) == 5 and len(set(audio_hashes)) == 5
    (ready/'manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding='utf-8')
    (ready/'README.md').write_text('# Пять разных шоурилов\n\n1920×1080, 60 fps.\n\n'
        'НИПИГАЗ — Big Energy: раскрытие страниц и вертикальная хроника.\n'
        'Hubarch — First Light: сохранён утверждённый ролик.\n'
        'Останкино — Durban: эфирный мультиэкран и смена программ.\n'
        'ММК-1 — Until You Disconnect: рельс, тяжёлый разгон, сборка модулей.\n'
        'Белка — Dance Baby: веер и каскад карточек.\n\n'
        'Все пять роликов содержат отдельный звуковой дизайн движений. '
        'Исходные дизайны сайтов и темп музыки сохранены. Авторство и условия треков — manifest.json.\n', encoding='utf-8')
    archive = ROOT/'output/showreels/portfolio-individual-motion-v2.zip'
    with zipfile.ZipFile(archive, 'w', zipfile.ZIP_STORED) as pack:
        for name in [f'{name}.mp4' for _, name in names]+['manifest.json', 'README.md']:
            pack.write(ready/name, name)
    print(f'PACKAGE COMPLETE: {archive}', flush=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--project', choices=TRACKS)
    parser.add_argument('--ffmpeg', default='ffmpeg')
    parser.add_argument('--render', action='store_true')
    parser.add_argument('--assemble', action='store_true')
    parser.add_argument('--package', action='store_true')
    parser.add_argument('--hubarch-sound', action='store_true')
    parser.add_argument('--shot', type=int, choices=range(8))
    args = parser.parse_args()
    if args.hubarch_sound:
        hubarch_sound(args.ffmpeg)
        return
    if args.package:
        package(args.ffmpeg)
        return
    folder = folder_for(args.project)
    timing = music_timing(args.project, args.ffmpeg, folder)
    if args.assemble:
        assemble(args.project, timing, args.ffmpeg, folder)
        return
    story = MotionStory(args.project, timing)
    if args.shot is not None:
        render_shot(story, args.shot, args.ffmpeg, folder)
        return
    storyboard(story, folder)
    if args.render:
        for shot in range(8):
            render_shot(story, shot, args.ffmpeg, folder)
        assemble(args.project, timing, args.ffmpeg, folder)


if __name__ == '__main__':
    main()
