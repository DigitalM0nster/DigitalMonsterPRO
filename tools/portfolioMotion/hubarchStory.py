"""Hubarch editorial film with native UI and user-selected music.

Eight distinct compositions, native pages and a resolved ending. This replaces
the repeated orbit as a story concept, not the already delivered movie files.
"""
from dataclasses import dataclass
import argparse
import json
import subprocess
import wave

import numpy as np
from PIL import Image, ImageDraw, ImageFont

from direction import Film, Pose, SIZE, CONTENT_ORIGIN, corners, homography, max_pixel_scale, project_points
from elementLift import photo_geometry
from motionField import draw_field, field_cards, validate_rows
from musicEdit import MUSIC_DIR
from hubarchMusicCues import SOURCE_START, SOURCE_CUES, CUT_FRAMES, CUT_TIMES, FRAMES, timing_verification

OUTRO_PICTURE_FADE = 1.75
OUTRO_MUSIC_FADE = 2.75
OUTRO_BLACK_HOLD = .6
OUTRO_SILENCE_HOLD = .35

CAPTIONS = (
    '01 / ЗНАКОМСТВО — главный экран',
    '02 / МАСШТАБ — движущееся поле проектов',
    '03 / ВЫБОР — проект из каталога',
    '04 / АКЦЕНТ — фотография выходит в объём',
    '05 / РАСКРЫТИЕ — страница выбранного проекта',
    '06 / СИСТЕМА — каскад экранов в глубину',
    '07 / КУЛЬМИНАЦИЯ — плавный проход над полем',
    '08 / ФИНАЛ — возвращение к образу бренда',
)


def ease(u):
    return u*u*u*(10+u*(-15+6*u))


@dataclass(frozen=True)
class Card:
    group: str
    clock: float
    pose: Pose
    lift: float = 0


def layout(shot, u):
    q = ease(u)
    if shot == 0:
        return [Card('home', .1+u*1.4, Pose(960+6*q, 540-4*q, .74, -2, 1, 0))]
    if shot == 1:
        return []
    if shot == 2:
        # The native capture itself changes the selected architecture project.
        return [Card('select', 2.5+u*3.1, Pose(960, 540, .74, 0, 1, 0))]
    if shot == 3:
        rise = ease(min(1, u/.5))
        release = 1-ease(float(np.clip((u-.57)/.4, 0, 1)))
        return [Card('select', 5.6, Pose(960, 540, .74, 0, 1, 0), .32*rise*release)]
    if shot == 4:
        return [Card('case', 6.2+u*2.6, Pose(960, 540, .74, 0, 1, 0))]
    if shot == 5:
        return [Card('home', 1.0, Pose(440+8*q, 320-3*q, .40, -10, 3, -2)),
                Card('select', 2.6, Pose(850+8*q, 390-3*q, .46, -10, 3, -2)),
                Card('select', 5.6, Pose(1230+8*q, 540-3*q, .53, -10, 3, -2)),
                Card('case', 8.8, Pose(1510+8*q, 760-3*q, .51, -10, 3, -2))]
    # Resolve to one steady, complete hero. No detached HUD or extra caption.
    return [Card('home', 2.7, Pose(960, 540, .74, -2, 1, 0))]


class Story:
    def __init__(self, project_id='hubarch', layout_fn=layout, continuous_catalogue=True):
        self.film = Film(project_id)
        self.layout = layout_fn
        self.continuous_catalogue = continuous_catalogue

    def render(self, shot, u):
        time = CUT_TIMES[shot]+u*(CUT_TIMES[shot+1]-CUT_TIMES[shot])
        canvas = self.film.style.background(time*.16)
        if shot in (1, 6):
            seconds = u*(CUT_TIMES[shot+1]-CUT_TIMES[shot])
            draw_field(self.film, canvas, seconds, variant=shot == 6)
            return canvas.convert('RGB')
        for card in self.layout(shot, u):
            self.film.draw_card(canvas, card.group, card.clock,
                                pose_override=card.pose, lift_override=card.lift)
        return canvas.convert('RGB')

    def validate(self):
        maximum, minimum = 0, float('inf')
        for shot in range(8):
            for u in np.linspace(0, 1, 97):
                if shot in (1, 6):
                    for _, raw, front, _ in field_cards(self.film.card_size,
                            u*(CUT_TIMES[shot+1]-CUT_TIMES[shot]), variant=shot == 6):
                        scale = max_pixel_scale(homography(raw, front))
                        maximum = max(maximum, scale)
                        assert scale <= 1, ('Field enlarged source', shot, scale)
                    continue
                for card in self.layout(shot, u):
                    source, target = corners(card.pose, card_size=self.film.card_size)
                    scale = max_pixel_scale(homography(source, target))
                    maximum = max(maximum, scale)
                    margin = min(target.min(), (np.array(SIZE)-target).min())
                    minimum = min(minimum, margin)
                    assert scale <= 1 and margin >= 16, (shot, u, scale, margin)
                    if card.lift:
                        source, photo, _ = photo_geometry(card.lift, CONTENT_ORIGIN,
                                                        self.film.card_size, self.film.lift)
                        target = project_points(card.pose, photo)
                        scale = max_pixel_scale(homography(source, target), (0, 0, *source[2]))
                        maximum = max(maximum, scale)
                        assert scale <= 1 and target.min() >= 16 and np.all(target <= np.array(SIZE)-16)
        # A single continuous camera across the catalogue -> photo lift boundary.
        if self.continuous_catalogue:
            assert self.layout(2, 1)[0].pose == self.layout(3, 0)[0].pose
            assert self.layout(2, 1)[0].clock == self.layout(3, 0)[0].clock
        return {'max_source_scale': round(maximum, 4), 'min_margin': round(float(minimum), 2),
                'catalogue_lift_camera_continuity': 'exact' if self.continuous_catalogue else 'separate scenes',
                'music': timing_verification(),
                'moving_rows': validate_rows(self.film.card_size)}


def render_shot(story, shot, ffmpeg, output):
    start, stop = CUT_FRAMES[shot:shot+2]
    target = output/f'film-shot-{shot:02d}.mp4'
    command = [ffmpeg, '-y', '-v', 'error', '-f', 'rawvideo', '-pix_fmt', 'rgb24',
               '-s', '1920x1080', '-r', '60', '-i', 'pipe:0', '-an', '-c:v', 'libx264',
               '-preset', 'medium', '-crf', '17', '-pix_fmt', 'yuv420p', '-threads', '2',
               str(target)]
    process = subprocess.Popen(command, stdin=subprocess.PIPE, stderr=subprocess.PIPE)
    try:
        for frame in range(start, stop):
            t = frame/60
            u = (t-CUT_TIMES[shot])/(CUT_TIMES[shot+1]-CUT_TIMES[shot])
            picture = story.render(shot, float(np.clip(u, 0, 1)))
            remaining = np.clip((FRAMES/60-OUTRO_BLACK_HOLD-t)/OUTRO_PICTURE_FADE, 0, 1)
            fade = min(1, t/.10, ease(remaining))
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
    print(f'Shot {shot}: {stop-start} frames ready', flush=True)


def assemble(ffmpeg, output, preview=False, project_id='hubarch'):
    track = MUSIC_DIR/'references/TpZwt4w9TnM.webm'
    start = SOURCE_START
    count = 2 if preview else 8
    frames = CUT_FRAMES[count]
    duration = frames/60
    raw = subprocess.check_output([ffmpeg, '-v', 'error', '-i', str(track),
        '-af', f'atrim=start={start},asetpts=PTS-STARTPTS',
        '-t', str(duration), '-ar', '48000', '-ac', '2', '-f', 'f32le', 'pipe:1'])
    samples = np.frombuffer(raw, dtype='<f4').reshape(-1, 2).copy()
    assert len(samples) == frames*800
    gain = min(1, 10**(-2/20)/np.max(np.abs(samples)))
    samples *= gain
    samples[:192] *= np.linspace(0, 1, 192)[:, None]
    if preview:
        samples[-12000:] *= np.linspace(1, 0, 12000)[:, None]
    else:
        tail_end = len(samples)-round(OUTRO_SILENCE_HOLD*48000)
        tail_start = tail_end-round(OUTRO_MUSIC_FADE*48000)
        envelope = np.cos(np.linspace(0, np.pi/2, tail_end-tail_start))**2
        samples[tail_start:tail_end] *= envelope[:, None]
        samples[tail_end:] = 0
    audio = output/('first-light-preview.wav' if preview else 'first-light-edit.wav')
    with wave.open(str(audio), 'wb') as wav:
        wav.setnchannels(2)
        wav.setsampwidth(2)
        wav.setframerate(48000)
        wav.writeframes(np.round(samples*32767).astype('<i2').tobytes())
    concat = output/('preview-concat.txt' if preview else 'film-concat.txt')
    concat.write_text('\n'.join(f"file 'film-shot-{i:02d}.mp4'" for i in range(count)), encoding='utf-8')
    target = output/('motion-check-6s.mp4' if preview else f'{project_id}-showreel-first-light-v4.mp4')
    subprocess.run([ffmpeg, '-y', '-v', 'error', '-f', 'concat', '-safe', '0', '-i', str(concat),
        '-i', str(audio), '-map', '0:v:0', '-map', '1:a:0', '-c:v', 'copy', '-c:a', 'aac',
        '-b:a', '256k', '-t', str(duration), '-movflags', '+faststart', str(target)], check=True)
    result = subprocess.run([ffmpeg, '-v', 'error', '-i', str(target), '-map', '0:v:0',
        '-map', '0:a:0', '-f', 'null', '-', '-progress', 'pipe:1', '-nostats'],
        capture_output=True, text=True, check=True)
    counts = [int(row.split('=')[1]) for row in result.stdout.splitlines() if row.startswith('frame=')]
    assert counts[-1] == frames
    metadata = {'track': 'First Light / Infraction', 'source': 'https://www.youtube.com/watch?v=TpZwt4w9TnM',
        'author_track_page': 'https://inaudio.org/track/first-light-technology/',
        'credit': 'Music from #InAudio: https://inaudio.org/ — Infraction, First Light.',
        'publication': 'Private review export. Author description requires an InAudio subscription for commercial use; no commercial license was purchased by this task.',
        'source_bpm_measured': 130, 'tempo_adjustment': 1.0, 'source_start': start,
        'audio_peak_dbfs': float(20*np.log10(np.max(np.abs(samples)))),
        'frames': frames, 'duration': duration, 'decode_video_audio': 'passed',
        'montage_cut_frames': CUT_FRAMES[:count+1], 'timing': timing_verification(),
        'music_selection': 'User favorite; source audio downloaded successfully.',
        'ending': None if preview else {'picture_fade_seconds': OUTRO_PICTURE_FADE,
            'music_fade_seconds': OUTRO_MUSIC_FADE, 'black_hold_seconds': OUTRO_BLACK_HOLD,
            'silence_hold_seconds': OUTRO_SILENCE_HOLD}}
    (output/('preview-check.json' if preview else 'music-and-export.json')).write_text(json.dumps(metadata, indent=2), encoding='utf-8')
    print(f'Ready: {target}', flush=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--shot', type=int, choices=range(8))
    parser.add_argument('--ffmpeg', default='ffmpeg')
    parser.add_argument('--assemble', action='store_true')
    parser.add_argument('--preview', action='store_true')
    args = parser.parse_args()
    from showreel import ROOT
    output = ROOT/'output/showreels/hubarch/story-refined-v4'
    output.mkdir(exist_ok=True)
    if args.assemble:
        assemble(args.ffmpeg, output, args.preview)
        return
    story = Story()
    if args.shot is not None:
        render_shot(story, args.shot, args.ffmpeg, output)
        return
    checks = story.validate()
    board = Image.new('RGB', (1440, 4*470), '#080d13')
    font = ImageFont.truetype('C:/Windows/Fonts/segoeui.ttf', 20)
    small = ImageFont.truetype('C:/Windows/Fonts/segoeui.ttf', 17)
    draw = ImageDraw.Draw(board)
    for shot in range(8):
        still = story.render(shot, .5)
        still.save(output/f'shot-{shot+1:02d}.jpg', quality=95)
        x, y = shot%2*720, shot//2*470
        board.paste(still.resize((720, 405), Image.Resampling.LANCZOS), (x, y))
        draw.text((x+20, y+411), CAPTIONS[shot], font=font, fill='white')
        draw.text((x+20, y+440), f'{CUT_TIMES[shot]:.1f}–{CUT_TIMES[shot+1]:.1f} с / музыкальные акценты',
                  font=small, fill='#6995af')
    board.save(output/'hubarch-storyboard.jpg', quality=95)
    (output/'story.json').write_text(json.dumps({
        'status': 'native site story film; music downloaded from user reference',
        'reference_music': 'First Light / Infraction', 'duration': FRAMES/60,
        'scenes': [{'purpose': title, 'start_seconds': CUT_TIMES[i], 'end_seconds': CUT_TIMES[i+1]}
                   for i, title in enumerate(CAPTIONS)],
        'verification': checks}, ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps(checks), flush=True)
    print(output/'hubarch-storyboard.jpg', flush=True)


if __name__ == '__main__':
    main()
