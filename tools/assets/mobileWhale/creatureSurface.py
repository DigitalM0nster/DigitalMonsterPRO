"""One continuous spatial surface for the editable skin and its bead curves.

Reference pixels are the orthographic surface coordinates, not a texture. The
same depth field supplies mesh vertices, particle positions, normals and rig
weights. Lighting/visibility must not be used to repair this geometry.
"""
import math
from mathutils import Vector


def _ease(value):
    value = max(0., min(1., value))
    return value ** 3 * (value * (value * 6. - 15.) + 10.)


def _distance(x, y, polygon):
    """Signed distance: positive inside a closed outline."""
    inside = False
    distance = float("inf")
    for (ax, ay), (bx, by) in zip(polygon, polygon[1:] + polygon[:1]):
        dx, dy = bx - ax, by - ay
        t = max(0., min(1., ((x-ax)*dx + (y-ay)*dy) / max(1e-9, dx*dx+dy*dy)))
        distance = min(distance, math.hypot(x-ax-t*dx, y-ay-t*dy))
        if (ay > y) != (by > y) and x < ax + dx * (y-ay) / (by-ay):
            inside = not inside
    return distance if inside else -distance


class CreatureSurface:
    """Shared authoring surface, in Blender's X / depth-Y / height-Z axes."""

    def __init__(self, reference, smooth_profile, body_weights, filament_data=None):
        self.reference = reference
        self.smooth = smooth_profile
        self.body_weights = body_weights
        self.start, self.end = 249., 1010.
        self.step = 2.
        self.samples = int(math.ceil((self.end-self.start)/self.step)) + 1
        self.xs = [self.start + (self.end-self.start)*i/(self.samples-1) for i in range(self.samples)]
        rows = reference["bodyRows"]
        upper = [smooth_profile(rows[-1]["points"], x)[0] for x in self.xs]
        lower = [smooth_profile(rows[0]["points"], x)[0] for x in self.xs]

        # Follow clean fitted outlines where the old envelope misses them.
        # Internal decorative rows never determine the physical cross-section.
        # A broad, smooth correction preserves the sculpted nose/chin shape.
        top_correction, bottom_correction = [0.]*self.samples, [0.]*self.samples
        for path in (filament_data or {}).get("paths", []):
            if path["category"] != 3:
                continue
            for x, y in path["points"]:
                if not self.start < x < self.end:
                    continue
                i = min(self.samples-1, max(0, round((x-self.start)/(self.end-self.start)*(self.samples-1))))
                if abs(y-upper[i]) < 18.:
                    top_correction[i] = min(top_correction[i], y-upper[i])
                if abs(y-lower[i]) < 18.:
                    bottom_correction[i] = max(bottom_correction[i], y-lower[i])
        for source, target, sign in [(top_correction, upper, -1), (bottom_correction, lower, 1)]:
            # Expand sparse corrections across their neighboring stations before
            # fairing. This avoids a depth ripple at every source sample.
            expanded = [sign*max(sign*source[j] for j in range(max(0,i-3), min(self.samples,i+4))) for i in range(self.samples)]
            for i in range(self.samples):
                taps = [(j, math.exp(-.5*((j-i)/2.)**2)) for j in range(max(0,i-6), min(self.samples,i+7))]
                target[i] += sum(expanded[j]*w for j,w in taps)/sum(w for _,w in taps)
        # The upper outline is the actual clean-reference main silhouette,
        # not merely an outward correction to an obsolete torso outline.
        # Otherwise a contour repeatedly dives into and out of the old hull,
        # producing visible depth ripples when the camera turns.
        traced_upper = [float("inf")]*self.samples
        for path in (filament_data or {}).get("paths", []):
            if path["category"] != 3:continue
            for x,y in path["points"]:
                if not 254.<x<945.:continue
                i=min(self.samples-1,max(0,round((x-self.start)/(self.end-self.start)*(self.samples-1))))
                traced_upper[i]=min(traced_upper[i],y)
        known=[i for i,y in enumerate(traced_upper) if math.isfinite(y)]
        for a,b in zip(known,known[1:]):
            for i in range(a+1,b):
                traced_upper[i]=traced_upper[a]+(traced_upper[b]-traced_upper[a])*(i-a)/(b-a)
        raw=[traced_upper[i] if math.isfinite(traced_upper[i]) else upper[i] for i in range(self.samples)]
        for i,x in enumerate(self.xs):
            if not 260.<x<936.:continue
            taps=[(j,math.exp(-.5*((j-i)/3.)**2)) for j in range(max(0,i-9),min(self.samples,i+10))]
            target=sum(raw[j]*w for j,w in taps)/sum(w for _,w in taps)
            blend=_ease((x-260.)/18.)*_ease((936.-x)/18.)
            upper[i]=upper[i]*(1.-blend)+target*blend
        self.upper = list(zip(self.xs, upper))
        self.lower = list(zip(self.xs, lower))

        fin = reference["nearFin"]
        self.fin_polygon = reference["finRoot"] + fin["trailing"][2:] + list(reversed(fin["leading"]))
        self.flukes = []
        for name, bone in [("upperFluke", "FlukeFar"), ("lowerFluke", "FlukeNear")]:
            profile = reference[name]
            self.flukes.append((profile, bone, profile["leading"] + list(reversed(profile["trailing"]))))

    def bounds(self, x):
        x = max(self.start, min(self.end, x))
        i = min(self.samples-2, max(0,int((x-self.start)/(self.end-self.start)*(self.samples-1))))
        # Uniform stations permit a local lookup instead of scanning all rows
        # for each finite derivative and each editable mesh vertex.
        a,b = max(0,i-1),min(self.samples,i+3)
        upper = self.smooth(self.upper[a:b], x)[0]
        lower = self.smooth(self.lower[a:b], x)[0]
        return upper, max(upper+.02, lower)

    def body_screen(self, s, q):
        x = self.start + (self.end-self.start)*max(0., min(1., s))
        upper, lower = self.bounds(x)
        return [x, (upper+lower)*.5 - max(-1.,min(1.,q))*(lower-upper)*.5]

    def contains(self, x, y, margin=0.):
        """Union of the real silhouette charts, used once for surface filling.

        Do not use the extended attachment blend masks here: they exist to
        keep fitted edge curves continuous and would add free-floating beads
        beyond the creature. Overlapping body/fin roots are one domain.
        """
        if self.start <= x <= self.end:
            upper, lower = self.bounds(x)
            if upper-margin <= y <= lower+margin:
                return True
        if _distance(x,y,self.fin_polygon) >= -margin:
            return True
        return any(_distance(x,y,polygon) >= -margin for _,_,polygon in self.flukes)

    def _body_depth(self, x, y):
        s = max(0., min(1., (x-self.start)/(self.end-self.start)))
        upper, lower = self.bounds(x)
        half_height = (lower-upper)*.005
        # The narrow peduncle cannot retain the old torso-sized depth radius.
        # This couples depth to the actual sculpted cross-section at each X.
        nominal = (.12+1.08*math.sin(math.pi*s)**.62)*(1.-.38*s)
        radius = .95*math.sqrt(half_height*half_height+.0001)
        width = .5*(nominal+radius-math.sqrt((nominal-radius)**2+.000025))
        q = max(-1., min(1., ((upper+lower)*.5-y)/max(.01,(lower-upper)*.5)))
        # Finite slope at the silhouette avoids amplifying subpixel tracing
        # noise into a deep corrugation while retaining a rounded cross-section.
        softness=.35
        radial=(math.sqrt(max(0.,1.-q*q)+softness*softness)-softness)/(math.sqrt(1.+softness*softness)-softness)
        return width*radial

    def _profile_depth(self, profile, u):
        keys = [(i/(len(profile["depth"])-1), value) for i,value in enumerate(profile["depth"])]
        return self.smooth(keys, max(0.,min(1.,u)))[0]

    def _field(self, x, y, side):
        """Depth and skin share precisely the same continuous chart weights."""
        depth = side*(self._body_depth(x,y)+.010)
        weights = self.body_weights((x-700.)/100.)
        region = False

        # Expanded smooth chart membership is deliberate: a clean reference
        # edge can lie a few pixels outside the old polygon. It must not jump
        # from the fin tip's depth back to the torso's depth at that boundary.
        if 510. < x < 858. and 465. < y < 666.:
            membership = _ease((_distance(x,y,self.fin_polygon)+32.)/20.)
            root_y = self.smooth(self.reference["finRoot"], max(553.,min(705.,x)))[0]
            root_blend = _ease((y-root_y)/44.)
            blend = membership*root_blend
            if blend > 0.:
                u = max(0.,min(1.,((x-594.)*226.+(y-520.)*106.)/62312.))
                fin_depth = side*abs(self._profile_depth(self.reference["nearFin"],u))
                depth = depth*(1.-blend)+fin_depth*blend
                weights = {name:weight*(1.-blend) for name,weight in weights.items()}
                weights["PectoralNear" if side < 0 else "PectoralFar"] = blend
                region = True

        # Both lobes share the peduncle's continuous base. Their overlapping
        # root charts blend, rather than selecting the first polygon hit.
        contributions = []
        if x > 912.:
            for profile, bone, polygon in self.flukes:
                root, tip = profile["leading"][0], profile["leading"][-1]
                dx, dy = tip[0]-root[0], tip[1]-root[1]
                u = max(0.,min(1.,((x-root[0])*dx+(y-root[1])*dy)/(dx*dx+dy*dy)))
                membership = _ease((_distance(x,y,polygon)+30.)/18.)
                blend = membership*_ease(u/.38)*_ease((x-912.)/30.)
                if blend > 0.:
                    contributions.append((blend,self._profile_depth(profile,u)+side*.018,bone))
            total = sum(item[0] for item in contributions)
            if total > 0.:
                influence = 1.-math.prod(1.-item[0] for item in contributions)
                target = sum(w*d for w,d,_ in contributions)/total
                depth = depth*(1.-influence)+target*influence
                weights = {name:weight*(1.-influence) for name,weight in weights.items()}
                for weight,_,bone in contributions:
                    weights[bone] = weights.get(bone,0.)+influence*weight/total
                region = True
        return depth, weights, region

    def projected(self, x, y, side):
        depth, weights, region = self._field(x,y,side)
        # Derivatives of the actual final surface, including attachment blends.
        # Never take normals from obsolete decorative row coordinates.
        epsilon = .20
        dx = (self._field(x+epsilon,y,side)[0]-self._field(x-epsilon,y,side)[0])/(2.*epsilon)
        dy = (self._field(x,y+epsilon,side)[0]-self._field(x,y-epsilon,side)[0])/(2.*epsilon)
        normal = Vector((-100.*dx,1.,100.*dy)).normalized()*side
        return Vector(((x-700.)/100.,depth,(450.-y)/100.)), normal, weights, region

    def surface(self, s, q, side=-1, lift=0.):
        x,y = self.body_screen(s,q)
        # Same map as the visible particles; the skin remains editable in
        # Blender. The small shell lift is already included in that map.
        depth = self._field(x,y,side)[0]
        point = Vector(((x-700.)/100.,depth,(450.-y)/100.))
        point.y += side*max(0.,lift-.010)
        return point

    def body_point(self, s, theta):
        return self.surface(s,math.sin(theta),-1 if math.cos(theta)<0 else 1)

    def wing_point(self, profile, s, theta, far=False):
        def trace(points):
            return self.smooth([(i/(len(points)-1),*point) for i,point in enumerate(points)],s)
        a,b = trace(profile["leading"]),trace(profile["trailing"])
        t = (math.cos(theta)+1.)*.5
        x,y = a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t
        depth = self._field(x,y,1 if far else -1)[0]
        point = Vector(((x-700.)/100.,depth,(450.-y)/100.))
        # A small closed wing thickness around the exact particle-bearing skin.
        point.y += (.020*math.sin(math.pi*s)**.4+.002)*math.sin(theta)
        return point
