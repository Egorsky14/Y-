"""EGO HVAC technician character for HVAC Company Owner V3, authored in Blender and exported as GLB.

Run headless (see docs/art/ASSET_PIPELINE.md):
    blender -b --factory-startup --python tools/blender/technician.py -- <out.glb> [preview_dir]

The body is modelled as a signed-distance anatomy (ellipsoids and tapered capsules for pelvis,
ribcage, pectorals, deltoids, biceps, quadriceps, calves..., joined with smooth unions), polygonised
with surface nets, smoothed and decimated: a single continuous surface whose shoulders, elbows,
hips and knees flow into each other instead of meeting as balls and tubes. Skin weights come from
the same primitives (each belongs to a bone; weights fall off with distance from the bone's own
primitives), so the blend across a joint follows the anatomy.

Every exported mesh is skinned to one armature whose bones carry the game rig's joint names
(Worker.tsx): pelvis, torso, head, armL/armR, foreL/foreR, legL/legR, shinL/shinR, footL/footR.
Rigid parts (boots, belt, collar, cap, hair, eyes) are weighted 1.0 to their bone. The game
merges the parts it needs per character into one skinned mesh per material.

Coordinates below are the game's (metres, +y up, +z the character's forward, L = -x); they are
converted to Blender's Z-up frame when the meshes are built (glTF writes Y-up again).

Bind pose: the canonical rig pose (Worker.tsx, every joint rotation zero) except the arms, which
are abducted ARM_ABDUCT radians so the arm surface stays clear of the torso. The game recomputes the
bind matrices from this joint table at load, so Blender bone rolls never matter.

Object names: `<part>__<material>` e.g. `body_avg__shirt`, `head_square__skin`, `boots__leather`.
"""
import math
import os
import sys

import bmesh
import bpy
import numpy as np

argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
OUT = os.path.abspath(argv[0] if argv else "technician.glb")
PREVIEW_DIR = os.path.abspath(argv[1]) if len(argv) > 1 else None

# ---------------------------------------------------------------- rig (game coordinates)
ARM_ABDUCT = 0.3
SHOULDER_X = 0.2
JOINTS = {
    "pelvis": (0.0, 0.95, 0.0),
    "torso": (0.0, 1.01, 0.0),
    "head": (0.0, 1.595, 0.0),
    "armL": (-SHOULDER_X, 1.51, 0.0),
    "armR": (SHOULDER_X, 1.51, 0.0),
    "legL": (-0.1, 0.90, 0.0),
    "legR": (0.1, 0.90, 0.0),
    "shinL": (-0.1, 0.45, 0.0),
    "shinR": (0.1, 0.45, 0.0),
    "footL": (-0.1, 0.03, 0.0),
    "footR": (0.1, 0.03, 0.0),
}
UPPER_ARM = 0.3
FOREARM_TO_WRIST = 0.27


def arm_dir(side):
    return np.array([side * math.sin(ARM_ABDUCT), -math.cos(ARM_ABDUCT), 0.0])


for side, s in ((-1, "L"), (1, "R")):
    JOINTS[f"fore{s}"] = tuple(np.array(JOINTS[f"arm{s}"]) + arm_dir(side) * UPPER_ARM)
PARENT = {"pelvis": None, "torso": "pelvis", "head": "torso", "armL": "torso", "armR": "torso", "foreL": "armL", "foreR": "armR",
          "legL": "pelvis", "legR": "pelvis", "shinL": "legL", "shinR": "legR", "footL": "shinL", "footR": "shinR"}
TAIL = {"pelvis": (0, 0.85, 0), "torso": (0, 1.55, 0), "head": (0, 1.80, 0), "footL": (-0.1, 0.03, 0.2), "footR": (0.1, 0.03, 0.2)}
for side, s in ((-1, "L"), (1, "R")):
    TAIL[f"arm{s}"] = JOINTS[f"fore{s}"]
    TAIL[f"fore{s}"] = tuple(np.array(JOINTS[f"fore{s}"]) + arm_dir(side) * FOREARM_TO_WRIST)
    TAIL[f"leg{s}"] = JOINTS[f"shin{s}"]
    TAIL[f"shin{s}"] = JOINTS[f"foot{s}"]
BONES = list(PARENT.keys())


# ---------------------------------------------------------------- SDF primitives (vectorised, p: (N, 3))
def v3(*a):
    return np.array(a, dtype=np.float64)


class Ellipsoid:
    def __init__(self, c, r, bone, rot=None):
        self.c = np.asarray(c, float)
        self.r = np.asarray(r, float)
        self.bone = bone
        self.rot = rot  # 3x3, world = rot @ local

    def __call__(self, p):
        q = p - self.c
        if self.rot is not None:
            q = q @ self.rot  # world → local (rot is orthonormal)
        k0 = np.linalg.norm(q / self.r, axis=1)
        k1 = np.linalg.norm(q / (self.r * self.r), axis=1)
        return k0 * (k0 - 1.0) / np.maximum(k1, 1e-9)


class Cone:
    """Round cone (capsule with radius r1 at a, r2 at b)."""

    def __init__(self, a, b, r1, r2, bone):
        self.a = np.asarray(a, float)
        self.b = np.asarray(b, float)
        self.r1 = r1
        self.r2 = r2
        self.bone = bone

    def __call__(self, p):
        ba = self.b - self.a
        l2 = ba @ ba
        rr = self.r1 - self.r2
        a2 = l2 - rr * rr
        il2 = 1.0 / l2
        pa = p - self.a
        y = pa @ ba
        z = y - l2
        xv = pa * l2 - np.outer(y, ba)
        x2 = np.einsum("ij,ij->i", xv, xv)
        y2 = y * y * l2
        z2 = z * z * l2
        k = np.sign(rr) * rr * rr * x2
        out = np.empty(len(p))
        m1 = np.sign(z) * a2 * z2 > k
        m2 = (~m1) & (np.sign(y) * a2 * y2 < k)
        m3 = ~(m1 | m2)
        out[m1] = np.sqrt(x2[m1] + z2[m1]) * il2 - self.r2
        out[m2] = np.sqrt(x2[m2] + y2[m2]) * il2 - self.r1
        out[m3] = (np.sqrt(x2[m3] * a2 * il2) + y[m3] * rr) * il2 - self.r1
        return out


class RoundBox:
    def __init__(self, c, b, r, bone):
        self.c = np.asarray(c, float)
        self.b = np.asarray(b, float)
        self.r = r
        self.bone = bone

    def __call__(self, p):
        q = np.abs(p - self.c) - self.b + self.r
        return np.linalg.norm(np.maximum(q, 0), axis=1) + np.minimum(q.max(1), 0) - self.r


def smin(a, b, k):
    h = np.clip(0.5 + 0.5 * (b - a) / k, 0.0, 1.0)
    return b * (1 - h) + a * h - k * h * (1 - h)


def smax(a, b, k):
    return -smin(-a, -b, k)


class Shape:
    """A smooth union of primitives (each with its own blend radius against what came before)."""

    def __init__(self, k=0.03):
        self.items = []  # (prim, k, mode) mode: 'add' | 'sub'
        self.k = k

    def add(self, prim, k=None):
        self.items.append((prim, self.k if k is None else k, "add"))
        return prim

    def sub(self, prim, k=0.01):
        self.items.append((prim, k, "sub"))
        return prim

    def __call__(self, p):
        d = None
        for prim, k, mode in self.items:
            di = prim(p)
            if mode == "add":
                d = di if d is None else smin(d, di, k)
            else:
                d = smax(d, -di, k)
        return d

    def prims(self):
        return [p for p, _, m in self.items if m == "add"]


# ---------------------------------------------------------------- surface nets
CORNERS = np.array([[i, j, k] for k in (0, 1) for j in (0, 1) for i in (0, 1)])
EDGES = [(0, 1), (2, 3), (4, 5), (6, 7), (0, 2), (1, 3), (4, 6), (5, 7), (0, 4), (1, 5), (2, 6), (3, 7)]


def surface_nets(fn, lo, hi, h):
    lo = np.asarray(lo, float)
    hi = np.asarray(hi, float)
    n = np.ceil((hi - lo) / h).astype(int) + 1
    xs = [lo[i] + np.arange(n[i]) * h for i in range(3)]
    X, Y, Z = np.meshgrid(*xs, indexing="ij")
    pts = np.stack([X.ravel(), Y.ravel(), Z.ravel()], 1)
    d = np.empty(len(pts))
    step = 400000
    for i in range(0, len(pts), step):
        d[i:i + step] = fn(pts[i:i + step])
    d = d.reshape(n)
    nx, ny, nz = n
    # Corner values for every cell.
    cv = np.stack([d[c[0]:nx - 1 + c[0], c[1]:ny - 1 + c[1], c[2]:nz - 1 + c[2]] for c in CORNERS], -1)
    neg = cv < 0
    active = neg.any(-1) & ~neg.all(-1)
    idx = np.argwhere(active)
    cvals = cv[active]
    acc = np.zeros((len(idx), 3))
    cnt = np.zeros(len(idx))
    for a, b in EDGES:
        da = cvals[:, a]
        db = cvals[:, b]
        m = (da < 0) != (db < 0)
        t = da[m] / (da[m] - db[m])
        pa = CORNERS[a]
        pb = CORNERS[b]
        acc[m] += pa + (pb - pa) * t[:, None]
        cnt[m] += 1
    verts = lo + (idx + acc / cnt[:, None]) * h
    cell_id = -np.ones((nx - 1, ny - 1, nz - 1), dtype=np.int64)
    cell_id[active] = np.arange(len(idx))
    faces = []
    # x-edges: between (i,j,k) and (i+1,j,k); the four cells around it are (i, j-1..j, k-1..k).
    sgn = d < 0
    for axis in range(3):
        o = [0, 0, 0]
        o[axis] = 1
        a_ = sgn[: nx - o[0], : ny - o[1], : nz - o[2]]
        b_ = sgn[o[0]:, o[1]:, o[2]:]
        diff = a_ != b_
        u, w = [ax for ax in range(3) if ax != axis]
        e = np.argwhere(diff)
        # Need neighbouring cells at -1 in u and w, and the cell index along axis must be valid.
        ok = (e[:, u] >= 1) & (e[:, w] >= 1) & (e[:, u] < n[u] - 1) & (e[:, w] < n[w] - 1) & (e[:, axis] < n[axis] - 1)
        e = e[ok]
        flip = a_[tuple(e.T)]

        def cell(du, dw):
            c = e.copy()
            c[:, u] -= du
            c[:, w] -= dw
            return cell_id[tuple(c.T)]

        q = np.stack([cell(1, 1), cell(0, 1), cell(0, 0), cell(1, 0)], 1)
        q[flip] = q[flip][:, ::-1]
        if axis == 1:
            q = q[:, ::-1]
        faces.append(q)
    faces = np.concatenate(faces)
    faces = faces[(faces >= 0).all(1)]
    return verts, faces


def taubin(verts, faces, iters=6, lam=0.5, mu=-0.53):
    """Volume-preserving smoothing on the quad mesh's edge graph."""
    e = np.concatenate([faces[:, [0, 1]], faces[:, [1, 2]], faces[:, [2, 3]], faces[:, [3, 0]]])
    e = np.unique(np.sort(e, 1), axis=0)
    n = len(verts)
    deg = np.bincount(e.ravel(), minlength=n).astype(float)
    v = verts.copy()
    for _ in range(iters):
        for f in (lam, mu):
            s = np.zeros_like(v)
            np.add.at(s, e[:, 0], v[e[:, 1]])
            np.add.at(s, e[:, 1], v[e[:, 0]])
            avg = s / np.maximum(deg, 1)[:, None]
            v = v + f * (avg - v)
    return v


def gradient(fn, p, eps=1e-4):
    g = np.zeros_like(p)
    for i in range(3):
        dp = np.zeros(3)
        dp[i] = eps
        g[:, i] = (fn(p + dp) - fn(p - dp)) / (2 * eps)
    return g / np.maximum(np.linalg.norm(g, axis=1, keepdims=True), 1e-9)


def project(fn, p, offset=0.0, iters=6):
    """Move points onto the surface fn = offset along the gradient."""
    p = np.array(p, float, ndmin=2)
    for _ in range(iters):
        p = p - (fn(p) - offset)[:, None] * gradient(fn, p)
    return p


# ---------------------------------------------------------------- anatomy
def rot_z(a):
    c, s = math.cos(a), math.sin(a)
    return np.array([[c, -s, 0], [s, c, 0], [0, 0, 1]])


def build_body(girth=1.0, belly=1.0, limb=1.0):
    """Body shape for one build. girth: torso breadth; belly: abdomen; limb: arm and leg thickness."""
    body = Shape(k=0.035)
    g, l = girth, limb
    # Pelvis: hips, glutes, lower abdomen.
    body.add(Ellipsoid(v3(0, 0.925, -0.005), v3(0.162 * g, 0.105, 0.112 * g), "pelvis"))
    for s in (-1, 1):
        body.add(Ellipsoid(v3(s * 0.072, 0.865, -0.058), v3(0.082 * g, 0.092, 0.072 * g), "pelvis"), 0.03)
    body.add(Ellipsoid(v3(0, 0.985, 0.02), v3(0.148 * g, 0.075, 0.1 * g * belly), "pelvis"))
    # Torso: belly, ribcage, pectorals, upper back, shoulder girdle and trapezius, lower neck.
    body.add(Ellipsoid(v3(0, 1.09, 0.012 + 0.012 * (belly - 1)), v3(0.148 * g, 0.105, 0.103 * g * belly), "torso"), 0.05)
    body.add(Ellipsoid(v3(0, 1.27, 0.0), v3(0.163 * g, 0.165, 0.11 * g), "torso"), 0.05)
    for s in (-1, 1):
        body.add(Ellipsoid(v3(s * 0.074 * g, 1.352, 0.052 * g), v3(0.082 * g, 0.062, 0.048), "torso"), 0.035)
        body.add(Ellipsoid(v3(s * 0.08, 1.49, -0.025), v3(0.068, 0.034, 0.046), "torso"), 0.045)
    body.add(Ellipsoid(v3(0, 1.335, -0.035), v3(0.158 * g, 0.13, 0.085 * g), "torso"), 0.05)
    body.add(Cone(v3(-0.15, 1.455, -0.014), v3(0.15, 1.455, -0.014), 0.048, 0.048, "torso"), 0.05)
    body.add(Cone(v3(0, 1.45, -0.004), v3(0, 1.565, 0.008), 0.058, 0.053, "torso"), 0.03)
    body.add(Cone(v3(0, 1.55, 0.008), v3(0, 1.665, 0.016), 0.053, 0.05, "head"), 0.02)
    for side, s in ((-1, "L"), (1, "R")):
        S = np.array(JOINTS[f"arm{s}"])
        dA = arm_dir(side)
        E = S + dA * UPPER_ARM
        W = E + dA * FOREARM_TO_WRIST
        R = rot_z(side * ARM_ABDUCT)
        # Deltoid cap over the shoulder joint, blending into the girdle.
        body.add(Ellipsoid(S + v3(side * 0.018, -0.05, 0.0), v3(0.048 * l, 0.075 * l, 0.056 * l), f"arm{s}", R), 0.04)
        body.add(Cone(S + dA * 0.02, E, 0.045 * l, 0.038 * l, f"arm{s}"), 0.02)
        body.add(Ellipsoid(S + dA * 0.16 + v3(0, 0, 0.018), v3(0.038 * l, 0.075, 0.038 * l), f"arm{s}", R), 0.02)
        body.add(Ellipsoid(S + dA * 0.13 + v3(0, 0, -0.02), v3(0.04 * l, 0.08, 0.04 * l), f"arm{s}", R), 0.02)
        mid = E + dA * 0.11
        body.add(Cone(E, mid, 0.043 * l, 0.041 * l, f"fore{s}"), 0.015)
        body.add(Cone(mid, W, 0.041 * l, 0.028 * l, f"fore{s}"), 0.015)
        body.add(Ellipsoid(E + dA * 0.07 + v3(side * 0.012, 0, 0.012), v3(0.034 * l, 0.06, 0.03 * l), f"fore{s}", R), 0.02)
        # Legs: thigh with quadriceps and hamstrings, knee, shin with calf, trouser hem over the boot.
        H = np.array(JOINTS[f"leg{s}"])
        K = np.array(JOINTS[f"shin{s}"])
        A = np.array(JOINTS[f"foot{s}"])
        body.add(Cone(H + v3(0, 0.02, 0), K, 0.085 * l, 0.056 * l, f"leg{s}"), 0.04)
        body.add(Ellipsoid(H + v3(side * 0.008, -0.17, 0.022), v3(0.068 * l, 0.15, 0.062 * l), f"leg{s}"), 0.03)
        body.add(Ellipsoid(H + v3(0, -0.2, -0.022), v3(0.064 * l, 0.14, 0.058 * l), f"leg{s}"), 0.03)
        body.add(Ellipsoid(K + v3(0, 0, 0.012), v3(0.052 * l, 0.055, 0.054 * l), f"shin{s}"), 0.025)
        body.add(Cone(K, A + v3(0, 0.13, 0), 0.05 * l, 0.042 * l, f"shin{s}"), 0.02)
        body.add(Ellipsoid(K + v3(0, -0.13, -0.025), v3(0.05 * l, 0.09, 0.052 * l), f"shin{s}"), 0.03)
        body.add(Cone(A + v3(0, 0.12, 0), A + v3(0, 0.17, -0.004), 0.05 * l, 0.051 * l, f"shin{s}"), 0.02)
    return body


def body_region(p, bone_of):
    """Clothing region of each body vertex: shirt (torso, upper arms to the sleeve), skin (forearms, neck), pants."""
    out = np.empty(len(p), dtype=object)
    for i, (q, b) in enumerate(zip(p, bone_of)):
        if b.startswith("fore"):
            out[i] = "skin"
        elif b.startswith("arm"):
            side = -1 if b.endswith("L") else 1
            S = np.array(JOINTS[b])
            t = (q - S) @ arm_dir(side)
            out[i] = "shirt" if t < 0.2 else "skin"
        elif b == "head":
            out[i] = "skin"
        elif b in ("torso", "pelvis"):
            if q[1] > 1.528 and abs(q[0]) < 0.075:
                out[i] = "skin"
            elif q[1] < 0.985:
                out[i] = "pants"
            else:
                out[i] = "shirt"
        else:
            out[i] = "pants"
    return out


# ---------------------------------------------------------------- head
FACES = {
    # cranium, jaw breadth, jaw depth, chin, cheek fullness, vertical scale
    "oval": dict(jaw=1.0, chin=1.0, cheek=1.0, sy=1.0, sx=1.0),
    "square": dict(jaw=1.16, chin=1.2, cheek=1.0, sy=0.99, sx=1.03),
    "round": dict(jaw=1.08, chin=0.9, cheek=1.25, sy=0.97, sx=1.05),
    "long": dict(jaw=0.95, chin=1.05, cheek=0.95, sy=1.06, sx=0.96),
}
EYE_Y = 1.693
EYE_X = 0.032


def build_head(f):
    sy, sx = f["sy"], f["sx"]
    cy = 1.69

    def Y(y):
        return cy + (y - cy) * sy

    h = Shape(k=0.02)
    h.add(Ellipsoid(v3(0, Y(1.716), -0.006), v3(0.077 * sx, 0.092 * sy, 0.098), "head"))
    h.add(Ellipsoid(v3(0, Y(1.646), 0.03), v3(0.064 * sx * f["jaw"], 0.068 * sy, 0.074), "head"), 0.03)
    h.add(Ellipsoid(v3(0, Y(1.6), 0.07), v3(0.026 * f["chin"], 0.021, 0.022), "head"), 0.02)
    for s in (-1, 1):
        h.add(Ellipsoid(v3(s * 0.05 * sx * f["jaw"], Y(1.625), 0.004), v3(0.022 * f["jaw"], 0.03, 0.034), "head"), 0.025)
        h.add(Ellipsoid(v3(s * 0.045 * sx, Y(1.676), 0.068), v3(0.025 * f["cheek"], 0.02 * f["cheek"], 0.02), "head"), 0.02)
        h.add(Ellipsoid(v3(s * 0.079 * sx, Y(1.684), -0.004), v3(0.011, 0.029, 0.019), "head"), 0.008)
    h.add(Cone(v3(-0.042, Y(1.716), 0.084), v3(0.042, Y(1.716), 0.084), 0.013, 0.013, "head"), 0.02)
    h.add(Cone(v3(0, Y(1.703), 0.095), v3(0, Y(1.659), 0.109), 0.0075, 0.0112, "head"), 0.012)
    h.add(Ellipsoid(v3(0, Y(1.658), 0.101), v3(0.0155, 0.0085, 0.0095), "head"), 0.01)
    h.add(Ellipsoid(v3(0, Y(1.633), 0.093), v3(0.022, 0.0068, 0.0095), "head"), 0.008)
    h.add(Ellipsoid(v3(0, Y(1.623), 0.089), v3(0.0195, 0.0072, 0.0095), "head"), 0.008)
    for s in (-1, 1):
        h.sub(Ellipsoid(v3(s * EYE_X, Y(EYE_Y), 0.088), v3(0.0145, 0.0095, 0.011), "head"), 0.01)
    for s in (-1, 1):
        lid = Ellipsoid(v3(s * EYE_X, Y(EYE_Y) + 0.0035, 0.0805), v3(0.0135, 0.0095, 0.0128), "head")
        h.items.append((lambda q, L=lid, y0=Y(EYE_Y) + 0.0025: smax(L(q), y0 - q[:, 1], 0.002), 0.004, "add"))
    return h, Y


HAIR = {
    # shell thickness over the cranium, hairline heights (front, back), noise amplitude
    "crop": dict(t=0.008, front=1.722, back=1.635, noise=0.0),
    "buzz": dict(t=0.0035, front=1.725, back=1.64, noise=0.0),
    "curly": dict(t=0.017, front=1.718, back=1.64, noise=0.006),
    "swept": dict(t=0.013, front=1.715, back=1.63, noise=0.0, front_lift=0.01),
    "receding": dict(t=0.007, front=1.748, back=1.64, noise=0.0),
}


def hair_shape(style, Y, sx, sy):
    p = HAIR[style]
    cran = Ellipsoid(v3(0, Y(1.716), -0.006), v3(0.077 * sx + p["t"], 0.092 * sy + p["t"], 0.098 + p["t"]), "head")
    lift = p.get("front_lift", 0.0)

    def fn(q):
        d = cran(q)
        if lift:
            d = smin(d, Ellipsoid(v3(0, Y(1.765), 0.05), v3(0.06, 0.035, 0.05), "head")(q), 0.02)
        if p["noise"]:
            d = d - p["noise"] * (np.sin(q[:, 0] * 260) * np.sin(q[:, 1] * 240) * np.sin(q[:, 2] * 250))
        # Hairline: above a plane rising from the back of the head to the forehead, and off the temples.
        zf = np.clip((q[:, 2] + 0.1) / 0.2, 0, 1)
        line = Y(p["back"]) + (Y(p["front"]) - Y(p["back"])) * zf
        d = smax(d, line - q[:, 1], 0.004)
        return d

    return fn


BEARDS = ["none", "mustache", "goatee", "full"]


def beard_shape(style, head, Y):
    if style == "none":
        return None
    must = Cone(v3(-0.024, Y(1.641), 0.1), v3(0.024, Y(1.641), 0.1), 0.0055, 0.0055, "head")

    def fn(q):
        shell = head(q) - 0.0065
        d = None
        if style in ("mustache", "goatee"):
            d = must(q)
        if style == "goatee":
            chin = Ellipsoid(v3(0, Y(1.604), 0.078), v3(0.026, 0.026, 0.022), "head")(q) - 0.002
            d = smin(d, smax(shell, chin, 0.004), 0.004)
        if style == "full":
            # Jaw and chin below the cheekbones, cut away round the lips.
            region = np.maximum(q[:, 1] - Y(1.655), -q[:, 2] - 0.0)
            lips = Ellipsoid(v3(0, Y(1.628), 0.095), v3(0.024, 0.012, 0.03), "head")(q)
            d = smax(smax(shell, region, 0.006), -lips, 0.003)
            d = smin(d, must(q), 0.004)
        return d

    return fn


# ---------------------------------------------------------------- Blender scene
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene


def to_blender(p):
    p = np.asarray(p, float)
    return np.stack([p[:, 0], -p[:, 2], p[:, 1]], 1)


def srgb(hex_color):
    h = hex_color.lstrip("#")
    c = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return tuple(x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c)


MATERIALS = {}
PREVIEW_COLORS = {"shirt": "#1d2126", "pants": "#3a3f46", "skin": "#c98e68", "hair": "#2b1d14", "leather": "#4a3423", "sole": "#18140f", "gear": "#1c1d20",
                  "teal": "#19d3c5", "metal": "#c9ced3", "eye": "#f4f5f7", "iris": "#2a1d14", "cap": "#15181d", "pocket": "#353a40"}


def material(name):
    if name in MATERIALS:
        return MATERIALS[name]
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    bsdf = m.node_tree.nodes["Principled BSDF"]
    bsdf.inputs["Base Color"].default_value = (*srgb(PREVIEW_COLORS.get(name, "#808080")), 1.0)
    bsdf.inputs["Roughness"].default_value = 0.35 if name in ("metal", "eye") else 0.8
    bsdf.inputs["Metallic"].default_value = 0.8 if name == "metal" else 0.0
    MATERIALS[name] = m
    return m


arm_data = bpy.data.armatures.new("rig")
arm_obj = bpy.data.objects.new("technician-rig", arm_data)
scene.collection.objects.link(arm_obj)
bpy.context.view_layer.objects.active = arm_obj
bpy.ops.object.mode_set(mode="EDIT")
for name in BONES:
    b = arm_data.edit_bones.new(name)
    hd = to_blender([JOINTS[name]])[0]
    tl = to_blender([TAIL[name]])[0]
    b.head = hd
    b.tail = tl
for name in BONES:
    if PARENT[name]:
        arm_data.edit_bones[name].parent = arm_data.edit_bones[PARENT[name]]
bpy.ops.object.mode_set(mode="OBJECT")

TRIS = {}


def make_object(name, verts, faces, weights, mat):
    """verts in game coords; faces (tris or quads); weights: list of {bone: w} per vertex."""
    me = bpy.data.meshes.new(name)
    bv = to_blender(verts)
    me.from_pydata([tuple(x) for x in bv], [], [tuple(int(i) for i in f) for f in faces])
    me.validate(clean_customdata=False)
    assert len(me.vertices) == len(bv), f"{name}: validate removed vertices"
    me.update()
    obj = bpy.data.objects.new(name, me)
    scene.collection.objects.link(obj)
    obj.data.materials.append(material(mat))
    for poly in me.polygons:
        poly.use_smooth = True
    groups = {b: obj.vertex_groups.new(name=b) for b in BONES}
    for i, w in enumerate(weights):
        for b, x in w.items():
            groups[b].add([i], float(x), "REPLACE")
    mod = obj.modifiers.new("Armature", "ARMATURE")
    mod.object = arm_obj
    obj.parent = arm_obj
    # Box-projected UVs in metres (for fabric detail maps).
    bm = bmesh.new()
    bm.from_mesh(me)
    uv = bm.loops.layers.uv.new("UVMap")
    for f in bm.faces:
        n = f.normal
        ax = max(range(3), key=lambda i: abs(n[i]))
        for loop in f.loops:
            co = loop.vert.co
            loop[uv].uv = (co.y, co.z) if ax == 0 else (co.x, co.z) if ax == 1 else (co.x, co.y)
    bm.to_mesh(me)
    bm.free()
    TRIS[name] = sum(len(p.vertices) - 2 for p in me.polygons)
    return obj


def recalc_normals(verts, faces):
    me = bpy.data.meshes.new("tmp")
    me.from_pydata([tuple(x) for x in verts], [], [tuple(int(i) for i in f) for f in faces])
    bm = bmesh.new()
    bm.from_mesh(me)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    out = [[v.index for v in f.verts] for f in bm.faces]
    bm.free()
    bpy.data.meshes.remove(me)
    return out


def decimate(verts, faces, target_tris):
    """Collapse-decimate a mesh (game coords in and out) to about target_tris triangles."""
    me = bpy.data.meshes.new("dec")
    me.from_pydata([tuple(x) for x in verts], [], [tuple(int(i) for i in f) for f in faces])
    obj = bpy.data.objects.new("dec", me)
    scene.collection.objects.link(obj)
    tris = sum(len(f) - 2 for f in faces)
    if tris > target_tris:
        mod = obj.modifiers.new("dec", "DECIMATE")
        mod.ratio = target_tris / tris
        mod.use_collapse_triangulate = True
        dg = bpy.context.evaluated_depsgraph_get()
        ev = obj.evaluated_get(dg)
        m2 = bpy.data.meshes.new_from_object(ev)
    else:
        m2 = me.copy()
        bm = bmesh.new()
        bm.from_mesh(m2)
        bmesh.ops.triangulate(bm, faces=bm.faces)
        bm.to_mesh(m2)
        bm.free()
    v = np.array([vv.co[:] for vv in m2.vertices])
    f = [list(p.vertices) for p in m2.polygons]
    bpy.data.objects.remove(obj)
    bpy.data.meshes.remove(me)
    bpy.data.meshes.remove(m2)
    return v, f


def skin_weights(verts, prims, sigma=0.022, top=3):
    bones = sorted({p.bone for p in prims})
    D = np.stack([p(verts) for p in prims], 1)
    best = np.full((len(verts), len(bones)), np.inf)
    for j, p in enumerate(prims):
        bi = bones.index(p.bone)
        best[:, bi] = np.minimum(best[:, bi], D[:, j])
    dmin = best.min(1, keepdims=True)
    w = np.exp(-np.maximum(best - dmin, 0) / sigma)
    out = []
    for row in w:
        order = np.argsort(-row)[:top]
        vals = row[order]
        vals = vals / vals.sum()
        keep = vals > 0.04
        vals = vals[keep] / vals[keep].sum()
        out.append({bones[o]: float(x) for o, x in zip(order[keep], vals)})
    bone_of = [bones[i] for i in np.argmin(best, 1)]
    return out, bone_of


def sdf_mesh(fn, lo, hi, h, smooth=4, target=None):
    v, f = surface_nets(fn, lo, hi, h)
    if smooth:
        v = taubin(v, f, smooth)
    bv = to_blender(v)
    f = recalc_normals(bv, f)
    if target:
        bv, f = decimate(bv, f, target)
    else:
        bv, f = decimate(bv, f, 10 ** 9)
    # back to game coords
    g = np.stack([bv[:, 0], bv[:, 2], -bv[:, 1]], 1)
    return g, f


def split_by_region(name, verts, faces, regions, weights):
    """One object per clothing region; faces take the region most of their vertices have."""
    faces = np.asarray(faces)
    for reg in sorted(set(regions)):
        mask = np.array([sum(regions[i] == reg for i in f) >= 2 for f in faces])
        if not mask.any():
            continue
        fsel = faces[mask]
        used = np.unique(fsel)
        remap = -np.ones(len(verts), dtype=int)
        remap[used] = np.arange(len(used))
        make_object(f"{name}__{reg}", verts[used], remap[fsel], [weights[i] for i in used], reg)


def rigid(name, verts, faces, bone, mat):
    make_object(f"{name}__{mat}", verts, faces, [{bone: 1.0}] * len(verts), mat)


# ---------------------------------------------------------------- build: bodies
BUILDS = {"slim": dict(girth=0.93, belly=0.92, limb=0.94), "avg": dict(girth=1.0, belly=1.0, limb=1.0), "heavy": dict(girth=1.09, belly=1.22, limb=1.08)}
BODY_LO, BODY_HI = (-0.5, 0.12, -0.24), (0.5, 1.68, 0.26)
for build, params in BUILDS.items():
    body = build_body(**params)
    v, f = sdf_mesh(body, BODY_LO, BODY_HI, 0.0075, smooth=5, target=6500)
    w, bone_of = skin_weights(v, body.prims())
    regions = body_region(v, bone_of)
    split_by_region(f"body_{build}", v, f, regions, w)
    print(f"body_{build}: {len(v)} verts, {len(f)} tris")

# Distant LOD: one coarse body for every build.
body = build_body(**BUILDS["avg"])
v, f = sdf_mesh(body, BODY_LO, BODY_HI, 0.02, smooth=3, target=1300)
w, bone_of = skin_weights(v, body.prims(), sigma=0.03)
split_by_region("body_lod", v, f, body_region(v, bone_of), w)

# Distant LOD head (with short hair), cap and boots.
head, Y = build_head(FACES["oval"])
v, f = sdf_mesh(head, (-0.11, 1.55, -0.13), (0.11, 1.83, 0.14), 0.012, smooth=2, target=350)
rigid("head_lod", v, f, "head", "skin")
lodcap = lambda q: smin(smax(Ellipsoid(v3(0, 1.738, -0.006), v3(0.089, 0.078, 0.106), "head")(q), 1.722 - q[:, 1], 0.004), smax(Ellipsoid(v3(0, 1.727, 0.122), v3(0.088, 0.008, 0.068), "head")(q), 0.075 - q[:, 2], 0.003), 0.006)
v, f = sdf_mesh(lodcap, (-0.11, 1.70, -0.13), (0.11, 1.83, 0.2), 0.012, smooth=1, target=200)
rigid("cap_lod", v, f, "head", "cap")
for side, s in ((-1, "L"), (1, "R")):
    x0 = side * 0.1
    lb = Shape(k=0.03)
    lb.add(Cone(v3(x0, 0.07, -0.012), v3(x0, 0.2, -0.006), 0.057, 0.053, f"foot{s}"))
    lb.add(Ellipsoid(v3(x0, 0.05, 0.06), v3(0.056, 0.05, 0.15), f"foot{s}"))
    v, f = sdf_mesh(lambda q, B=lb: smax(B(q), -q[:, 1], 0.003), (x0 - 0.09, -0.01, -0.12), (x0 + 0.09, 0.24, 0.25), 0.012, smooth=1, target=150)
    rigid(f"bootlod{s}", v, f, f"foot{s}", "leather")

# ---------------------------------------------------------------- build: heads, eyes, brows, hair, beards
HEAD_LO, HEAD_HI = (-0.11, 1.55, -0.13), (0.11, 1.83, 0.14)
for face, fp in FACES.items():
    head, Y = build_head(fp)
    v, f = sdf_mesh(head, HEAD_LO, HEAD_HI, 0.0045, smooth=3, target=1800)
    rigid(f"head_{face}", v, f, "head", "skin")
    for style in HAIR:
        v, f = sdf_mesh(hair_shape(style, Y, fp["sx"], fp["sy"]), HEAD_LO, HEAD_HI, 0.005, smooth=2, target=600)
        rigid(f"hair_{style}_{face}", v, f, "head", "hair")
    for style in BEARDS[1:]:
        fn = beard_shape(style, head, Y)
        v, f = sdf_mesh(fn, HEAD_LO, HEAD_HI, 0.004, smooth=2, target=400)
        rigid(f"beard_{style}_{face}", v, f, "head", "hair")
    # Brows: two short tapered strands over the eye sockets.
    brow = Shape(k=0.002)
    for s in (-1, 1):
        brow.add(Cone(v3(s * 0.017, Y(1.713), 0.0975), v3(s * 0.05, Y(1.716), 0.087), 0.0048, 0.0032, "head"))
    v, f = sdf_mesh(brow, (-0.07, Y(1.7), 0.075), (0.07, Y(1.73), 0.11), 0.0018, smooth=1, target=150)
    rigid(f"brows_{face}", v, f, "head", "hair")
    # Eyes: white eyeball and a dark iris disc, seated in the sockets.
    eyes = Shape(k=0.001)
    iris = Shape(k=0.001)
    for s in (-1, 1):
        c = v3(s * EYE_X, Y(EYE_Y), 0.0785)
        eyes.add(Ellipsoid(c, v3(0.0112, 0.0112, 0.0112), "head"))
        iris.add(Ellipsoid(c + v3(0, 0, 0.0094), v3(0.0062, 0.0062, 0.0026), "head"))
    v, f = sdf_mesh(eyes, (-0.05, Y(1.675), 0.065), (0.05, Y(1.711), 0.097), 0.0012, smooth=1, target=200)
    rigid(f"eyes_{face}", v, f, "head", "eye")
    v, f = sdf_mesh(iris, (-0.05, Y(1.68), 0.085), (0.05, Y(1.706), 0.098), 0.0008, smooth=1, target=100)
    rigid(f"iris_{face}", v, f, "head", "iris")

# ---------------------------------------------------------------- build: cap
cap = Shape(k=0.006)
crown = Ellipsoid(v3(0, 1.738, -0.006), v3(0.089, 0.078, 0.106), "head")


def cap_fn(q):
    d = smax(crown(q), 1.722 - q[:, 1] - 0.03 * np.clip(-q[:, 2] / 0.1, 0, 1), 0.004)
    brim = Ellipsoid(v3(0, 1.727, 0.122), v3(0.088, 0.0055, 0.068), "head")(q)
    brim = smax(brim, 0.075 - q[:, 2], 0.003)
    d = smin(d, brim, 0.006)
    button = Ellipsoid(v3(0, 1.816, -0.006), v3(0.009, 0.006, 0.009), "head")(q)
    return smin(d, button, 0.003)


v, f = sdf_mesh(cap_fn, (-0.11, 1.70, -0.13), (0.11, 1.83, 0.2), 0.004, smooth=2, target=900)
rigid("cap", v, f, "head", "cap")

# ---------------------------------------------------------------- build: boots (per foot bone)
for side, s in ((-1, "L"), (1, "R")):
    x0 = side * 0.1
    up = Shape(k=0.025)
    up.add(Cone(v3(x0, 0.07, -0.012), v3(x0, 0.205, -0.006), 0.057, 0.053, f"foot{s}"))
    up.add(Ellipsoid(v3(x0, 0.06, 0.055), v3(0.054, 0.048, 0.13), f"foot{s}"))
    up.add(Ellipsoid(v3(x0 + side * 0.004, 0.05, 0.165), v3(0.052, 0.042, 0.055), f"foot{s}"), 0.03)
    up.add(Ellipsoid(v3(x0, 0.06, -0.045), v3(0.047, 0.05, 0.05), f"foot{s}"), 0.02)

    def upper_fn(q, up=up):
        return smax(up(q), 0.022 - q[:, 1], 0.004)

    def sole_fn(q, up=up):
        flat = q.copy()
        flat[:, 1] = 0.05
        foot = up(flat) - 0.008
        slab = np.abs(q[:, 1] - 0.0125) - 0.0125
        lugs = 0.0015 * np.sign(np.sin(q[:, 2] * 140))
        return smax(foot, slab + np.where(q[:, 1] < 0.006, lugs, 0), 0.003)

    lo, hi = (x0 - 0.09, -0.005, -0.12), (x0 + 0.09, 0.24, 0.25)
    v, f = sdf_mesh(upper_fn, lo, hi, 0.005, smooth=3, target=700)
    rigid(f"boot{s}", v, f, f"foot{s}", "leather")
    v, f = sdf_mesh(sole_fn, lo, (x0 + 0.09, 0.03, 0.25), 0.004, smooth=1, target=300)
    rigid(f"sole{s}", v, f, f"foot{s}", "sole")
    # Lace rows: thin dark bars across the instep.
    laces = Shape(k=0.002)
    for i in range(5):
        z = 0.03 + i * 0.024
        y = 0.115 - i * 0.012
        laces.add(Cone(v3(x0 - 0.022, y, z), v3(x0 + 0.022, y, z), 0.0035, 0.0035, f"foot{s}"))
    v, f = sdf_mesh(laces, (x0 - 0.04, 0.05, 0.0), (x0 + 0.04, 0.14, 0.15), 0.002, smooth=1, target=150)
    pv = project(up, v, 0.004)
    rigid(f"laces{s}", pv, f, f"foot{s}", "gear")

# ---------------------------------------------------------------- build: clothing details (per build)
for build, params in BUILDS.items():
    body = build_body(**params)
    # Belt: a band round the waist, a buckle, and two pouches on the hips.
    band = lambda q, b=body: smax(b(q) - 0.009, np.abs(q[:, 1] - 0.985) - 0.022, 0.003)
    v, f = sdf_mesh(band, (-0.26, 0.95, -0.2), (0.26, 1.02, 0.2), 0.004, smooth=2, target=500)
    rigid(f"belt_{build}", v, f, "pelvis", "gear")
    front = project(body, [[0, 0.985, 0.2]], 0.012)[0]
    buckle = Ellipsoid(front + v3(0, 0, 0.004), v3(0.026, 0.02, 0.006), "pelvis")
    v, f = sdf_mesh(buckle, front - 0.04, front + 0.04, 0.0025, smooth=1, target=200)
    rigid(f"buckle_{build}", v, f, "pelvis", "metal")
    pouches = Shape(k=0.004)
    for sx in (-1, 1):
        at = project(body, [[sx * 0.15, 0.935, 0.16]], 0.024, iters=12)[0]
        pouches.add(RoundBox(at, v3(0.036, 0.05, 0.022), 0.01, "pelvis"))
        pouches.add(RoundBox(at + v3(0, 0.044, 0.004), v3(0.038, 0.012, 0.024), 0.006, "pelvis"))
    v, f = sdf_mesh(pouches, (-0.33, 0.85, -0.05), (0.33, 1.02, 0.15), 0.004, smooth=1, target=350)
    rigid(f"pouches_{build}", v, f, "pelvis", "leather")
    # Polo collar: a band standing round the neck base that rolls over and lies down onto the
    # shoulders and upper chest (its lower edge flares out with depth), parted in a V at the front.
    def collar(q, b=body):
        r = np.hypot(q[:, 0], q[:, 2] - 0.006)
        shell = np.abs(b(q) - 0.0085) - 0.0045
        flare = r - (0.074 + np.clip(1.565 - q[:, 1], 0, 0.1) * 0.85)
        band = np.maximum(q[:, 1] - 1.566, 1.468 - q[:, 1])
        vee = (0.006 + np.clip(1.565 - q[:, 1], 0, 0.1) * 0.55) - np.abs(q[:, 0])
        vee = np.where(q[:, 2] > 0.02, vee, -1.0)
        return smax(smax(shell, flare, 0.004), band, 0.003)

    v, f = sdf_mesh(collar, (-0.16, 1.44, -0.14), (0.16, 1.59, 0.16), 0.0028, smooth=2, target=700)
    rigid(f"collar_{build}", v, f, "torso", "shirt")
    placket = Shape(k=0.002)
    top = project(body, [[0, 1.5, 0.15]], 0.005)[0]
    bot = project(body, [[0, 1.4, 0.15]], 0.005)[0]
    placket.add(Cone(top, bot, 0.011, 0.011, "torso"))
    v, f = sdf_mesh(lambda q, P=placket, b=body: smax(P(q), np.abs(b(q) - 0.005) - 0.002, 0.001), (-0.04, 1.37, 0.05), (0.04, 1.53, 0.17), 0.0018, smooth=1, target=300)
    rigid(f"placket_{build}", v, f, "torso", "shirt")
    buttons = Shape(k=0.001)
    for t in (0.25, 0.65):
        c = project(body, [[0, 1.5 - t * 0.1, 0.15]], 0.0085)[0]
        buttons.add(Ellipsoid(c, v3(0.0045, 0.0045, 0.0022), "torso"))
    v, f = sdf_mesh(buttons, (-0.02, 1.38, 0.05), (0.02, 1.52, 0.17), 0.0009, smooth=0, target=200)
    rigid(f"buttons_{build}", v, f, "torso", "gear")
    # Teal piping along each shoulder yoke, and a teal band at each sleeve hem.
    piping = Shape(k=0.002)
    for sx in (-1, 1):
        pts = project(body, [[sx * (0.085 + i * 0.022), 1.49, -0.008] for i in range(6)], 0.0055, iters=10)
        for a, b2 in zip(pts[:-1], pts[1:]):
            piping.add(Cone(a, b2, 0.0032, 0.0032, "torso"))
    v, f = sdf_mesh(piping, (-0.26, 1.42, -0.08), (0.26, 1.6, 0.08), 0.0016, smooth=1, target=250)
    rigid(f"piping_{build}", v, f, "torso", "teal")
    for side, s in ((-1, "L"), (1, "R")):
        S = np.array(JOINTS[f"arm{s}"])
        dA = arm_dir(side)
        c = S + dA * 0.2

        def hem(q, b=body, c=c, dA=dA):
            along = (q - c) @ dA
            return smax(b(q) - 0.0072, np.abs(along) - 0.018, 0.002)

        def trim(q, b=body, c=c, dA=dA):
            along = (q - c) @ dA
            return smax(b(q) - 0.0082, np.abs(along - 0.013) - 0.0035, 0.001)

        lo = c - 0.09
        hi = c + 0.09
        v, f = sdf_mesh(hem, lo, hi, 0.003, smooth=1, target=250)
        make_object(f"sleeve{s}_{build}__shirt", v, f, [{f"arm{s}": 1.0}] * len(v), "shirt")
        v, f = sdf_mesh(trim, lo, hi, 0.0018, smooth=1, target=250)
        make_object(f"sleevetrim{s}_{build}__teal", v, f, [{f"arm{s}": 1.0}] * len(v), "teal")
        # Cargo pocket on the outside of each thigh, a reinforced knee panel on each shin.
        H = np.array(JOINTS[f"leg{s}"])
        K = np.array(JOINTS[f"shin{s}"])
        pc = project(body, [H + v3(side * 0.04, -0.25, 0.0)], 0.0, iters=10)[0]
        pocket = RoundBox(pc, v3(0.06, 0.07, 0.06), 0.012, f"leg{s}")
        v, f = sdf_mesh(lambda q, P=pocket, b=body: smax(P(q), np.abs(b(q) - 0.0075) - 0.0045, 0.002), pc - 0.1, pc + 0.1, 0.0028, smooth=1, target=200)
        rigid(f"pocket{s}_{build}", v, f, f"leg{s}", "pocket")
        kc = project(body, [K + v3(0, -0.02, 0.0)], 0.0, iters=10)[0]
        panel = RoundBox(kc + v3(0, 0, 0.04), v3(0.045, 0.07, 0.04), 0.015, f"shin{s}")
        v, f = sdf_mesh(lambda q, P=panel, b=body: smax(P(q), np.abs(b(q) - 0.0035) - 0.0022, 0.002), kc - 0.1, kc + 0.1, 0.0028, smooth=1, target=200)
        rigid(f"knee{s}_{build}", v, f, f"shin{s}", "pocket")

# ---------------------------------------------------------------- validation
problems = []
for name, t in TRIS.items():
    if t == 0:
        problems.append(f"{name}: empty")
body_tris = {b: sum(t for n, t in TRIS.items() if n.startswith(f"body_{b}__")) for b in BUILDS}
for b, t in body_tris.items():
    if not 5000 <= t <= 12000:
        problems.append(f"body_{b}: {t} tris outside 5k-12k")
for n in ("body_avg__shirt", "body_avg__pants", "body_avg__skin", "head_oval__skin", "cap__cap", "bootL__leather"):
    if n not in bpy.data.objects:
        problems.append(f"missing {n}")
    else:
        o = bpy.data.objects[n]
        zs = [(o.matrix_world @ v.co).z for v in o.data.vertices]
        if n.startswith("bootL") and min(zs) > 0.03:
            problems.append(f"{n}: floats {min(zs):.3f}")
total_close = body_tris["avg"] + sum(TRIS[n] for n in TRIS if n.endswith("_oval__skin") or n.startswith("cap__") or n.startswith("boot") or n.startswith("sole"))
print("tris per object:", sorted(TRIS.items()))
print("close character (avg body, oval head, cap, boots):", total_close)
if problems:
    print("VALIDATION FAILED:", problems)
    sys.exit(1)

# ---------------------------------------------------------------- export
os.makedirs(os.path.dirname(OUT), exist_ok=True)
bpy.ops.export_scene.gltf(filepath=OUT, export_format="GLB", export_skins=True, export_animations=False, export_morph=False, export_apply=False,
                          export_normals=True, export_texcoords=False, export_materials="EXPORT", export_yup=True)
print("exported", OUT, os.path.getsize(OUT), "bytes")

# ---------------------------------------------------------------- preview
if PREVIEW_DIR:
    os.makedirs(PREVIEW_DIR, exist_ok=True)
    # Show one assembled character: avg body, oval head, crop hair, cap, full gear.
    show = lambda n: (n.startswith("body_avg__") or n.endswith("_oval__skin") or n in ("eyes_oval__eye", "iris_oval__iris", "brows_oval__hair", "hair_crop_oval__hair", "beard_mustache_oval__hair", "cap__cap")
                      or n.split("__")[0] in ("bootL", "bootR", "soleL", "soleR", "lacesL", "lacesR") or n.split("__")[0].endswith("_avg"))
    for o in scene.objects:
        if o.type == "MESH":
            o.hide_render = not show(o.name)
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = 900
    scene.render.resolution_y = 1200
    world = bpy.data.worlds.new("w")
    world.use_nodes = True
    world.node_tree.nodes["Background"].inputs[0].default_value = (0.55, 0.6, 0.66, 1)
    world.node_tree.nodes["Background"].inputs[1].default_value = 0.8
    scene.world = world
    sun = bpy.data.objects.new("sun", bpy.data.lights.new("sun", "SUN"))
    sun.data.energy = 3.5
    sun.rotation_euler = (0.9, 0.2, 0.6)
    scene.collection.objects.link(sun)
    cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam"))
    scene.collection.objects.link(cam)
    scene.camera = cam
    from mathutils import Vector
    for label, pos, look, lens in (("front", (1.2, -3.4, 1.1), (0, 0, 0.92), 55), ("side", (3.6, -0.6, 1.05), (0, 0, 0.92), 55), ("face", (0.35, -0.75, 1.72), (0, 0, 1.69), 70)):
        cam.location = pos
        cam.data.lens = lens
        d = Vector(look) - Vector(pos)
        cam.rotation_euler = d.to_track_quat("-Z", "Y").to_euler()
        scene.render.filepath = os.path.join(PREVIEW_DIR, f"technician-{label}.png")
        bpy.ops.render.render(write_still=True)
    print("previews in", PREVIEW_DIR)
