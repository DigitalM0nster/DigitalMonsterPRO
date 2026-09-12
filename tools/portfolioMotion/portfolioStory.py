"""Finish the four remaining native-site films using the approved Hubarch edit."""
import argparse
from functools import lru_cache
import hashlib
import json
import shutil
import subprocess
import zipfile

import numpy as np
from PIL import Image, ImageDraw, ImageFont

from direction import Pose, SIZE
from hubarchStory import Story, Card, ease, render_shot, assemble
from hubarchMusicCues import CUT_TIMES, FRAMES
from showreel import ROOT

PROJECTS = {
    'nipigas': {
        'title': 'НИПИГАЗ', 'number': '01', 'scale': .78, 'continuous': True,
        'scenes': [('select', 4.4, 5.6), None, ('home', .3, 2.3),
                   ('home', 2.3, 4.0), ('case', 6.2, 7.35), None, None, ('select', 5.6, 5.6)],
        'field': [('select', 5.6), ('home', .6), ('case', 6.2),
                  ('home', 3.6), ('case', 8.0), ('case', 6.7)],
        'cascade': [('select', 5.6), ('home', .8), ('home', 3.2), ('case', 6.2)],
        'labels': ['Календарь памяти', 'Система экранов', 'Архивные истории',
                   'Продолжение хронологии', 'Выбор дат', 'Глубина истории', 'Движущиеся ряды', 'Календарь победы'],
    },
    'ostankino': {
        'title': 'ОСТАНКИНО', 'number': '03', 'scale': .74, 'continuous': True,
        'scenes': [('home', .1, 1.5), None, ('home', 1.5, 3.0),
                   ('home', 3.0, 3.0), ('select', 2.5, 5.6), None, None, ('home', 2.7, 2.7)],
        'lift_scene': 3,
        'field': [('home', 2.7), ('select', 3.4), ('case', 8.8),
                  ('case', 6.4), ('home', .8), ('select', 5.6)],
        'cascade': [('home', 2.7), ('select', 3.5), ('case', 6.8), ('case', 8.8)],
        'labels': ['Медиакомплекс', 'Система сайта', 'Живая типографика',
                   'Название в объёме', 'Аренда офисов', 'Студии и павильоны', 'Движущиеся ряды', 'Останкино'],
    },
    'mmk-1': {
        'title': 'ММК-1', 'number': '04', 'scale': .74, 'continuous': False,
        'scenes': [('home', .1, 1.5), None, ('select', 2.5, 5.0),
                   ('case', 6.2, 9.0), ('home', .6, 3.9), None, None, ('home', 3.8, 3.8)],
        'field': [('home', .8), ('select', 3.0), ('case', 8.8),
                  ('home', 3.8), ('select', 5.6), ('home', 2.2)],
        'cascade': [('home', 1.0), ('select', 3.4), ('case', 8.6), ('home', 3.8)],
        'labels': ['Башенные краны', 'Система сайта', 'Каталог техники',
                   'Компания', 'Живая 3D-сцена', 'Техника и сервис', 'Движущиеся ряды', 'ММК-1'],
    },
    'belka-production': {
        'title': 'СТУДИЯ БЕЛКИ', 'number': '05', 'scale': .74, 'continuous': True,
        'scenes': [('home', .1, 1.5), None, ('select', 2.5, 5.6),
                   ('select', 5.6, 5.6), ('case', 6.2, 8.8), None, None, ('home', 2.7, 2.7)],
        'lift_scene': 3,
        'field': [('home', .8), ('select', 3.2), ('case', 8.8),
                  ('select', 5.6), ('home', 3.6), ('case', 6.2)],
        'cascade': [('home', 1.0), ('select', 3.4), ('select', 5.6), ('case', 8.8)],
        'labels': ['Характер студии', 'Система дизайна', 'Кейсы агентства',
                   'Карточка в объёме', 'Сайт-открытка', 'Работы студии', 'Движущиеся ряды', 'Студия Белки'],
    },
}

CASCADE_POSES = (Pose(444, 318.5, .40, -10, 3, -2), Pose(854, 388.5, .46, -10, 3, -2),
                 Pose(1234, 538.5, .53, -10, 3, -2), Pose(1514, 758.5, .51, -10, 3, -2))


def project_layout(config, shot, u):
    if shot in (1, 6):
        return []
    if shot == 5:
        # The camera is steady; each original site's own animation stays live.
        return [Card(group, clock+u*.25, pose)
                for (group, clock), pose in zip(config['cascade'], CASCADE_POSES)]
    group, start, stop = config['scenes'][shot]
    pose = Pose(960, 540, config['scale'], -2 if shot in (0, 7) else 0, 1, 0)
    lift = 0
    if shot == config.get('lift_scene'):
        lift = .32*ease(min(1, u/.5))*(1-ease(float(np.clip((u-.57)/.4, 0, 1))))
    return [Card(group, start+(stop-start)*u, pose, lift)]


def cache_static_chrome(film):
    """Reuse fixed offline mockup shadows/rims without caching the website video."""
    draw = film.style.frame_volume

    @lru_cache(maxsize=16)
    def layer(size, front_bytes, back_bytes):
        canvas = Image.new('RGBA', size)
        draw(canvas, np.frombuffer(front_bytes, dtype=float).reshape(3, 3),
             np.frombuffer(back_bytes, dtype=float).reshape(3, 3))
        return canvas

    def composite(canvas, front, back):
        canvas.alpha_composite(layer(canvas.size, front.tobytes(), back.tobytes()))

    film.style.frame_volume = composite


def prepare(project):
    config = PROJECTS[project]
    story = Story(project, lambda shot, u: project_layout(config, shot, u), config['continuous'])
    story.film.field_content = config['field']
    cache_static_chrome(story.film)
    return story


def output_folder(project):
    folder = ROOT/f'output/showreels/{project}/story-final-v1'
    folder.mkdir(parents=True, exist_ok=True)
    return folder


def storyboard(story, project, folder):
    checks = story.validate()
    board = Image.new('RGB', (1920, 640), '#080d13')
    draw = ImageDraw.Draw(board)
    font = ImageFont.truetype('C:/Windows/Fonts/segoeui.ttf', 18)
    for shot in range(8):
        still = story.render(shot, .5)
        still.save(folder/f'shot-{shot+1:02d}.jpg', quality=94)
        x, y = shot%4*480, shot//4*320
        board.paste(still.resize((480, 270), Image.Resampling.LANCZOS), (x, y))
        draw.text((x+12, y+281), PROJECTS[project]['labels'][shot], font=font, fill='white')
    board.save(folder/'storyboard.jpg', quality=94)
    metadata = {'project': project, 'duration': FRAMES/60, 'frames': FRAMES,
                'source': story.film.project['source'], 'verification': checks,
                'scenes': [{'label': title, 'start': CUT_TIMES[i], 'end': CUT_TIMES[i+1]}
                           for i, title in enumerate(PROJECTS[project]['labels'])]}
    (folder/'story.json').write_text(json.dumps(metadata, ensure_ascii=False, indent=2), encoding='utf-8')
    print(f'{project}: storyboard and geometry verified', flush=True)


def check_ending(ffmpeg, movie):
    pixels = subprocess.check_output([ffmpeg, '-v', 'error', '-sseof', '-0.5', '-i', str(movie),
        '-an', '-vf', 'scale=16:9:flags=area', '-pix_fmt', 'rgb24', '-f', 'rawvideo', 'pipe:1'])
    assert np.frombuffer(pixels, np.uint8).max() == 0, f'Picture tail is not black: {movie}'
    audio = subprocess.check_output([ffmpeg, '-v', 'error', '-sseof', '-0.25', '-i', str(movie),
        '-vn', '-ar', '48000', '-ac', '2', '-f', 'f32le', 'pipe:1'])
    peak = float(np.max(np.abs(np.frombuffer(audio, '<f4'))))
    assert peak < .0001, f'Audio tail not silent: {movie}'
    return {'black_picture_tail': 'passed', 'silent_audio_tail': 'passed', 'audio_tail_peak': peak}


def package(ffmpeg):
    ready = ROOT/'output/showreels/ready-final'
    ready.mkdir(exist_ok=True)
    sources = [('01-Nipigas', output_folder('nipigas')/'nipigas-showreel-first-light-v4.mp4'),
               ('02-Hubarch', ROOT/'output/showreels/hubarch/story-refined-v4/hubarch-showreel-first-light-v4.mp4'),
               ('03-Ostankino', output_folder('ostankino')/'ostankino-showreel-first-light-v4.mp4'),
               ('04-MMK-1', output_folder('mmk-1')/'mmk-1-showreel-first-light-v4.mp4'),
               ('05-Belka-production', output_folder('belka-production')/'belka-production-showreel-first-light-v4.mp4')]
    manifest = []
    for name, source in sources:
        ending = check_ending(ffmpeg, source)
        if not (source.parent/'ending-check.json').exists():
            (source.parent/'ending-check.json').write_text(json.dumps(ending, indent=2), encoding='utf-8')
        target = ready/f'{name}.mp4'
        shutil.copy2(source, target)
        manifest.append({'file': target.name, 'duration': FRAMES/60, 'frames': FRAMES,
                         'sha256': hashlib.sha256(target.read_bytes()).hexdigest(), 'ending': ending})
    (ready/'manifest.json').write_text(json.dumps(manifest, indent=2), encoding='utf-8')
    shutil.copy2(sources[1][1].parent/'music-and-export.json', ready/'music-credit.json')
    (ready/'README.md').write_text('# Готовые шоурилы\n\nПять самостоятельных роликов: 29,92 секунды, 1920×1080, 60 fps, со звуком.\n'
        'Реальные дизайны сайтов, ровные встречные ряды и плавная концовка.\n'
        'Музыка: Infraction — First Light, выбранный пользователем трек.\n'
        'https://www.youtube.com/watch?v=TpZwt4w9TnM\n'
        'Авторство и условия исходного трека сохранены в music-credit.json.\n', encoding='utf-8')
    archive = ROOT/'output/showreels/portfolio-showreels-final.zip'
    with zipfile.ZipFile(archive, 'w', zipfile.ZIP_STORED) as pack:
        names = [f'{name}.mp4' for name, _ in sources]+['manifest.json', 'music-credit.json', 'README.md']
        for name in names:
            pack.write(ready/name, name)
    print(f'Collection ready: {archive}', flush=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--project', choices=PROJECTS)
    parser.add_argument('--ffmpeg', default='ffmpeg')
    parser.add_argument('--render', action='store_true')
    parser.add_argument('--assemble', action='store_true')
    parser.add_argument('--package', action='store_true')
    args = parser.parse_args()
    if args.package:
        package(args.ffmpeg)
        return
    if not args.project:
        parser.error('--project is required')
    folder = output_folder(args.project)
    if args.assemble:
        assemble(args.ffmpeg, folder, project_id=args.project)
        return
    story = prepare(args.project)
    storyboard(story, args.project, folder)
    if args.render:
        for shot in range(8):
            render_shot(story, shot, args.ffmpeg, folder)
        assemble(args.ffmpeg, folder, project_id=args.project)
        movie = folder/f'{args.project}-showreel-first-light-v4.mp4'
        ending = check_ending(args.ffmpeg, movie)
        (folder/'ending-check.json').write_text(json.dumps(ending, indent=2), encoding='utf-8')
        print(f'Complete: {args.project}', flush=True)


if __name__ == '__main__':
    main()
