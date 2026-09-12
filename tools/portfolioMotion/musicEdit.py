"""Beat grid, soundtrack preparation and delivery packaging for offline films."""
from __future__ import annotations

import argparse
import hashlib
import json
import shutil
import subprocess
import wave
import zipfile

import numpy as np
from showreel import ROOT

MUSIC_DIR = ROOT/'output/showreels/music'
MUSIC_DURATION = 11.8  # Exactly 708 frames at 60 fps, six bars of 4/4.
BEAT = MUSIC_DURATION/24
SOURCE_BPM = 122
RATE = 48000
FILMS = [('nipigas', '01-Nipigas'), ('hubarch', '02-Hubarch'),
         ('ostankino', '03-Ostankino'), ('mmk-1', '04-MMK-1'),
         ('belka-production', '05-Belka-production')]


def write_wav(path, samples, end_fade):
    samples = samples.copy()
    start_n, end_n = round(.004*RATE), round(end_fade*RATE)
    samples[:start_n] *= np.linspace(0, 1, start_n)[:, None]
    samples[-end_n:] *= np.linspace(1, 0, end_n)[:, None]
    with wave.open(str(path), 'wb') as wav:
        wav.setnchannels(2)
        wav.setsampwidth(2)
        wav.setframerate(RATE)
        wav.writeframes(np.round(samples*32767).astype('<i2').tobytes())


def prepare(ffmpeg):
    # Transient autocorrelation measures 122 BPM; the stronger section begins
    # at source beat 32. Continuous music is preserved across all five films.
    source_start = 32*60/SOURCE_BPM
    tempo = (60/SOURCE_BPM)/BEAT
    duration = MUSIC_DURATION*len(FILMS)
    raw = subprocess.check_output([
        ffmpeg, '-v', 'error', '-i', str(MUSIC_DIR/'tech-house-vibes-130.mp3'),
        '-af', f'atrim=start={source_start},asetpts=PTS-STARTPTS,atempo={tempo:.12f}',
        '-t', str(duration), '-ar', str(RATE), '-ac', '2', '-f', 'f32le', 'pipe:1'])
    samples = np.frombuffer(raw, dtype='<f4').reshape(-1, 2).copy()
    count = round(MUSIC_DURATION*RATE)
    assert len(samples) == count*len(FILMS), 'Unexpected audio duration'
    peak = float(np.max(np.abs(samples)))
    gain = min(1, 10**(-2/20)/peak)
    samples *= gain
    write_wav(MUSIC_DIR/'continuous-edit.wav', samples, .25)
    for index, (project, _) in enumerate(FILMS):
        write_wav(MUSIC_DIR/f'{project}-edit.wav', samples[index*count:(index+1)*count], .08)
    metadata = {
        'title': 'Tech House vibes', 'artist': 'Alejandro Magana (A. M.)',
        'page': 'https://mixkit.co/free-stock-music/electronica/',
        'asset': 'https://assets.mixkit.co/music/130/130.mp3',
        'license': 'https://mixkit.co/license/#musicFree',
        'source_bpm_measured': SOURCE_BPM, 'source_start_seconds': source_start,
        'tempo_adjustment': tempo, 'edit_bpm': 60/BEAT,
        'music_duration_seconds': duration, 'individual_duration_seconds': MUSIC_DURATION,
        'sample_rate': RATE, 'sample_peak_dbfs': 20*np.log10(peak*gain),
        'gain_db': 20*np.log10(gain),
        'cue_beats': {'hero': [0, 8, 16], 'handoff': [4, 12, 20], 'lift': [2, 10]},
        'notes': '24 beats per film. Continuous master; standalone edits have short click-free fades. Source track is not included in the delivery ZIP.'}
    (MUSIC_DIR/'edit.json').write_text(json.dumps(metadata, indent=2), encoding='utf-8')
    print(json.dumps(metadata), flush=True)


def package(ffmpeg):
    ready = ROOT/'output/showreels/ready-music'
    ready.mkdir(exist_ok=True)
    manifest = []
    for project, name in FILMS:
        source = ROOT/f'output/showreels/{project}/{project}-beat-v1.mp4'
        result = subprocess.run([ffmpeg, '-v', 'error', '-i', str(source),
            '-map', '0:v:0', '-map', '0:a:0', '-f', 'null', '-',
            '-progress', 'pipe:1', '-nostats'], capture_output=True, text=True, check=True)
        frames = [int(row.split('=')[1]) for row in result.stdout.splitlines() if row.startswith('frame=')]
        assert frames[-1] == round(MUSIC_DURATION*60), (source, frames[-1])
        target = ready/f'{name}.mp4'
        shutil.copy2(source, target)
        manifest.append({'file': target.name, 'frames': frames[-1], 'duration': MUSIC_DURATION,
                         'sha256': hashlib.sha256(target.read_bytes()).hexdigest(),
                         'video_and_audio_decode': 'passed'})
        print(f'Checked: {target.name}', flush=True)
    concat = ready/'concat.txt'
    concat.write_text('\n'.join(f"file '{name}.mp4'" for _, name in FILMS), encoding='utf-8')
    combined = ready/'all-projects-with-music.mp4'
    subprocess.run([ffmpeg, '-y', '-v', 'error', '-f', 'concat', '-safe', '0', '-i', str(concat),
        '-i', str(MUSIC_DIR/'continuous-edit.wav'), '-map', '0:v:0', '-map', '1:a:0',
        '-c:v', 'copy', '-c:a', 'aac', '-b:a', '256k', '-t', str(MUSIC_DURATION*len(FILMS)),
        '-movflags', '+faststart', str(combined)], check=True)
    subprocess.run([ffmpeg, '-v', 'error', '-i', str(combined), '-f', 'null', '-'], check=True)
    (ready/'manifest.json').write_text(json.dumps(manifest, indent=2), encoding='utf-8')
    shutil.copy2(MUSIC_DIR/'edit.json', ready/'music-credit.json')
    readme = '# Ролики с музыкой\n\nПять роликов по 11,8 секунды, 1080p / 60 fps. '
    readme += 'Карточки, ускорения и вылеты элементов привязаны к биту.\n\n'
    readme += 'Музыка: Tech House vibes — Alejandro Magaña (A. M.), Mixkit.\n'
    readme += 'https://mixkit.co/free-stock-music/electronica/\nhttps://mixkit.co/license/#musicFree\n\n'
    readme += 'Общий просмотр: all-projects-with-music.mp4 — непрерывный трек без перезапуска между проектами.\n'
    (ready/'README.md').write_text(readme, encoding='utf-8')
    archive = ROOT/'output/showreels/portfolio-motion-five-with-music.zip'
    with zipfile.ZipFile(archive, 'w', zipfile.ZIP_STORED) as pack:
        for _, name in FILMS:
            pack.write(ready/f'{name}.mp4', f'{name}.mp4')
        pack.write(ready/'README.md', 'README.md')
        pack.write(ready/'music-credit.json', 'music-credit.json')
    print(f'Ready: {combined}\nArchive: {archive}', flush=True)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--ffmpeg', default='ffmpeg')
    parser.add_argument('--prepare', action='store_true')
    parser.add_argument('--package', action='store_true')
    args = parser.parse_args()
    if args.prepare:
        prepare(args.ffmpeg)
    if args.package:
        package(args.ffmpeg)
