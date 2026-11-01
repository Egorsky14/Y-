"""Rooftop HVAC kit for HVAC Company Owner V3, authored in Blender and exported as GLB.

Run headless (see docs/art/ASSET_PIPELINE.md):
    blender -b --factory-startup --python tools/blender/rooftop_kit.py -- <out.glb> [preview_dir]

Named nodes (real-world metres; Blender Z-up, written Y-up by the glTF exporter):
  rtu          manufacturer-neutral commercial packaged rooftop unit (7.5-10 ton class) on its roof curb:
               2.4 m long (model +X) x 1.45 m deep x 1.25 m cabinet over a 0.35 m galvanized curb. Service
               side toward model -Z (glTF): hinged access doors with quarter-turn latches, the control and
               compressor sections, a neutral data plate; condenser coil behind a louvred guard on the +X
               end and the back; two condenser fans with wire grilles on top; economizer hood on the -X
               end; fused disconnect with conduit, and a gas line with a shut-off cock.
  rtu-lod      a few hundred triangles of the same silhouette for distant roofs.
  rtu-res      residential packaged gas/electric unit on roof rails: 1.3 m long x 0.95 m x 0.9 m cabinet
               (1.05 m with rails), single top fan with grille, louvred coil sides, service panel on the
               model -X end, disconnect and gas line.
  ladder-base  24 ft extension ladder, base section: 3.8 m aluminium C-channel rails 0.48 m apart, D rungs
               every 0.305 m, swivel safety shoes. Origin at the feet, rails up model +Y, climbing face +Z.
  ladder-fly   fly section: 3.6 m, rails 0.42 m, rung locks and guide brackets at its foot, rail caps at the
               top. Origin at its own foot; the game slides it up the base along +Y to extend the ladder.
Validates dimensions, ground contact and the triangle budget, exports, and optionally renders previews.
"""
import math
import os
import sys

import bmesh
import bpy
from mathutils import Matrix, Vector

argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
OUT = os.path.abspath(argv[0] if argv else "rooftop-kit.glb")
PREVIEW_DIR = os.path.abspath(argv[1]) if len(argv) > 1 else None
TRIANGLE_BUDGET = 40000

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene


def srgb(hex_color):
    h = hex_color.lstrip("#")
    c = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return tuple(x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c)


MATS = {}


def mat(name, color, rough=0.6, metal=0.0):
    if name in MATS:
        return MATS[name]
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = (*srgb(color), 1)
    b.inputs["Roughness"].default_value = rough
    b.inputs["Metallic"].default_value = metal
    MATS[name] = m
    return m


CABINET = lambda: mat("rtu-cabinet", "#c9c6bd", 0.55, 0.2)
CABINET_RES = lambda: mat("rtu-res-cabinet", "#d4d0c6", 0.55, 0.15)
SEAM = lambda: mat("rtu-seam", "#7d7a73", 0.7, 0.1)
COIL = lambda: mat("rtu-coil", "#3b4045", 0.6, 0.5)
GRILLE = lambda: mat("rtu-grille", "#1d1f22", 0.5, 0.6)
GALV = lambda: mat("galvanized", "#a9adb0", 0.45, 0.8)
DARK = lambda: mat("rtu-dark", "#2a2d31", 0.7, 0.1)
LATCH = lambda: mat("rtu-latch", "#d8dadb", 0.35, 0.9)
PLATE = lambda: mat("rtu-plate", "#e8e6df", 0.5, 0.3)
GAS = lambda: mat("gas-yellow", "#d9b21f", 0.55, 0.1)
CONDUIT = lambda: mat("conduit", "#b8bcbf", 0.4, 0.85)
RUST = lambda: mat("rtu-weather", "#8a6d4f", 0.9, 0.0)
ALU = lambda: mat("ladder-aluminium", "#c4c8cb", 0.38, 0.85)
ALU_DARK = lambda: mat("ladder-shoe", "#2b2b2d", 0.85, 0.0)
LOCK = lambda: mat("ladder-lock", "#d8352a", 0.5, 0.2)
LABEL = lambda: mat("ladder-label", "#e8c21a", 0.6, 0.0)


class Part:
    """Collects bmesh pieces for one named node; each material becomes one primitive."""

    def __init__(self, name):
        self.name = name
        self.bm = bmesh.new()
        self.mats = []

    def _mat_index(self, m):
        if m not in self.mats:
            self.mats.append(m)
        return self.mats.index(m)

    def _add(self, bm2, m, matrix):
        bm2.transform(matrix)
        idx = self._mat_index(m)
        for f in bm2.faces:
            f.material_index = idx
        me = bpy.data.meshes.new("tmp")
        bm2.to_mesh(me)
        bm2.free()
        self.bm.from_mesh(me)
        bpy.data.meshes.remove(me)

    def box(self, m, size, at, rot=(0, 0, 0), bevel=0.0):
        bm2 = bmesh.new()
        bmesh.ops.create_cube(bm2, size=1.0)
        bm2.transform(Matrix.Diagonal((*size, 1)))
        if bevel > 0:
            bmesh.ops.bevel(bm2, geom=list(bm2.edges), offset=bevel, segments=2, affect="EDGES", profile=0.5)
        self._add(bm2, m, Matrix.Translation(at) @ euler(rot))

    def cyl(self, m, r, depth, at, rot=(0, 0, 0), segs=16, r2=None):
        bm2 = bmesh.new()
        bmesh.ops.create_cone(bm2, cap_ends=True, segments=segs, radius1=r, radius2=r if r2 is None else r2, depth=depth)
        self._add(bm2, m, Matrix.Translation(at) @ euler(rot))

    def torus(self, m, R, r, at, rot=(0, 0, 0), segs=28, minor=6):
        bm2 = bmesh.new()
        verts = []
        for i in range(segs):
            a = 2 * math.pi * i / segs
            ring = []
            for j in range(minor):
                b = 2 * math.pi * j / minor
                ring.append(bm2.verts.new(((R + r * math.cos(b)) * math.cos(a), (R + r * math.cos(b)) * math.sin(a), r * math.sin(b))))
            verts.append(ring)
        for i in range(segs):
            for j in range(minor):
                a, b2 = verts[i][j], verts[(i + 1) % segs][j]
                c, d = verts[(i + 1) % segs][(j + 1) % minor], verts[i][(j + 1) % minor]
                bm2.faces.new((a, b2, c, d))
        self._add(bm2, m, Matrix.Translation(at) @ euler(rot))

    def finish(self):
        me = bpy.data.meshes.new(self.name)
        self.bm.to_mesh(me)
        self.bm.free()
        for m in self.mats:
            me.materials.append(m)
        obj = bpy.data.objects.new(self.name, me)
        scene.collection.objects.link(obj)
        for p in me.polygons:
            p.use_smooth = False
        return obj


def euler(rot):
    from mathutils import Euler
    return Euler(rot, "XYZ").to_matrix().to_4x4()


# Model frame (Blender): X = length, -Y = service side (glTF -Z after export... see note), Z up.
# glTF: (x, y, z)_gltf = (x, z, -y)_blender, so the glTF -Z service side is Blender +Y.
SERVICE = +1  # Blender Y sign of the service face


def fan_grille(p, cx, cy, top, r, m_grille):
    """Condenser fan opening on a cabinet top: shroud ring, wire rings, spokes, motor and blades below."""
    p.cyl(DARK(), r + 0.03, 0.06, (cx, cy, top + 0.03), segs=28)
    for k in range(5):
        rr = r * (0.25 + 0.75 * (k + 1) / 5)
        p.torus(m_grille, rr, 0.005, (cx, cy, top + 0.065), segs=32, minor=4)
    for i in range(8):
        a = i * math.pi / 4
        p.box(m_grille, (r * 2, 0.008, 0.008), (cx, cy, top + 0.066), rot=(0, 0, a))
    p.cyl(m_grille, 0.07, 0.07, (cx, cy, top + 0.03), segs=14)
    for i in range(4):
        a = i * math.pi / 2 + 0.3
        p.box(COIL(), (r * 0.8, 0.12, 0.012), (cx + math.cos(a) * r * 0.42, cy + math.sin(a) * r * 0.42, top + 0.01), rot=(0.35, 0, a))


def louvres(p, x0, x1, y, z0, z1, axis="x", m=None, pitch=0.045):
    """Coil guard louvres across a face (horizontal blades)."""
    m = m or GRILLE()
    n = int((z1 - z0) / pitch)
    for i in range(n):
        z = z0 + (i + 0.5) * pitch
        if axis == "x":
            p.box(m, (x1 - x0, 0.012, 0.022), ((x0 + x1) / 2, y, z), rot=(0.5, 0, 0))
        else:
            p.box(m, (0.012, x1 - x0, 0.022), (y, (x0 + x1) / 2, z), rot=(0, 0.5, 0))


def build_rtu():
    p = Part("rtu")
    L, W, H, C = 2.4, 1.45, 1.25, 0.35
    # Roof curb: galvanized frame with a wood nailer and cant strip, flashed into the membrane.
    p.box(GALV(), (L + 0.08, W + 0.08, C), (0, 0, C / 2))
    p.box(DARK(), (L + 0.22, W + 0.22, 0.05), (0, 0, 0.025))
    # Cabinet and base rail.
    p.box(SEAM(), (L + 0.02, W + 0.02, 0.1), (0, 0, C + 0.05))
    p.box(CABINET(), (L, W, H - 0.1), (0, 0, C + 0.1 + (H - 0.1) / 2), bevel=0.012)
    top = C + H
    p.box(CABINET(), (L + 0.03, W + 0.03, 0.04), (0, 0, top - 0.02), bevel=0.008)
    y = SERVICE * (W / 2 + 0.004)
    # Service side: three hinged doors (control, compressor, blower) with seams, latches and hinges.
    doors = [(-0.75, 0.62), (0.0, 0.62), (0.68, 0.5)]
    for x, w in doors:
        z0, z1 = C + 0.16, top - 0.1
        for s in (-1, 1):
            p.box(SEAM(), (0.012, 0.008, z1 - z0), (x + s * w / 2, y, (z0 + z1) / 2))
        for z in (z0, z1):
            p.box(SEAM(), (w, 0.008, 0.012), (x, y, z))
        for z in (z0 + 0.22, z1 - 0.22):
            p.cyl(LATCH(), 0.022, 0.02, (x + w / 2 - 0.07, y + SERVICE * 0.01, z), rot=(math.pi / 2, 0, 0), segs=12)
            p.box(LATCH(), (0.012, 0.02, 0.06), (x - w / 2 + 0.03, y + SERVICE * 0.006, z))
    # Neutral data plate and a small warning label on the control door.
    p.box(PLATE(), (0.2, 0.006, 0.12), (-0.75, y + SERVICE * 0.006, top - 0.32))
    p.box(LABEL(), (0.12, 0.006, 0.06), (-0.75, y + SERVICE * 0.006, top - 0.5))
    # Coil sections: louvred guards on the +X end and the back.
    louvres(p, -L / 2 + 0.08, L / 2 - 0.08, -SERVICE * (W / 2 + 0.012), C + 0.2, top - 0.12)
    louvres(p, -W / 2 + 0.08, W / 2 - 0.08, L / 2 + 0.012, C + 0.2, top - 0.12, axis="y")
    # Two condenser fans on top.
    for fx in (0.45, -0.25):
        fan_grille(p, fx, -SERVICE * 0.05, top, 0.33, GRILLE())
    # Economizer / fresh-air hood on the -X end.
    p.box(CABINET(), (0.32, W * 0.8, 0.5), (-L / 2 - 0.16, 0, C + 0.62), rot=(0, 0.25, 0), bevel=0.01)
    louvres(p, -W * 0.38, W * 0.38, -L / 2 - 0.3, C + 0.42, C + 0.8, axis="y", m=SEAM(), pitch=0.05)
    # Fused disconnect on a strut beside the control door, conduit into the cabinet.
    dx = -1.05
    p.box(GALV(), (0.04, 0.04, 0.9), (dx - 0.25, SERVICE * (W / 2 + 0.25), 0.45))
    p.box(DARK(), (0.28, 0.14, 0.36), (dx - 0.25, SERVICE * (W / 2 + 0.33), 0.78), bevel=0.01)
    p.box(LABEL(), (0.03, 0.05, 0.12), (dx - 0.1, SERVICE * (W / 2 + 0.33), 0.8))
    p.cyl(CONDUIT(), 0.016, 0.3, (dx - 0.25, SERVICE * (W / 2 + 0.33), 0.45), segs=8)
    p.cyl(CONDUIT(), 0.016, 0.3, (dx - 0.1, SERVICE * (W / 2 + 0.15), 0.62), rot=(math.pi / 2, 0, 0), segs=8)
    # Gas line: from the deck up to a shut-off cock and into the burner section.
    gx = 0.68
    p.cyl(GAS(), 0.018, 0.6, (gx + 0.2, SERVICE * (W / 2 + 0.18), C + 0.15), segs=10)
    p.cyl(GAS(), 0.018, 0.2, (gx + 0.2, SERVICE * (W / 2 + 0.09), C + 0.42), rot=(math.pi / 2, 0, 0), segs=10)
    p.box(DARK(), (0.08, 0.05, 0.04), (gx + 0.2, SERVICE * (W / 2 + 0.18), C + 0.3))
    p.box(GAS(), (0.4, 0.04, 0.04), (gx + 0.2, SERVICE * (W / 2 + 0.18), 0.04))
    # Condensate drain trap at the base.
    p.cyl(DARK(), 0.016, 0.18, (0.2, SERVICE * (W / 2 + 0.06), C + 0.05), segs=8)
    # Weathering: streaks under the latches and along the base rail.
    for x, _ in doors:
        p.box(RUST(), (0.05, 0.004, 0.3), (x + 0.2, y + SERVICE * 0.003, C + 0.35))
    p.box(RUST(), (L * 0.9, 0.004, 0.03), (0, y + SERVICE * 0.003, C + 0.12))
    return p.finish()


def build_rtu_lod():
    p = Part("rtu-lod")
    L, W, H, C = 2.4, 1.45, 1.25, 0.35
    p.box(GALV(), (L + 0.08, W + 0.08, C), (0, 0, C / 2))
    p.box(CABINET(), (L, W, H), (0, 0, C + H / 2))
    for fx in (0.45, -0.25):
        p.cyl(GRILLE(), 0.34, 0.06, (fx, -SERVICE * 0.05, C + H + 0.03), segs=12)
    p.box(COIL(), (L - 0.16, 0.02, H - 0.3), (0, -SERVICE * (W / 2 + 0.01), C + H / 2))
    p.box(CABINET(), (0.3, W * 0.8, 0.5), (-L / 2 - 0.15, 0, C + 0.62))
    return p.finish()


def build_rtu_res():
    p = Part("rtu-res")
    L, W, H, R = 1.3, 0.95, 0.9, 0.15
    # Two galvanized roof rails on rubber pads.
    for s in (-1, 1):
        p.box(DARK(), (L + 0.2, 0.12, 0.03), (0, s * W * 0.35, 0.015))
        p.box(GALV(), (L + 0.1, 0.08, R - 0.03), (0, s * W * 0.35, 0.03 + (R - 0.03) / 2))
    p.box(CABINET_RES(), (L, W, H), (0, 0, R + H / 2), bevel=0.012)
    top = R + H
    p.box(CABINET_RES(), (L + 0.02, W + 0.02, 0.03), (0, 0, top - 0.015), bevel=0.006)
    fan_grille(p, 0.15, 0, top, 0.3, GRILLE())
    # Louvred coil on both long sides and the +X end.
    for s in (-1, 1):
        louvres(p, -L / 2 + 0.25, L / 2 - 0.06, s * (W / 2 + 0.01), R + 0.08, top - 0.08)
    louvres(p, -W / 2 + 0.06, W / 2 - 0.06, L / 2 + 0.01, R + 0.08, top - 0.08, axis="y")
    # Service panel on the -X end: two removable panels with screws, data plate.
    ex = -L / 2 - 0.004
    for z0, z1 in ((R + 0.06, R + 0.46), (R + 0.5, top - 0.06)):
        for z in (z0, z1):
            p.box(SEAM(), (0.008, W - 0.1, 0.01), (ex, 0, z))
        for s in (-1, 1):
            p.box(SEAM(), (0.008, 0.01, z1 - z0), (ex, s * (W / 2 - 0.05), (z0 + z1) / 2))
            for z in (z0 + 0.04, z1 - 0.04):
                p.cyl(LATCH(), 0.007, 0.01, (ex - 0.004, s * (W / 2 - 0.08), z), rot=(0, math.pi / 2, 0), segs=8)
    p.box(PLATE(), (0.006, 0.16, 0.09), (ex - 0.003, 0.18, top - 0.2))
    # Disconnect and gas cock beside the service end.
    p.box(DARK(), (0.1, 0.2, 0.26), (-L / 2 - 0.12, -W / 2 + 0.05, R + 0.5), bevel=0.008)
    p.cyl(CONDUIT(), 0.012, R + 0.4, (-L / 2 - 0.12, -W / 2 + 0.05, (R + 0.4) / 2), segs=8)
    p.cyl(GAS(), 0.014, 0.35, (-L / 2 - 0.1, W / 2 - 0.12, 0.2), segs=8)
    p.box(DARK(), (0.06, 0.05, 0.04), (-L / 2 - 0.1, W / 2 - 0.12, 0.3))
    p.box(RUST(), (0.004, 0.06, 0.25), (ex - 0.002, -0.2, R + 0.3))
    return p.finish()


RUNG = 0.305
FIRST = 0.3


def rail(p, x, length, depth=0.075, width=0.03, z=0.0):
    """Aluminium C-channel rail: web plus two flanges, along +Z (Blender up)."""
    p.box(ALU(), (width * 0.35, depth, length), (x, z, length / 2))
    for s in (-1, 1):
        p.box(ALU(), (width, 0.008, length), (x - math.copysign(width * 0.32, x), z + s * depth / 2, length / 2))


def build_ladder_base():
    p = Part("ladder-base")
    L, half = 3.8, 0.24
    for s in (-1, 1):
        rail(p, s * half, L)
        # Swivel safety shoe: rubber pad on a pivot.
        p.box(ALU_DARK(), (0.07, 0.13, 0.025), (s * half, 0, 0.0125), bevel=0.006)
        p.cyl(ALU(), 0.012, 0.1, (s * half, 0, 0.06), rot=(0, math.pi / 2, 0), segs=8)
        p.box(ALU_DARK(), (0.04, 0.1, 0.09), (s * half, 0, 0.07))
    n = int((L - FIRST) / RUNG) + 1
    for i in range(n):
        z = FIRST + i * RUNG
        # D rung: flat, ribbed top for the boot.
        p.box(ALU(), (half * 2 - 0.03, 0.04, 0.03), (0, 0, z), bevel=0.006)
        p.box(ALU_DARK(), (half * 2 - 0.06, 0.03, 0.004), (0, 0, z + 0.016))
    # Duty-rating label on the inner rail.
    p.box(LABEL(), (0.004, 0.06, 0.18), (-half + 0.02, 0, 1.2))
    return p.finish()


def build_ladder_fly():
    p = Part("ladder-fly")
    L, half, off = 3.6, 0.21, -0.085  # Blender -Y = glTF +Z: the fly runs on the climbing face of the base
    for s in (-1, 1):
        rail(p, s * half, L, z=off)
        p.cyl(ALU_DARK(), 0.022, 0.06, (s * half, off, L - 0.02), segs=10)  # rail caps
        # Guide bracket wrapping the base rail, and the red rung lock.
        p.box(ALU(), (0.08, 0.12, 0.05), (s * (half + 0.03), off * 0.5, 0.12))
        p.box(LOCK(), (0.07, 0.05, 0.08), (s * (half - 0.03), off - 0.05, 0.42))
    n = int((L - FIRST) / RUNG) + 1
    for i in range(n):
        z = FIRST + i * RUNG
        p.box(ALU(), (half * 2 - 0.03, 0.04, 0.03), (0, off, z), bevel=0.006)
        p.box(ALU_DARK(), (half * 2 - 0.06, 0.03, 0.004), (0, off, z + 0.016))
    # Halyard rope down the climbing face, with its pulley at the base top (drawn on the fly's foot).
    p.cyl(mat("rope", "#e2dccb", 0.9), 0.006, L - 0.4, (0.05, off - 0.03, L / 2), segs=6)
    return p.finish()


objs = [build_rtu(), build_rtu_lod(), build_rtu_res(), build_ladder_base(), build_ladder_fly()]

# ---------------------------------------------------------------- validation
problems = []
tris = 0
EXPECT = {"rtu": ((2.5, 3.2), (1.5, 2.3), (1.55, 1.75)), "rtu-lod": ((2.4, 3.0), (1.4, 2.0), (1.5, 1.7)), "rtu-res": ((1.4, 1.8), (0.9, 1.4), (1.0, 1.15)),
          "ladder-base": ((0.45, 0.6), (0.07, 0.2), (3.75, 3.85)), "ladder-fly": ((0.4, 0.6), (0.07, 0.25), (3.55, 3.65))}
for o in objs:
    me = o.data
    t = sum(len(p.vertices) - 2 for p in me.polygons)
    tris += t
    xs = [v.co.x for v in me.vertices]
    ys = [v.co.y for v in me.vertices]
    zs = [v.co.z for v in me.vertices]
    dims = (max(xs) - min(xs), max(ys) - min(ys), max(zs) - min(zs))
    for d, (lo, hi), label in zip(dims, EXPECT[o.name], "xyz"):
        if not lo <= d <= hi:
            problems.append(f"{o.name} {label} = {d:.3f} outside {lo}-{hi}")
    if abs(min(zs)) > 0.005:
        problems.append(f"{o.name}: base at z={min(zs):.3f}")
    print(f"{o.name}: {t} tris, {dims[0]:.2f} x {dims[1]:.2f} x {dims[2]:.2f}")
if tris > TRIANGLE_BUDGET:
    problems.append(f"{tris} tris over budget {TRIANGLE_BUDGET}")
if problems:
    print("VALIDATION FAILED:", problems)
    sys.exit(1)

os.makedirs(os.path.dirname(OUT), exist_ok=True)
bpy.ops.export_scene.gltf(filepath=OUT, export_format="GLB", export_normals=True, export_texcoords=False, export_materials="EXPORT", export_yup=True, export_apply=True)
print("exported", OUT, os.path.getsize(OUT), "bytes,", tris, "tris")

if PREVIEW_DIR:
    os.makedirs(PREVIEW_DIR, exist_ok=True)
    o = {x.name: x for x in objs}
    o["rtu"].location = (0, 0, 0)
    o["rtu-lod"].location = (0, 6, 0)
    o["rtu-res"].location = (3.2, 0.5, 0)
    o["ladder-base"].location = (-2.6, 0.8, 0)
    o["ladder-fly"].location = (-2.6, 0.8, 1.6)
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = 1400
    scene.render.resolution_y = 900
    world = bpy.data.worlds.new("w")
    world.use_nodes = True
    world.node_tree.nodes["Background"].inputs[0].default_value = (0.6, 0.64, 0.7, 1)
    world.node_tree.nodes["Background"].inputs[1].default_value = 0.9
    scene.world = world
    sun = bpy.data.objects.new("sun", bpy.data.lights.new("sun", "SUN"))
    sun.data.energy = 3.5
    sun.rotation_euler = (0.8, 0.1, 2.4)
    scene.collection.objects.link(sun)
    floor = bpy.data.meshes.new("floor")
    floor.from_pydata([(-20, -20, 0), (20, -20, 0), (20, 20, 0), (-20, 20, 0)], [], [(0, 1, 2, 3)])
    fo = bpy.data.objects.new("floor", floor)
    fo.data.materials.append(mat("membrane", "#8e8b85", 0.95))
    scene.collection.objects.link(fo)
    cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam"))
    scene.collection.objects.link(cam)
    scene.camera = cam
    for label, pos, look in (("service", (1.0, 7.0, 3.2), (0.2, 0, 1.0)), ("back", (4.5, -5.0, 3.5), (0.5, 0, 0.9))):
        cam.location = pos
        cam.data.lens = 35
        cam.rotation_euler = (Vector(look) - Vector(pos)).to_track_quat("-Z", "Y").to_euler()
        scene.render.filepath = os.path.join(PREVIEW_DIR, f"rooftop-{label}.png")
        bpy.ops.render.render(write_still=True)
