"""Native artwork, browser views and continuous editorial compositions."""
from dataclasses import dataclass, replace


@dataclass(frozen=True)
class Layer:
    key: str
    group: str
    clock: float
    x: float
    y: float
    scale: float
    roll: float = 0
    crop: tuple | None = None
    opacity: float = 1
    cutout: bool = False


# Rectangles are measured against the original captured viewport, without chrome.
ART = {
    'belka-production': [('select', 5.6, (627, 300, 1210, 613)),
                         ('select', 5.6, (35, 303, 608, 616)),
                         ('home', 2.7, (914, 220, 1190, 553))],
    'hubarch': [('select', 5.6, (280, 160, 1001, 561)),
                ('select', 3., (280, 160, 1001, 561)),
                ('home', 2.7, (116, 143, 1168, 556))],
    'nipigas': [('home', .6, (174, 4, 1080, 580)),
                ('select', 5.6, (325, 177, 832, 403)),
                ('home', .6, (716, 335, 1048, 550))],
    'ostankino': [('case', 8.8, (18, 433, 605, 715)),
                  ('case', 8.8, (645, 433, 1229, 715)),
                  ('home', 3., (18, 581, 1248, 688))],
    'mmk-1': [('home', 2.7, (760, 76, 1272, 690)),
              ('select', 5.6, (64, 367, 493, 558)),
              ('select', 5.6, (525, 367, 954, 558))],
}


def compositions(project):
    clocks = dict(home=2.7, select=5.6, case=8.8)
    if project == 'nipigas':
        clocks['home'], clocks['case'] = .6, 6.2

    def site(group, x=960, y=540, scale=.82, roll=0):
        return Layer(group, group, clocks[group], x, y, scale, roll)

    def art(index, x, y, scale=.92, roll=0):
        group, clock, crop = ART[project][index]
        return Layer(f'art{index}', group, clock, x, y, scale, roll, crop,
                     cutout=project == 'belka-production' and index == 2)

    hero = 'select' if project == 'nipigas' else 'home'
    opening = [site(hero)]
    if project == 'belka-production':
        fan = [site('case', 1450, 657, .48, 5), site('select', 470, 657, .48, -5),
               site('home', 960, 448, .64)]
        return [opening, fan,
            [site('select', 465, 626, .47, -3), art(0, 1300, 606, .94, 3), art(2, 965, 300, .94)],
            [art(1, 515, 446, .96, -4), art(0, 1400, 590, .96, 4), art(2, 945, 460, .96)],
            [art(0, 1450, 323, .61, 4), site('case', 832, 590, .73, -1)],
            [art(0, 475, 315, .94, -3), art(1, 1290, 338, .95, 2),
             site('select', 730, 808, .43, -2), art(2, 1455, 765, .83)],
            [site('case', 1420, 670, .49, 5), site('select', 470, 650, .49, -5),
             site('home', 970, 405, .64)], opening]
    if project == 'ostankino':
        multiview = [site('home', 556, 310, .50), site('select', 1364, 310, .50),
                     site('case', 556, 770, .50),
                     Layer('monitor', 'case', 6.4, 1364, 770, .50)]
        return [opening,
            multiview,
            [art(2, 960, 285, .93), art(0, 570, 595, .96), art(1, 1330, 595, .96)],
            [art(0, 520, 398, .98), art(1, 1380, 628, .98), art(2, 960, 878, .93)],
            [site('select', 1120, 510, .72), art(0, 385, 795, .81)],
            [art(1, 475, 295, .95), site('case', 1290, 602, .64), art(0, 450, 785, .95)],
            multiview, opening]
    if project == 'mmk-1':
        return [opening,
            [site('case', 1545, 540, .43), site('select', 375, 540, .43), site('home', 960, 540, .54)],
            [art(0, 1180, 510, .93), art(1, 430, 400, .98), art(2, 430, 750, .98)],
            [art(0, 845, 520, .95), art(1, 1510, 330, .88), art(2, 1510, 740, .88)],
            [site('select', 880, 515, .78), art(1, 1490, 845, .8)],
            [site('case', 495, 445, .53), art(0, 1340, 562, .81), art(2, 480, 857, .94)],
            [site('select', 510, 736, .44), site('case', 1430, 736, .44), site('home', 960, 330, .60)], opening]
    if project == 'nipigas':
        return [opening,
            [site('home', 448, 330, .47, -2), site('case', 1472, 750, .47, 2), site('select', 960, 540, .59)],
            [art(0, 1190, 540, .91), site('home', 455, 365, .43, -2), art(1, 450, 772, .98)],
            [art(0, 771, 500, .93), art(1, 1510, 382, .98, 3), art(2, 1505, 770, .98)],
            [site('case', 840, 500, .78), art(1, 1505, 799, .94)],
            [site('select', 480, 368, .48), art(0, 1330, 572, .86), art(1, 450, 809, .92, -3)],
            [site('home', 480, 360, .51, -2), site('case', 1440, 697, .51, 2), site('select', 975, 560, .47)], opening]
    # Hubarch uses an architectural composition; its own imagery replaces
    # repeated full-browser shots between the opening and concluding screens.
    return [opening,
        [site('select', 545, 490, .63, -3), site('home', 1375, 610, .63, 3)],
        [site('select', 452, 605, .43, -2), art(0, 1290, 510, .91, 2)],
        [art(0, 1350, 490, .91, 2), art(1, 555, 560, .91, -2)],
        [site('case', 1045, 525, .74), art(1, 395, 820, .71)],
        [art(1, 485, 343, .84, -2), art(0, 1420, 680, .84, 2), art(2, 975, 509, .71)],
        [site('select', 475, 700, .46, -3), site('case', 1450, 700, .46, 3), site('home', 960, 352, .60)], opening]


def accent_composition(project, layers, stage):
    """A short musical reflow within long scenes, not a 4-second slow drift."""
    if stage == 7:
        return layers
    shift = {'belka-production': (48, 42), 'hubarch': (55, 22), 'nipigas': (26, 56),
             'ostankino': (64, 0), 'mmk-1': (52, 20)}[project]
    changed = []
    for i, layer in enumerate(layers):
        sign = 1 if i%2 else -1
        changed.append(replace(layer, x=layer.x+sign*shift[0], y=layer.y-sign*shift[1],
                               roll=layer.roll+sign*(1.2 if project == 'belka-production' else .3)))
    return changed
