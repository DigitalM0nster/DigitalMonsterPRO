"""Verified source recordings for the five projects with available material."""
from elementLift import HUBARCH_LIFT, LiftSpec
from functools import lru_cache
import numpy as np
from PIL import Image
from showreel import Captures


class ProjectCaptures(Captures):
    """Keep browser-export pixels intact, padding tiny export-size differences."""
    def __init__(self, directory, size=(1280, 720)):
        super().__init__(directory)
        self.size = size

    @lru_cache(maxsize=12)
    def image(self, filename):
        with Image.open(self.directory/filename) as source:
            w, h = source.size
            if not (self.size[0]-40 <= w <= self.size[0] and self.size[1]-30 <= h <= self.size[1]):
                raise ValueError(f'Unexpected native capture dimensions: {filename}: {source.size}')
            pixels = np.asarray(source.convert('RGB'))
            # CUA exports vary by a few pixels. Extend only the final edge;
            # never enlarge, crop or resample the actual website artwork.
            pixels = np.pad(pixels, ((0, self.size[1]-h), (0, self.size[0]-w), (0, 0)), mode='edge')
            return Image.fromarray(pixels)

PROJECTS = {
    'hubarch': {
        'address': 'hubarch.ru', 'capture': 'sources/capture-v2',
        'source': 'Native browser recordings from https://hubarch.ru/ru',
        'lift': HUBARCH_LIFT, 'version': 'v9',
    },
    'ostankino': {
        'address': 'ostankino.ru', 'capture': 'sources/native',
        'source': 'Native browser recordings: https://ostankino.ru/, /rent/, /studios-rental/',
        'lift': LiftSpec((16, 581, 1253, 688), 'home', .6, 1.8, -12, -26, 120),
    },
    'belka-production': {
        'address': 'belkaproduction.ru', 'capture': 'sources/native',
        'source': 'Local original Belka Production application, /, /cases, /cases/case1; port 5188',
        'lift': LiftSpec((627, 300, 1209, 613)),
    },
    'mmk-1': {
        'address': 'MMK-1', 'capture': 'sources/native',
        'source': 'Local original MMK1.local application: home animated crane, rental catalogue, about; port 5189',
        'lift': None,
    },
    'nipigas': {
        'address': 'NIPIGAS / 9 MAY', 'capture': 'sources/native',
        'source': 'Original public/video/nipigas_9_may.mp4: web viewport crop 1904x912 at (0,120), excludes only browser/desktop chrome, reduced to 1280x614. Excerpts at 12, 2 and 23 seconds; source retained at 60 fps',
        'source_size': (1280, 614),
        'lift': None,
    },
}
