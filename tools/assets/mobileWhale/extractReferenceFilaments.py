"""Clean reference and approximate role corridors to single filament centerlines.

Writes diagnostic artifacts to ignored output/mobile-whale. Brush strokes locate
whole-line roles; clean image ridges determine the fitted curves.
"""
import argparse
import json
import math
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
WORK = ROOT / "output/mobile-whale"
WORK.mkdir(parents=True, exist_ok=True)
SOURCE = HERE / 'reference.png'
A = np.array([[.734457705911134, .00003287556449753], [-.000001238290936697, .7343678251412079]])
OFFSET = np.array([-2.158697993207807, -7.155773879489061])


def convolve(a, kernel, axis):
    radius = len(kernel)//2
    padding = [(0, 0), (0, 0)]
    padding[axis] = (radius, radius)
    p = np.pad(a, padding, mode='edge')
    result = np.zeros_like(a)
    for i, value in enumerate(kernel):
        sl = [slice(None), slice(None)]
        sl[axis] = slice(i, i+a.shape[axis])
        result += value*p[tuple(sl)]
    return result


def gaussian(a, sigma):
    radius = math.ceil(3*sigma)
    x = np.arange(-radius, radius+1, dtype=np.float32)
    g = np.exp(-.5*(x/sigma)**2)
    g /= g.sum()
    return convolve(convolve(a, g, 0), g, 1)


def sample(a, x, y):
    ix = np.clip(x.astype(np.int32), 0, a.shape[1]-2)
    iy = np.clip(y.astype(np.int32), 0, a.shape[0]-2)
    fx, fy = x-ix, y-iy
    return a[iy, ix]*(1-fx)*(1-fy)+a[iy, ix+1]*fx*(1-fy)+a[iy+1, ix]*(1-fx)*fy+a[iy+1, ix+1]*fx*fy


def thin(image):
    """Zhang-Suen only removes extra width; it never invents a trajectory."""
    image = image.copy()
    for iteration in range(30):
        changed = 0
        for phase in (0, 1):
            p = np.pad(image, 1)
            n = [p[:-2, 1:-1], p[:-2, 2:], p[1:-1, 2:], p[2:, 2:],
                 p[2:, 1:-1], p[2:, :-2], p[1:-1, :-2], p[:-2, :-2]]
            count = sum(v.astype(np.uint8) for v in n)
            transitions = sum((~n[i] & n[(i+1)%8]).astype(np.uint8) for i in range(8))
            if phase == 0:
                clear = ~(n[0]&n[2]&n[4]) & ~(n[2]&n[4]&n[6])
            else:
                clear = ~(n[0]&n[2]&n[6]) & ~(n[0]&n[4]&n[6])
            remove = image & (count >= 2) & (count <= 6) & (transitions == 1) & clear
            changed += int(remove.sum())
            image[remove] = False
        if not changed:
            return image, iteration+1
    return image, 30


def make_mask(size):
    # Contours serve only as a broad foreground/UI exclusion mask.
    ref = json.loads((ROOT/'tools/assets/mobileWhale/referenceContours.json').read_text())
    mask = Image.new('L', size)
    draw = ImageDraw.Draw(mask)
    inverse = np.linalg.inv(A)
    def polygon(points):
        q = (np.asarray(points)-OFFSET)@inverse.T
        draw.polygon([tuple(p) for p in q], fill=255)
    polygon(ref['bodyRows'][-1]['points']+ref['bodyRows'][0]['points'][::-1])
    for key in ['nearFin', 'upperFluke', 'lowerFluke']:
        polygon(ref[key]['leading']+ref[key]['trailing'][::-1])
    return np.asarray(mask.filter(ImageFilter.MaxFilter(19))) > 0


def graph_from_ridges(ridge, normal_x, normal_y, smoothed):
    y, x = np.nonzero(ridge)
    coordinates = np.column_stack((x, y)).astype(float)
    nx, ny = normal_x[y, x], normal_y[y, x]
    p = sample(smoothed, x+nx, y+ny)
    m = sample(smoothed, x-nx, y-ny)
    c = smoothed[y, x]
    shift = np.clip((p-m)/(2*np.maximum(1e-6, 2*c-p-m)), -.6, .6)
    coordinates += np.column_stack((nx, ny))*shift[:, None]
    lookup = {(int(xx), int(yy)): i for i, (xx, yy) in enumerate(zip(x, y))}
    adjacency = [set() for _ in coordinates]
    for i, (xx, yy) in enumerate(zip(x, y)):
        for dx, dy in [(1, 0), (0, 1), (1, 1), (-1, 1)]:
            j = lookup.get((xx+dx, yy+dy))
            if j is None:
                continue
            # A diagonal beside an existing orthogonal link is a triangular
            # pixel artifact, not a second anatomical branch.
            if dx and dy and ((xx+dx, yy) in lookup or (xx, yy+dy) in lookup):
                continue
            adjacency[i].add(j)
            adjacency[j].add(i)
    return coordinates, adjacency, lookup


def bridge_gaps(coords, adjacency, lookup, max_gap=4.5, fit_span=6., min_fit=3., transverse=.85, cosine=.94, score_margin=1.35):
    endpoints = [i for i, neighbors in enumerate(adjacency) if len(neighbors) == 1]
    tangents = {}
    for end in endpoints:
        current, previous, length = end, -1, 0.
        while length < fit_span:
            others = adjacency[current]-{previous}
            if not others or (current != end and len(adjacency[current]) != 2):
                break
            nxt = next(iter(others))
            length += np.linalg.norm(coords[nxt]-coords[current])
            previous, current = current, nxt
        if length >= min_fit:
            v = coords[end]-coords[current]
            tangents[end] = v/max(np.linalg.norm(v), 1e-6)
    bins = {}
    for i in tangents:
        bins.setdefault(tuple(np.floor(coords[i]/max_gap).astype(int)), []).append(i)
    candidates = {}
    for i, tangent in tangents.items():
        bx, by = np.floor(coords[i]/max_gap).astype(int)
        options = []
        for ox in (-1, 0, 1):
            for oy in (-1, 0, 1):
                for j in bins.get((bx+ox, by+oy), []):
                    if j == i:
                        continue
                    delta = coords[j]-coords[i]
                    length = np.linalg.norm(delta)
                    if length <= 1 or length > max_gap:
                        continue
                    v = delta/length
                    da, db = tangent@v, tangents[j]@-v
                    if min(da, db) < cosine:
                        continue
                    cross_a = tangent[0]*delta[1]-tangent[1]*delta[0]
                    cross_b = tangents[j][0]*delta[1]-tangents[j][1]*delta[0]
                    if max(abs(cross_a), abs(cross_b)) > min(transverse, .28*length):
                        continue
                    blocked = False
                    for t in np.arange(1., length-1., .5):
                        xx, yy = np.rint(coords[i]+v*t).astype(int)
                        k = lookup.get((xx, yy))
                        if k is not None and k not in {i, j}:
                            blocked = True
                            break
                    if not blocked:
                        options.append((length+3*(2-da-db), j))
        options.sort()
        if options and (len(options) == 1 or options[1][0] > score_margin*options[0][0]):
            candidates[i] = options[0][1]
    joined = 0
    for i, j in candidates.items():
        if i < j and candidates.get(j) == i:
            adjacency[i].add(j)
            adjacency[j].add(i)
            joined += 1
    return joined


def trace_paths(coords, adjacency, minimum_length=7):
    # At a true junction use a reciprocal straight continuation. A brighter
    # neighboring line never overrides this local tangent ownership.
    pairing = {}
    for i, neighbors in enumerate(adjacency):
        if len(neighbors) <= 2:
            continue
        arms = {}
        for n in neighbors:
            previous, current, distance = i, n, 0.
            for _ in range(5):
                if len(adjacency[current]) != 2:
                    break
                nxt = next(iter(adjacency[current]-{previous}))
                distance += np.linalg.norm(coords[nxt]-coords[current])
                previous, current = current, nxt
                if distance >= 5:
                    break
            d = coords[current]-coords[i]
            arms[n] = d/max(np.linalg.norm(d), 1e-8)
        best = {}
        for n, v in arms.items():
            options = sorted((float(v@w), k) for k, w in arms.items() if k != n)
            if options[0][0] < -.866 and (len(options) == 1 or options[1][0]-options[0][0] > .12):
                best[n] = options[0][1]
        for n, k in best.items():
            if best.get(k) == n:
                pairing[(i, n)] = k
    used = set()
    output = []
    ordered = sorted(range(len(coords)), key=lambda i: len(adjacency[i]) == 2)
    for start in ordered:
        for nxt in adjacency[start]:
            edge = tuple(sorted((start, nxt)))
            if edge in used:
                continue
            path = [start]
            previous, current = start, nxt
            while True:
                used.add(tuple(sorted((previous, current))))
                path.append(current)
                others = adjacency[current]-{previous}
                if len(adjacency[current]) == 2:
                    candidate = next(iter(others))
                else:
                    candidate = pairing.get((current, previous))
                if candidate is None or tuple(sorted((current, candidate))) in used:
                    break
                previous, current = current, candidate
            p = coords[path]
            length = np.linalg.norm(np.diff(p, axis=0), axis=1).sum()
            if length >= minimum_length:
                output.append(p)
    return output


def fair_path(p, sigma):
    if sigma <= 0:
        return p
    cumulative = np.r_[0., np.cumsum(np.linalg.norm(np.diff(p, axis=0), axis=1))]
    if cumulative[-1] < 1:
        return p
    at = np.linspace(0, cumulative[-1], max(3, math.ceil(cumulative[-1]) + 1))
    points = np.column_stack([np.interp(at, cumulative, p[:, axis]) for axis in (0, 1)])
    step = cumulative[-1]/(len(at)-1)
    radius = math.ceil(sigma/step*3)
    kernel = np.exp(-.5*(np.arange(-radius, radius+1)*step/sigma)**2)
    kernel /= kernel.sum()
    padded = np.pad(points, [(radius, radius), (0, 0)], mode='edge')
    result = sum(weight*padded[i:i+len(points)] for i, weight in enumerate(kernel))
    # Preserve genuine photo endpoints; suppress only small raster kinks.
    displacement = result-points
    distance = np.linalg.norm(displacement, axis=1)
    displacement *= np.minimum(1., .9/np.maximum(distance, 1e-8))[:, None]
    result = points+displacement
    result[0], result[-1] = p[0], p[-1]
    return result


def curvature(p):
    cumulative = np.r_[0., np.cumsum(np.linalg.norm(np.diff(p, axis=0), axis=1))]
    if cumulative[-1] < 6:
        return 0.
    at = np.arange(1., cumulative[-1]-1., 1.)
    lo, hi = np.maximum(0., at-2), np.minimum(cumulative[-1], at+2)
    tangent = np.column_stack([np.interp(hi, cumulative, p[:, i])-np.interp(lo, cumulative, p[:, i]) for i in (0, 1)])
    angle = np.unwrap(np.arctan2(tangent[:, 1], tangent[:, 0]))
    return float(np.mean(abs(np.diff(angle))))


def run(args):
    image = Image.open(SOURCE).convert('RGB')
    rgb = np.asarray(image).astype(np.float32)
    # Compress broad star/glow dynamic range while retaining cyan filaments.
    raw = np.maximum(0, .65*rgb[:, :, 2]+.35*rgb[:, :, 1]-rgb[:, :, 0])
    signal = 70*np.log1p(raw/35)
    mask = make_mask(image.size)
    smoothed = gaussian(signal, args.sigma)
    hxx = np.roll(smoothed, 1, 1)-2*smoothed+np.roll(smoothed, -1, 1)
    hyy = np.roll(smoothed, 1, 0)-2*smoothed+np.roll(smoothed, -1, 0)
    hxy = (np.roll(np.roll(smoothed, 1, 0), 1, 1)+np.roll(np.roll(smoothed, -1, 0), -1, 1)-np.roll(np.roll(smoothed, 1, 0), -1, 1)-np.roll(np.roll(smoothed, -1, 0), 1, 1))*.25
    radius = np.sqrt((hxx-hyy)**2+4*hxy*hxy)
    ln, lt = (hxx+hyy-radius)*.5, (hxx+hyy+radius)*.5
    nx, ny = hxy.copy(), ln-hxx
    norm = np.sqrt(nx*nx+ny*ny)
    nx = np.divide(nx, norm, out=np.ones_like(nx), where=norm > 1e-8)
    ny = np.divide(ny, norm, out=np.zeros_like(ny), where=norm > 1e-8)
    vessel = np.maximum(0, -ln)*np.exp(-.5*(lt/np.maximum(1e-6, -ln)/args.beta)**2)
    weight = gaussian(vessel, 3.)
    orientation_x = gaussian(vessel*(nx*nx-ny*ny), 3.)
    orientation_y = gaussian(vessel*2*nx*ny, 3.)
    coherence = np.sqrt(orientation_x**2+orientation_y**2)/np.maximum(weight, 1e-6)
    yy, xx = np.indices(smoothed.shape, dtype=np.float32)
    minus, plus = sample(smoothed, xx-nx, yy-ny), sample(smoothed, xx+nx, yy+ny)
    ridge = mask & (vessel > args.threshold) & (raw > 10) & (coherence >= args.coherence) & (smoothed >= minus) & (smoothed >= plus)
    ridge, iterations = thin(ridge)
    coords, adjacency, lookup = graph_from_ridges(ridge, nx, ny, smoothed)
    bridges = bridge_gaps(coords, adjacency, lookup, args.gap)
    paths = trace_paths(coords, adjacency, args.minimum)
    before_pruning = len(paths)
    paths = [fair_path(p, args.fair) for p in paths]
    paths = [p for p in paths if curvature(p) <= args.max_curvature]
    mapped = [p@A.T+OFFSET for p in paths]
    lengths = [float(np.linalg.norm(np.diff(p, axis=0), axis=1).sum()) for p in mapped]
    stats = {'sigmaSourcePx': args.sigma, 'vesselThreshold': args.threshold, 'beta': args.beta,
             'maxGapSourcePx': args.gap, 'minimumPathSourcePx': args.minimum,
             'coherenceMinimum': args.coherence, 'fairingSigmaSourcePx': args.fair,
             'maximumMeanCurvaturePerSourcePx': args.max_curvature, 'prunedPaths': before_pruning-len(paths),
             'skeletonPixels': int(ridge.sum()), 'thinningIterations': iterations, 'bridges': bridges,
             'pathCount': len(paths), 'totalLengthOriginalPx': sum(lengths),
             'oneSideBeadsAt2_9px': sum(math.ceil(length/2.9) for length in lengths),
             'lengthPercentilesOriginalPx': np.percentile(lengths, [0, 25, 50, 75, 90, 99, 100]).tolist() if lengths else []}
    linear = np.where(rgb <= 10.31475, rgb/3294.6, ((rgb/255+.055)/1.055)**2.4)
    luminance = linear[:, :, 0]*.2126+linear[:, :, 1]*.7152+linear[:, :, 2]*.0722
    data = {'source': str(SOURCE.relative_to(ROOT)).replace(chr(92), '/'), 'canvas': [1219, 679], 'registration': [*A[0], OFFSET[0], *A[1], OFFSET[1]],
            'method': 'clean-image Hessian normal-NMS skeleton, reciprocal oriented gap bridging; no annotation geometry',
            'stats': stats, 'paths': [
                {'points': np.round(p, 3).tolist(),
                 'light': np.round(np.sqrt(np.clip(sample(luminance, source_path[:, 0], source_path[:, 1]), 0, 1)), 4).tolist(),
                 'coherence': round(float(np.mean(sample(coherence, source_path[:, 0], source_path[:, 1]))), 4)}
                for p, source_path in zip(mapped, paths)]}
    (WORK/(args.name+'.json')).write_text(json.dumps(data, separators=(',', ':')))
    svg = ['<svg xmlns="http://www.w3.org/2000/svg" width="1219" height="679" viewBox="0 0 1219 679" style="width:100vw;height:100vh;display:block;background:#010712"><rect width="1219" height="679" fill="#010712"/>']
    for p, length in zip(mapped, lengths):
        points = ' '.join(f'{x:.2f},{y:.2f}' for x, y in p)
        opacity = .3 if length < 12 else .65 if length < 40 else 1
        svg.append(f'<polyline points="{points}" fill="none" stroke="#009fff" stroke-width=".65" opacity="{opacity}"/>')
    svg.append('</svg>')
    (WORK/(args.name+'.svg')).write_text('\n'.join(svg))
    print(json.dumps(stats))


def merge_scales(coarse_name, fine_name, output_name):
    coarse = json.loads((WORK/(coarse_name+'.json')).read_text())
    fine = json.loads((WORK/(fine_name+'.json')).read_text())
    cell = 1.15  # Original pixels = 1.57 source pixels; strictly one centerline.
    occupied = {}
    for path in coarse['paths']:
        for p in path['points']:
            occupied.setdefault((math.floor(p[0]/cell), math.floor(p[1]/cell)), []).append(p)
    def clear(p):
        ix, iy = math.floor(p[0]/cell), math.floor(p[1]/cell)
        for dx in (-1, 0, 1):
            for dy in (-1, 0, 1):
                for q in occupied.get((ix+dx, iy+dy), []):
                    if (p[0]-q[0])**2+(p[1]-q[1])**2 < cell**2:
                        return False
        return True
    added = []
    for path in fine['paths']:
        if path.get('coherence', 0) < .25:
            continue
        segment, light = [], []
        for p, energy in [*zip(path['points'], path['light']), (None, 0)]:
            if p is not None and clear(p):
                segment.append(p)
                light.append(energy)
            else:
                length = sum(math.dist(a, b) for a, b in zip(segment, segment[1:]))
                # Fine ribs can bend around a jaw, so use coherence per whole
                # path rather than chopping every low-coherence turn to pieces.
                # Very short kinked glow fragments are not stable filaments.
                source_segment = (np.asarray(segment)-OFFSET)@np.linalg.inv(A).T if segment else np.empty((0, 2))
                stable = length >= 6. and curvature(source_segment) <= (.17 if length < 12 else .23)
                if stable:
                    added.append({'points': segment, 'light': light, 'coherence': path.get('coherence'), 'sourceSigma': 1.25})
                segment, light = [], []
    for path in coarse['paths']:
        path['sourceSigma'] = 1.65
    coarse['paths'].extend(added)
    lengths = [sum(math.dist(a, b) for a, b in zip(path['points'], path['points'][1:])) for path in coarse['paths']]
    coarse['stats'] = {'pathCount': len(coarse['paths']), 'fineAddedPaths': len(added), 'totalLengthOriginalPx': sum(lengths),
                       'oneSideBeadsAt2_9px': sum(math.ceil(length/2.9) for length in lengths), 'duplicateExclusionOriginalPx': cell}
    coarse['method'] += '; dual scale coarse1.65 ownership plus stable fine1.25 outside1.15originalpx corridor'
    (WORK/(output_name+'.json')).write_text(json.dumps(coarse, separators=(',', ':')))
    svg = ['<svg xmlns="http://www.w3.org/2000/svg" width="1219" height="679" viewBox="0 0 1219 679" style="width:100vw;height:100vh;display:block;background:#010712"><rect width="1219" height="679" fill="#010712"/>']
    for path in coarse['paths']:
        points = ' '.join(f'{x:.2f},{y:.2f}' for x, y in path['points'])
        svg.append(f'<polyline points="{points}" fill="none" stroke="#009fff" stroke-width=".65" opacity=".8"/>')
    svg.append('</svg>')
    (WORK/(output_name+'.svg')).write_text('\n'.join(svg))
    print(json.dumps(coarse['stats']))


def polish_paths(source_name, output_name):
    """Smooth the image-derived centerlines, never the annotated strokes."""
    data = json.loads((WORK/(source_name+'.json')).read_text())
    step = .6
    def uniform(p):
        p = np.asarray(p, dtype=float)
        arc = np.r_[0., np.cumsum(np.linalg.norm(np.diff(p, axis=0), axis=1))]
        at = np.linspace(0., arc[-1], max(3, math.ceil(arc[-1]/step)+1))
        return np.column_stack([np.interp(at, arc, p[:, i]) for i in (0, 1)]), at
    def angular(p, arc):
        lo, hi = np.maximum(0., arc-2.4), np.minimum(arc[-1], arc+2.4)
        tangent = np.column_stack([np.interp(hi, arc, p[:, i])-np.interp(lo, arc, p[:, i]) for i in (0, 1)])
        theta = np.unwrap(np.arctan2(tangent[:, 1], tangent[:, 0]))
        turn = np.diff(theta)
        return theta, turn
    def smooth_curve(p, strength=1.):
        p, arc = uniform(p)
        local_step = arc[-1]/(len(arc)-1)
        theta, turns = angular(p, arc)
        k = np.gradient(theta, local_step)
        base = min(3.2, max(1.7, arc[-1]/12))*strength
        sigma = np.full(len(p), base)
        window = max(2, round(4./local_step))
        for i in range(len(p)):
            a, b = max(0, i-window), min(len(p), i+window+1)
            values = k[a:b]
            mean = np.mean(abs(values))
            sign_coherence = abs(np.sum(values))/max(1e-6, np.sum(abs(values)))
            cv = np.std(abs(values))/max(1e-6, mean)
            total = abs(np.sum(values))*local_step
            # Sustained one-sign anatomical bends retain their radius. A
            # concentrated raster kink does not qualify for this exemption.
            if sign_coherence > .8 and cv < .75 and total > 1.:
                sigma[i] = min(base, max(.85, .36/max(mean, 1e-6)))
        # Smooth the radius itself so its variation cannot introduce a seam.
        kernel = np.exp(-.5*(np.arange(-5, 6)/2.)**2)
        kernel /= kernel.sum()
        sigma = np.convolve(np.pad(sigma, (5, 5), mode='edge'), kernel, mode='valid')
        reach = math.ceil(float(sigma.max())*3.5/local_step)
        fit_count = min(len(p), max(3, round(5./local_step)))
        ta = np.polyfit(arc[:fit_count]-arc[0], p[:fit_count], 1)[0]
        tb = np.polyfit(arc[-fit_count:]-arc[-1], p[-fit_count:], 1)[0]
        offsets = np.arange(1, reach+1)*local_step
        before = p[0]-offsets[::-1, None]*ta
        after = p[-1]+offsets[:, None]*tb
        padded = np.vstack([before, p, after])
        result = np.zeros_like(p)
        for i, width in enumerate(sigma):
            radius = math.ceil(width*3.5/local_step)
            d = np.arange(-radius, radius+1)*local_step
            weights = np.exp(-.5*(d/width)**2)
            weights /= weights.sum()
            result[i] = weights@padded[reach+i-radius:reach+i+radius+1]
        # A whole-curve reduction preserves smoothness; no pointwise clipping
        # and no endpoint snap are used.
        displacement = np.linalg.norm(result-p, axis=1)
        if displacement.max() > 3. and strength > .4:
            return smooth_curve(p, strength*.78)
        return result, float(displacement.max())
    input_paths = data['paths']
    accepted, rejected, rejected_bright, shifts = [], 0, 0, []
    original_turns = []
    for path in input_paths:
        p, arc = uniform(path['points'])
        theta, turns = angular(p, arc)
        original_turns.extend(abs(turns).tolist())
        length = arc[-1]
        variation = float(sum(abs(turns)))
        net = abs(float(sum(turns)))
        oscillation = variation-net
        chord = np.linalg.norm(p[-1]-p[0])/max(length, 1e-6)
        genuine_u = length >= 8. and net >= 1.92 and net/max(variation, 1e-6) >= .8
        noisy_short = (length < 9.5 and variation > 1. and chord < .85)
        noisy_short |= (length < 14 and oscillation > 1.4)
        noisy_short |= (length < 24 and oscillation > 4.7)
        noisy_short |= (length < 12 and path.get('coherence', 1) < .5 and variation > 1.57)
        bright_arc = length < 26 and np.median(path['light']) > .43 and variation > 2.1 and chord < .8
        if bright_arc:
            rejected_bright += 1
            continue
        if noisy_short and not genuine_u:
            rejected += 1
            continue
        p, shift = smooth_curve(p)
        accepted.append(p)
        shifts.append(shift)
    # Short, mutually straight gaps between image-derived segments can be
    # joined without choosing a neighboring line or inventing a broad curve.
    coords = []
    adjacency = []
    for p in accepted:
        start = len(coords)
        coords.extend(p)
        adjacency.extend(set() for _ in p)
        for i in range(start, len(coords)-1):
            adjacency[i].add(i+1)
            adjacency[i+1].add(i)
    coords = np.asarray(coords)
    lookup = {tuple(np.rint(p).astype(int)): i for i, p in enumerate(coords)}
    bridges = bridge_gaps(coords, adjacency, lookup, 4.5)
    paths = trace_paths(coords, adjacency, 5.)
    paths = [smooth_curve(p, .75)[0] for p in paths]
    rgb = np.asarray(Image.open(SOURCE).convert('RGB')).astype(np.float32)
    linear = np.where(rgb <= 10.31475, rgb/3294.6, ((rgb/255+.055)/1.055)**2.4)
    luminance = linear[:, :, 0]*.2126+linear[:, :, 1]*.7152+linear[:, :, 2]*.0722
    inverse = np.linalg.inv(A)
    output_paths = []
    final_turns = []
    lengths = []
    for p in paths:
        p, arc = uniform(p)
        _, turn = angular(p, arc)
        final_turns.extend(abs(turn).tolist())
        q = (p-OFFSET)@inverse.T
        light = np.sqrt(np.clip(sample(luminance, q[:, 0], q[:, 1]), 0, 1))
        output_paths.append({'points': np.round(p, 3).tolist(), 'light': np.round(light, 4).tolist()})
        lengths.append(float(arc[-1]))
    data['paths'] = output_paths
    data['method'] += '; curvature-adaptive arc Gaussian with linear endpoint extension, short-zigzag pruning, reciprocal small-gap joining; source luminance resampled at final geometry'
    data['stats'] = {'inputPaths': len(input_paths), 'rejectedShortWorms': rejected, 'rejectedBrightHaloArcs': rejected_bright, 'bridgedGaps': bridges, 'pathCount': len(paths),
                     'totalLengthOriginalPx': sum(lengths), 'oneSideBeadsAt2_9px': sum(math.ceil(v/2.9) for v in lengths),
                     'smoothingDisplacementP50P90P99Max': np.percentile(shifts, [50, 90, 99, 100]).tolist(),
                     'headingChangePer0_6pxOriginalP90P99MaxDegrees': (np.percentile(original_turns, [90, 99, 100])*180/math.pi).tolist(),
                     'headingChangePer0_6pxFinalP90P99MaxDegrees': (np.percentile(final_turns, [90, 99, 100])*180/math.pi).tolist()}
    (WORK/(output_name+'.json')).write_text(json.dumps(data, separators=(',', ':')))
    svg = ['<svg xmlns="http://www.w3.org/2000/svg" width="1219" height="679" viewBox="0 0 1219 679" style="width:100vw;height:100vh;display:block;background:#010712"><rect width="1219" height="679" fill="#010712"/>']
    for path in output_paths:
        points = ' '.join(f'{x:.2f},{y:.2f}' for x, y in path['points'])
        svg.append(f'<polyline points="{points}" fill="none" stroke="#009fff" stroke-width=".65" opacity=".8"/>')
    svg.append('</svg>')
    (WORK/(output_name+'.svg')).write_text('\n'.join(svg))
    print(json.dumps(data['stats']))


def connect_paths(source_name, output_name, latest=False):
    data = json.loads((WORK/(source_name+'.json')).read_text())
    inverse = np.linalg.inv(A)
    rgb = np.asarray(Image.open(SOURCE).convert('RGB')).astype(np.float32)
    linear = np.where(rgb <= 10.31475, rgb/3294.6, ((rgb/255+.055)/1.055)**2.4)
    luminance = linear[:, :, 0]*.2126+linear[:, :, 1]*.7152+linear[:, :, 2]*.0722
    raw = np.maximum(0, .65*rgb[:, :, 2]+.35*rgb[:, :, 1]-rgb[:, :, 0])
    ridge_image = gaussian(70*np.log1p(raw/35), 1.15)
    def at_original(field, xy):
        q = (np.asarray(xy)-OFFSET)@inverse.T
        return sample(field, q[..., 0], q[..., 1])
    def resample_path(p, spacing=.7):
        p = np.asarray(p, dtype=float)
        arc = np.r_[0., np.cumsum(np.linalg.norm(np.diff(p, axis=0), axis=1))]
        values = np.linspace(0., arc[-1], max(3, math.ceil(arc[-1]/spacing)+1))
        return np.column_stack([np.interp(values, arc, p[:, i]) for i in (0, 1)])
    def fair(p, sigma=2.4):
        p = resample_path(p)
        step = np.mean(np.linalg.norm(np.diff(p, axis=0), axis=1))
        radius = math.ceil(3.5*sigma/step)
        window = min(len(p), max(3, round(6/step)))
        va = np.polyfit(np.arange(window)*step, p[:window], 1)[0]
        vb = np.polyfit(np.arange(window)*step, p[-window:], 1)[0]
        distance = np.arange(1, radius+1)*step
        padded = np.vstack([p[0]-distance[::-1, None]*va, p, p[-1]+distance[:, None]*vb])
        kernel = np.exp(-.5*(np.arange(-radius, radius+1)*step/sigma)**2)
        kernel /= kernel.sum()
        return sum(w*padded[i:i+len(p)] for i, w in enumerate(kernel))
    # The latest user's marking declares WHICH continuous current is meant.
    # It is only a broad search corridor; the clean photograph supplies XY.
    corridor = np.array([[293,578],[279,567],[273,552],[272,542],[289,523],
        [364,503],[413,460],[438,450],[497,437],[515,437],[550,422],
        [587,422],[645,408],[672,399],[700,382],[721,348]], dtype=float)
    guide = resample_path(fair(corridor, 4.5), 1.)
    tangent = np.gradient(guide, axis=0)
    tangent /= np.maximum(np.linalg.norm(tangent, axis=1), 1e-9)[:, None]
    normal = np.column_stack([-tangent[:, 1], tangent[:, 0]])
    offsets = np.arange(-12., 12.01, .5)
    xy = guide[:, None, :]+normal[:, None, :]*offsets[None, :, None]
    response = np.zeros(xy.shape[:2])
    for d, weight in [(-2., .1), (-1., .2), (0., .4), (1., .2), (2., .1)]:
        q = xy+tangent[:, None, :]*d
        center = at_original(ridge_image, q)
        sides = (at_original(ridge_image, q+normal[:, None, :]*2.2)+at_original(ridge_image, q-normal[:, None, :]*2.2))*.5
        response += weight*(center-sides)
    response = np.clip(response/6., -2., 3.)-.0035*offsets[None, :]**2
    response += .15*np.sqrt(np.clip(at_original(luminance, xy), 0, 1))
    # Viterbi over displacement AND displacement speed: dark spans preserve
    # the same tangent/row, rather than restarting on the next bright pixel.
    slopes = np.arange(-2, 3)
    count, states = response.shape
    scores = np.repeat(response[0, :, None], len(slopes), axis=1)
    scores -= .30*slopes[None, :]**2
    back = np.zeros((count, states, len(slopes)), dtype=np.int8)
    for i in range(1, count):
        next_scores = np.full_like(scores, -1e20)
        for k, slope in enumerate(slopes):
            previous = np.arange(states)-slope
            valid = (previous >= 0)&(previous < states)
            candidates = scores[previous[valid]]-.85*(slopes[None, :]-slope)**2
            parent = np.argmax(candidates, axis=1)
            next_scores[valid, k] = candidates[np.arange(valid.sum()), parent]+response[i, valid]-.18*slope*slope
            back[i, valid, k] = parent
        scores = next_scores
    j, k = np.unravel_index(np.argmax(scores), scores.shape)
    selected = np.zeros(count, dtype=int)
    for i in range(count-1, -1, -1):
        selected[i] = j
        if i:
            old_k = int(back[i, j, k])
            j -= slopes[k]
            k = old_k
    main = fair(xy[np.arange(count), selected], 4.5)
    def photo_fit(corridor, category):
        length = float(np.linalg.norm(np.diff(corridor, axis=0), axis=1).sum())
        guide = resample_path(fair(corridor, min(3., max(.8, length/12.))), 1.)
        tangent = np.gradient(guide, axis=0)
        tangent /= np.maximum(np.linalg.norm(tangent, axis=1), 1e-9)[:, None]
        normal = np.column_stack([-tangent[:, 1], tangent[:, 0]])
        offsets = np.arange(-5., 5.01, .5)
        xy = guide[:, None, :]+normal[:, None, :]*offsets[None, :, None]
        center = at_original(ridge_image, xy)
        sides = (at_original(ridge_image, xy+normal[:, None, :]*2.)+at_original(ridge_image, xy-normal[:, None, :]*2.))*.5
        response = np.clip((center-sides)/6., -2., 3.)-.022*offsets[None, :]**2
        count, states = response.shape
        slopes = np.arange(-2, 3)
        scores = np.repeat(response[0, :, None], 5, axis=1)-.3*slopes[None, :]**2
        back = np.zeros((count, states, 5), dtype=np.int8)
        for i in range(1, count):
            out = np.full_like(scores, -1e20)
            for k, slope in enumerate(slopes):
                previous = np.arange(states)-slope
                valid = (previous >= 0)&(previous < states)
                costs = scores[previous[valid]]-.9*(slopes[None, :]-slope)**2
                parent = np.argmax(costs, axis=1)
                out[valid, k] = costs[np.arange(valid.sum()), parent]+response[i, valid]-.24*slope*slope
                back[i, valid, k] = parent
            scores = out
        j, k = np.unravel_index(np.argmax(scores), scores.shape)
        selected = np.zeros(count, dtype=int)
        for i in range(count-1, -1, -1):
            selected[i] = j
            if i:
                old_k = int(back[i, j, k]);j -= slopes[k];k = old_k
        sigma = min([1., 1.8, 2.7, 4.5][category], max(.9, length/10.))
        return fair(xy[np.arange(count), selected], sigma)
    # A broad brush is ONE approximate topology/search corridor, never a
    # brightness dilation over every parallel photo ridge beneath that brush.
    tail_guided_ids = set()
    reference = json.loads((ROOT/'tools/assets/mobileWhale/referenceContours.json').read_text())
    restored_ribs = 0
    if latest:
        annotation_path = ROOT/'tools/assets/mobileWhale/flowGuidanceLatest.png'
        if not annotation_path.exists():
            annotation_path = Path('C:/Users/psych/AppData/Local/Temp/codex-clipboard-efab73be-1eba-4ddd-a4f5-227d12308f5e.png')
        annotation = np.asarray(Image.open(annotation_path).convert('RGB')).astype(float)
        ar, ag, ab = annotation.transpose(2,0,1)
        masks = {3:(ar>170)&(ag<115)&(ab<125),
                 2:(ar>175)&(ag>155)&(ab<140)&(np.abs(ar-ag)<95)}
        guided = []
        guide_joins = 0
        for category in [3,2]:
            mask = masks[category]
            skeleton, _ = thin(mask)
            zero = np.zeros(mask.shape, dtype=np.float32)
            coords, adjacency, lookup = graph_from_ridges(skeleton,np.ones_like(zero),zero,zero)
            bridge_gaps(coords,adjacency,lookup,6.,fit_span=8.,min_fit=4.,transverse=1.2,cosine=.94)
            corridors = [p*1.25009+np.array([111.571,15.306]) for p in trace_paths(coords,adjacency,6.)]
            # A skeleton junction can split a straight current at the traversal
            # start. Rejoin only coincident, mutually straight same-role ends.
            while True:
                options=[]
                for i, a in enumerate(corridors):
                    for j in range(i+1,len(corridors)):
                        b=corridors[j]
                        for ae in [0,-1]:
                            for be in [0,-1]:
                                distance=float(np.linalg.norm(a[ae]-b[be]))
                                if distance>3.8:
                                    continue
                                aa=a[::-1] if ae==0 else a
                                bb=b if be==0 else b[::-1]
                                va=aa[-1]-aa[max(0,len(aa)-7)]
                                vb=bb[min(len(bb)-1,6)]-bb[0]
                                cosine=float(va@vb/max(1e-9,np.linalg.norm(va)*np.linalg.norm(vb)))
                                if cosine>.82:
                                    options.append((distance+10*(1-cosine),i,j,ae,be))
                if not options:
                    break
                _,i,j,ae,be=min(options)
                a=corridors[i][::-1] if ae==0 else corridors[i]
                b=corridors[j] if be==0 else corridors[j][::-1]
                corridors[i]=np.vstack([a,b[1:] if np.linalg.norm(a[-1]-b[0])<.01 else b])
                corridors.pop(j)
                guide_joins+=1
            for corridor in corridors:
                p=photo_fit(corridor,category)
                length=float(np.linalg.norm(np.diff(p,axis=0),axis=1).sum())
                if length >= (12. if category==3 else 7.):
                    guided.append((p,category))
    else:
        annotation_path = ROOT/'tools/assets/mobileWhale/flowGuidance.png'
        annotation = np.asarray(Image.open(annotation_path).convert('RGB')).astype(float)
        ar, ag, ab = annotation.transpose(2, 0, 1)
        annotation_a = np.array([[.5744851042321719,-.0000267516235710576],[-.000006473092002741,.5744448873159411]])
        annotation_offset = np.array([230.03552065413072,285.41709560976636])
        masks = {3:(ar>170)&(ag<110)&(ab<130),
                 2:(ar>180)&(ag>=110)&(ag<215)&(ab<150)&(ar>ag*1.18),
                 1:(ag>150)&(ar<175)&(ab<170)&(ag>ar*1.15)}
        guided = [(main, 3)]
        tail_guided_ids = set()
        reference = json.loads((ROOT/'tools/assets/mobileWhale/referenceContours.json').read_text())
        for key in ['upperFluke', 'lowerFluke']:
            for edge in ['leading', 'trailing']:
                p = photo_fit(np.asarray(reference[key][edge], dtype=float), 3)
                tail_guided_ids.add(id(p))
                guided.append((p, 3))
        for category in [3, 2, 1]:
            mask = masks[category]
            mask[:14] = False;mask[531:] = False
            skeleton, _ = thin(mask)
            zero = np.zeros(mask.shape, dtype=np.float32)
            coords, adjacency, lookup = graph_from_ridges(skeleton, np.ones_like(zero), zero, zero)
            bridge_gaps(coords, adjacency, lookup, 8., fit_span=8., min_fit=4., transverse=1.2, cosine=.94)
            corridors = trace_paths(coords, adjacency, 9.)
            for path in corridors:
                corridor = path@annotation_a.T+annotation_offset
                p = photo_fit(corridor, category)
                if category == 3:
                    # The independently verified nose-to-crest current already
                    # owns this role, including dark gaps omitted by the brush.
                    distances = np.min(np.sum((p[:, None, :]-main[None, :, :])**2, axis=2), axis=1)
                    if np.mean(distances < 4.) > .25:
                        continue
                guided.append((p, category))
        # The previous full-frame marking supplies only the three posterior ribs
        # outside the latest close-up's right boundary. New guidance owns the head.
        full_guidance_path = ROOT/'tools/assets/mobileWhale/flowGuidanceFull.png'
        if not full_guidance_path.exists():
            full_guidance_path = Path('C:/Users/psych/AppData/Local/Temp/codex-clipboard-a926ca1a-b521-4c61-b018-818d0ce0bff3.png')
        full_annotation = np.asarray(Image.open(full_guidance_path).convert('RGB')).astype(float)
        fr, fg, fb = full_annotation.transpose(2,0,1)
        full_mask = (fr>170)&(fg<110)&(fb<130)
        full_skeleton, _ = thin(full_mask)
        zero = np.zeros(full_mask.shape, dtype=np.float32)
        coords, adjacency, lookup = graph_from_ridges(full_skeleton, np.ones_like(zero), zero, zero)
        bridge_gaps(coords, adjacency, lookup, 8., fit_span=8., min_fit=4., transverse=1.2, cosine=.94)
        restored_ribs = 0
        for path in trace_paths(coords, adjacency, 8.):
            corridor = path*1.6618+np.array([-39.15,11.55])
            minimum, maximum = corridor.min(0), corridor.max(0)
            if not (minimum[0]>790 and maximum[0]<910 and minimum[1]>382 and maximum[1]<480 and maximum[1]-minimum[1]>25 and maximum[0]-minimum[0]<70):
                continue
            p = photo_fit(corridor, 3)
            p = p[p[:,0]>790]
            guided.append((p,3))
            restored_ribs += 1
        if restored_ribs != 3:
            raise ValueError(f'Expected exactly three posterior full-reference guide ribs, got {restored_ribs}')
        # The close-up crop is not an anatomical line ending. Continue the same
        # source-resolved currents through full-reference silhouette corridors.
        def extend_at(crop_endpoint, continuation):
            candidates = []
            target = np.asarray(crop_endpoint)
            for index, (p, category) in enumerate(guided):
                if category != 3 or id(p) in tail_guided_ids or index == 0:
                    continue
                for end in [0, -1]:
                    candidates.append((float(np.linalg.norm(p[end]-target)), index, end))
            distance, index, end = min(candidates)
            if distance > 22:
                raise ValueError(f'No crop continuation endpoint near {crop_endpoint}: {distance}')
            p = guided[index][0]
            if end == 0:
                p = p[::-1]
            p = photo_fit(np.vstack([p, np.asarray(continuation)]), 3)
            guided[index] = (p, 3)
            return index
        extend_at([676,592], [q for q in reference['nearFin']['leading'] if q[0]>690])
        extend_at([762,592], [q for q in reference['nearFin']['trailing'] if q[0]>770])
        back_index = extend_at([785,350], [q for q in reference['bodyRows'][-1]['points'] if q[0]>800])
        extend_at([787,497], [q for q in reference['bodyRows'][0]['points'] if q[0]>790])
        back = guided[back_index][0]
        crest_candidates=[]
        for index, (p, category) in enumerate(guided):
            if category == 3 and index not in [0, back_index] and id(p) not in tail_guided_ids:
                for end in [0, -1]:
                    crest_candidates.append((float(np.linalg.norm(p[end]-back[0])),index,end))
        distance, index, end = min(crest_candidates)
        if distance < 12:
            head = guided[index][0]
            if end == 0:
                head = head[::-1]
            guided[back_index] = (photo_fit(np.vstack([head,back]),3),3)
            guided.pop(index)
        # Small red skeleton spurs around brush intersections are not filaments.
        guided=[(p,c) for p,c in guided if c!=3 or id(p) in tail_guided_ids or np.linalg.norm(np.diff(p,axis=0),axis=1).sum()>=12]
    # Remove the former pieces of this same current; no double bead row.
    cell = 1.45
    main_bins = {}
    owned_guided = []
    for p, category in guided:
        # Deterministic role ownership removes overlapping duplicate guides.
        # Actual intersections are shared spatially, not widened into bands.
        if owned_guided:
            near = []
            for q in p:
                ix, iy = np.floor(q/cell).astype(int)
                near.append(any(np.sum((q-v)**2)<cell*cell for dx in (-1,0,1) for dy in (-1,0,1) for v in main_bins.get((ix+dx,iy+dy), [])))
            if np.mean(near) > .45:
                continue
        owned_guided.append((p, category))
        for q in p:
            main_bins.setdefault(tuple(np.floor(q/cell).astype(int)), []).append(q)
    def overlaps_main(p):
        ix, iy = np.floor(p/cell).astype(int)
        for dx in (-1, 0, 1):
            for dy in (-1, 0, 1):
                for q in main_bins.get((ix+dx, iy+dy), []):
                    if np.sum((p-q)**2) < cell*cell:
                        return True
        return False
    fragments = []
    for path in data['paths']:
        segment = []
        for p in [*path['points'], None]:
            if p is not None and not overlaps_main(np.asarray(p)):
                segment.append(p)
            else:
                if len(segment) > 1 and sum(math.dist(a, b) for a, b in zip(segment, segment[1:])) >= 5:
                    fragments.append(np.asarray(segment))
                segment = []
    coords, adjacency = [], []
    for p in fragments:
        start = len(coords)
        coords.extend(p)
        adjacency.extend(set() for _ in p)
        for i in range(start, len(coords)-1):
            adjacency[i].add(i+1)
            adjacency[i+1].add(i)
    coords = np.asarray(coords)
    lookup = {tuple(np.rint(p).astype(int)): i for i, p in enumerate(coords)}
    bridges = bridge_gaps(coords, adjacency, lookup, 35., fit_span=12., min_fit=8., transverse=.8, cosine=.966, score_margin=1.5)
    paths = trace_paths(coords, adjacency, 5.)
    paths = [fair(p, 1.8) for p in paths]
    paths = [p for p, category in owned_guided]+paths
    fixed_categories = [category for p, category in owned_guided]
    fixed_roles = [('tail-outline' if id(p) in tail_guided_ids else {3: 'guide-main', 2: 'guide-secondary', 1: 'guide-tertiary'}[category]) for p, category in owned_guided]
    reference = json.loads((ROOT/'tools/assets/mobileWhale/referenceContours.json').read_text())
    tail_edges = []
    for key in ['upperFluke', 'lowerFluke']:
        tail_edges.extend([reference[key]['leading'], reference[key]['trailing']])
    def tail_outline_distance(p):
        distances = np.full(len(p), np.inf)
        for edge in tail_edges:
            for a, b in zip(edge, edge[1:]):
                a=np.asarray(a);v=np.asarray(b)-a
                u=np.clip(((p-a)*v).sum(1)/max(1e-9,float(v@v)),0,1)
                distances=np.minimum(distances,np.linalg.norm(p-a-u[:,None]*v,axis=1))
        return distances
    result = []
    lengths = []
    for index, p in enumerate(paths):
        # Smooth entire authored curves before placing beads, including dark
        # spans. Tight small anatomy uses a smaller fairing radius.
        if index < len(fixed_categories):
            arc_length=float(np.linalg.norm(np.diff(p,axis=0),axis=1).sum())
            radius={3:5.5,2:2.4,1:1.2}[fixed_categories[index]]
            p=fair(p,min(radius,arc_length/14.))
        p = resample_path(p)
        length = float(np.linalg.norm(np.diff(p, axis=0), axis=1).sum())
        light = np.sqrt(np.clip(at_original(luminance, p), 0, 1))
        bright = float(np.quantile(light, .85))
        smoothness = 1./(1.+curvature(p)*2.)
        confidence = (.9+.1*smoothness)*(.88+.12*min(1., length/25.))
        score = bright*confidence
        if index < len(fixed_categories):
            category = fixed_categories[index]
            role_source = fixed_roles[index]
        elif np.mean(p[:,0]>940) > .6:
            distance = tail_outline_distance(p)
            if np.mean(distance < 3.) > .65:
                continue  # Four continuous photo-fitted edges own this contour.
            category = int(bright > .14)
            role_source = 'reference-detail'
        else:
            category = int(length > 12 and bright > .13)  # Unmarked fine anatomy: tertiary or faint.
            role_source = 'reference-detail'
        record = {'points': np.round(p, 3).tolist(), 'light': np.round(light, 4).tolist(), 'category': category,
                  'roleSource': role_source,
                  'categoryScore': round(score, 4), 'referenceBrightP85': round(bright, 4)}
        if index == 0:
            record['role'] = 'full-image red/yellow topology; clean-reference global ridge fit' if latest else 'continuous main current from the latest user topology; clean-reference global ridge fit'
        result.append(record)
        lengths.append(length)
    if latest:
        # Brush lifts and independent ridge fits must not split the same main
        # current. Join tangent continuations only if neither end already
        # belongs to another main junction.
        def nearby_main(point, omitted):
            return min((float(np.min(np.linalg.norm(np.asarray(r['points'])-point,axis=1)))
                for k,r in enumerate(result) if r['category']==3 and k not in omitted), default=1e9)
        while True:
            options=[]
            for i,ra in enumerate(result):
                if ra['category']!=3:continue
                a=np.asarray(ra['points'])
                for j in range(i+1,len(result)):
                    if result[j]['category']!=3:continue
                    b=np.asarray(result[j]['points'])
                    for ae in [0,-1]:
                        aa=a[::-1] if ae==0 else a
                        va=aa[-1]-aa[-min(20,len(aa))];va/=max(1e-9,np.linalg.norm(va))
                        for be in [0,-1]:
                            bb=b if be==0 else b[::-1]
                            gap=float(np.linalg.norm(aa[-1]-bb[0]))
                            if not 3<gap<22:continue
                            vb=bb[min(19,len(bb)-1)]-bb[0];vb/=max(1e-9,np.linalg.norm(vb))
                            if va@vb<.7:continue
                            if min(nearby_main(aa[-1],{i,j}),nearby_main(bb[0],{i,j}))<3:continue
                            options.append((gap,i,j,ae,be))
            if not options:break
            _,i,j,ae,be=min(options)
            a=np.asarray(result[i]['points']);b=np.asarray(result[j]['points'])
            p=fair(np.vstack([a[::-1] if ae==0 else a,b if be==0 else b[::-1]]),3.5)
            result[i]['points']=np.round(p,3).tolist()
            result[i]['light']=np.round(np.sqrt(np.clip(at_original(luminance,p),0,1)),4).tolist()
            result.pop(j)
        # Independent photo fits on either side of a real graph junction can
        # drift by a few pixels. Ease that correction over the whole end span,
        # not a sharp last-segment snap or an extra bead stripe.
        for i,r in enumerate(result):
            if r['category']!=3:continue
            p=np.asarray(r['points'])
            for end in [0,-1]:
                candidates=[]
                for j,other in enumerate(result):
                    if i==j or other['category']!=3:continue
                    q=np.asarray(other['points']);d=np.linalg.norm(q-p[end],axis=1);k=int(np.argmin(d))
                    candidates.append((float(d[k]),j,k))
                distance,j,k=min(candidates)
                if not 2<distance<12:continue
                target=np.asarray(result[j]['points'][k]);offset=target-p[end]
                arc=np.r_[0,np.cumsum(np.linalg.norm(np.diff(p,axis=0),axis=1))]
                d=arc if end==0 else arc[-1]-arc
                t=np.clip(1-d/min(28,arc[-1]*.3),0,1)
                ease=t*t*t*(10+t*(-15+6*t))
                p+=ease[:,None]*offset
            r['points']=np.round(p,3).tolist()
            r['light']=np.round(np.sqrt(np.clip(at_original(luminance,p),0,1)),4).tolist()
        lengths=[float(np.linalg.norm(np.diff(r['points'],axis=0),axis=1).sum()) for r in result]
    data['paths'] = result
    if latest:
        data['guidance'] = {'source': 'tools/assets/mobileWhale/flowGuidanceLatest.png', 'registration': [1.25009,0,111.571,0,1.25009,15.306], 'classes': {'red':3,'yellow':2}, 'rejoinedSameRoleJunctions':guide_joins}
    counts = {str(i): sum(p['category'] == i for p in result) for i in range(4)}
    data['stats'] = {'pathCount': len(result), 'guidedRolePaths': len(owned_guided), 'restoredPosteriorRibs': restored_ribs, 'additionalLongGapBridges': bridges,
        'totalLengthOriginalPx': sum(lengths), 'oneSideBeadsAt2_9px': sum(math.ceil(v/2.9) for v in lengths),
        'categoryPathCounts': counts, 'longestPathsOriginalPx': sorted(lengths, reverse=True)[:10],
        'mainPathIndex': 0, 'mainPathLengthOriginalPx': lengths[0], 'mainEndpoints': [result[0]['points'][0], result[0]['points'][-1]],
        'mainSearchDisplacementP50P90Max': np.percentile(abs(offsets[selected]), [50, 90, 100]).tolist()}
    data['method'] += '; long mutually straight gap continuation <=35originalpx; latest red/orange/green strokes are single topology/search corridors, clean-photo global ridge fitting supplies geometry; immutable role per whole curve, illumination separately sampled; unmarked tail interior only0/1, outline3'
    (WORK/(output_name+'.json')).write_text(json.dumps(data, separators=(',', ':')))
    svg = ['<svg xmlns="http://www.w3.org/2000/svg" width="1219" height="679" viewBox="0 0 1219 679" style="width:100vw;height:100vh;display:block;background:#010712"><rect width="1219" height="679" fill="#010712"/>']
    for index, path in reversed(list(enumerate(result))):
        points = ' '.join(f'{x:.2f},{y:.2f}' for x, y in path['points'])
        color = '#57dcff' if index == 0 else '#009fff'
        opacity = [0.2, .38, .65, .95][path['category']]
        svg.append(f'<polyline points="{points}" fill="none" stroke="{color}" stroke-width="{1. if index == 0 else .65}" opacity="{opacity}"/>')
    svg.append('</svg>')
    (WORK/(output_name+'.svg')).write_text('\n'.join(svg))
    primary_svg = [svg[0]]
    for path in result:
        if path['category'] != 3:
            continue
        points = ' '.join(f'{x:.2f},{y:.2f}' for x, y in path['points'])
        primary_svg.append(f'<polyline points="{points}" fill="none" stroke="#25c9ff" stroke-width=".85"/>')
    primary_svg.append('</svg>')
    (WORK/(output_name+'-primary.svg')).write_text('\n'.join(primary_svg))
    print(json.dumps(data['stats']))


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--sigma', type=float, default=1.25)
    parser.add_argument('--threshold', type=float, default=.65)
    parser.add_argument('--beta', type=float, default=.65)
    parser.add_argument('--gap', type=float, default=4.5)
    parser.add_argument('--minimum', type=float, default=7)
    parser.add_argument('--coherence', type=float, default=0)
    parser.add_argument('--fair', type=float, default=0)
    parser.add_argument('--max-curvature', type=float, default=100)
    parser.add_argument('--name', default='reference-extraction-candidate')
    parser.add_argument('--merge', nargs=2)
    parser.add_argument('--polish')
    parser.add_argument('--connect')
    parser.add_argument('--connect-latest')
    args = parser.parse_args()
    if args.connect_latest:
        connect_paths(args.connect_latest,args.name,latest=True)
        raise SystemExit
    if args.connect:
        connect_paths(args.connect, args.name)
    elif args.polish:
        polish_paths(args.polish, args.name)
    elif args.merge:
        merge_scales(*args.merge, args.name)
    else:
        run(args)
