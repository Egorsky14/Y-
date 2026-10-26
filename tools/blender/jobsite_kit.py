"""Job-site service kit for HVAC Company Owner V3, authored in Blender and exported as GLB.

Run headless (see docs/art/ASSET_PIPELINE.md):
    blender -b --factory-startup --python tools/blender/jobsite_kit.py -- <out.glb> [preview_dir]

Builds three named parts in real-world metres (Blender Z-up; the glTF exporter writes Y-up):
  bag       soft-sided technician tool bag, EGO teal webbing and handles
  manifold  2-valve refrigerant gauge manifold with low/high dials, knurled knobs and three
            charging hoses (blue, yellow, red) coiled on the ground with brass couplers
  cylinder  refrigerant recovery cylinder: grey body, yellow shoulder, valve guard, two valves
The kit origin is the ground point the game stages it on; +X runs along the house wall.
Validates dimensions, transforms and triangle budget, then exports and optionally renders
close-up previews with EEVEE.
"""
import math
import os
import sys

import bmesh
import bpy
import numpy as np
from mathutils import Vector

argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
OUT = os.path.abspath(argv[0] if argv else "jobsite-kit.glb")
PREVIEW_DIR = os.path.abspath(argv[1]) if len(argv) > 1 else None
TRIANGLE_BUDGET = 16000

# ---------------------------------------------------------------- scene and materials
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
scene.unit_settings.system = "METRIC"


def material(name, color, roughness=0.6, metallic=0.0, emission=None, image=None):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    bsdf = m.node_tree.nodes["Principled BSDF"]
    bsdf.inputs["Base Color"].default_value = (*srgb(color), 1.0)
    bsdf.inputs["Roughness"].default_value = roughness
    bsdf.inputs["Metallic"].default_value = metallic
    if emission:
        bsdf.inputs["Emission Color"].default_value = (*srgb(emission[0]), 1.0)
        bsdf.inputs["Emission Strength"].default_value = emission[1]
    if image is not None:
        tex = m.node_tree.nodes.new("ShaderNodeTexImage")
        tex.image = image
        m.node_tree.links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
    return m


def srgb(hex_color):
    """Hex sRGB to linear RGB, the space Blender's colour sockets hold."""
    h = hex_color.lstrip("#")
    c = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return tuple(x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c)


def dial_face(name, arc_color):
    """256 px gauge face: white dial, black major/minor ticks, coloured pressure arc, hub."""
    n = 256
    img = bpy.data.images.new(name, n, n, alpha=False)
    y, x = np.mgrid[0:n, 0:n]
    cx = cy = (n - 1) / 2
    r = np.hypot(x - cx, y - cy) / (n / 2)
    a = np.arctan2(y - cy, x - cx)  # image v runs up
    # Dial sweeps 270 degrees, from lower-left clockwise to lower-right.
    sweep = np.mod(np.pi * 1.25 - a, 2 * np.pi)
    on_scale = sweep <= np.pi * 1.5
    rgb = np.ones((n, n, 3)) * np.array([0.96, 0.96, 0.94])
    arc = (r > 0.70) & (r < 0.80) & on_scale
    rgb[arc] = srgb(arc_color)
    t = sweep / (np.pi * 1.5)
    major = (np.abs(np.mod(t * 10 + 0.5, 1) - 0.5) < 0.035) & (r > 0.62) & (r < 0.86) & on_scale
    minor = (np.abs(np.mod(t * 50 + 0.5, 1) - 0.5) < 0.09) & (r > 0.74) & (r < 0.86) & on_scale
    rgb[major | minor] = (0.04, 0.04, 0.04)
    rgb[r < 0.09] = (0.08, 0.08, 0.08)
    rgb[r > 0.97] = (0.1, 0.1, 0.1)
    pixels = np.concatenate([rgb, np.ones((n, n, 1))], axis=2).astype(np.float32)
    img.pixels.foreach_set(pixels.ravel())
    img.pack()
    return img


M = {
    "nylon": material("bag-nylon", "#1c1e21", roughness=0.88),
    "nylon-edge": material("bag-binding", "#101113", roughness=0.8),
    "teal": material("ego-teal", "#19d3c5", roughness=0.55, emission=("#19d3c5", 0.15)),
    "zip": material("zip-metal", "#9aa0a6", roughness=0.35, metallic=1.0),
    "alu": material("anodized-aluminum", "#b9bfc5", roughness=0.32, metallic=1.0),
    "chrome": material("chrome", "#e6e8ea", roughness=0.12, metallic=1.0),
    "brass": material("brass", "#c9a24a", roughness=0.3, metallic=1.0),
    "blue": material("knob-blue", "#2c6fd1", roughness=0.45),
    "red": material("knob-red", "#d13b3b", roughness=0.45),
    "hose-blue": material("hose-blue", "#2a5fb8", roughness=0.55),
    "hose-yellow": material("hose-yellow", "#e2c23a", roughness=0.55),
    "hose-red": material("hose-red", "#c43434", roughness=0.55),
    "black": material("black-rubber", "#121314", roughness=0.7),
    "cyl-grey": material("cylinder-grey", "#8c949c", roughness=0.42, metallic=0.55),
    "cyl-yellow": material("cylinder-yellow", "#e8b923", roughness=0.45, metallic=0.3),
    "face-low": material("dial-low", "#ffffff", roughness=0.4, image=dial_face("dial-low", "#2c6fd1")),
    "face-high": material("dial-high", "#ffffff", roughness=0.4, image=dial_face("dial-high", "#d13b3b")),
}


# ---------------------------------------------------------------- helpers
def obj_from_bmesh(name, bm, mat):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new(name, me)
    scene.collection.objects.link(ob)
    me.materials.append(M[mat])
    return ob


def prim(op, name, mat, location=(0, 0, 0), rotation=(0, 0, 0), scale=(1, 1, 1), **kw):
    op(location=location, rotation=rotation, **kw)
    ob = bpy.context.active_object
    ob.name = name
    ob.scale = scale
    ob.data.materials.clear()
    ob.data.materials.append(M[mat])
    return ob


def bevel(ob, width, segments=2, limit=True):
    mod = ob.modifiers.new("bevel", "BEVEL")
    mod.width = width
    mod.segments = segments
    mod.limit_method = "ANGLE" if limit else "NONE"
    mod.harden_normals = True
    return ob


def smooth(ob, angle=40):
    with bpy.context.temp_override(active_object=ob, selected_objects=[ob], selected_editable_objects=[ob]):
        bpy.ops.object.shade_auto_smooth(angle=math.radians(angle))
    return ob


def tube(name, mat, points, radius, resolution=6, bevel_res=2):
    """Polyline swept with a round profile (hoses, handles), converted to mesh."""
    cu = bpy.data.curves.new(name, "CURVE")
    cu.dimensions = "3D"
    cu.bevel_depth = radius
    cu.bevel_resolution = bevel_res
    cu.use_fill_caps = True
    sp = cu.splines.new("BEZIER")
    sp.bezier_points.add(len(points) - 1)
    for bp, p in zip(sp.bezier_points, points):
        bp.co = p
        bp.handle_left_type = bp.handle_right_type = "AUTO"
    cu.resolution_u = resolution
    ob = bpy.data.objects.new(name, cu)
    scene.collection.objects.link(ob)
    cu.materials.append(M[mat])
    with bpy.context.temp_override(active_object=ob, selected_objects=[ob], selected_editable_objects=[ob]):
        bpy.ops.object.convert(target="MESH")
    return bpy.data.objects[name]


def lathe(name, mat, profile, segments=24, caps=True):
    """Revolves an (r, z) profile around Z: cylinders, valves, bezels. caps=False leaves open rings (bezels)."""
    bm = bmesh.new()
    rings = []
    for r, z in profile:
        ring = [bm.verts.new((r * math.cos(2 * math.pi * i / segments), r * math.sin(2 * math.pi * i / segments), z)) for i in range(segments)]
        rings.append(ring)
    for a, b in zip(rings, rings[1:]):
        for i in range(segments):
            j = (i + 1) % segments
            bm.faces.new((a[i], a[j], b[j], b[i]))
    if caps and profile[0][0] > 0:
        bm.faces.new(list(reversed(rings[0])))
    if caps and profile[-1][0] > 0:
        bm.faces.new(rings[-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    ob = obj_from_bmesh(name, bm, mat)
    return smooth(ob, 35)


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
        # Bake the full transform so every part has its origin at the kit ground point.
        bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    return ob


# ---------------------------------------------------------------- tool bag (0.46 x 0.30 x 0.28 m)
bag_parts = []
body = prim(bpy.ops.mesh.primitive_cube_add, "bag-body", "nylon", location=(0, 0, 0.14), scale=(0.23, 0.15, 0.13), size=1 * 2)
bm = bmesh.new()
bm.from_mesh(body.data)
for v in bm.verts:  # soft top: the opening is a little narrower than the base
    if v.co.z > 0:
        v.co.y *= 0.86
bm.to_mesh(body.data)
bm.free()
bag_parts.append(smooth(bevel(body, 0.06, 4), 50))  # generous radius: soft ballistic nylon, not a hard case
# Binding seams along the top edges and a teal webbing band around the bag.
for y in (-0.129, 0.129):
    bag_parts.append(smooth(bevel(prim(bpy.ops.mesh.primitive_cube_add, "seam", "nylon-edge", location=(0, y, 0.272), scale=(0.215, 0.008, 0.01), size=2), 0.004, 1), 60))
band = prim(bpy.ops.mesh.primitive_cube_add, "band", "teal", location=(0, 0, 0.17), scale=(0.234, 0.153, 0.018), size=2)
bm = bmesh.new()
bm.from_mesh(band.data)
bmesh.ops.delete(bm, geom=[f for f in bm.faces if abs(f.normal.z) > 0.9], context="FACES")
bm.to_mesh(band.data)
bm.free()
bag_parts.append(band)
# Zipper track and pull along the opening.
bag_parts.append(prim(bpy.ops.mesh.primitive_cube_add, "zip", "zip", location=(0, 0, 0.279), scale=(0.2, 0.006, 0.003), size=2))
bag_parts.append(smooth(prim(bpy.ops.mesh.primitive_cylinder_add, "pull", "zip", location=(0.12, 0.012, 0.281), rotation=(math.pi / 2, 0, 0), vertices=10, radius=0.008, depth=0.012), 50))
# Front pocket with its own teal piping.
pocket = prim(bpy.ops.mesh.primitive_cube_add, "pocket", "nylon", location=(0, -0.152, 0.11), scale=(0.15, 0.025, 0.07), size=2)
bag_parts.append(smooth(bevel(pocket, 0.018, 2), 50))
bag_parts.append(prim(bpy.ops.mesh.primitive_cube_add, "pocket-pipe", "teal", location=(0, -0.176, 0.176), scale=(0.142, 0.004, 0.005), size=2))
# Rubber base and two webbing handles arching over the opening.
bag_parts.append(smooth(bevel(prim(bpy.ops.mesh.primitive_cube_add, "base", "black", location=(0, 0, 0.012), scale=(0.236, 0.156, 0.012), size=2), 0.008, 2), 50))
for y in (-0.06, 0.06):
    bag_parts.append(tube(f"handle{y}", "teal", [(-0.12, y, 0.26), (-0.09, y, 0.36), (0.09, y, 0.36), (0.12, y, 0.26)], 0.009, resolution=6, bevel_res=1))
bag = join("bag", bag_parts)

# ---------------------------------------------------------------- gauge manifold, lying on its back on the ground
man_parts = []
# Body block (0.17 x 0.05 x 0.045) with hose ports along the bottom edge (-Y side when lying).
man_parts.append(smooth(bevel(prim(bpy.ops.mesh.primitive_cube_add, "man-body", "alu", location=(0, 0, 0.025), scale=(0.085, 0.025, 0.0225), size=2), 0.006, 2), 45))
# Knurled valve knobs on both ends, along X.
for side, mat in ((-1, "blue"), (1, "red")):
    knob = lathe(f"knob{side}", mat, [(0.0, 0.0), (0.019, 0.0), (0.021, 0.004), (0.021, 0.026), (0.018, 0.03), (0.0, 0.03)], 20)
    knob.rotation_euler = (0, side * math.pi / 2, 0)
    knob.location = (side * 0.085, 0, 0.025)
    man_parts.append(knob)
    stem = lathe(f"stem{side}", "chrome", [(0.0, 0.0), (0.006, 0.0), (0.006, 0.012), (0.0, 0.012)], 10)
    stem.rotation_euler = (0, side * math.pi / 2, 0)
    stem.location = (side * 0.079, 0, 0.025)
    man_parts.append(stem)
# Three brass ports along the -Y face (low, utility, high).
ports = []
for x in (-0.05, 0.0, 0.05):
    port = lathe(f"port{x}", "brass", [(0.0, 0.0), (0.008, 0.0), (0.008, 0.014), (0.006, 0.016), (0.006, 0.024), (0.0, 0.024)], 12)
    port.rotation_euler = (math.pi / 2, 0, 0)
    port.location = (x, -0.024, 0.025)
    man_parts.append(port)
    ports.append(Vector((x, -0.048, 0.025)))
# Two dials on short necks, faces up.
for x, face in ((-0.048, "face-low"), (0.048, "face-high")):
    tilt = 0.0  # faces up: legible from the game camera; one pivot keeps the needle on the face
    neck = lathe(f"neck{x}", "brass", [(0.0, 0.0), (0.006, 0.0), (0.006, 0.02), (0.0, 0.02)], 10)
    neck.location = (x, 0.004, 0.045)
    man_parts.append(neck)
    case = lathe(f"case{x}", "black", [(0.0, 0.0), (0.04, 0.0), (0.043, 0.004), (0.043, 0.028), (0.0, 0.028)], 32)
    bezel = lathe(f"bezel{x}", "chrome", [(0.039, 0.024), (0.045, 0.026), (0.045, 0.032), (0.039, 0.034), (0.037, 0.03)], 32, caps=False)
    bm = bmesh.new()
    bmesh.ops.create_circle(bm, cap_ends=True, radius=0.038, segments=32)
    uv = bm.loops.layers.uv.new("UVMap")
    for f in bm.faces:
        for loop in f.loops:
            loop[uv].uv = (loop.vert.co.x / 0.076 + 0.5, loop.vert.co.y / 0.076 + 0.5)
    bmesh.ops.translate(bm, verts=bm.verts, vec=(0, 0, 0.029))
    dial = obj_from_bmesh(f"dial{x}", bm, face)
    needle = prim(bpy.ops.mesh.primitive_cube_add, f"needle{x}", "black", location=(0.012, 0.006, 0.0305), rotation=(0, 0, math.radians(35 if x < 0 else -25)), scale=(0.022, 0.0015, 0.0008), size=2)
    for part in (case, bezel, dial, needle):
        part.location = Vector((x, 0.004, 0.062)) + part.location
        part.rotation_euler = (tilt, 0, part.rotation_euler.z)
        man_parts.append(part)
# Hanging hook on top.
man_parts.append(tube("hook", "chrome", [(0, 0.024, 0.035), (0, 0.05, 0.05), (0, 0.075, 0.04), (0, 0.07, 0.022)], 0.003, resolution=4, bevel_res=1))
manifold = join("manifold", man_parts)

# Charging hoses: from each port, a smooth bend down to the ground, then a loose coil of its own
# (three coils side by side, so no hose passes through another), coupler at the end.
hose_parts = []
for i, (p, mat) in enumerate(zip(ports, ("hose-blue", "hose-yellow", "hose-red"))):
    r = 0.085
    cx, cy = (i - 1) * 0.2, -0.27
    top = Vector((cx, cy + r * 0.8, 0.0075))
    pts = [p, p + Vector((0, -0.022, -0.004)), p.lerp(top, 0.45) + Vector((0, 0, -0.005)), top]
    pts[2].z = max(pts[2].z, 0.012)
    turns = 0.85
    for k in range(1, 10):
        a = math.pi / 2 + (k / 9) * 2 * math.pi * turns * (1 if i != 0 else -1)
        rk = r * (1 - 0.18 * k / 9)  # slight spiral so the coil never overlaps itself
        pts.append(Vector((cx + math.cos(a) * rk, cy + math.sin(a) * rk * 0.8, 0.0075)))
    hose = tube(f"hose{i}", mat, [tuple(v) for v in pts], 0.0065, resolution=8, bevel_res=2)
    hose_parts.append(hose)
    end = pts[-1]
    prev = pts[-2]
    d = (end - prev).normalized()
    coupler = lathe(f"coupler{i}", "brass", [(0.0, 0.0), (0.009, 0.0), (0.009, 0.022), (0.006, 0.026), (0.0, 0.026)], 12)
    coupler.rotation_mode = "QUATERNION"
    coupler.rotation_quaternion = Vector((0, 0, 1)).rotation_difference(d)
    coupler.location = end
    hose_parts.append(coupler)
hoses = join("hoses", hose_parts)
for ob in (manifold, hoses):  # lay the manifold set beside the bag
    ob.location = (0.55, 0.1, 0)
with bpy.context.temp_override(active_object=manifold, selected_objects=[manifold, hoses], selected_editable_objects=[manifold, hoses]):
    bpy.ops.object.join()
manifold.name = "manifold"

# ---------------------------------------------------------------- recovery cylinder (30 lb class: 0.30 m dia x 0.47 m)
cyl_parts = []
R = 0.15
cyl_parts.append(lathe("foot", "cyl-grey", [(R * 0.86, 0.0), (R * 0.9, 0.0), (R * 0.9, 0.035), (R * 0.86, 0.035)], 32))
cyl_parts.append(lathe("shell", "cyl-grey", [(0.0, 0.03), (R * 0.7, 0.032), (R * 0.95, 0.045), (R, 0.07), (R, 0.31)], 36))
cyl_parts.append(lathe("shoulder", "cyl-yellow", [(R, 0.31), (R, 0.34), (R * 0.95, 0.37), (R * 0.72, 0.395), (R * 0.3, 0.405), (0.0, 0.407)], 36))
cyl_parts.append(lathe("collar", "cyl-yellow", [(R * 0.62, 0.39), (R * 0.68, 0.39), (R * 0.68, 0.47), (R * 0.62, 0.47)], 24))
for side, mat in ((-1, "blue"), (1, "red")):
    v = lathe(f"valve{side}", "brass", [(0.0, 0.0), (0.012, 0.0), (0.012, 0.04), (0.0, 0.04)], 12)
    v.location = (side * 0.03, 0, 0.405)
    wheel = lathe(f"wheel{side}", mat, [(0.004, 0.0), (0.022, 0.0), (0.022, 0.01), (0.004, 0.01)], 16)
    wheel.location = (side * 0.03, 0, 0.445)
    cyl_parts += [v, wheel]
cylinder = join("cylinder", cyl_parts)
cylinder.location = (-0.5, 0.1, 0)
bag.location = (0, 0, 0)

# ---------------------------------------------------------------- validation
def dims(ob):
    pts = [ob.matrix_world @ Vector(c) for c in ob.bound_box]
    lo = Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts)))
    hi = Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
    return lo, hi


def tris(ob):
    return sum(len(p.vertices) - 2 for p in ob.data.polygons)


report = []
EXPECT = {  # name: (min size xyz, max size xyz) in metres, and the parts must sit on the ground
    "bag": ((0.42, 0.28, 0.32), (0.52, 0.40, 0.40)),
    "manifold": ((0.3, 0.3, 0.06), (0.65, 0.65, 0.15)),
    "cylinder": ((0.28, 0.28, 0.44), (0.33, 0.33, 0.5)),
}
ok = True
total = 0
for name, (lo_lim, hi_lim) in EXPECT.items():
    ob = bpy.data.objects[name]
    lo, hi = dims(ob)
    size = hi - lo
    t = tris(ob)
    total += t
    fits = all(a <= s <= b for a, s, b in zip(lo_lim, size, hi_lim)) and abs(lo.z) < 0.005
    applied = tuple(round(s, 4) for s in ob.scale) == (1.0, 1.0, 1.0)
    ok &= fits and applied
    report.append(f"{name:9s} size {size.x:.3f} x {size.y:.3f} x {size.z:.3f} m  base z {lo.z:+.4f}  tris {t:5d}  mats {len(ob.data.materials)}  scale-applied {applied}  {'OK' if fits else 'OUT OF RANGE'}")
report.append(f"total triangles {total} (budget {TRIANGLE_BUDGET})  {'OK' if total <= TRIANGLE_BUDGET else 'OVER'}")
ok &= total <= TRIANGLE_BUDGET
print("\n".join("[kit] " + r for r in report))
if not ok:
    raise SystemExit("[kit] validation failed")

# ---------------------------------------------------------------- export
os.makedirs(os.path.dirname(OUT), exist_ok=True)
bpy.ops.export_scene.gltf(filepath=OUT, export_format="GLB", export_apply=True, export_yup=True, export_texcoords=True, export_normals=True, export_materials="EXPORT", export_image_format="AUTO", use_selection=False)
print(f"[kit] exported {OUT} ({os.path.getsize(OUT)} bytes)")

# ---------------------------------------------------------------- close-up previews (EEVEE)
if PREVIEW_DIR:
    os.makedirs(PREVIEW_DIR, exist_ok=True)
    world = bpy.data.worlds.new("w")
    scene.world = world
    world.use_nodes = True
    world.node_tree.nodes["Background"].inputs["Color"].default_value = (*srgb("#cfd8de"), 1)
    world.node_tree.nodes["Background"].inputs["Strength"].default_value = 0.8
    bpy.ops.mesh.primitive_plane_add(size=6, location=(0, 0, 0))
    ground = bpy.context.active_object
    ground.data.materials.append(material("ground", "#c9b48f", roughness=0.95))
    sun = bpy.data.objects.new("sun", bpy.data.lights.new("sun", "SUN"))
    sun.data.energy = 3.2
    sun.data.angle = math.radians(2)
    sun.rotation_euler = (math.radians(50), 0, math.radians(35))
    scene.collection.objects.link(sun)
    cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam"))
    cam.data.lens = 50
    scene.collection.objects.link(cam)
    scene.camera = cam
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x, scene.render.resolution_y = 1280, 800
    scene.view_settings.view_transform = "AgX"
    for name, target, dist, az, el in (("kit-front", (0.05, -0.05, 0.12), 1.9, -0.35, 0.42), ("kit-top", (0.3, -0.05, 0.03), 1.25, 0.25, 1.05), ("manifold-close", (0.55, 0.08, 0.06), 0.55, -0.3, 0.75)):
        t = Vector(target)
        cam.location = t + Vector((math.sin(az) * math.cos(el), -math.cos(az) * math.cos(el), math.sin(el))) * dist
        cam.rotation_euler = (t - cam.location).to_track_quat("-Z", "Y").to_euler()
        scene.render.filepath = os.path.join(PREVIEW_DIR, f"{name}.png")
        bpy.ops.render.render(write_still=True)
        print(f"[kit] rendered {scene.render.filepath}")
