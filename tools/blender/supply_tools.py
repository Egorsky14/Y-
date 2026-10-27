"""Supply Depot equipment props for HVAC Company Owner V3, authored in Blender and exported as GLB.

Run headless (see docs/art/ASSET_PIPELINE.md):
    blender -b --factory-startup --python tools/blender/supply_tools.py -- <out.glb> [preview_dir]

Builds four named parts in real-world metres (Blender Z-up; the glTF exporter writes Y-up):
  tool-case         hard-shell technician tool case (professional hand tool set)
  vacuum-pump       two-stage vacuum pump: motor, yellow shroud, oil sight glass, handle, skid base
  recovery-machine  refrigerant recovery machine: yellow cabinet, two gauges, valve panel, handle
  nitrogen-kit      nitrogen cylinder on its foot ring with regulator and gauge
Like the job-site kit (jobsite_kit.py) the parts are authored in the outdoor unit's frame: origin on
the ground at the unit centre, +Y toward the street, +X away from the house wall, so the game can
stage them around the condenser with one transform. The pump and recovery machine sit on the
valve side (near the service ports), the case behind the technician, the cylinder on the open side.
In the store the same parts are shown on display tables (the game re-centres them).
"""
import math
import os
import sys

import bmesh
import bpy
from mathutils import Vector

argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
OUT = os.path.abspath(argv[0] if argv else "supply-tools.glb")
PREVIEW_DIR = os.path.abspath(argv[1]) if len(argv) > 1 else None
TRIANGLE_BUDGET = 14000

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
    "yellow": material("safety-yellow", "#f2c230", 0.45),
    "dark": material("housing-dark", "#2a2f36", 0.55),
    "black": material("rubber", "#15181c", 0.85),
    "steel": material("steel", "#b9c0c7", 0.3, 0.9),
    "alu": material("aluminium", "#d5d9dd", 0.35, 0.8),
    "teal": material("ego-teal", "#19d3c5", 0.4),
    "dial": material("dial-face", "#f4f4f2", 0.4),
    "glass": material("sight-glass", "#9fd3ff", 0.1),
    "red": material("gauge-red", "#e2534b", 0.45),
    "blue": material("gauge-blue", "#3f8ef0", 0.45),
    "green": material("cylinder-green", "#3b7d4f", 0.5, 0.2),
}


def prim(op, name, mat, location=(0, 0, 0), rotation=(0, 0, 0), scale=(1, 1, 1), **kw):
    op(location=location, rotation=rotation, **kw)
    ob = bpy.context.active_object
    ob.name = name
    ob.scale = scale
    ob.data.materials.clear()
    ob.data.materials.append(M[mat])
    return ob


def box(name, mat, center, half, bev=0.0, segments=2):
    ob = prim(bpy.ops.mesh.primitive_cube_add, name, mat, location=center, scale=half, size=2)
    if bev:
        mod = ob.modifiers.new("bevel", "BEVEL")
        mod.width = bev
        mod.segments = segments
        mod.limit_method = "ANGLE"
        mod.harden_normals = True
    return ob


def cyl(name, mat, center, radius, depth, rotation=(0, 0, 0), vertices=20):
    return prim(bpy.ops.mesh.primitive_cylinder_add, name, mat, location=center, rotation=rotation, radius=radius, depth=depth, vertices=vertices)


def smooth(ob, angle=40):
    with bpy.context.temp_override(active_object=ob, selected_objects=[ob], selected_editable_objects=[ob]):
        bpy.ops.object.shade_auto_smooth(angle=math.radians(angle))
    return ob


def handle(name, mat, a, b, height, radius=0.012):
    """Arched carry handle from a to b (both at the same z), rising by height."""
    cu = bpy.data.curves.new(name, "CURVE")
    cu.dimensions = "3D"
    cu.bevel_depth = radius
    cu.bevel_resolution = 2
    cu.use_fill_caps = True
    sp = cu.splines.new("BEZIER")
    pts = [Vector(a), (Vector(a) + Vector(b)) / 2 + Vector((0, 0, height)), Vector(b)]
    sp.bezier_points.add(len(pts) - 1)
    for bp, p in zip(sp.bezier_points, pts):
        bp.co = p
        bp.handle_left_type = bp.handle_right_type = "AUTO"
    cu.resolution_u = 8
    ob = bpy.data.objects.new(name, cu)
    scene.collection.objects.link(ob)
    cu.materials.append(M[mat])
    with bpy.context.temp_override(active_object=ob, selected_objects=[ob], selected_editable_objects=[ob]):
        bpy.ops.object.convert(target="MESH")
    return bpy.data.objects[name]


def gauge(name, center, radius, facing, rim="dark", arc="red"):
    """Round gauge: rim, white face and needle, facing +Y (street) or -X etc. (Euler rotation)."""
    parts = [cyl(name + "-rim", rim, center, radius, 0.02, rotation=facing, vertices=24)]
    d = Vector((0, 0, 0.011))
    d.rotate(__import__("mathutils").Euler(facing))
    parts.append(cyl(name + "-face", "dial", Vector(center) + d, radius * 0.84, 0.004, rotation=facing, vertices=24))
    needle = box(name + "-needle", arc, Vector(center) + d * 1.25, (radius * 0.6, 0.002, 0.003))
    needle.rotation_euler = facing
    needle.rotation_euler.rotate_axis("Z", math.radians(35))
    parts.append(needle)
    return parts


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


def placed(parts, at):
    for p in parts:
        p.location = Vector(p.location) + Vector(at)
    return parts


FACE_STREET = (math.pi / 2, 0, 0)  # a disc whose face points toward the street (-Y in Blender → +Y after rotation sign)

# ---------------------------------------------------------------- tool case (0.56 x 0.36 x 0.17 m)
case = []
case.append(box("case-shell", "dark", (0, 0, 0.085), (0.28, 0.18, 0.075), bev=0.02, segments=3))
case.append(box("case-seam", "black", (0, 0, 0.12), (0.283, 0.183, 0.006)))
for x in (-0.16, 0.16):
    case.append(box("case-latch", "yellow", (x, 0.185, 0.12), (0.03, 0.006, 0.022), bev=0.004))
case.append(box("case-badge", "teal", (0, 0.183, 0.07), (0.07, 0.004, 0.018), bev=0.003))
case.append(handle("case-handle", "black", (-0.09, 0.0, 0.16), (0.09, 0.0, 0.16), 0.045, 0.012))
for x in (-0.24, 0.24):
    for y in (-0.14, 0.14):
        case.append(cyl("case-foot", "black", (x, y, 0.005), 0.018, 0.01, vertices=10))
tool_case = join("tool-case", placed(case, (0.62, 1.95, 0)))
tool_case.rotation_euler = (0, 0, 0)

# ---------------------------------------------------------------- vacuum pump (0.40 x 0.20 x 0.30 m)
vp = []
vp.append(box("pump-skid", "black", (0, 0, 0.012), (0.19, 0.09, 0.012), bev=0.006))
vp.append(smooth(cyl("pump-motor", "dark", (-0.07, 0, 0.13), 0.085, 0.2, rotation=(0, math.pi / 2, 0), vertices=24)))
vp.append(box("pump-body", "yellow", (0.1, 0, 0.12), (0.075, 0.08, 0.1), bev=0.02, segments=3))
for i in range(4):
    vp.append(box("pump-fin", "dark", (0.1, 0.081, 0.06 + i * 0.035), (0.06, 0.003, 0.006)))
vp.append(cyl("pump-sight", "glass", (0.175, 0.04, 0.08), 0.018, 0.012, rotation=(0, math.pi / 2, 0), vertices=16))
vp.append(cyl("pump-port", "alu", (0.1, 0, 0.235), 0.014, 0.04, vertices=12))
vp.append(cyl("pump-cap", "black", (0.04, 0, 0.23), 0.02, 0.03, vertices=12))
vp.append(handle("pump-handle", "steel", (-0.12, 0.0, 0.2), (0.06, 0.0, 0.2), 0.08, 0.01))
vp.append(box("pump-switch", "red", (-0.15, 0.06, 0.2), (0.012, 0.012, 0.01)))
vacuum_pump = join("vacuum-pump", placed(vp, (-0.80, 1.05, 0)))

# ---------------------------------------------------------------- recovery machine (0.44 x 0.26 x 0.40 m)
rm = []
rm.append(box("rec-cabinet", "yellow", (0, 0, 0.17), (0.22, 0.13, 0.16), bev=0.025, segments=3))
rm.append(box("rec-panel", "dark", (0, 0.131, 0.21), (0.19, 0.004, 0.09), bev=0.004))
rm += gauge("rec-gauge-l", (-0.09, 0.137, 0.25), 0.045, FACE_STREET, arc="blue")
rm += gauge("rec-gauge-r", (0.09, 0.137, 0.25), 0.045, FACE_STREET, arc="red")
for x, mat in ((-0.06, "blue"), (0.0, "teal"), (0.06, "red")):
    rm.append(cyl("rec-knob", mat, (x, 0.145, 0.155), 0.016, 0.022, rotation=FACE_STREET, vertices=14))
rm.append(handle("rec-handle", "black", (-0.14, 0.0, 0.33), (0.14, 0.0, 0.33), 0.07, 0.014))
for x in (-0.18, 0.18):
    rm.append(box("rec-foot", "black", (x, 0, 0.006), (0.03, 0.11, 0.006)))
recovery = join("recovery-machine", placed(rm, (-0.95, 1.65, 0)))

# ---------------------------------------------------------------- nitrogen kit (0.24 x 0.24 x 1.10 m)
nk = []
nk.append(smooth(cyl("n2-foot", "black", (0, 0, 0.03), 0.11, 0.06, vertices=24)))
nk.append(smooth(cyl("n2-body", "green", (0, 0, 0.5), 0.1, 0.88, vertices=28)))
# Shoulder and neck, then the regulator with its gauge facing the street.
shoulder = smooth(prim(bpy.ops.mesh.primitive_uv_sphere_add, "n2-shoulder", "green", location=(0, 0, 0.94), scale=(1, 1, 0.55), radius=0.1, segments=28, ring_count=10))
nk.append(shoulder)
nk.append(cyl("n2-neck", "steel", (0, 0, 1.0), 0.025, 0.06, vertices=14))
nk.append(box("n2-regulator", "alu", (0, 0.03, 1.05), (0.035, 0.05, 0.03), bev=0.008))
nk += gauge("n2-gauge", (0, 0.095, 1.06), 0.04, FACE_STREET, rim="steel", arc="red")
nk.append(box("n2-band", "dial", (0, 0, 0.72), (0.101, 0.101, 0.03)))
nitrogen = join("nitrogen-kit", placed(nk, (1.15, -0.25, 0)))

# ---------------------------------------------------------------- validation
def dims(ob):
    pts = [ob.matrix_world @ Vector(c) for c in ob.bound_box]
    lo = Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts)))
    hi = Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
    return lo, hi


def tris(ob):
    return sum(len(p.vertices) - 2 for p in ob.data.polygons)


EXPECT = {  # name: (min size xyz, max size xyz) in metres; every part rests on the ground
    "tool-case": ((0.5, 0.33, 0.15), (0.62, 0.42, 0.26)),
    "vacuum-pump": ((0.36, 0.16, 0.26), (0.46, 0.24, 0.34)),
    "recovery-machine": ((0.4, 0.24, 0.36), (0.5, 0.32, 0.46)),
    "nitrogen-kit": ((0.2, 0.2, 1.0), (0.26, 0.3, 1.15)),
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
    fits = all(a <= s <= b for a, s, b in zip(lo_lim, size, hi_lim)) and abs(lo.z) < 0.005
    applied = tuple(round(s, 4) for s in ob.scale) == (1.0, 1.0, 1.0)
    ok &= fits and applied
    report.append(f"{name:17s} size {size.x:.3f} x {size.y:.3f} x {size.z:.3f} m  base z {lo.z:+.4f}  tris {t:5d}  mats {len(ob.data.materials)}  {'OK' if fits else 'OUT OF RANGE'}")
report.append(f"total triangles {total} (budget {TRIANGLE_BUDGET})  {'OK' if total <= TRIANGLE_BUDGET else 'OVER'}")
ok &= total <= TRIANGLE_BUDGET
print("\n".join("[supply] " + r for r in report))
if not ok:
    raise SystemExit("[supply] validation failed")

# ---------------------------------------------------------------- export
os.makedirs(os.path.dirname(OUT), exist_ok=True)
bpy.ops.export_scene.gltf(filepath=OUT, export_format="GLB", export_apply=True, export_yup=True, export_texcoords=True, export_normals=True, export_materials="EXPORT", use_selection=False)
print(f"[supply] exported {OUT} ({os.path.getsize(OUT)} bytes)")

# ---------------------------------------------------------------- preview (EEVEE)
if PREVIEW_DIR:
    os.makedirs(PREVIEW_DIR, exist_ok=True)
    world = bpy.data.worlds.new("w")
    scene.world = world
    world.use_nodes = True
    world.node_tree.nodes["Background"].inputs["Color"].default_value = (*srgb("#cfd8de"), 1)
    world.node_tree.nodes["Background"].inputs["Strength"].default_value = 0.8
    bpy.ops.mesh.primitive_plane_add(size=8, location=(0, 0, 0))
    bpy.context.active_object.data.materials.append(material("ground", "#c9b48f", roughness=0.95))
    bpy.ops.mesh.primitive_cube_add(size=1, location=(0, 0, 0.48))
    unit = bpy.context.active_object
    unit.scale = (0.92, 0.92, 0.86)
    unit.data.materials.append(material("unit", "#e4e6e8", roughness=0.5))
    sun = bpy.data.objects.new("sun", bpy.data.lights.new("sun", "SUN"))
    sun.data.energy = 3.2
    sun.rotation_euler = (math.radians(50), 0, math.radians(35))
    scene.collection.objects.link(sun)
    cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam"))
    cam.data.lens = 40
    scene.collection.objects.link(cam)
    scene.camera = cam
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x, scene.render.resolution_y = 1280, 800
    scene.view_settings.view_transform = "AgX"
    for name, target, dist, az, el in (("supply-tools", (0.0, 0.9, 0.3), 3.6, math.pi - 0.35, 0.45), ("supply-pump-close", (-0.85, 1.3, 0.18), 1.3, math.pi - 0.5, 0.4)):
        t = Vector(target)
        cam.location = t + Vector((math.sin(az) * math.cos(el), -math.cos(az) * math.cos(el), math.sin(el))) * dist
        cam.rotation_euler = (t - cam.location).to_track_quat("-Z", "Y").to_euler()
        scene.render.filepath = os.path.join(PREVIEW_DIR, f"{name}.png")
        bpy.ops.render.render(write_still=True)
        print(f"[supply] rendered {scene.render.filepath}")
