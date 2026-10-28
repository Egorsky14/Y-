"""Residential yard furniture and utility props for HVAC Company Owner V3, authored in Blender, exported as GLB.

Run headless (see docs/art/ASSET_PIPELINE.md):
    blender -b --factory-startup --python tools/blender/yard_kit.py -- public/models/props/yard-kit.glb [preview_dir]

Twelve named parts in real-world metres (Blender Z-up; the glTF exporter writes Y-up). Each part
stands on the ground at its origin. Blender +Y becomes glTF -Z, which is "toward the street" in a
lot's local frame, so backs of seating face +Y (toward the house when placed on a rear patio).
  dining-set     rectangular teak table with six powder-coated chairs and seat cushions (2.4 x 2.4 m)
  bistro-set     round café table with two chairs (1.5 x 1.5 m)
  lounge-chair   chaise lounge with cushion (0.75 x 1.95 m)
  grill          stainless gas grill on a black cart with side shelves and propane tank (1.35 x 0.6 m)
  sofa-set       L-shaped outdoor sectional with cushions and a low coffee table (3.0 x 2.5 m)
  fire-pit       round concrete fire bowl with lava rock and two Adirondack chairs (2.5 x 2.5 m)
  umbrella       market umbrella, open, 2.7 m canopy on a dark pole with a base
  shed           resin storage shed with double doors, gable roof and vents (2.4 x 1.8 m)
  planter-pot    tall tapered ceramic pot with an agave-like rosette (0.6 m)
  swing-set      A-frame swing set with two swings and a slide (3.5 x 2.3 m)
  trash-bins     two wheeled curbside carts, waste and recycling (1.5 x 0.75 m)
  bench          garden bench with slatted seat and back (1.5 x 0.6 m)
Cushions, canopies and the planter rosette use light base colours: the game tints them per
instance through instance colours, so one asset gives many colour schemes.
"""
import math
import os
import sys

import bmesh
import bpy
from mathutils import Vector

argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
OUT = os.path.abspath(argv[0] if argv else "yard-kit.glb")
PREVIEW_DIR = os.path.abspath(argv[1]) if len(argv) > 1 else None
TRIANGLE_BUDGET = 26000

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
scene.unit_settings.system = "METRIC"


def srgb(hex_color):
    h = hex_color.lstrip("#")
    c = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return tuple(x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c)


def material(name, color, roughness=0.6, metallic=0.0):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    bsdf = m.node_tree.nodes["Principled BSDF"]
    bsdf.inputs["Base Color"].default_value = (*srgb(color), 1.0)
    bsdf.inputs["Roughness"].default_value = roughness
    bsdf.inputs["Metallic"].default_value = metallic
    return m


M = {
    "frame": material("frame-dark", "#2a2b2d", 0.55, 0.3),
    "teak": material("teak", "#9a6b43", 0.7),
    "cushion": material("cushion", "#e9e3d6", 0.95),  # tinted per instance
    "steel": material("stainless", "#c4c8cc", 0.3, 0.8),
    "black": material("black", "#1a1b1d", 0.6),
    "concrete": material("concrete", "#b9b2a6", 0.95),
    "lava": material("lava-rock", "#5a3b30", 0.95),
    "resin": material("resin-tan", "#c9b79a", 0.75),
    "resin-dark": material("resin-dark", "#6b5d4c", 0.75),
    "ceramic": material("ceramic", "#e4ddd0", 0.5),  # tinted per instance
    "leaf": material("leaf", "#7fa98a", 0.7),
    "green": material("cart-green", "#2f6b4f", 0.6),
    "blue": material("cart-blue", "#2f5d8a", 0.6),
    "slide": material("slide-yellow", "#e6b52e", 0.5),
    "rope": material("rope", "#a08a6a", 0.9),
    "propane": material("propane", "#e8e6e0", 0.45, 0.4),
}


def prim(op, name, mat, location=(0, 0, 0), rotation=(0, 0, 0), scale=(1, 1, 1), **kw):
    op(location=location, rotation=rotation, **kw)
    ob = bpy.context.active_object
    ob.name = name
    ob.scale = scale
    ob.data.materials.clear()
    ob.data.materials.append(M[mat])
    return ob


def box(name, mat, center, half, rot=(0, 0, 0), bev=0.0):
    ob = prim(bpy.ops.mesh.primitive_cube_add, name, mat, location=center, rotation=rot, scale=half, size=2)
    if bev:
        mod = ob.modifiers.new("bevel", "BEVEL")
        mod.width = bev
        mod.segments = 2
        mod.limit_method = "ANGLE"
    return ob


def cyl(name, mat, center, radius, depth, rotation=(0, 0, 0), vertices=16, radius2=None):
    if radius2 is None:
        return prim(bpy.ops.mesh.primitive_cylinder_add, name, mat, location=center, rotation=rotation, radius=radius, depth=depth, vertices=vertices)
    return prim(bpy.ops.mesh.primitive_cone_add, name, mat, location=center, rotation=rotation, radius1=radius, radius2=radius2, depth=depth, vertices=vertices)


def join(name, objects):
    for ob in objects:
        for mod in list(ob.modifiers):
            with bpy.context.temp_override(active_object=ob, object=ob):
                bpy.ops.object.modifier_apply(modifier=mod.name)
    with bpy.context.temp_override(active_object=objects[0], selected_objects=objects, selected_editable_objects=objects):
        bpy.ops.object.join()
    ob = objects[0]
    ob.name = name
    ob.data.name = name
    with bpy.context.temp_override(active_object=ob, selected_objects=[ob], selected_editable_objects=[ob]):
        bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    return ob


def moved(parts, offset, rot_z=0.0):
    """Rotate parts about the origin by rot_z, then translate."""
    for p in parts:
        loc = Vector(p.location)
        loc.rotate(__import__("mathutils").Euler((0, 0, rot_z)))
        p.location = loc + Vector(offset)
        p.rotation_euler.z += rot_z
    return parts


def chair(prefix, at=(0, 0, 0), rot_z=0.0, arms=True):
    """Powder-coated dining chair (0.5 x 0.55 m), cushion on the seat, back toward +Y."""
    p = []
    for sx in (-0.21, 0.21):
        for sy in (-0.22, 0.22):
            p.append(box(f"{prefix}-leg", "frame", (sx, sy, 0.22), (0.015, 0.015, 0.22)))
    p.append(box(f"{prefix}-seat", "frame", (0, 0, 0.44), (0.24, 0.25, 0.015)))
    p.append(box(f"{prefix}-cushion", "cushion", (0, -0.01, 0.48), (0.22, 0.22, 0.03), bev=0.015))
    p.append(box(f"{prefix}-back", "frame", (0, 0.245, 0.68), (0.23, 0.015, 0.2)))
    for sx in (-0.21, 0.21):
        p.append(box(f"{prefix}-post", "frame", (sx, 0.245, 0.58), (0.015, 0.015, 0.16)))
        if arms:
            p.append(box(f"{prefix}-arm", "frame", (sx, 0.0, 0.64), (0.02, 0.24, 0.012)))
    return moved(p, at, rot_z)


# ---------------------------------------------------------------- dining set
d = [box("dt-top", "teak", (0, 0, 0.74), (0.85, 0.48, 0.02), bev=0.008)]
for sx in (-0.75, 0.75):
    for sy in (-0.38, 0.38):
        d.append(box("dt-leg", "frame", (sx, sy, 0.36), (0.025, 0.025, 0.36)))
for x in (-0.55, 0, 0.55):
    d += chair("dc", (x, -0.82, 0), math.pi)
    d += chair("dc", (x, 0.82, 0), 0)
dining = join("dining-set", d)

# ---------------------------------------------------------------- bistro set
b = [cyl("bt-top", "frame", (0, 0, 0.72), 0.36, 0.02, vertices=24), cyl("bt-post", "frame", (0, 0, 0.36), 0.025, 0.72, vertices=8), cyl("bt-foot", "frame", (0, 0, 0.02), 0.22, 0.03, vertices=16)]
b += chair("bc", (-0.55, 0.0, 0), math.pi / 2, arms=False)
b += chair("bc", (0.55, 0.0, 0), -math.pi / 2, arms=False)
bistro = join("bistro-set", b)

# ---------------------------------------------------------------- lounge chair (back toward +Y)
l = []
for sx in (-0.33, 0.33):
    l.append(box("lc-rail", "frame", (sx, -0.1, 0.3), (0.018, 0.85, 0.018)))
    for sy in (-0.85, 0.6):
        l.append(box("lc-leg", "frame", (sx, sy, 0.15), (0.018, 0.018, 0.15)))
l.append(box("lc-seat", "cushion", (0, -0.25, 0.36), (0.32, 0.62, 0.05), bev=0.02))
l.append(box("lc-back", "cushion", (0, 0.62, 0.58), (0.32, 0.33, 0.05), rot=(math.radians(-50), 0, 0), bev=0.02))
lounge = join("lounge-chair", l)

# ---------------------------------------------------------------- grill
g = [box("gr-cart", "black", (0, 0, 0.45), (0.33, 0.27, 0.3), bev=0.01)]
g.append(box("gr-body", "steel", (0, 0, 0.85), (0.34, 0.26, 0.1), bev=0.01))
g.append(cyl("gr-lid", "steel", (0, 0, 0.95), 0.26, 0.68, rotation=(0, math.pi / 2, 0), vertices=18))
g.append(box("gr-lid-cut", "steel", (0, 0, 0.94), (0.34, 0.26, 0.02)))
g.append(box("gr-handle", "black", (0, -0.29, 1.08), (0.24, 0.015, 0.015)))
for sx in (-0.52, 0.52):
    g.append(box("gr-shelf", "black", (sx, 0, 0.86), (0.18, 0.24, 0.015)))
for sx in (-0.28, 0.28):
    for sy in (-0.22, 0.22):
        g.append(cyl("gr-wheel", "black", (sx, sy, 0.05), 0.05, 0.03, rotation=(0, math.pi / 2, 0), vertices=10))
g.append(cyl("gr-tank", "propane", (0.18, 0.0, 0.32), 0.15, 0.42, vertices=14))
for i in range(4):
    g.append(box("gr-knob", "black", (-0.18 + i * 0.12, -0.27, 0.82), (0.02, 0.015, 0.02)))
grill = join("grill", g)

# ---------------------------------------------------------------- sofa set (L sectional, back toward +Y and -X)
s = []
s.append(box("sf-base", "frame", (0, 0.75, 0.2), (1.45, 0.38, 0.2), bev=0.02))
s.append(box("sf-seat", "cushion", (0, 0.72, 0.44), (1.4, 0.34, 0.07), bev=0.04))
s.append(box("sf-back", "cushion", (0, 1.04, 0.66), (1.4, 0.1, 0.22), bev=0.05))
s.append(box("sf-wing", "frame", (-1.07, -0.15, 0.2), (0.38, 0.6, 0.2), bev=0.02))
s.append(box("sf-wing-seat", "cushion", (-1.04, -0.15, 0.44), (0.34, 0.56, 0.07), bev=0.04))
s.append(box("sf-wing-back", "cushion", (-1.36, -0.15, 0.66), (0.1, 0.56, 0.22), bev=0.05))
s.append(box("sf-arm", "frame", (1.4, 0.75, 0.42), (0.06, 0.38, 0.12), bev=0.02))
s.append(box("sf-arm2", "frame", (-1.07, -0.78, 0.42), (0.38, 0.05, 0.12), bev=0.02))
s.append(box("sf-table", "teak", (0.25, -0.35, 0.36), (0.55, 0.35, 0.03), bev=0.01))
for sx in (-0.25, 0.75):
    for sy in (-0.65, -0.05):
        s.append(box("sf-tleg", "frame", (sx, sy, 0.17), (0.02, 0.02, 0.17)))
sofa = join("sofa-set", s)

# ---------------------------------------------------------------- fire pit with two Adirondack chairs
f = [cyl("fp-bowl", "concrete", (0, 0, 0.2), 0.55, 0.4, vertices=24, radius2=0.62)]
f.append(cyl("fp-lava", "lava", (0, 0, 0.4), 0.5, 0.03, vertices=20))
for a in (math.radians(215), math.radians(325)):
    cx, cy = math.cos(a) * 0.95, math.sin(a) * 0.95
    ad = [box("ad-seat", "teak", (0, 0, 0.36), (0.3, 0.3, 0.02), rot=(math.radians(-8), 0, 0))]
    ad.append(box("ad-back", "teak", (0, 0.36, 0.62), (0.28, 0.025, 0.32), rot=(math.radians(-22), 0, 0)))
    for sx in (-0.33, 0.33):
        ad.append(box("ad-arm", "teak", (sx, 0.02, 0.6), (0.06, 0.36, 0.015)))
        ad.append(box("ad-leg", "teak", (sx, -0.25, 0.3), (0.025, 0.03, 0.3)))
        ad.append(box("ad-leg2", "teak", (sx, 0.25, 0.2), (0.025, 0.03, 0.2)))
    f += moved(ad, (cx, cy, 0), a - math.pi / 2)
firepit = join("fire-pit", f)

# ---------------------------------------------------------------- market umbrella (open)
u = [cyl("um-base", "black", (0, 0, 0.04), 0.25, 0.08, vertices=16), cyl("um-pole", "frame", (0, 0, 1.2), 0.022, 2.4, vertices=8)]
u.append(cyl("um-canopy", "cushion", (0, 0, 2.28), 1.35, 0.42, vertices=8, radius2=0.06))
u.append(cyl("um-finial", "frame", (0, 0, 2.55), 0.05, 0.12, vertices=8))
umbrella = join("umbrella", u)

# ---------------------------------------------------------------- shed (door toward +Y)
h = [box("sh-body", "resin", (0, 0, 1.0), (1.2, 0.9, 1.0), bev=0.02)]
for sy in (-1, 1):
    h.append(box("sh-roof", "resin-dark", (0, sy * 0.48, 2.17), (1.3, 0.55, 0.035), rot=(sy * math.radians(-22), 0, 0)))
h.append(box("sh-ridge", "resin-dark", (0, 0, 2.38), (1.32, 0.06, 0.04)))
# Gable ends: flat triangles filling the roof pitch above each side wall.
for sx in (-1.19, 1.19):
    me = bpy.data.meshes.new("sh-gable")
    me.from_pydata([(0, -0.9, 0), (0, 0.9, 0), (0, 0, 0.38)], [], [(0, 1, 2), (0, 2, 1)])
    tri = bpy.data.objects.new("sh-gable", me)
    scene.collection.objects.link(tri)
    tri.location = (sx, 0, 2.0)
    me.materials.append(M["resin"])
    h.append(tri)
for sx in (-0.33, 0.33):
    h.append(box("sh-door", "resin-dark", (sx, 0.905, 0.95), (0.31, 0.012, 0.85)))
h.append(box("sh-handle", "black", (0, 0.92, 1.0), (0.02, 0.01, 0.12)))
for sx in (-0.95, 0.95):
    h.append(box("sh-vent", "resin-dark", (sx, 0.905, 1.75), (0.12, 0.01, 0.06)))
shed = join("shed", h)

# ---------------------------------------------------------------- planter pot with rosette
pp = [cyl("pp-pot", "ceramic", (0, 0, 0.32), 0.2, 0.64, vertices=4, radius2=0.28)]
pp[0].rotation_euler.z = math.pi / 4
pp.append(cyl("pp-soil", "lava", (0, 0, 0.63), 0.24, 0.02, vertices=12))
for i in range(12):
    a = i / 12 * math.pi * 2
    tilt = 0.5 + (i % 2) * 0.35
    leaf = cyl("pp-leaf", "leaf", (0, 0, 0), 0.05, 0.5, vertices=4, radius2=0)
    leaf.location = (math.cos(a) * 0.08, math.sin(a) * 0.08, 0.86)
    leaf.rotation_euler = (math.sin(a) * -tilt, math.cos(a) * tilt, 0)
    pp.append(leaf)
planter = join("planter-pot", pp)

# ---------------------------------------------------------------- swing set (beam along X)
w = []
for sx in (-1.6, 1.6):
    for sy in (-1, 1):
        w.append(box("sw-leg", "teak", (sx, sy * 0.55, 1.03), (0.05, 0.05, 1.12), rot=(sy * math.radians(-26), 0, 0)))
w.append(cyl("sw-beam", "teak", (0, 0, 2.05), 0.07, 3.4, rotation=(0, math.pi / 2, 0), vertices=8))
for sx in (-0.6, 0.4):
    for dx in (-0.2, 0.2):
        w.append(cyl("sw-rope", "rope", (sx + dx, 0, 1.3), 0.01, 1.5, vertices=4))
    w.append(box("sw-seat", "black", (sx, 0, 0.55), (0.24, 0.09, 0.015)))
w.append(box("sw-slide", "slide", (1.1, -0.98, 0.66), (0.24, 0.7, 0.02), rot=(math.radians(45), 0, 0)))
w.append(box("sw-deck", "teak", (1.1, -0.45, 1.25), (0.3, 0.3, 0.03)))
swing = join("swing-set", w)

# ---------------------------------------------------------------- curbside carts
t = []
for i, (mat, sx) in enumerate((("green", -0.38), ("blue", 0.38))):
    t.append(box("tb-body", mat, (sx, 0, 0.52), (0.31, 0.34, 0.5), bev=0.03))
    t.append(box("tb-lid", mat, (sx, -0.02, 1.04), (0.33, 0.37, 0.025), bev=0.01))
    t.append(cyl("tb-wheel", "black", (sx, 0.3, 0.1), 0.1, 0.62, rotation=(0, math.pi / 2, 0), vertices=10))
bins = join("trash-bins", t)

# ---------------------------------------------------------------- bench (back toward +Y)
bb = []
for i in range(4):
    bb.append(box("bn-slat", "teak", (0, -0.2 + i * 0.12, 0.44), (0.72, 0.045, 0.018)))
for i in range(3):
    bb.append(box("bn-back", "teak", (0, 0.26, 0.6 + i * 0.12), (0.72, 0.012, 0.04)))
for sx in (-0.66, 0.66):
    bb.append(box("bn-side", "frame", (sx, 0, 0.3), (0.025, 0.26, 0.3)))
    bb.append(box("bn-arm", "frame", (sx, 0.0, 0.62), (0.03, 0.24, 0.015)))
bench = join("bench", bb)

# ---------------------------------------------------------------- validation
def dims(ob):
    cs = [ob.matrix_world @ Vector(c) for c in ob.bound_box]
    lo = Vector((min(c.x for c in cs), min(c.y for c in cs), min(c.z for c in cs)))
    hi = Vector((max(c.x for c in cs), max(c.y for c in cs), max(c.z for c in cs)))
    return lo, hi


def tris(ob):
    return sum(len(p.vertices) - 2 for p in ob.data.polygons)


EXPECT = {
    "dining-set": ((1.6, 1.9, 0.7), (2.5, 2.5, 1.0)),
    "bistro-set": ((1.2, 0.6, 0.7), (1.7, 1.0, 1.0)),
    "lounge-chair": ((0.6, 1.7, 0.4), (0.9, 2.1, 1.0)),
    "grill": ((1.2, 0.5, 1.0), (1.5, 0.75, 1.3)),
    "sofa-set": ((2.6, 1.9, 0.8), (3.1, 2.7, 1.0)),
    "fire-pit": ((1.8, 1.0, 0.4), (2.8, 2.7, 1.1)),
    "umbrella": ((2.5, 2.5, 2.4), (2.9, 2.9, 2.8)),
    "shed": ((2.3, 1.7, 2.2), (2.7, 2.2, 2.6)),
    "planter-pot": ((0.35, 0.35, 0.8), (0.75, 0.75, 1.3)),
    "swing-set": ((3.2, 1.6, 2.0), (3.7, 2.7, 2.3)),
    "trash-bins": ((1.3, 0.7, 1.0), (1.7, 0.9, 1.2)),
    "bench": ((1.3, 0.5, 0.7), (1.6, 0.75, 1.0)),
}
ok = True
total = 0
report = []
for name, (lo_lim, hi_lim) in EXPECT.items():
    ob = bpy.data.objects[name]
    lo, hi = dims(ob)
    size = hi - lo
    t = tris(ob)
    total += t
    fits = all(a <= s <= b for a, s, b in zip(lo_lim, size, hi_lim)) and abs(lo.z) < 0.02
    applied = tuple(round(s, 4) for s in ob.scale) == (1.0, 1.0, 1.0)
    ok &= fits and applied
    report.append(f"{name:13s} size {size.x:.2f} x {size.y:.2f} x {size.z:.2f} m  base z {lo.z:+.3f}  tris {t:5d}  mats {len(ob.data.materials)}  {'OK' if fits else 'OUT OF RANGE'}")
report.append(f"total triangles {total} (budget {TRIANGLE_BUDGET})  {'OK' if total <= TRIANGLE_BUDGET else 'OVER'}")
ok &= total <= TRIANGLE_BUDGET
print("\n".join("[yard] " + r for r in report))
if not ok:
    raise SystemExit("[yard] validation failed")

# Recalculate normals outward on every part (no inverted faces after the joins).
for name in EXPECT:
    me = bpy.data.objects[name].data
    bm = bmesh.new()
    bm.from_mesh(me)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(me)
    bm.free()

# ---------------------------------------------------------------- export
os.makedirs(os.path.dirname(OUT), exist_ok=True)
bpy.ops.export_scene.gltf(filepath=OUT, export_format="GLB", export_apply=True, export_yup=True, export_texcoords=False, export_normals=True, export_materials="EXPORT", use_selection=False)
print(f"[yard] exported {OUT} ({os.path.getsize(OUT)} bytes)")

# ---------------------------------------------------------------- preview (EEVEE)
if PREVIEW_DIR:
    os.makedirs(PREVIEW_DIR, exist_ok=True)
    names = list(EXPECT)
    for i, name in enumerate(names):
        ob = bpy.data.objects[name]
        ob.location = ((i % 4) * 3.4 - 5.1, (i // 4) * 3.4 - 3.4, 0)
    world = bpy.data.worlds.new("w")
    scene.world = world
    world.use_nodes = True
    world.node_tree.nodes["Background"].inputs["Color"].default_value = (0.75, 0.72, 0.66, 1)
    world.node_tree.nodes["Background"].inputs["Strength"].default_value = 0.8
    bpy.ops.object.light_add(type="SUN", rotation=(math.radians(50), math.radians(10), math.radians(35)))
    bpy.context.active_object.data.energy = 4
    bpy.ops.mesh.primitive_plane_add(size=30, location=(0, 0, 0))
    bpy.context.active_object.data.materials.append(material("ground", "#cdb48c", 1.0))
    bpy.ops.object.camera_add(location=(9, -14, 11), rotation=(math.radians(55), 0, math.radians(32)))
    scene.camera = bpy.context.active_object
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = 1400
    scene.render.resolution_y = 900
    scene.render.filepath = os.path.join(PREVIEW_DIR, "yard-kit.png")
    bpy.ops.render.render(write_still=True)
    print(f"[yard] preview {scene.render.filepath}")
