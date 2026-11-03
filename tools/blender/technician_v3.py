"""Next-generation EGO HVAC technician (Graphics Revolution 3.0), authored in Blender and exported as GLB.

Run headless (one Blender at a time, about two minutes; see docs/graphics-revolution-3/PIPELINE.md):
    blender -b --factory-startup --python tools/blender/technician_v3.py -- <out_dir> [--preview <dir>] [--hero]

What it builds, from CC0 MakeHuman data (tools/character/makehuman, see SOURCE.txt):
  1. Real human anatomy: the MakeHuman base mesh, morphed by its macro targets into three builds and six heads, scaled to
     a 1.80 m man with feet on the ground.
  2. A 43-bone game rig: joints come from the morphed mesh's own joint helpers; skin weights are MakeHuman's authored
     weights, merged from its 163 bones. Old game-rig names are kept, so the game's clips still address it.
  3. Clothing as geometry, not paint: the polo, work pants and belt are shells of the body surface, smoothed so the cloth
     no longer shows the anatomy under it, loosened, and folded. The skin under them is deleted, so nothing can poke
     through. Hems are snapped to clean lines and given an inner skirt so they have thickness.
  4. One texture atlas for the whole person (albedo with tint mask, normal, occlusion/roughness/metal), painted here, so
     a character is one draw call. Alpha 1 means "tinted per region" (skin, shirt, pants, hair, cap); alpha 0 means
     absolute colour (logo, teal trim, eyes, boots).
  5. Three levels of detail.

Coordinates are the game's: metres, +y up, +z the character's forward, L = -x. Bind pose is MakeHuman's A-pose. Bones are
described in a canonical pose in which every joint rotation is zero, limbs hang straight down and all local axes are
world-aligned (src/world/characters/rigData.generated.ts carries both), which is the frame the game's clips and IK use.
"""
import json
import math
import os
import sys

import bmesh
import bpy
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from sdf_kit import Cone, Ellipsoid, Shape, smax, smin, surface_nets, taubin  # noqa: E402

argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
OUT_DIR = os.path.abspath(argv[0] if argv else "out")
PREVIEW_DIR = os.path.abspath(argv[argv.index("--preview") + 1]) if "--preview" in argv else None
HERO_ONLY = "--hero" in argv
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
MH = os.path.join(ROOT, "tools", "character", "makehuman")
ATLAS = 2048
# Texels stay under 1 so highlights in the ratio survive: the game divides the employee's skin tone by this.
SKIN_BASE = 0.88
TARGET_HEIGHT = 1.80
# The body's UV space is squeezed under this line; the strip above holds cap, boots, eyes, hair and collar.
BODY_V = 0.82
os.makedirs(OUT_DIR, exist_ok=True)
rng = np.random.default_rng(1408)


# ---------------------------------------------------------------- MakeHuman data
def load_obj(path):
    verts, uvs, faces = [], [], {}
    group = None
    with open(path, encoding="utf8") as fh:
        for line in fh:
            if line.startswith("v "):
                verts.append([float(x) for x in line.split()[1:4]])
            elif line.startswith("vt "):
                uvs.append([float(x) for x in line.split()[1:3]])
            elif line.startswith("g "):
                group = line[2:].strip()
            elif line.startswith("f "):
                corners = [c.split("/") for c in line.split()[1:]]
                faces.setdefault(group, []).append(([int(c[0]) - 1 for c in corners], [int(c[1]) - 1 for c in corners]))
    return np.array(verts), np.array(uvs), faces


V_BASE, UV_ALL, GROUPS = load_obj(os.path.join(MH, "3dobjs", "base.obj"))
BODY_F = np.array([f[0] for f in GROUPS["body"]])
BODY_FT = np.array([f[1] for f in GROUPS["body"]])
N_BODY = BODY_F.max() + 1
SKEL = json.load(open(os.path.join(MH, "rigs", "default.mhskel"), encoding="utf8"))
MHW = json.load(open(os.path.join(MH, "rigs", "default_weights.mhw"), encoding="utf8"))["weights"]
_target_cache = {}


def target(name):
    if name not in _target_cache:
        idx, d = [], []
        with open(os.path.join(MH, "targets", name + ".target"), encoding="utf8") as fh:
            for line in fh:
                if line[0] in "#\n":
                    continue
                p = line.split()
                idx.append(int(p[0]))
                d.append([float(p[1]), float(p[2]), float(p[3])])
        # Some targets are deliberately empty (the average-weight universal one is the zero point).
        _target_cache[name] = (np.array(idx, dtype=int), np.array(d, dtype=float).reshape(-1, 3))
    return _target_cache[name]


def morph(recipe):
    """Base mesh plus weighted targets (MakeHuman units, decimetres)."""
    v = V_BASE.copy()
    for name, w in recipe.items():
        idx, d = target(name)
        v[idx] += d * w
    return v


MACRO = "macrodetails/"
UNI = MACRO + "universal-male-young-"
AVG = {MACRO + "caucasian-male-young": 1.0, UNI + "averagemuscle-averageweight": 1.0}
BUILDS = {
    "avg": AVG,
    "slim": {MACRO + "caucasian-male-young": 1.0, UNI + "averagemuscle-averageweight": 0.45, UNI + "averagemuscle-minweight": 0.55},
    "heavy": {MACRO + "caucasian-male-young": 1.0, UNI + "averagemuscle-averageweight": 0.3, UNI + "averagemuscle-maxweight": 0.55, UNI + "maxmuscle-maxweight": 0.15},
}
RACE = lambda c, af, s: {MACRO + "caucasian-male-young": c, MACRO + "african-male-young": af, MACRO + "asian-male-young": s}
HEADS = {
    # Shape and ancestry targets together make different people, not one face with different paint.
    "oval": {**RACE(1, 0, 0), "head/head-oval": 0.5, "nose/nose-scale-horiz-incr": 0.1},
    "square": {**RACE(0.85, 0.15, 0), "head/head-square": 0.65, "chin/chin-width-incr": 0.45, "chin/chin-bones-incr": 0.4, "nose/nose-hump-incr": 0.35},
    "round": {**RACE(0.25, 0, 0.75), "head/head-round": 0.45, "head/head-fat-incr": 0.2, "cheek/l-cheek-bones-incr": 0.3, "cheek/r-cheek-bones-incr": 0.3},
    "long": {**RACE(0.15, 0.85, 0), "head/head-rectangular": 0.4, "nose/nose-volume-incr": 0.25},
    "broad": {**RACE(0.55, 0.3, 0.15), "head/head-fat-incr": 0.35, "chin/chin-prominent-incr": 0.3, "nose/nose-scale-horiz-incr": 0.25},
    "weathered": {MACRO + "caucasian-male-young": 0.55, MACRO + "caucasian-male-old": 0.45, "head/head-age-incr": 0.75, "head/head-rectangular": 0.25, "nose/nose-hump-incr": 0.2},
}

_avg = morph(AVG)
_body_ids = np.unique(BODY_F)
_foot_y = _avg[_body_ids, 1].min()
SCALE = TARGET_HEIGHT / (_avg[_body_ids, 1].max() - _foot_y)


def to_game(v):
    """MakeHuman decimetres to game metres with the soles on y = 0; MakeHuman already looks along +z with +y up."""
    out = (v - np.array([0.0, _foot_y, 0.0])) * SCALE
    return out


V_AVG = to_game(_avg)


def joint_pos(v, joint):
    return v[np.array(SKEL["joints"][joint], dtype=int)].mean(0)


def mh_head(v, bone):
    return joint_pos(v, SKEL["bones"][bone]["head"])


def mh_tail(v, bone):
    return joint_pos(v, SKEL["bones"][bone]["tail"])


# ---------------------------------------------------------------- rig
# Game side L is at -x, which is MakeHuman's .R side (MakeHuman's .L is at +x); checked below.
assert mh_head(V_AVG, "upperarm01.L")[0] > 0
FINGERS = {"thumb": 1, "index": 2, "middle": 3, "ring": 4, "pinky": 5}
BONE_SOURCES = {"pelvis": ["root", "spine05", "pelvis.L", "pelvis.R"], "spine": ["spine04", "spine03"], "torso": ["spine02", "spine01", "breast.L", "breast.R"], "neck": ["neck01", "neck02"], "head": ["neck03", "head"]}
for gs, ms in (("L", "R"), ("R", "L")):
    BONE_SOURCES.update({
        f"clav{gs}": [f"clavicle.{ms}", f"shoulder01.{ms}"], f"arm{gs}": [f"upperarm01.{ms}", f"upperarm02.{ms}"], f"fore{gs}": [f"lowerarm01.{ms}"], f"twist{gs}": [f"lowerarm02.{ms}"],
        f"hand{gs}": [f"wrist.{ms}"] + [f"metacarpal{i}.{ms}" for i in range(1, 5)], f"leg{gs}": [f"upperleg01.{ms}", f"upperleg02.{ms}"], f"shin{gs}": [f"lowerleg01.{ms}", f"lowerleg02.{ms}"], f"foot{gs}": [f"foot.{ms}"],
        f"toe{gs}": [f"toe{i}-{j}.{ms}" for i in range(1, 6) for j in range(1, 4) if f"toe{i}-{j}.{ms}" in SKEL["bones"]],
    })
    for name, i in FINGERS.items():
        BONE_SOURCES[f"{name}1{gs}"] = [f"finger{i}-1.{ms}"]
        BONE_SOURCES[f"{name}2{gs}"] = [f"finger{i}-2.{ms}", f"finger{i}-3.{ms}"]
BONES = list(BONE_SOURCES.keys())
BONE_INDEX = {b: i for i, b in enumerate(BONES)}
PARENT = {"pelvis": None, "spine": "pelvis", "torso": "spine", "neck": "torso", "head": "neck"}
for s in "LR":
    PARENT.update({f"clav{s}": "torso", f"arm{s}": f"clav{s}", f"fore{s}": f"arm{s}", f"twist{s}": f"fore{s}", f"hand{s}": f"twist{s}", f"leg{s}": "pelvis", f"shin{s}": f"leg{s}", f"foot{s}": f"shin{s}", f"toe{s}": f"foot{s}"})
    for f in FINGERS:
        PARENT[f"{f}1{s}"] = f"hand{s}"
        PARENT[f"{f}2{s}"] = f"{f}1{s}"
assert len(BONES) == 43 and set(BONES) == set(PARENT)


def joint_table(v):
    """World position of every game bone's head in the bind pose, and a tail for the limb bones."""
    j, tail = {}, {}
    j["pelvis"] = mh_head(v, "spine05")
    j["spine"] = mh_head(v, "spine04")
    j["torso"] = mh_head(v, "spine02")
    j["neck"] = mh_head(v, "neck01")
    j["head"] = mh_head(v, "neck03")
    for gs, ms in (("L", "R"), ("R", "L")):
        j[f"clav{gs}"] = mh_head(v, f"clavicle.{ms}")
        j[f"arm{gs}"] = mh_head(v, f"upperarm01.{ms}")
        j[f"fore{gs}"] = mh_head(v, f"lowerarm01.{ms}")
        j[f"twist{gs}"] = mh_head(v, f"lowerarm02.{ms}")
        j[f"hand{gs}"] = mh_head(v, f"wrist.{ms}")
        j[f"leg{gs}"] = mh_head(v, f"upperleg01.{ms}")
        j[f"shin{gs}"] = mh_head(v, f"lowerleg01.{ms}")
        j[f"foot{gs}"] = mh_head(v, f"foot.{ms}")
        j[f"toe{gs}"] = mh_head(v, f"toe3-1.{ms}")
        for name, i in FINGERS.items():
            j[f"{name}1{gs}"] = mh_head(v, f"finger{i}-1.{ms}")
            j[f"{name}2{gs}"] = mh_head(v, f"finger{i}-2.{ms}")
            tail[f"{name}2{gs}"] = mh_tail(v, f"finger{i}-3.{ms}")
        tail[f"hand{gs}"] = mh_head(v, f"finger3-1.{ms}")
    return j, tail


JOINTS, TAILS = joint_table(V_AVG)


def frame_for(direction, forward=(0.0, 0.0, 1.0)):
    """World rotation of a limb bone: local -y along the limb, local z as near to `forward` as the limb allows."""
    y = -direction / np.linalg.norm(direction)
    z = np.asarray(forward, float)
    z = z - y * (z @ y)
    z = z / np.linalg.norm(z)
    x = np.cross(y, z)
    return np.stack([x, y, z], 1)


LIMB_NEXT = {}
for s in "LR":
    LIMB_NEXT.update({f"arm{s}": f"fore{s}", f"fore{s}": f"twist{s}", f"twist{s}": f"hand{s}", f"leg{s}": f"shin{s}", f"shin{s}": f"foot{s}"})
    for f in FINGERS:
        LIMB_NEXT[f"{f}1{s}"] = f"{f}2{s}"
WORLD_R = {}
for b in BONES:
    if b in LIMB_NEXT:
        WORLD_R[b] = frame_for(JOINTS[LIMB_NEXT[b]] - JOINTS[b])
    elif b in TAILS:
        WORLD_R[b] = frame_for(TAILS[b] - JOINTS[b])
    else:
        WORLD_R[b] = np.eye(3)
# The forearm's twist segment and the forearm share a frame so wrist roll is shared between them only when the clips ask.
RIG = {}
for b in BONES:
    p = PARENT[b]
    if p is None:
        at = JOINTS[b].copy()
        bind = WORLD_R[b]
    else:
        at = WORLD_R[p].T @ (JOINTS[b] - JOINTS[p])
        bind = WORLD_R[p].T @ WORLD_R[b]
    RIG[b] = {"parent": p, "at": at, "bind": bind}


def mat_to_quat(m):
    t = np.trace(m)
    if t > 0:
        s = math.sqrt(t + 1) * 2
        return [(m[2, 1] - m[1, 2]) / s, (m[0, 2] - m[2, 0]) / s, (m[1, 0] - m[0, 1]) / s, s / 4]
    i = int(np.argmax(np.diag(m)))
    j, k = (i + 1) % 3, (i + 2) % 3
    s = math.sqrt(1 + m[i, i] - m[j, j] - m[k, k]) * 2
    q = [0.0, 0.0, 0.0, (m[k, j] - m[j, k]) / s]
    q[i] = s / 4
    q[j] = (m[j, i] + m[i, j]) / s
    q[k] = (m[k, i] + m[i, k]) / s
    return q


# Skin weights merged from MakeHuman's bones into ours. Every vertex keeps up to four, normalised.
_w = np.zeros((len(V_BASE), len(BONES)), dtype=np.float32)
_source_of = {m: g for g, ms in BONE_SOURCES.items() for m in ms}
for bone, entries in MHW.items():
    g = _source_of.get(bone, "head")  # Everything unnamed is a facial bone.
    for vid, w in entries:
        _w[vid, BONE_INDEX[g]] += w
_w_sum = _w.sum(1, keepdims=True)
_orphans = int((_w_sum[_body_ids] == 0).sum())
assert _orphans == 0, f"{_orphans} body vertices have no skin weight"
WEIGHTS = _w / np.maximum(_w_sum, 1e-9)
WEIGHT_OF = lambda names: WEIGHTS[:, [BONE_INDEX[n] for n in names]].sum(1)

# ---------------------------------------------------------------- measurements
HIP_Y = JOINTS["legL"][1]
ANKLE_Y = JOINTS["footL"][1]
WAIST_Y = HIP_Y + 0.105  # The belt line: on the hips, a little under the navel.
NECK_Y = JOINTS["neck"][1]
SLEEVE_T = 0.74  # Polo sleeve hem, as a fraction of the upper arm.
HEM_Y = ANKLE_Y + 0.055  # Trouser hem, breaking over the boot.


def smoothstep(a, b, x):
    t = np.clip((x - a) / (b - a), 0, 1)
    return t * t * (3 - 2 * t)


def vertex_normals(v, faces):
    n = np.zeros_like(v)
    a, b, c, d = (faces[:, i] for i in range(4))
    fn = np.cross(v[c] - v[a], v[d] - v[b])
    for k in (a, b, c, d):
        np.add.at(n, k, fn)
    return n / np.maximum(np.linalg.norm(n, axis=1, keepdims=True), 1e-9)


def arm_param(v):
    """Fraction along the upper arm of the vertex's nearer shoulder, and the side (-1 is L)."""
    side = np.sign(v[:, 0])
    s = np.where(side[:, None] < 0, JOINTS["armL"], JOINTS["armR"])
    e = np.where(side[:, None] < 0, JOINTS["foreL"], JOINTS["foreR"])
    d = e - s
    return np.einsum("ij,ij->i", v - s, d) / np.einsum("ij,ij->i", d, d), side


ARM_BONES = [b for b in BONES if b.startswith(("arm", "fore", "twist", "hand")) or b[:-2] in FINGERS]
_arm_w = WEIGHT_OF(ARM_BONES)
_leg_w = WEIGHT_OF([b for b in BONES if b.startswith(("leg", "shin", "foot", "toe"))])
_head_w = WEIGHT_OF(["neck", "head"])
_foot_w = WEIGHT_OF(["footL", "footR", "toeL", "toeR"])


def classify(v):
    """Per-vertex region of the dressed body: head, arm (bare skin), shirt, pants, none (inside a boot)."""
    t, _ = arm_param(v)
    y = v[:, 1]
    out = np.full(len(v), "shirt", dtype=object)
    out[y < WAIST_Y] = "pants"
    out[(_arm_w > 0.5) & (t > SLEEVE_T)] = "arm"
    out[(_head_w > 0.45) & (_arm_w < 0.5)] = "head"
    out[y < HEM_Y - 0.03] = "none"
    return out


REGION = classify(V_AVG)


def face_region(fv):
    """Each quad takes the region most of its corners have, with ties to the outer garment."""
    order = ["shirt", "pants", "head", "arm", "none"]
    out = np.empty(len(fv), dtype=object)
    for i, q in enumerate(fv):
        r = [REGION[j] for j in q]
        out[i] = max(order, key=lambda k: (r.count(k), -order.index(k)))
    return out


FACE_REGION = face_region(BODY_F)

# ---------------------------------------------------------------- cloth folds (shared by geometry and normal map)
def _noise3(p, f, seed=0.0):
    """Smooth band-limited noise from a few rotated sines: stable, cheap, and needs no lookup texture."""
    q = p * f
    n = np.sin(q[..., 0] * 1.03 + q[..., 1] * 0.41 + seed) * np.sin(q[..., 1] * 0.97 - q[..., 2] * 0.53 + seed * 1.7)
    n += 0.6 * np.sin(q[..., 2] * 1.31 + q[..., 0] * 0.67 + seed * 2.3) * np.sin(q[..., 0] * 1.61 - q[..., 1] * 0.83 + seed * 0.7)
    return n / 1.6


def fold_height(p, kind):
    """Height of the cloth's folds at points p (bind pose), metres."""
    y = p[..., 1]
    x = p[..., 0]
    z = p[..., 2]
    h = np.zeros(y.shape, dtype=np.float32)
    if kind == "shirt":
        th = np.arctan2(x, z)
        # Gathers above the belt where the polo is tucked in, strongest just over it.
        k = smoothstep(WAIST_Y + 0.20, WAIST_Y + 0.01, y) * (y < NECK_Y)
        warp = _noise3(p, 9.0, 1.1) * 0.9
        h += 0.0062 * k * (np.sin(th * 15 + warp * 2.0) * 0.6 + np.sin(th * 29 + warp * 3.0 + 1.0) * 0.4)
        # Soft diagonal drape across the chest and back, from the shoulders toward the waist.
        h += 0.0036 * smoothstep(NECK_Y - 0.02, NECK_Y - 0.2, y) * _noise3(p * np.array([1.0, 0.45, 1.0]), 26.0, 2.3)
        # Pull lines from the armpits.
        ap = np.minimum(np.hypot(x - JOINTS["armL"][0], y - (JOINTS["armL"][1] - 0.12)), np.hypot(x - JOINTS["armR"][0], y - (JOINTS["armR"][1] - 0.12)))
        h += 0.004 * smoothstep(0.22, 0.05, ap) * np.sin(ap * 90 + _noise3(p, 11.0, 4.0) * 2.0)
    elif kind == "pants":
        lx = np.abs(x) - abs(JOINTS["legL"][0])
        ky = JOINTS["shinL"][1]
        ky0 = np.abs(y - ky)
        # Behind and round the knee, compression creases.
        h += 0.0052 * smoothstep(0.17, 0.02, ky0) * np.sin(y * 92 + _noise3(p, 16.0, 3.3) * 2.6 + lx * 16) * smoothstep(-0.5, 0.5, _noise3(p, 13.0, 9.1))
        # Stacking above the boot.
        h += 0.0078 * smoothstep(ANKLE_Y + 0.26, ANKLE_Y + 0.07, y) * np.sin(y * 76 + _noise3(p, 18.0, 5.1) * 3.4) * smoothstep(-0.6, 0.4, _noise3(p, 11.0, 2.2))
        # Crotch and hip creases radiating from the fork.
        fork = np.hypot(lx, (y - (HIP_Y - 0.07)) * 0.9)
        h += 0.0056 * smoothstep(0.26, 0.06, fork) * np.sin(fork * 68 + np.arctan2(z, lx + 1e-4) * 4 + _noise3(p, 12.0, 1.4) * 2.0)
        # Long vertical drape down the thigh and shin.
        h += 0.003 * _noise3(p * np.array([1.0, 0.16, 1.0]), 34.0, 7.7)
    return h


# ---------------------------------------------------------------- shells: garments cut from the body surface
def edges_of(faces):
    e = np.concatenate([faces[:, [0, 1]], faces[:, [1, 2]], faces[:, [2, 3]], faces[:, [3, 0]]])
    return e


def boundary_edges(faces):
    """Directed edges used by exactly one quad: the shell's rim."""
    e = edges_of(faces)
    key = np.sort(e, 1)
    _, inv, cnt = np.unique(key, axis=0, return_inverse=True, return_counts=True)
    return e[cnt[inv.ravel()] == 1]


def laplace(v, faces, iters, lam, pinned=None, weight=None):
    e = np.unique(np.sort(edges_of(faces), 1), axis=0)
    deg = np.bincount(e.ravel(), minlength=len(v)).astype(float)
    out = v.copy()
    for _ in range(iters):
        s = np.zeros_like(out)
        np.add.at(s, e[:, 0], out[e[:, 1]])
        np.add.at(s, e[:, 1], out[e[:, 0]])
        delta = s / np.maximum(deg, 1)[:, None] - out
        if weight is not None:
            delta = delta * weight[:, None]
        if pinned is not None:
            delta[pinned] = 0
        out = out + lam * delta
    return out


class Piece:
    """A skinned mesh in game coordinates: quads or tris, with per-corner UVs and four weights per vertex."""

    def __init__(self, name, tint, verts, faces, uvs, weights):
        self.name, self.tint, self.verts, self.faces, self.uvs, self.weights = name, tint, verts, faces, uvs, weights


def body_uv(ft):
    uv = UV_ALL[ft].copy()
    uv[..., 1] *= BODY_V
    return uv


def cut(mask):
    faces = BODY_F[mask]
    ids, inv = np.unique(faces, return_inverse=True)
    return ids, inv.reshape(faces.shape), body_uv(BODY_FT[mask])


def add_skirt(verts, faces, uvs, weights, normals, depth=0.014):
    """Gives a rim thickness: an inner band turned back from the edge, so the opening does not read as paper."""
    rim = boundary_edges(faces)
    uv_at = {}
    for q, quv in zip(faces, uvs):
        for i, vid in enumerate(q):
            uv_at.setdefault(int(vid), quv[i])
    ids = np.unique(rim)
    new_index = {int(v): len(verts) + i for i, v in enumerate(ids)}
    inner = verts[ids] - normals[ids] * depth
    verts = np.concatenate([verts, inner])
    weights = np.concatenate([weights, weights[ids]])
    extra = np.array([[b, a, new_index[int(a)], new_index[int(b)]] for a, b in rim])
    extra_uv = np.array([[uv_at[int(b)], uv_at[int(a)], uv_at[int(a)], uv_at[int(b)]] for a, b in rim])
    return verts, np.concatenate([faces, extra]), np.concatenate([uvs, extra_uv]), weights


def garment(name, tint, region, v, inflate, smooth_iters, shape=None, snap=None, skirt=0.014, tuck=None):
    """A shell of body faces in a region of the morph v: smoothed, inflated, folded, hems snapped."""
    mask = np.isin(FACE_REGION, region)
    ids, faces, uvs = cut(mask)
    p0 = v[ids]
    n0 = vertex_normals(v, BODY_F)[ids]
    w = WEIGHTS[ids]
    p = p0.copy()
    if shape:
        p = shape(p)
    rim = np.unique(boundary_edges(faces))
    if snap:
        p[rim] = snap(p[rim])
    # Taubin-style: smoothing removes muscles and nipples the cloth would hide; the second pass stops it shrinking.
    if smooth_iters:
        p = laplace(p, faces, smooth_iters, 0.5, pinned=rim)
        p = laplace(p, faces, smooth_iters // 2, -0.25, pinned=rim)
    amount = inflate(p0) if callable(inflate) else np.full(len(p), inflate)
    p = p + n0 * amount[:, None]
    # The cloth stays outside the skin it replaced.
    clearance = np.einsum("ij,ij->i", p - p0, n0)
    p += n0 * np.maximum(0.0035 - clearance, 0)[:, None]
    p += vertex_normals(p, faces) * fold_height(p0, tint)[:, None] * 0.32
    if snap:
        p[rim] = snap(p[rim])
    if tuck:
        p -= n0 * tuck(p0)[:, None]
    p, faces, uvs, w = add_skirt(p, faces, uvs, w, vertex_normals(p, faces), skirt) if skirt else (p, faces, uvs, w)
    return Piece(name, tint, p, faces, uvs, w)


def leg_axis_shape(p, top_y, profile):
    """Work pants: legs loosened toward a straight cross-section round the hip-knee-ankle line."""
    out = p.copy()
    for s in "LR":
        hip, knee, ankle = JOINTS[f"leg{s}"], JOINTS[f"shin{s}"], JOINTS[f"foot{s}"]
        side = p[:, 0] * hip[0] > 0
        y = p[:, 1]
        below = y < top_y
        cx = np.where(y > knee[1], np.interp(y, [knee[1], hip[1]], [knee[0], hip[0]]), np.interp(y, [ankle[1], knee[1]], [ankle[0], knee[0]]))
        cz = np.where(y > knee[1], np.interp(y, [knee[1], hip[1]], [knee[2], hip[2]]), np.interp(y, [ankle[1], knee[1]], [ankle[2], knee[2]]))
        rx = p[:, 0] - cx
        rz = p[:, 2] - cz
        r = np.hypot(rx, rz)
        want = np.interp(y, [a for a, _ in profile], [b for _, b in profile])
        k = smoothstep(top_y, top_y - 0.12, y) * 0.6
        r2 = r + (np.maximum(want, r) - r) * k
        sel = side & below
        out[sel, 0] = (cx + rx / np.maximum(r, 1e-6) * r2)[sel]
        out[sel, 2] = (cz + rz / np.maximum(r, 1e-6) * r2)[sel]
    return out


def sleeve_shape(p):
    """The polo's short sleeve: wider than the arm, opening toward the hem."""
    t, side = arm_param(p)
    out = p.copy()
    for sgn, s in ((-1, "L"), (1, "R")):
        S, E = JOINTS[f"arm{s}"], JOINTS[f"fore{s}"]
        d = (E - S) / np.linalg.norm(E - S)
        sel = (side == sgn) & (t > 0.1)
        c = S + np.outer(np.einsum("ij,j->i", p - S, d), d)
        r = p - c
        k = np.clip((t - 0.1) / (SLEEVE_T - 0.1), 0, 1)
        out[sel] = (c + r * (1.0 + 0.2 * k)[:, None])[sel]
    return out


def snap_sleeve(p):
    t, side = arm_param(p)
    out = p.copy()
    for sgn, s in ((-1, "L"), (1, "R")):
        S, E = JOINTS[f"arm{s}"], JOINTS[f"fore{s}"]
        d = E - S
        sel = (side == sgn) & (t > 0.4)
        out[sel] = out[sel] + np.outer(SLEEVE_T - t[sel], d)
    return out


def snap_shirt(p):
    out = snap_sleeve(p)
    t, _ = arm_param(p)
    low = (p[:, 1] < WAIST_Y + 0.12) & (t < 0.4)
    out[low, 1] = WAIST_Y - 0.05
    return out


def snap_hem(p):
    """Trouser hem: a clean, level, round opening over the boot."""
    out = p.copy()
    # The waistband: a level top edge above the belt line.
    out[out[:, 1] > WAIST_Y - 0.15, 1] = WAIST_Y + 0.014
    for s in "LR":
        ankle, knee = JOINTS[f"foot{s}"], JOINTS[f"shin{s}"]
        low = (out[:, 1] < WAIST_Y - 0.15) & (out[:, 0] * ankle[0] > 0)
        k = (HEM_Y - ankle[1]) / (knee[1] - ankle[1])
        cx = ankle[0] + (knee[0] - ankle[0]) * k
        cz = ankle[2] + (knee[2] - ankle[2]) * k - 0.006
        a = np.arctan2(out[low, 0] - cx, out[low, 2] - cz)
        out[low, 0] = cx + np.sin(a) * 0.072
        out[low, 2] = cz + np.cos(a) * 0.076
        out[low, 1] = HEM_Y
    return out


def dress(v, build):
    pieces = []
    shirt_inflate = lambda q: 0.0035 + (0.003 + 0.009 * smoothstep(WAIST_Y + 0.28, WAIST_Y + 0.05, q[:, 1])) * smoothstep(WAIST_Y - 0.005, WAIST_Y + 0.05, q[:, 1]) + 0.004 * smoothstep(0.2, 0.7, arm_param(q)[0]) * (_arm_w[cut(np.isin(FACE_REGION, ["shirt"]))[0]] > 0.5)
    pieces.append(garment(f"shirt_{build}", "shirt", ["shirt"], v, shirt_inflate, 26, shape=sleeve_shape, snap=snap_shirt, tuck=lambda q: 0.02 * smoothstep(WAIST_Y + 0.02, WAIST_Y - 0.01, q[:, 1])))
    profile = [(ANKLE_Y, 0.07), (JOINTS["shinL"][1] - 0.14, 0.077), (JOINTS["shinL"][1], 0.083), (JOINTS["shinL"][1] + 0.22, 0.1), (HIP_Y, 0.118)]
    # Heavier men fill out the cloth more; the profile only ever adds.
    pants_ids = cut(np.isin(FACE_REGION, ["pants"]))[0]
    pieces.append(garment(f"pants_{build}", "pants", ["pants"], v, lambda q: np.full(len(pants_ids), 0.0085), 18, shape=lambda p: leg_axis_shape(p, HIP_Y - 0.02, profile), snap=snap_hem))
    # Bare arms and hands; the top is hidden inside the sleeve.
    ids, faces, uvs = cut(FACE_REGION == "arm")
    pieces.append(Piece(f"arms_{build}", "skin", v[ids], faces, uvs, WEIGHTS[ids]))
    return pieces


def ring_radius(v, ids, y, center, thetas, spread=0.2):
    """Radius of the morph at height y round `center`, per angle: the outline to wrap a band round."""
    near = np.abs(v[ids, 1] - y) < 0.03
    pts = v[ids][near]
    th = np.arctan2(pts[:, 0] - center[0], pts[:, 2] - center[1])
    r = np.hypot(pts[:, 0] - center[0], pts[:, 2] - center[1])
    out = []
    for t in thetas:
        d = np.abs(np.arctan2(np.sin(th - t), np.cos(th - t)))
        out.append(r[d < spread].max() if (d < spread).any() else r.mean())
    out = np.array(out)
    for _ in range(4):
        out = (np.roll(out, 1) + out * 2 + np.roll(out, -1)) / 4
    return out


def loft(rows, n, closed, slot):
    """Quads between successive rings of points, mapped across an atlas slot."""
    verts = np.concatenate(rows)
    m = len(rows)
    faces, uv = [], []
    for i in range(m - 1):
        for j in range(n if closed else n - 1):
            a, b = i * n + j, i * n + (j + 1) % n
            faces.append([a, a + n, b + n, b])
            u0, u1 = j / n, (j + 1) / n
            v0, v1 = i / (m - 1), (i + 1) / (m - 1)
            uv.append([acc_uv(slot, u0, v0), acc_uv(slot, u0, v1), acc_uv(slot, u1, v1), acc_uv(slot, u1, v0)])
    return verts, np.array(faces), np.array(uv)


def rounded_box(c, half, slot, segments=None):
    """A soft-cornered box (eight corners, beveled by averaging), for buckles and pouches."""
    hx, hy, hz = half
    b = 0.72
    verts, faces = [], []
    for sx in (-1, 1):
        for sy in (-1, 1):
            for sz in (-1, 1):
                verts.append([c[0] + sx * hx, c[1] + sy * hy * b, c[2] + sz * hz * b])
                verts.append([c[0] + sx * hx * b, c[1] + sy * hy, c[2] + sz * hz * b])
                verts.append([c[0] + sx * hx * b, c[1] + sy * hy * b, c[2] + sz * hz])
    verts = np.array(verts)
    idx = lambda sx, sy, sz, k: ((sx > 0) * 4 + (sy > 0) * 2 + (sz > 0)) * 3 + k
    for s in (-1, 1):
        faces.append([idx(s, -1, -1, 0), idx(s, 1, -1, 0), idx(s, 1, 1, 0), idx(s, -1, 1, 0)] if s > 0 else [idx(s, -1, 1, 0), idx(s, 1, 1, 0), idx(s, 1, -1, 0), idx(s, -1, -1, 0)])
        faces.append([idx(-1, s, -1, 1), idx(-1, s, 1, 1), idx(1, s, 1, 1), idx(1, s, -1, 1)] if s > 0 else [idx(1, s, -1, 1), idx(1, s, 1, 1), idx(-1, s, 1, 1), idx(-1, s, -1, 1)])
        faces.append([idx(1, -1, s, 2), idx(1, 1, s, 2), idx(-1, 1, s, 2), idx(-1, -1, s, 2)] if s > 0 else [idx(-1, -1, s, 2), idx(-1, 1, s, 2), idx(1, 1, s, 2), idx(1, -1, s, 2)])
    # Bevel strips between the flats.
    for sx in (-1, 1):
        for sy in (-1, 1):
            f = [idx(sx, sy, -1, 0), idx(sx, sy, 1, 0), idx(sx, sy, 1, 1), idx(sx, sy, -1, 1)]
            faces.append(f if sx * sy > 0 else f[::-1])
        for sz in (-1, 1):
            f = [idx(sx, -1, sz, 0), idx(sx, 1, sz, 0), idx(sx, 1, sz, 2), idx(sx, -1, sz, 2)]
            faces.append(f[::-1] if sx * sz > 0 else f)
    for sy in (-1, 1):
        for sz in (-1, 1):
            f = [idx(-1, sy, sz, 1), idx(1, sy, sz, 1), idx(1, sy, sz, 2), idx(-1, sy, sz, 2)]
            faces.append(f if sy * sz > 0 else f[::-1])
    faces = np.array(faces)
    # A planar map: front and top take the slot.
    u = (verts[:, 0] - c[0]) / (2 * hx) * 0.92 + 0.5
    w = (verts[:, 1] - c[1]) / (2 * hy) * 0.92 + 0.5
    return verts, faces, acc_uv(slot, u, w)[faces]


def merge_meshes(items):
    vs, fs, us = [], [], []
    base = 0
    for v, f, u in items:
        vs.append(v)
        fs.append(f + base)
        us.append(u)
        base += len(v)
    return np.concatenate(vs), np.concatenate(fs), np.concatenate(us)


def belt_piece(v, build, pouch=True):
    """A real leather belt: a lofted loop on the waist of the pants, with a buckle and a tool pouch on the hip."""
    ids = _body_ids[(v[_body_ids, 1] > WAIST_Y - 0.05) & (v[_body_ids, 1] < WAIST_Y + 0.05) & (_arm_w[_body_ids] < 0.3)]
    cz = np.median(v[ids, 2])
    n = 44
    thetas = np.linspace(-np.pi, np.pi, n, endpoint=False)
    r = ring_radius(v, ids, WAIST_Y, (0.0, cz), thetas) + 0.0145
    y0, y1 = WAIST_Y - 0.019, WAIST_Y + 0.019
    ring = lambda y, extra: np.stack([np.sin(thetas) * (r + extra), np.full(n, y), cz + np.cos(thetas) * (r + extra)], 1)
    rows = [ring(y0, -0.006), ring(y0 + 0.002, 0.0), ring(y1 - 0.002, 0.0), ring(y1, -0.006)]
    items = [loft(rows, n, True, "belt")]
    front = cz + r[n // 2] + 0.003
    items.append(rounded_box((0.0, WAIST_Y, front), (0.021, 0.019, 0.004), "metal"))
    items.append(rounded_box((0.0, WAIST_Y, front + 0.005), (0.012, 0.009, 0.0022), "belt"))
    verts, faces, uvs = merge_meshes(items)
    if pouch:
        # On the working side: a leather pouch hanging from the belt.
        a = np.pi * 0.62
        at = np.array([np.sin(a) * (r[0] + 0.03), WAIST_Y - 0.06, cz + np.cos(a) * (r[0] + 0.03)])
        pv, pf, pu = rounded_box(at, (0.034, 0.055, 0.019), "pouch")
        c, sn = np.cos(a), np.sin(a)
        d = pv - at
        pv = at + np.stack([d[:, 0] * c + d[:, 2] * sn, d[:, 1], -d[:, 0] * sn + d[:, 2] * c], 1)
        fv, ff, fu = rounded_box(at + np.array([0.0, 0.043, 0.0]), (0.036, 0.016, 0.0215), "pouch")
        d = fv - (at + np.array([0.0, 0.043, 0.0]))
        fv = at + np.array([0.0, 0.043, 0.0]) + np.stack([d[:, 0] * c + d[:, 2] * sn, d[:, 1], -d[:, 0] * sn + d[:, 2] * c], 1)
        verts, faces, uvs = merge_meshes([(verts, faces, uvs), (pv, pf, pu), (fv, ff, fu)])
    wts = np.zeros((len(verts), len(BONES)), dtype=np.float32)
    wts[:, BONE_INDEX["pelvis"]] = 0.72
    wts[:, BONE_INDEX["spine"]] = 0.28
    return Piece(f"belt_{build}", "abs", verts, faces, uvs, wts)


# ---------------------------------------------------------------- accessory strip layout (atlas uv: u0, v0, u1, v1)
ACC = {
    "boot": (0.0, BODY_V + 0.005, 0.34, 1.0),
    "cap": (0.35, BODY_V + 0.005, 0.56, 1.0),
    "hair": (0.57, BODY_V + 0.005, 0.70, 0.91),
    "eye": (0.57, 0.915, 0.665, 1.0),
    "collar": (0.71, BODY_V + 0.005, 0.86, 0.91),
    "belt": (0.87, BODY_V + 0.005, 0.96, 0.87),
    "metal": (0.87, 0.875, 0.92, 0.92),
    "pouch": (0.87, 0.925, 0.96, 1.0),
    "pocket": (0.71, 0.915, 0.86, 1.0),
}


def acc_uv(slot, u, v):
    a = ACC[slot]
    return np.stack([a[0] + (a[2] - a[0]) * u, a[1] + (a[3] - a[1]) * v], -1)


# ---------------------------------------------------------------- head and hair
def head_variants():
    """Each head: the average neck and collar line, with the shape of another person above it."""
    v_avg = V_AVG
    joints_avg = JOINTS["head"]
    mask = (FACE_REGION == "head")
    ids, faces, uvs = cut(mask)
    y = v_avg[ids, 1]
    # Full effect from the jaw up, none at the neck's base, so every head fits every collar.
    k = smoothstep(NECK_Y + 0.03, NECK_Y + 0.1, y)
    out = {}
    for name, recipe in HEADS.items():
        if HERO_ONLY and name != "oval":
            continue
        rec = {**recipe, UNI + "averagemuscle-averageweight": 1.0}
        vv = to_game(morph(rec))
        off = joint_pos(vv, SKEL["bones"]["neck03"]["head"]) - joints_avg
        p = v_avg[ids] + (vv[ids] - off - v_avg[ids]) * k[:, None]
        # Below the collar the neck pulls in, safely inside the shirt.
        n = vertex_normals(v_avg, BODY_F)[ids]
        p -= n * 0.006 * smoothstep(NECK_Y + 0.0, NECK_Y - 0.03, y)[:, None]
        out[name] = Piece(f"head_{name}", "skin", p, faces, uvs, WEIGHTS[ids])
        # The whole morph, for what sits in this head's sockets.
        out[name].full = vv - off
    return out, ids


def eye_piece(head_name, p_of):
    """MakeHuman's eyeball helpers, placed in this head's sockets, with an iris painted in the atlas."""
    out_v, out_f, out_uv = [], [], []
    for g in ("helper-l-eye", "helper-r-eye"):
        f = np.array([q[0] for q in GROUPS[g]])
        ids, inv = np.unique(f, return_inverse=True)
        inv = inv.reshape(f.shape)
        p = p_of[ids]
        c = p.mean(0)
        r = np.linalg.norm(p - c, axis=1).max()
        u = (p[:, 0] - c[0]) / (2 * r) + 0.5
        v = (p[:, 1] - c[1]) / (2 * r) + 0.5
        back = p[:, 2] < c[2]
        u[back] = 0.02
        v[back] = 0.5
        base = sum(len(a) for a in out_v)
        out_v.append(p)
        out_f.append(inv + base)
        out_uv.append(acc_uv("eye", u, v)[inv])
    verts = np.concatenate(out_v)
    w = np.zeros((len(verts), len(BONES)), dtype=np.float32)
    w[:, BONE_INDEX["head"]] = 1
    return Piece(f"eyes_{head_name}", "abs", verts, np.concatenate(out_f), np.concatenate(out_uv), w)


CAP_BASE = JOINTS["head"][1] + 0.105
HAIRS = {"crop": (0.0075, 0.0), "buzz": (0.0032, 0.0), "curly": (0.016, 0.006), "swept": (0.012, 0.0), "receding": (0.0065, 0.024)}


def scalp_mask(p, recede=0.0):
    """Scalp vertices above a hairline running from the temples over the ears to the nape."""
    head = JOINTS["head"]
    y = p[:, 1] - head[1]
    z = p[:, 2] - head[2]
    # Hairline height rises toward the forehead and drops to the nape; cut clear of the ears.
    line = 0.07 + 0.062 * smoothstep(-0.02, 0.09, z) + recede * smoothstep(0.02, 0.09, z) - 0.05 * smoothstep(-0.03, -0.1, z)
    # Round the ear only: above it, the hair comes down the side of the head.
    ear = (np.abs(p[:, 0]) > 0.062) & (np.abs(z + 0.0) < 0.042) & (y < 0.082)
    return (y > line) & ~ear


def hair_piece(style, head):
    t, recede = HAIRS[style]
    q = head.verts
    keep = scalp_mask(q, recede)
    fm = keep[head.faces].sum(1) >= 3
    faces = head.faces[fm]
    ids, inv = np.unique(faces, return_inverse=True)
    inv = inv.reshape(faces.shape)
    n = vertex_normals(q, head.faces)[ids]
    p = q[ids] + n * t
    if style == "curly":
        p += n * (0.006 * np.sin(p[:, 0] * 240) * np.sin(p[:, 1] * 220) * np.sin(p[:, 2] * 230))[:, None]
    if style == "swept":
        p += n * (0.008 * smoothstep(0.02, 0.1, p[:, 2] - JOINTS["head"][2]))[:, None]
    rim = np.unique(boundary_edges(inv))
    # The hairline's edge is smoothed and tucks into the skin, so it never reads as a torn mesh edge.
    p = laplace(p, inv, 4, 0.5, weight=np.isin(np.arange(len(p)), rim).astype(float))
    p[rim] -= n[rim] * (t + 0.0006)
    uv = acc_uv("hair", (p[:, 0] * 3.1 + 0.5) % 1, (p[:, 2] * 3.1 + 0.5) % 1)[inv]
    return Piece(f"hair_{style}_{head.name.split('_')[1]}", "hair", p, inv, uv, head.weights[ids])


def beard_piece(style, head, name):
    """Facial hair shells from the head's own surface; the edge sinks into the skin."""
    q = head.verts
    h = JOINTS["head"]
    mouth = np.array(H_MOUTH)
    y = q[:, 1] - mouth[1]
    z = q[:, 2] - h[2]
    x = q[:, 0]
    lips = (np.abs(x) < 0.027) & (np.abs(y) < 0.0125) & (q[:, 2] > mouth[2] - 0.03)
    if style == "mustache":
        keep = (np.abs(x) < 0.031) & (y > 0.0065) & (y < 0.0235) & (z > 0.05)
    elif style == "goatee":
        keep = ((np.abs(x) < 0.021) & (y < -0.012) & (y > -0.06) & (z > 0.02)) | ((np.abs(x) < 0.031) & (y > 0.0065) & (y < 0.0235) & (z > 0.05))
    else:
        keep = (y < 0.03) & (y > -0.078) & (z > -0.02) & ~lips & ~((np.abs(x) < 0.022) & (y > 0.0235)) & (q[:, 1] > NECK_Y + 0.045)
    fm = keep[head.faces].sum(1) >= 3
    faces = head.faces[fm]
    ids, inv = np.unique(faces, return_inverse=True)
    inv = inv.reshape(faces.shape)
    n = vertex_normals(q, head.faces)[ids]
    t = 0.0034 if style == "full" else 0.003
    p = q[ids] + n * t
    rim = np.unique(boundary_edges(inv))
    # A smoothed edge, so the head's topology does not show as steps along it.
    p = laplace(p, inv, 5, 0.5, weight=np.isin(np.arange(len(p)), rim).astype(float))
    p[rim] -= n[rim] * (t + 0.0005)
    uv = acc_uv("hair", (p[:, 0] * 4.3 + 0.5) % 1, (p[:, 1] * 4.3 + 0.5) % 1)[inv]
    return Piece(f"beard_{style}_{name}", "hair", p, inv, uv, head.weights[ids])


H_MOUTH = np.array([q[0] for q in GROUPS["helper-upper-teeth"]]).ravel()
H_MOUTH = (V_AVG[H_MOUTH].mean(0) + V_AVG[np.array([q[0] for q in GROUPS["helper-lower-teeth"]]).ravel()].mean(0)) / 2
EYE_L = V_AVG[np.array([q[0] for q in GROUPS["helper-l-eye"]]).ravel()].mean(0)
EYE_R = V_AVG[np.array([q[0] for q in GROUPS["helper-r-eye"]]).ravel()].mean(0)


# ---------------------------------------------------------------- SDF hardware: boots and cap, with their atlas mapping
def weld_quads(fn, lo, hi, h, smooth=2):
    v, f = surface_nets(fn, lo, hi, h)
    if smooth:
        v = taubin(v, f, smooth)
    return v, f


def fix_winding_to_outside(v, f, fn):
    """Orients quads so normals follow the SDF's gradient."""
    a = v[f[:, 0]]
    fnorm = np.cross(v[f[:, 2]] - a, v[f[:, 3]] - v[f[:, 1]])
    c = v[f].mean(1)
    eps = 1e-3
    g = np.stack([fn(c + np.eye(3)[i] * eps) - fn(c - np.eye(3)[i] * eps) for i in range(3)], 1)
    flip = np.einsum("ij,ij->i", fnorm, g) < 0
    f = f.copy()
    f[flip] = f[flip][:, ::-1]
    return f


BOOT_LEN = max(V_AVG[_body_ids, 2])


def boot_piece(s):
    side = -1 if s == "L" else 1
    A = JOINTS[f"foot{s}"]
    T = JOINTS[f"toe{s}"]
    x0 = A[0]
    # Foot length comes from the real foot: the boot adds a welt round it.
    ids = np.where(_foot_w[:N_BODY] > 0.5)[0]
    ids = ids[V_AVG[ids, 0] * side > 0]
    zmin, zmax = V_AVG[ids, 2].min() - 0.012, V_AVG[ids, 2].max() + 0.016
    mid = (zmin + zmax) / 2
    half = (zmax - zmin) / 2
    tx = T[0] + (T[0] - x0) * 0.2
    up = Shape(k=0.022)
    # Ankle shaft, heel counter, vamp, and a rounded composite toe box a little wider than the foot.
    up.add(Cone((x0, ANKLE_Y - 0.02, A[2] - 0.012), (x0, ANKLE_Y + 0.105, A[2] - 0.006), 0.05, 0.047, f"foot{s}"))
    up.add(Ellipsoid((x0, 0.062, zmin + 0.052), (0.043, 0.058, 0.054), f"foot{s}"), 0.03)
    up.add(Ellipsoid(((x0 + tx) / 2, 0.052, mid + 0.02), (0.046, 0.05, half * 0.72), f"foot{s}"), 0.03)
    up.add(Ellipsoid((tx, 0.046, zmax - 0.052), (0.05, 0.046, 0.058), f"foot{s}"), 0.024)

    def upper(q):
        d = up(q)
        # Opening at the top of the shaft.
        return smax(d, q[:, 1] - (ANKLE_Y + 0.112), 0.005)

    def sole(q):
        flat = q.copy()
        flat[:, 1] = 0.05
        foot = up(flat) - 0.007
        slab = np.abs(q[:, 1] - 0.016) - 0.016
        # Heel block: the arch rises off the ground between heel and ball.
        arch = smoothstep(zmin + 0.1, zmin + 0.115, q[:, 2]) * smoothstep(T[2] - 0.035, T[2] - 0.055, q[:, 2])
        return smax(foot, slab + arch * np.maximum(0.009 - q[:, 1], 0), 0.002)

    def boot(q):
        return smin(smax(upper(q), 0.02 - q[:, 1], 0.002), sole(q), 0.0025)

    lo = (x0 - 0.1, -0.006, zmin - 0.02)
    hi = (x0 + 0.1, ANKLE_Y + 0.13, zmax + 0.02)
    v, f = weld_quads(boot, lo, hi, 0.0046, smooth=2)
    v[:, 1] = np.maximum(v[:, 1], 0.0)
    f = fix_winding_to_outside(v, f, boot)
    # Atlas: wrapped round the foot's long axis, like unrolling the leather.
    u = (np.arctan2(v[:, 0] - x0, v[:, 2] - mid) / (2 * np.pi) + 0.5)
    w = np.clip(v[:, 1] / (ANKLE_Y + 0.13), 0, 1)
    w_top = np.clip((v[:, 2] - zmin) / (zmax - zmin), 0, 1)
    uv = acc_uv("boot", 0.5 * u + (0.0 if side < 0 else 0.5), w)
    uvs = uv[f]
    # A seam across the wrap would stretch a quad over the whole strip: wrap the corners locally.
    span = uvs[:, :, 0].max(1) - uvs[:, :, 0].min(1)
    uvs[span > 0.1, :, 0] = uvs[span > 0.1, :, 0].min(1, keepdims=True)
    wts = np.zeros((len(v), len(BONES)), dtype=np.float32)
    k = smoothstep(T[2] - 0.022, T[2] + 0.022, v[:, 2])
    # Above the ankle the shaft follows the shin a little, so the boot bends instead of shearing the trouser hem.
    sh = smoothstep(ANKLE_Y + 0.02, ANKLE_Y + 0.1, v[:, 1]) * 0.5
    wts[:, BONE_INDEX[f"toe{s}"]] = k
    wts[:, BONE_INDEX[f"foot{s}"]] = (1 - k) * (1 - sh)
    wts[:, BONE_INDEX[f"shin{s}"]] = (1 - k) * sh
    return Piece(f"boot{s}", "abs", v, f, uvs, wts), (zmin, zmax, x0, mid)


def cap_piece():
    h = JOINTS["head"]
    ids = np.where((_head_w[:N_BODY] > 0.5) & (V_AVG[:N_BODY, 1] > h[1] + 0.105))[0]
    p = V_AVG[ids]
    cz = (p[:, 2].min() + p[:, 2].max()) / 2
    rx = (p[:, 0].max() - p[:, 0].min()) / 2 + 0.010
    rz = (p[:, 2].max() - p[:, 2].min()) / 2 + 0.010
    head_top = V_AVG[ids, 1].max()
    top = head_top + 0.011
    base = h[1] + 0.105
    ry = (top - base) * 1.22
    crown = Ellipsoid((0.0, base, cz), (rx, ry, rz), "head")
    z_front = cz + rz

    def fn(q):
        # An ellipsoid cut flat-ish at the top gives the panels' shape instead of a dome; the back dips to the nape.
        d = smax(crown(q), q[:, 1] - top, 0.022)
        d = smax(d, (base - 0.018 * np.clip((cz - q[:, 2]) / rz, 0, 1)) - q[:, 1], 0.002)
        return smin(d, Ellipsoid((0.0, top - 0.0005, cz), (0.008, 0.004, 0.008), "head")(q), 0.002)

    lo = (-rx - 0.02, base - 0.03, cz - rz - 0.02)
    hi = (rx + 0.02, top + 0.012, z_front + 0.02)
    v, f = weld_quads(fn, lo, hi, 0.004, smooth=2)
    f = fix_winding_to_outside(v, f, fn)
    # The crown is mapped by angle round it and by height, the seam at the back.
    az = np.arctan2(v[:, 0], v[:, 2] - cz) / (2 * np.pi) + 0.5
    hgt = np.clip((v[:, 1] - base) / (top - base), 0, 1)
    uvs = acc_uv("cap", az, 0.1 + 0.9 * hgt)[f]
    span = uvs[:, :, 0].max(1) - uvs[:, :, 0].min(1)
    uvs[span > 0.06, :, 0] = uvs[span > 0.06, :, 0].min(1, keepdims=True)
    # The bill: a curved stiff sheet with real thickness, wider than the head's front, rounded in plan.
    I, J = 8, 14
    wx = rx * 0.99
    zc = z_front - 0.018
    reach_z = 0.09
    rows = []
    for layer, dy in ((0, 0.0042), (1, -0.0042)):
        for i in range(I + 1):
            t = i / I
            z = (z_front - 0.03) + (zc + reach_z - (z_front - 0.03)) * t
            half = wx * np.sqrt(max(0.0, 1 - ((z - zc) / reach_z) ** 2))
            for j in range(J + 1):
                sx = -1 + 2 * j / J
                x = half * sx
                # Out of the forehead level, then curving down and across, so it reads as a bill from straight in front.
                y = base - 0.002 - (0.012 + 0.018 * t) * (x / wx) ** 2 - 0.042 * t * t + dy
                rows.append([x, y, z])
    bv = np.array(rows)
    grid = (I + 1) * (J + 1)
    bf = []
    idx = lambda L, i, j: L * grid + i * (J + 1) + j
    for i in range(I):
        for j in range(J):
            bf.append([idx(0, i, j), idx(0, i, j + 1), idx(0, i + 1, j + 1), idx(0, i + 1, j)])
            bf.append([idx(1, i, j), idx(1, i + 1, j), idx(1, i + 1, j + 1), idx(1, i, j + 1)])
    # Rim round the three free edges.
    for i in range(I):
        bf.append([idx(0, i, 0), idx(0, i + 1, 0), idx(1, i + 1, 0), idx(1, i, 0)])
        bf.append([idx(0, i + 1, J), idx(0, i, J), idx(1, i, J), idx(1, i + 1, J)])
    for j in range(J):
        bf.append([idx(0, I, j), idx(0, I, j + 1), idx(1, I, j + 1), idx(1, I, j)])
    bf = np.array(bf)[:, ::-1]  # Outward: top sheet up, bottom sheet down, rim out.
    buv = acc_uv("cap", 0.02 + 0.05 * (bv[:, 0] - bv[:, 0].min()) / np.ptp(bv[:, 0]), 0.02 + 0.05 * (bv[:, 2] - bv[:, 2].min()) / np.ptp(bv[:, 2]))[bf]
    base_n = len(v)
    v = np.concatenate([v, bv])
    f = np.concatenate([f, bf + base_n])
    uvs = np.concatenate([uvs, buv])
    wts = np.zeros((len(v), len(BONES)), dtype=np.float32)
    wts[:, BONE_INDEX["head"]] = 1
    return Piece("cap", "cap", v, f, uvs, wts), {"base": base, "top": top, "cz": cz, "rz": rz}


def collar_piece(v, build):
    """The polo collar: a lofted band round the neck that stands, rolls over and lies on the shoulders, open at the throat."""
    h = np.array(JOINTS["neck"])
    y0 = NECK_Y - 0.028
    near = np.abs(v[:N_BODY, 1] - (y0 + 0.02)) < 0.022
    bones = (_head_w[:N_BODY] > 0.5)
    pts = v[:N_BODY][near & bones]
    c = np.array([0.0, y0, np.median(pts[:, 2])])
    th = np.arctan2(pts[:, 0] - c[0], pts[:, 2] - c[2])
    r = np.hypot(pts[:, 0] - c[0], pts[:, 2] - c[2])
    N = 36
    gap = 0.2
    thetas = np.linspace(gap, 2 * np.pi - gap, N)
    bins = (thetas + np.pi) % (2 * np.pi) - np.pi
    radius = []
    for t in bins:
        d = np.abs(np.arctan2(np.sin(th - t), np.cos(th - t)))
        radius.append(r[d < 0.35].max() if (d < 0.35).any() else r.mean())
    radius = np.array(radius)
    for _ in range(16):
        radius = np.convolve(np.r_[radius[0], radius, radius[-1]], [0.25, 0.5, 0.25], "valid")
    # Rows of the loft: (height above the base, extra radius): inside of the stand, its top, the roll, then the leaf.
    rows = [(-0.012, 0.012), (0.018, 0.012), (0.03, 0.015), (0.029, 0.02), (0.012, 0.026), (-0.012, 0.033), (-0.028, 0.044)]
    verts = []
    for dy, dr in rows:
        for t, r0 in zip(thetas, radius):
            # The leaf points grow at the front, like a collar lying open.
            front = np.cos(t) ** 8 if np.cos(t) > 0 else 0.0
            extra = dr + (0.006 * front if dy < 0 else 0)
            yy = y0 + dy - (0.012 * front if dy < 0.03 else 0.004 * front)
            verts.append([c[0] + np.sin(t) * (r0 + extra), yy, c[2] + np.cos(t) * (r0 + extra)])
    verts = np.array(verts)
    faces = []
    uv = []
    for i in range(len(rows) - 1):
        for j in range(N - 1):
            a = i * N + j
            faces.append([a, a + 1, a + N + 1, a + N])
            uv.append([acc_uv("collar", j / (N - 1), i / (len(rows) - 1)), acc_uv("collar", (j + 1) / (N - 1), i / (len(rows) - 1)), acc_uv("collar", (j + 1) / (N - 1), (i + 1) / (len(rows) - 1)), acc_uv("collar", j / (N - 1), (i + 1) / (len(rows) - 1))])
    # Skinned as the shirt's upper torso, with the stand following the neck slightly.
    wts = np.zeros((len(verts), len(BONES)), dtype=np.float32)
    k = smoothstep(y0 + 0.0, y0 + 0.03, verts[:, 1]) * 0.35
    wts[:, BONE_INDEX["torso"]] = 1 - k
    wts[:, BONE_INDEX["neck"]] = k
    return Piece(f"collar_{build}", "shirt", verts, np.array(faces), np.array(uv), wts)


def pocket_pieces(pants, v, build):
    """Cargo pockets: a patch of the pants' own outer-thigh surface standing proud of it, with a flap."""
    out = []
    knee = JOINTS["shinL"][1]
    for s, sgn in (("L", -1), ("R", 1)):
        c_y = (HIP_Y + knee) / 2 - 0.025
        sel = pants.verts[:, 0] * sgn > 0
        # Outer thigh: quads facing away from the other leg, by angle round the thigh.
        cx = (JOINTS[f"leg{s}"][0] + JOINTS[f"shin{s}"][0]) / 2
        fc = pants.verts[pants.faces].mean(1)
        m = (fc[:, 0] * sgn > 0) & (np.abs(fc[:, 1] - c_y) < 0.086) & ((fc[:, 0] - cx) * sgn > 0.015) & (np.abs(fc[:, 2] - JOINTS[f"leg{s}"][2]) < 0.07)
        faces = pants.faces[m]
        if not len(faces):
            continue
        ids, inv = np.unique(faces, return_inverse=True)
        inv = inv.reshape(faces.shape)
        n = vertex_normals(pants.verts, pants.faces)[ids]
        p = pants.verts[ids] + n * 0.0065
        rim = np.unique(boundary_edges(inv))
        p[rim] -= n[rim] * 0.009
        uu = (p[:, 2] - p[:, 2].min()) / np.ptp(p[:, 2])
        vv = (p[:, 1] - p[:, 1].min()) / np.ptp(p[:, 1])
        out.append(Piece(f"pocket{s}_{build}", "pants", p, inv, acc_uv("pocket", uu, vv)[inv], pants.weights[ids]))
    _ = sel
    return out


# ---------------------------------------------------------------- texture atlas
def raster_body(cells=ATLAS):
    """Per-texel position and region of the body's UV layout, in the average morph's bind pose."""
    P = np.zeros((cells, cells, 3), dtype=np.float32)
    R = np.zeros((cells, cells), dtype=np.uint8)
    codes = {"head": 1, "arm": 2, "shirt": 3, "pants": 4, "none": 5}
    tris = [(0, 1, 2), (0, 2, 3)]
    uv = body_uv(BODY_FT) * (cells - 1)
    pos = V_AVG[BODY_F]
    for i in range(len(BODY_F)):
        code = codes[FACE_REGION[i]]
        for a, b, c in tris:
            ua, ub, uc = uv[i, a], uv[i, b], uv[i, c]
            x0, x1 = int(min(ua[0], ub[0], uc[0])), int(max(ua[0], ub[0], uc[0])) + 1
            y0, y1 = int(min(ua[1], ub[1], uc[1])), int(max(ua[1], ub[1], uc[1])) + 1
            xs, ys = np.meshgrid(np.arange(x0, x1 + 1), np.arange(y0, y1 + 1))
            den = (ub[1] - uc[1]) * (ua[0] - uc[0]) + (uc[0] - ub[0]) * (ua[1] - uc[1])
            if abs(den) < 1e-9:
                continue
            l1 = ((ub[1] - uc[1]) * (xs - uc[0]) + (uc[0] - ub[0]) * (ys - uc[1])) / den
            l2 = ((uc[1] - ua[1]) * (xs - uc[0]) + (ua[0] - uc[0]) * (ys - uc[1])) / den
            l3 = 1 - l1 - l2
            m = (l1 >= -0.02) & (l2 >= -0.02) & (l3 >= -0.02)
            yy, xx = ys[m], xs[m]
            ok = (yy < cells) & (xx < cells)
            yy, xx = yy[ok], xx[ok]
            P[yy, xx] = (l1[m][ok, None] * pos[i, a] + l2[m][ok, None] * pos[i, b] + l3[m][ok, None] * pos[i, c]).astype(np.float32)
            R[yy, xx] = code
    return P, R


def dilate(img, mask, iters=8):
    """Bleeds colour past UV island edges, so mips and bilinear filtering do not pull in the background."""
    out = img.copy()
    m = mask.copy()
    for _ in range(iters):
        acc = np.zeros_like(out, dtype=np.float32)
        cnt = np.zeros(m.shape, dtype=np.float32)
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            am = np.roll(m, (dy, dx), (0, 1))
            acc += np.roll(out, (dy, dx), (0, 1)) * am[..., None]
            cnt += am
        new = (~m) & (cnt > 0)
        out[new] = acc[new] / cnt[new, None]
        m = m | new
    return out


def ellipsoid_dist(P, c, r):
    return np.sqrt((((P - np.asarray(c)) / np.asarray(r)) ** 2).sum(-1))


def height_to_normal(h, strength):
    dx = np.roll(h, -1, 1) - np.roll(h, 1, 1)
    dy = np.roll(h, -1, 0) - np.roll(h, 1, 0)
    n = np.stack([-dx * strength, -dy * strength, np.ones_like(h)], -1)
    return n / np.linalg.norm(n, axis=-1, keepdims=True)


def load_logo():
    """The EGO HVAC wordmark, drawn by the game's own canvas code (tools/character/wordmark.mjs)."""
    path = os.path.join(ROOT, "tools", "character", "wordmark.png")
    img = bpy.data.images.load(path)
    w, h = img.size
    px = np.array(img.pixels[:], dtype=np.float32).reshape(h, w, 4)
    rgb = px[..., :3]
    px[..., :3] = np.where(rgb <= 0.04045, rgb / 12.92, ((rgb + 0.055) / 1.055) ** 2.4)
    return px, w, h


def paint_logo(albedo, alpha, P, region, center, width, flip=False, facing=1):
    """Stamps the wordmark at a body-space rectangle on the shirt's texels (front or back by `facing`)."""
    px, w, h = LOGO
    height = width * h / w
    u = (P[..., 0] - center[0]) / width + 0.5
    if flip:
        u = 1 - u
    v = (P[..., 1] - center[1]) / height + 0.5
    m = region & (u > 0) & (u < 1) & (v > 0) & (v < 1) & ((P[..., 2] * facing) > 0.01)
    ix = np.clip((u[m] * (w - 1)).astype(int), 0, w - 1)
    iy = np.clip((v[m] * (h - 1)).astype(int), 0, h - 1)
    c = px[iy, ix]
    a = c[:, 3]
    albedo[m] = albedo[m] * (1 - a[:, None]) + c[:, :3] * a[:, None]
    alpha[m] = alpha[m] * (1 - a)


def build_atlas(boot_info, cap_info):
    S = ATLAS
    P, R = raster_body(S)
    has = R > 0
    albedo = np.ones((S, S, 3), dtype=np.float32)
    alpha = np.ones((S, S), dtype=np.float32)
    rough = np.full((S, S), 0.86, dtype=np.float32)
    metal = np.zeros((S, S), dtype=np.float32)
    ao = np.ones((S, S), dtype=np.float32)
    height = np.zeros((S, S), dtype=np.float32)
    skin = (R == 1) | (R == 2)
    shirt = R == 3
    pants = R == 4
    h0 = JOINTS["head"]
    # --- Skin: a ratio against the tone chosen per employee (tint), so one map serves every complexion.
    fine = _noise3(P, 560.0, 1.0)
    mid = _noise3(P, 190.0, 2.0)
    broad = _noise3(P, 42.0, 3.0)
    tone = SKIN_BASE * (1.0 + 0.035 * broad + 0.018 * mid)
    albedo[skin] = np.stack([tone * (1 + 0.012 * broad), tone * (1 - 0.006 * broad), tone * (1 - 0.012 * broad)], -1)[skin]
    rough[skin] = (0.58 + 0.05 * mid)[skin]
    height[skin] = (0.00014 * fine + 0.00018 * mid)[skin]
    nose = H_MOUTH + np.array([0.0, 0.043, 0.024])
    blush = np.exp(-(ellipsoid_dist(P, H_MOUTH + np.array([0.047, 0.036, -0.01]), (0.03, 0.026, 0.03)) ** 2)) + np.exp(-(ellipsoid_dist(P, H_MOUTH + np.array([-0.047, 0.036, -0.01]), (0.03, 0.026, 0.03)) ** 2))
    blush += 0.8 * np.exp(-(ellipsoid_dist(P, nose, (0.018, 0.024, 0.02)) ** 2))
    # Ears run warmer, and so do knuckles and fingertips, as blood sits close to the surface.
    ears = np.exp(-(ellipsoid_dist(np.abs(P) * np.array([1, 0, 0]) + P * np.array([0, 1, 1]), np.array([0.078, h0[1] + 0.06, h0[2] - 0.005]), (0.012, 0.035, 0.022)) ** 2))
    hands = R == 2
    warm = np.clip(blush * 0.5 + ears * 0.55, 0, 1)
    warm = np.where(hands, 0.22 * smoothstep(0.55, 0.0, P[..., 1]), warm)
    warmth = np.stack([1 + 0.03 * warm, 1 - 0.13 * warm, 1 - 0.14 * warm], -1)
    albedo[skin] = (albedo * warmth)[skin]
    # --- Lips: by distance from the mouth line, redder and smoother.
    lip = np.exp(-(ellipsoid_dist(P, H_MOUTH + np.array([0.0, 0.0, 0.014]), (0.0235, 0.0105, 0.018)) ** 4))
    lip = lip * (R == 1)
    lipc = np.stack([1 - 0.14 * lip, 1 - 0.40 * lip, 1 - 0.38 * lip], -1)
    albedo = albedo * lipc
    rough = rough - 0.12 * lip
    # Mouth line: a dark crease between the lips.
    crease = np.exp(-(((P[..., 1] - H_MOUTH[1] + 0.0035 + 0.9 * (np.abs(P[..., 0]) ** 2) * 2.0) / 0.0017) ** 2)) * smoothstep(0.03, 0.02, np.abs(P[..., 0])) * (R == 1) * (P[..., 2] > H_MOUTH[2] - 0.02)
    albedo = albedo * (1 - 0.72 * crease)[..., None]
    # --- Eyebrows, lash lines and socket shading, by distance from each eye.
    for eye in (EYE_L, EYE_R):
        sx = np.sign(eye[0])
        # Hairs of the brow: a curved band above the socket, thinning outward.
        bx = (P[..., 0] - eye[0]) * sx
        by = P[..., 1] - (eye[1] + 0.0215 + 0.008 * np.cos(np.clip(bx / 0.03, -1.5, 1.5)) - 0.0035 * smoothstep(0.012, 0.03, bx))
        band = np.exp(-((by / 0.0034) ** 2)) * smoothstep(0.034, 0.024, np.abs(bx - 0.002)) * (P[..., 2] > eye[2] - 0.022) * (R == 1)
        strands = 0.72 + 0.28 * np.sin(bx * 900 + by * 300 + _noise3(P, 240.0, 6.0) * 3.0)
        brow = np.clip(band * strands * 1.15, 0, 1)
        albedo = albedo * (1 - 0.56 * brow)[..., None]
        height += brow * 0.00022
        # Eye socket and lid crease.
        sock = np.exp(-(ellipsoid_dist(P, eye + np.array([0.0, 0.002, 0.012]), (0.024, 0.016, 0.018)) ** 2)) * (R == 1)
        ao = ao * (1 - 0.24 * sock)
        lash = np.exp(-(ellipsoid_dist(P, eye + np.array([0.0, 0.0065, 0.0175]), (0.0145, 0.0026, 0.006)) ** 2)) * (R == 1)
        albedo = albedo * (1 - 0.58 * lash)[..., None]
    # Close-cropped hair on the scalp: a density that fades out at a soft hairline, ready for a cap or a bare head.
    hz = P[..., 2] - h0[2]
    hy = P[..., 1] - h0[1]
    hline = 0.07 + 0.062 * smoothstep(-0.02, 0.09, hz) - 0.05 * smoothstep(-0.03, -0.1, hz)
    side_clear = smoothstep(0.052, 0.068, np.abs(P[..., 0])) * smoothstep(0.052, 0.03, np.abs(hz)) * (hy < 0.082)
    density = smoothstep(-0.006, 0.012, hy - hline) * (1 - side_clear) * (R == 1)
    grain = 0.82 + 0.18 * np.sin(P[..., 0] * 1500 + 2.0 * np.sin(P[..., 2] * 700)) * np.sin(P[..., 2] * 1400 + P[..., 1] * 500)
    hair_tone = np.array([0.2, 0.17, 0.155])
    albedo = albedo * (1 - density[..., None]) + (hair_tone * grain[..., None]) * density[..., None]
    rough = rough * (1 - density) + 0.82 * density
    height += density * 0.0002 * grain
    # Stubble shadow on jaw and lip; the tint keeps it believable on any complexion.
    jaw = (R == 1) & (P[..., 1] < H_MOUTH[1] + 0.03) & (P[..., 1] > NECK_Y + 0.03) & (P[..., 2] > h0[2] - 0.03)
    stub = np.where(jaw, 0.055 * (0.75 + 0.25 * fine), 0.0) * smoothstep(0.0, 0.03, (H_MOUTH[1] + 0.03) - P[..., 1])
    albedo = albedo * (1 - stub)[..., None]
    # --- Shirt: fine pique knit, seams, placket, and printed brand; alpha 1 takes the shirt tint.
    knit = np.sin(P[..., 0] * 1250 + P[..., 2] * 880) * np.sin(P[..., 1] * 1250)
    albedo[shirt] = 0.92 + 0.05 * _noise3(P, 80.0, 3.0)[shirt][..., None]
    rough[shirt] = (0.9 + 0.03 * mid)[shirt]
    height[shirt] = (fold_height(P, "shirt") * 0.9 + 0.000035 * knit)[shirt]
    # Sleeve hem stitching and shoulder seam, on the polo.
    t, _ = arm_param(P.reshape(-1, 3))
    t = t.reshape(S, S)
    stitch = np.exp(-(((t - (SLEEVE_T - 0.05)) / 0.006) ** 2)) * shirt * (_arm_mask(P) > 0)
    seam = np.exp(-(((t - 0.085) / 0.012) ** 2)) * shirt * (_arm_mask(P) > 0)
    height += -0.0007 * stitch - 0.0009 * seam
    ao = ao * (1 - 0.16 * stitch) * (1 - 0.22 * seam)
    # Teal sleeve band: absolute colour, as trim.
    trim = (np.abs(t - (SLEEVE_T - 0.018)) < 0.018) & shirt & (_arm_mask(P) > 0)
    albedo[trim] = np.array([0.0088, 0.651, 0.558])
    alpha[trim] = 0
    # Placket: a raised strip down the throat with two buttons.
    px = np.abs(P[..., 0])
    front = P[..., 2] > 0.0
    py0, py1 = NECK_Y - 0.12, NECK_Y - 0.015
    plk = shirt & front & (px < 0.0165) & (P[..., 1] > py0) & (P[..., 1] < py1)
    height[plk] += 0.0011
    edge = shirt & front & (np.abs(px - 0.0165) < 0.0015) & (P[..., 1] > py0) & (P[..., 1] < py1)
    ao[edge] *= 0.55
    for by in (NECK_Y - 0.038, NECK_Y - 0.078):
        d = np.hypot(px, P[..., 1] - by)
        btn = shirt & front & (d < 0.0058)
        # Tinted like the shirt, a little darker and glossier: a button of the shirt's own colour.
        albedo[btn] = 0.42
        rough[btn] = 0.45
    # --- Brand: small on the wearer's chest, large across the back, on the cloth rather than floating above it.
    paint_logo(albedo, alpha, P, shirt, (0.098, NECK_Y - 0.122, 0), 0.098, flip=False, facing=1)
    paint_logo(albedo, alpha, P, shirt, (0.0, NECK_Y - 0.165, 0), 0.25, flip=True, facing=-1)
    # A name patch on the other side of the chest.
    patch = shirt & front & (np.abs(P[..., 0] + 0.098) < 0.03) & (np.abs(P[..., 1] - (NECK_Y - 0.122)) < 0.008)
    albedo[patch] = np.array([0.5, 0.51, 0.52])
    alpha[patch] = 0
    height[patch] += 0.0005
    # --- Pants: cotton twill, reinforced knees, side seams, a tinted base.
    twill = np.sin((P[..., 1] + P[..., 2] * 0.7 + P[..., 0] * 0.7) * 1100)
    albedo[pants] = 0.9 + 0.06 * _noise3(P, 60.0, 8.0)[pants][..., None]
    rough[pants] = (0.92 + 0.03 * mid)[pants]
    height[pants] = (fold_height(P, "pants") + 0.00004 * twill)[pants]
    for s in "LR":
        hx = JOINTS[f"shin{s}"][0]
        side_sel = P[..., 0] * hx > 0
        out_seam = np.exp(-((((P[..., 0] - hx) * np.sign(hx) - 0.083) / 0.0028) ** 2)) * pants * side_sel * (np.abs(P[..., 2] - JOINTS[f"shin{s}"][2]) < 0.03)
        ao = ao * (1 - 0.3 * out_seam)
        height -= 0.0005 * out_seam
        # Reinforced knee panel: a double-stitched shape on the front of the leg.
        ky = P[..., 1] - JOINTS[f"shin{s}"][1]
        knee = pants & side_sel & (P[..., 2] > JOINTS[f"shin{s}"][2]) & (np.abs(ky) < 0.085) & (np.abs(P[..., 0] - hx) < 0.075)
        albedo[knee] *= 0.86
        height[knee] += 0.0007
        kedge = pants & side_sel & (P[..., 2] > JOINTS[f"shin{s}"][2]) & (np.abs(np.abs(ky) - 0.085) < 0.0022) & (np.abs(P[..., 0] - hx) < 0.075)
        ao[kedge] *= 0.6
    # Front fly and pockets, drawn into the cloth.
    fly = pants & front & (px < 0.0052) & (P[..., 1] > HIP_Y - 0.09) & (P[..., 1] < WAIST_Y)
    ao[fly] *= 0.62
    slash = pants & front & (np.abs((px - 0.1) - (P[..., 1] - (WAIST_Y - 0.075)) * 0.6) < 0.0028) & (P[..., 1] < WAIST_Y) & (P[..., 1] > WAIST_Y - 0.09) & (px > 0.06)
    ao[slash] *= 0.55
    height[slash] -= 0.0006
    # Hem stitching.
    hem = pants & (np.abs(P[..., 1] - (HEM_Y + 0.016)) < 0.002)
    ao[hem] *= 0.7
    # Contact occlusion where cloth meets belt and collar.
    ao = ao * (1 - 0.26 * smoothstep(0.018, 0.0, np.abs(P[..., 1] - WAIST_Y) - 0.018) * (pants | shirt))
    ao = ao * (1 - 0.3 * smoothstep(0.03, 0.0, np.abs(P[..., 1] - (NECK_Y + 0.008))) * (R == 1))

    # --- Accessory strip.
    def slot(name):
        a = ACC[name]
        return int(a[0] * (S - 1)), int(a[1] * (S - 1)), int(a[2] * (S - 1)) + 1, int(a[3] * (S - 1)) + 1

    def grid(name):
        x0, y0, x1, y1 = slot(name)
        u, v = np.meshgrid(np.linspace(0, 1, x1 - x0), np.linspace(0, 1, y1 - y0))
        return (y0, y1, x0, x1), u, v

    # Boots: oiled brown leather, dark rubber sole and welt, laces, stitching. Absolute colour.
    sl, u, v = grid("boot")
    y0, y1, x0, x1 = sl
    uw = (u * 2) % 1  # left and right boots share a wrap each
    leather = np.stack([0.078 + 0.018 * _noise3(np.stack([u * 12, v * 12, 0 * u], -1), 8.0, 1.0), 0.042 + 0.009 * _noise3(np.stack([u * 12, v * 12, 0 * u], -1), 8.0, 1.0), 0.021 + 0.005 * _noise3(np.stack([u * 12, v * 12, 0 * u], -1), 8.0, 1.0)], -1)
    h_uv = v * (ANKLE_Y + 0.13)
    sole = h_uv < 0.032
    welt = (h_uv >= 0.032) & (h_uv < 0.038)
    leather[sole] = np.array([0.016, 0.015, 0.014])
    leather[welt] = np.array([0.05, 0.035, 0.022])
    br = np.where(sole, 0.92, 0.5 + 0.09 * np.sin(u * 900) * np.sin(v * 700))
    bh = 0.0002 * np.sin(u * 900) * np.sin(v * 700)
    bh = np.where(sole, 0.0014 * np.sign(np.sin(u * 420)), bh)
    # Laces and eyelets on the top of the instep (front of the wrap).
    front_wrap = np.abs(uw - 1.0) < 0.1
    front_wrap = (uw > 0.46) & (uw < 0.54)
    for i in range(6):
        ly = 0.075 + i * 0.022
        row = front_wrap & (np.abs(h_uv - ly) < 0.0035)
        leather[row] = np.array([0.035, 0.03, 0.025])
        bh = np.where(row, 0.0012, bh)
    albedo[y0:y1, x0:x1] = leather
    alpha[y0:y1, x0:x1] = 0
    rough[y0:y1, x0:x1] = br
    height[y0:y1, x0:x1] = bh
    # Cap: twill crown with panels, a teal front badge, tinted; the badge is absolute colour.
    sl, u, v = grid("cap")
    y0, y1, x0, x1 = sl
    # u is the angle round the crown (0.5 straight ahead), v the height up it.
    panel = np.abs(np.sin((u - 0.5) * 2 * np.pi * 3))
    albedo[y0:y1, x0:x1] = 0.92
    height[y0:y1, x0:x1] = 0.00005 * np.sin((u + v) * 900) - 0.00045 * np.exp(-((panel / 0.035) ** 2)) * (v > 0.12)
    rough[y0:y1, x0:x1] = 0.85
    # Six panels' stitching; the teal badge sits on the front panel, drawn as the bolt's rectangle.
    # The bolt from the wordmark (x 40..135, y 38..218 of its 1024 x 256 canvas) on the front panel.
    lpx, lw, lh = LOGO
    bu = (u - 0.5) / 0.03 * 0.5 + 0.5
    bv = (v - 0.3) / 0.34
    inside = (bu > 0) & (bu < 1) & (bv > 0) & (bv < 1)
    ix = np.clip(((40 + bu * 95) / 1024 * lw).astype(int), 0, lw - 1)
    iy = np.clip(((256 - (218 - bv * 180)) / 256 * lh).astype(int), 0, lh - 1)
    bolt = inside & (lpx[iy, ix, 3] > 0.5)
    albedo[y0:y1, x0:x1][bolt] = np.array([0.0088, 0.651, 0.558])
    alpha[y0:y1, x0:x1][bolt] = 0
    # Hair: dense strands, tinted.
    sl, u, v = grid("hair")
    y0, y1, x0, x1 = sl
    n1 = np.sin(u * 620 + 4 * np.sin(v * 37)) * np.sin(v * 91 + u * 31)
    albedo[y0:y1, x0:x1] = (0.78 + 0.18 * n1)[..., None]
    height[y0:y1, x0:x1] = 0.0007 * n1
    rough[y0:y1, x0:x1] = 0.7
    # Eyes: sclera, iris and pupil, absolute colour, wet.
    sl, u, v = grid("eye")
    y0, y1, x0, x1 = sl
    d = np.hypot(u - 0.5, v - 0.5)
    eye = np.tile(np.array([0.8, 0.79, 0.77], dtype=np.float32), u.shape + (1,))
    eye *= (1 - 0.3 * smoothstep(0.3, 0.5, d))[..., None]
    iris = d < 0.2
    fib = 0.75 + 0.25 * np.sin(np.arctan2(v - 0.5, u - 0.5) * 42)
    eye[iris] = (np.array([0.11, 0.058, 0.026]) * (0.55 + 0.75 * smoothstep(0.08, 0.2, d)[..., None]) * fib[..., None])[iris]
    eye[d < 0.085] = 0.006
    albedo[y0:y1, x0:x1] = eye
    alpha[y0:y1, x0:x1] = 0
    rough[y0:y1, x0:x1] = 0.12
    # Collar: knit, tinted, with a teal tip line along the leaf's edge.
    sl, u, v = grid("collar")
    y0, y1, x0, x1 = sl
    albedo[y0:y1, x0:x1] = 0.93
    height[y0:y1, x0:x1] = 0.0001 * np.sin(u * 1500) * np.sin(v * 700)
    rough[y0:y1, x0:x1] = 0.9
    tip = v > 0.965
    albedo[y0:y1, x0:x1][tip] = np.array([0.0088, 0.651, 0.558])
    alpha[y0:y1, x0:x1][tip] = 0
    # Belt: dark leather, absolute.
    sl, u, v = grid("belt")
    y0, y1, x0, x1 = sl
    albedo[y0:y1, x0:x1] = np.array([0.02, 0.017, 0.015])
    alpha[y0:y1, x0:x1] = 0
    rough[y0:y1, x0:x1] = 0.55
    sl, u, v = grid("metal")
    y0, y1, x0, x1 = sl
    albedo[y0:y1, x0:x1] = np.array([0.62, 0.63, 0.64])
    alpha[y0:y1, x0:x1] = 0
    rough[y0:y1, x0:x1] = 0.32
    metal[y0:y1, x0:x1] = 0.92
    sl, u, v = grid("pouch")
    y0, y1, x0, x1 = sl
    albedo[y0:y1, x0:x1] = np.stack([0.042 + 0.012 * np.sin(u * 300) * np.sin(v * 240), 0.027 + 0.006 * np.sin(u * 300) * np.sin(v * 240), 0.018 + 0.004 * np.sin(u * 300) * np.sin(v * 240)], -1)
    alpha[y0:y1, x0:x1] = 0
    rough[y0:y1, x0:x1] = 0.6
    height[y0:y1, x0:x1] = 0.00016 * np.sin(u * 300) * np.sin(v * 240)
    # Cargo pocket: tinted cloth with a flap line and stitches.
    sl, u, v = grid("pocket")
    y0, y1, x0, x1 = sl
    albedo[y0:y1, x0:x1] = 0.86
    height[y0:y1, x0:x1] = 0.0006 * np.exp(-(((v - 0.72) / 0.012) ** 2)) * -1 + 0.0009 * (v > 0.72) + 0.0001 * np.sin(u * 900)
    ao[y0:y1, x0:x1] = 1 - 0.45 * np.exp(-(((v - 0.72) / 0.015) ** 2))
    rough[y0:y1, x0:x1] = 0.92

    painted = has.copy()
    for name in ACC:
        x0, y0, x1, y1 = slot(name)
        painted[y0:y1, x0:x1] = True
    rgba = dilate(albedo, painted, 10)
    code = np.where(metal > 0.5, 1.0, np.where(alpha < 0.5, 0.5, 0.0))
    orm = np.stack([ao, code, np.clip(rough, 0.04, 1.0)], -1)
    orm = dilate(orm, painted, 10)
    h_full = dilate(height[..., None], painted, 10)[..., 0]
    # Texels are about 1.3 mm here; the factor turns metres of height into a slope.
    normal = height_to_normal(h_full, 1 / (2 * 0.0013))
    return rgba, orm, normal * 0.5 + 0.5


def _arm_mask(P):
    """Texels on a sleeve (outside the shoulder, on the arm)."""
    return (np.abs(P[..., 0]) > abs(JOINTS["armL"][0]) - 0.03) & (P[..., 1] < JOINTS["armL"][1] + 0.05)


def linear_to_srgb(c):
    c = np.clip(c, 0, 1)
    return np.where(c <= 0.0031308, c * 12.92, 1.055 * np.power(c, 1 / 2.4) - 0.055)


def save_image(name, rgba, srgb=False, size=None):
    """Writes a PNG with Blender (the row order is Blender's, bottom first, which is what `pixels` holds)."""
    arr = rgba.astype(np.float32)
    if arr.shape[-1] == 3:
        arr = np.concatenate([arr, np.ones(arr.shape[:2] + (1,), dtype=np.float32)], -1)
    if srgb:
        arr = arr.copy()
        arr[..., :3] = linear_to_srgb(arr[..., :3])
    h, w = arr.shape[:2]
    img = bpy.data.images.new(name, w, h, alpha=True, float_buffer=False)
    img.colorspace_settings.name = "Non-Color"
    img.alpha_mode = "STRAIGHT"
    img.pixels.foreach_set(arr.ravel())
    if size:
        img.scale(size, size)
    path = os.path.join(OUT_DIR, f"{name}.png")
    img.filepath_raw = path
    img.file_format = "PNG"
    img.save()
    return path


# ---------------------------------------------------------------- Blender export
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene


def to_blender(p):
    p = np.asarray(p, float)
    return np.stack([p[:, 0], -p[:, 2], p[:, 1]], 1)


def build_armature():
    data = bpy.data.armatures.new("rig")
    obj = bpy.data.objects.new("technician-rig", data)
    scene.collection.objects.link(obj)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.mode_set(mode="EDIT")
    for b in BONES:
        e = data.edit_bones.new(b)
        hd = JOINTS[b]
        e.head = to_blender([hd])[0]
        d = WORLD_R[b] @ np.array([0, -0.06, 0])
        if b in ("pelvis", "spine", "torso", "neck", "head"):
            d = np.array([0, 0.06, 0])
        e.tail = to_blender([hd + d])[0]
    for b in BONES:
        if PARENT[b]:
            data.edit_bones[b].parent = data.edit_bones[PARENT[b]]
    bpy.ops.object.mode_set(mode="OBJECT")
    return obj


ARM = None
TRIS = {}


def top4(w):
    """Keeps a vertex's four strongest bones (glTF's limit), renormalised, dropping slivers."""
    idx = np.argsort(-w, axis=1)[:, :4]
    vals = np.take_along_axis(w, idx, 1)
    vals[vals < 0.012] = 0
    vals = vals / np.maximum(vals.sum(1, keepdims=True), 1e-9)
    return idx, vals


def make_object(piece, decimate=None, protect=None):
    name = f"{piece.name}__{piece.tint}"
    me = bpy.data.meshes.new(name)
    v = to_blender(piece.verts)
    faces = [tuple(int(i) for i in f) for f in piece.faces]
    me.from_pydata([tuple(x) for x in v], [], faces)
    me.update()
    uv = me.uv_layers.new(name="UVMap")
    flat = np.asarray(piece.uvs).reshape(-1, 2)
    assert len(flat) == len(me.loops), f"{name}: {len(flat)} uvs for {len(me.loops)} loops"
    uv.uv.foreach_set("vector", flat.astype(np.float32).ravel())
    obj = bpy.data.objects.new(name, me)
    scene.collection.objects.link(obj)
    me.shade_smooth()
    groups = {b: obj.vertex_groups.new(name=b) for b in BONES}
    idx, vals = top4(piece.weights)
    for vid in range(len(v)):
        for j in range(4):
            if vals[vid, j] > 0:
                groups[BONES[idx[vid, j]]].add([vid], float(vals[vid, j]), "REPLACE")
    if protect is not None:
        g = obj.vertex_groups.new(name="_protect")
        for vid in np.where(protect)[0]:
            g.add([int(vid)], 1.0, "REPLACE")
    if decimate:
        tris = sum(len(p.vertices) - 2 for p in me.polygons)
        if tris > decimate:
            bpy.context.view_layer.objects.active = obj
            mod = obj.modifiers.new("dec", "DECIMATE")
            mod.ratio = decimate / tris
            mod.use_collapse_triangulate = True
            if protect is not None:
                mod.vertex_group = "_protect"
                mod.vertex_group_factor = 2.0  # A higher weight makes collapsing there cost more.
            bpy.ops.object.modifier_apply(modifier=mod.name)
        if protect is not None:
            obj.vertex_groups.remove(obj.vertex_groups["_protect"])
    mod = obj.modifiers.new("Armature", "ARMATURE")
    mod.object = ARM
    obj.parent = ARM
    TRIS[name] = sum(len(p.vertices) - 2 for p in obj.data.polygons)
    return obj


def lod_copy(piece, suffix):
    return Piece(f"{piece.name}_{suffix}", piece.tint, piece.verts, piece.faces, piece.uvs, piece.weights)


def hand_protect(piece):
    """Fingers and face keep their shape longest when a piece is simplified (true: decimate last)."""
    w = piece.weights
    fingers = w[:, [BONE_INDEX[b] for b in BONES if b[:-2] in FINGERS]].sum(1)
    return fingers > 0.3


def face_protect(piece):
    h = JOINTS["head"]
    p = piece.verts
    return (np.abs(p[:, 0]) < 0.07) & (p[:, 2] > h[2] + 0.03) & (p[:, 1] > NECK_Y + 0.03)


# LOD budgets (triangles per piece): near / normal gameplay / distant crowd.
BUDGET = {"head": (4600, 1100, 240), "arms": (3400, 900, 160), "shirt": (3200, 1100, 240), "pants": (3000, 1000, 240), "boot": (900, 260, 60), "cap": (900, 280, 70), "collar": (440, 140, 0), "belt": (800, 260, 0), "pocket": (120, 0, 0), "hair": (700, 150, 0), "beard": (420, 0, 0), "eyes": (280, 90, 0)}
LOD_SUFFIX = ("", "_lod1", "_lod2")


def emit(piece, kind):
    """One object per level of detail the budget allows, named `<part><lod>__<tint>`."""
    for lod, budget in enumerate(BUDGET[kind]):
        if not budget:
            continue
        protect = (hand_protect(piece) if kind == "arms" else face_protect(piece) if kind == "head" else None) if lod == 0 else None
        make_object(Piece(f"{piece.name}{LOD_SUFFIX[lod]}", piece.tint, piece.verts, piece.faces, piece.uvs, piece.weights), decimate=budget, protect=protect)


# ---------------------------------------------------------------- build it
print("rig: ", {k: [round(x, 3) for x in JOINTS[k]] for k in ("pelvis", "legL", "shinL", "footL", "armL", "foreL", "handL", "head")})
ARM = build_armature()
BOOTS = {}
for s in "LR":
    piece, info = boot_piece(s)
    BOOTS[s] = info
    emit(piece, "boot")
cap, cap_info = cap_piece()
emit(cap, "cap")
heads, head_ids = head_variants()
for name, head in heads.items():
    emit(head, "head")
    emit(eye_piece(name, head.full), "eyes")
    for style in HAIRS:
        if HERO_ONLY and style != "crop":
            continue
        emit(hair_piece(style, head), "hair")
    for style in ("mustache", "goatee", "full"):
        if HERO_ONLY:
            continue
        emit(beard_piece(style, head, name), "beard")
for build, recipe in BUILDS.items():
    if HERO_ONLY and build != "avg":
        continue
    v = to_game(morph(recipe))
    pieces = dress(v, build)
    for pc in pieces:
        kind = "shirt" if pc.name.startswith("shirt") else "pants" if pc.name.startswith("pants") else "arms"
        emit(pc, kind)
        if kind == "pants":
            for pk in pocket_pieces(pc, v, build):
                emit(pk, "pocket")
    emit(collar_piece(v, build), "collar")
    emit(belt_piece(v, build), "belt")

print("tris per object:", sorted(TRIS.items()))

LOGO = load_logo()
rgba, orm, normal = build_atlas(BOOTS, cap_info)
save_image("technician-albedo", rgba, srgb=True)
save_image("technician-orm", orm)
save_image("technician-normal", normal)

# ---------------------------------------------------------------- rig data for the game
rig = {b: {"parent": RIG[b]["parent"], "at": [round(float(x), 5) for x in RIG[b]["at"]], "bind": [round(float(x), 6) for x in mat_to_quat(RIG[b]["bind"])]} for b in BONES}
pelvis_at = RIG["pelvis"]["at"]
thigh = float(np.linalg.norm(RIG["shinL"]["at"]))
shin = float(np.linalg.norm(RIG["footL"]["at"]))
# Zero pose: straight limbs. The pelvis height that puts the soles on the ground with the legs straight.
ankle_h = float(JOINTS["footL"][1])
hip_below_pelvis = float(RIG["legL"]["at"][1])
pelvis_y = ankle_h + thigh + shin - hip_below_pelvis
measures = {
    "pelvisY": round(pelvis_y, 4),
    "ankleHeight": round(ankle_h, 4),
    "thigh": round(thigh, 4),
    "shin": round(shin, 4),
    "upperArm": round(float(np.linalg.norm(RIG["foreL"]["at"])), 4),
    "foreArm": round(float(np.linalg.norm(RIG["twistL"]["at"])) + float(np.linalg.norm(RIG["handL"]["at"])), 4),
    "handToPalm": round(float(np.linalg.norm(JOINTS["handL"] - JOINTS["middle1L"])) * 0.62, 4),
    "footForward": round(float(BOOTS["L"][1]), 4),
    "footBack": round(float(BOOTS["L"][0]), 4),
    "ballZ": round(float(JOINTS["toeL"][2]), 4),
    "height": TARGET_HEIGHT,
}
with open(os.path.join(OUT_DIR, "rig.json"), "w", encoding="utf8") as fh:
    json.dump({"bones": rig, "order": BONES, "measures": measures}, fh, indent=1)
print("measures:", measures)

# ---------------------------------------------------------------- export
glb = os.path.join(OUT_DIR, "technician-v3.glb")
bpy.ops.export_scene.gltf(filepath=glb, export_format="GLB", export_skins=True, export_animations=False, export_morph=False, export_apply=False, export_normals=True, export_texcoords=True, export_materials="NONE", export_yup=True)
print("exported", glb, os.path.getsize(glb), "bytes")
print("BUILD OK")

# ---------------------------------------------------------------- preview renders (A-pose, for reviewing geometry)
if PREVIEW_DIR:
    from mathutils import Vector

    os.makedirs(PREVIEW_DIR, exist_ok=True)
    TINTS = {"skin": "#c98e68", "shirt": "#1d2126", "pants": "#3a3f46", "hair": "#2b1d14", "cap": "#15181d", "abs": "#ffffff"}

    def srgb(hex_color):
        c = [int(hex_color[i:i + 2], 16) / 255 for i in (1, 3, 5)]
        return tuple(x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c) + (1.0,)

    albedo = bpy.data.images.load(os.path.join(OUT_DIR, "technician-albedo.png"))
    normal_img = bpy.data.images.load(os.path.join(OUT_DIR, "technician-normal.png"))
    normal_img.colorspace_settings.name = "Non-Color"
    orm_img = bpy.data.images.load(os.path.join(OUT_DIR, "technician-orm.png"))
    orm_img.colorspace_settings.name = "Non-Color"
    mats = {}
    for tint, col in TINTS.items():
        m = bpy.data.materials.new(tint)
        m.use_nodes = True
        nt = m.node_tree
        b = nt.nodes["Principled BSDF"]
        tex = nt.nodes.new("ShaderNodeTexImage")
        tex.image = albedo
        mix = nt.nodes.new("ShaderNodeMix")
        mix.data_type = "RGBA"
        mix.blend_type = "MULTIPLY"
        orm_tex = nt.nodes.new("ShaderNodeTexImage")
        orm_tex.image = orm_img
        sep = nt.nodes.new("ShaderNodeSeparateColor")
        nt.links.new(orm_tex.outputs["Color"], sep.inputs["Color"])
        inv = nt.nodes.new("ShaderNodeMath")
        inv.operation = "LESS_THAN"
        inv.inputs[1].default_value = 0.25
        nt.links.new(sep.outputs["Green"], inv.inputs[0])
        nt.links.new(inv.outputs[0], mix.inputs["Factor"])
        nt.links.new(tex.outputs["Color"], mix.inputs["A"])
        mix.inputs["B"].default_value = srgb(col)
        nt.links.new(mix.outputs["Result"], b.inputs["Base Color"])
        b.inputs["Roughness"].default_value = 0.7
        nmt = nt.nodes.new("ShaderNodeTexImage")
        nmt.image = normal_img
        nm = nt.nodes.new("ShaderNodeNormalMap")
        nt.links.new(nmt.outputs["Color"], nm.inputs["Color"])
        nt.links.new(nm.outputs["Normal"], b.inputs["Normal"])
        mats[tint] = m
    for o in scene.objects:
        if o.type == "MESH":
            part, tint = o.name.split("__")
            o.data.materials.append(mats[tint])
            o.hide_render = part.endswith(("_lod1", "_lod2"))
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
    for label, pos, look, lens in (("front", (1.0, -4.4, 1.15), (0, 0, 0.92), 60), ("side", (4.2, -0.3, 1.1), (0, 0, 0.92), 60), ("back", (-1.0, 4.4, 1.15), (0, 0, 0.92), 60), ("face", (0.28, -0.9, 1.68), (0, 0, 1.62), 85), ("hand", (-1.1, -0.65, 1.1), (-0.72, 0, 0.95), 85)):
        cam.location = pos
        cam.data.lens = lens
        cam.rotation_euler = (Vector(look) - Vector(pos)).to_track_quat("-Z", "Y").to_euler()
        scene.render.filepath = os.path.join(PREVIEW_DIR, f"v3-{label}.png")
        bpy.ops.render.render(write_still=True)
    print("previews in", PREVIEW_DIR)
