"""Job-site service kit for HVAC Company Owner V3, authored in Blender and exported as GLB.

Run headless (see docs/art/ASSET_PIPELINE.md):
    blender -b --factory-startup --python tools/blender/jobsite_kit.py -- <out.glb> [preview_dir]

Builds three named parts in real-world metres (Blender Z-up; the glTF exporter writes Y-up):
  bag       soft-sided technician tool bag, EGO teal webbing and handles
  manifold  2-valve refrigerant gauge manifold hung on the unit's top edge, low/high dials facing
            the street; blue and red hoses to the suction and liquid service ports, yellow
            utility hose coiled on the ground
  cylinder  refrigerant recovery cylinder: grey body, yellow shoulder, valve guard, two valves
The kit is authored in the outdoor unit's frame: origin on the ground at the unit centre, +Y
toward the street (the unit's service face), +X away from the house wall. The game places it on
the unit, so the hose couplers land on the unit's service valves.
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
# Generous bevel plus one subdivision level: the pillowed silhouette of sewn ballistic nylon, not a hard case.
bevel(body, 0.06, 4)
soft = body.modifiers.new("subsurf", "SUBSURF")
soft.levels = soft.render_levels = 1
bag_parts.append(smooth(body, 50))
# Binding seams along the top edges and a teal webbing band around the bag.
for y in (-0.129, 0.129):
    bag_parts.append(smooth(bevel(prim(bpy.ops.mesh.primitive_cube_add, "seam", "nylon-edge", location=(0, y, 0.272), scale=(0.215, 0.008, 0.01), size=2), 0.004, 1), 60))


def rounded_ring(name, mat, hx, hy, radius, z0, z1, thickness=0.003, corner_segments=6):
    """Closed band around a rounded rectangle (outer half-extents hx, hy): webbing that hugs a body."""
    def outline(ox, oy, r):
        pts = []
        for cx, cy, a0 in ((ox - r, oy - r, 0), (-ox + r, oy - r, 0.5 * math.pi), (-ox + r, -oy + r, math.pi), (ox - r, -oy + r, 1.5 * math.pi)):
            for k in range(corner_segments + 1):
                a = a0 + 0.5 * math.pi * k / corner_segments
                pts.append((cx + r * math.cos(a), cy + r * math.sin(a)))
        return pts
    bm = bmesh.new()
    rings = []
    for ox, oy, r, z in ((hx, hy, radius, z0), (hx, hy, radius, z1), (hx - thickness, hy - thickness, radius - thickness, z1), (hx - thickness, hy - thickness, radius - thickness, z0)):
        rings.append([bm.verts.new((x, y, z)) for x, y in outline(ox, oy, r)])
    n = len(rings[0])
    for a, b in zip(rings, rings[1:] + rings[:1]):
        for i in range(n):
            j = (i + 1) % n
            bm.faces.new((a[i], a[j], b[j], b[i]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return smooth(obj_from_bmesh(name, bm, mat), 40)


# The body tapers toward the opening; at the band height (z 0.15-0.186) it is ~0.137 m half-deep.
bag_parts.append(rounded_ring("band", "teal", 0.233, 0.141, 0.065, 0.152, 0.186))
# Zipper track and pull along the opening.
bag_parts.append(prim(bpy.ops.mesh.primitive_cube_add, "zip", "zip", location=(0, 0, 0.279), scale=(0.2, 0.006, 0.003), size=2))
bag_parts.append(smooth(prim(bpy.ops.mesh.primitive_cylinder_add, "pull", "zip", location=(0.12, 0.012, 0.281), rotation=(math.pi / 2, 0, 0), vertices=10, radius=0.008, depth=0.012), 50))
# Front pocket with its own teal piping.
pocket = prim(bpy.ops.mesh.primitive_cube_add, "pocket", "nylon", location=(0, -0.152, 0.11), scale=(0.15, 0.025, 0.07), size=2)
bevel(pocket, 0.018, 2)
pocket.modifiers.new("subsurf", "SUBSURF").levels = 1
bag_parts.append(smooth(pocket, 50))
bag_parts.append(prim(bpy.ops.mesh.primitive_cube_add, "pocket-pipe", "teal", location=(0, -0.171, 0.171), scale=(0.138, 0.004, 0.005), size=2))
# Rubber base and two webbing handles arching over the opening.
bag_parts.append(smooth(bevel(prim(bpy.ops.mesh.primitive_cube_add, "base", "black", location=(0, 0, 0.012), scale=(0.236, 0.156, 0.012), size=2), 0.008, 2), 50))
for y in (-0.06, 0.06):
    bag_parts.append(tube(f"handle{y}", "teal", [(-0.12, y, 0.26), (-0.09, y, 0.36), (0.09, y, 0.36), (0.12, y, 0.26)], 0.009, resolution=6, bevel_res=1))
bag = join("bag", bag_parts)

# ---------------------------------------------------------------- staging frame: the condenser
# The kit is authored in the frame of the house's outdoor unit (see HouseBuilder / addCondenser):
# origin on the ground at the unit centre, +Y toward the street (the unit's service face), +X away
# from the house wall. The game places the kit on the unit, so these numbers line up exactly.
UNIT_W = 0.92                      # cabinet width (pad 1.32 m square, 0.1 m tall)
UNIT_TOP = 0.1 + 0.86              # top deck height
FACE_Y = UNIT_W / 2                # service face (panel in the middle, valves at the -X corner)
VALVE_PORT_Y = FACE_Y + 0.085      # service port tips point out of the face (toward the street)
VALVE_PORT_Z = 0.1 + 0.15
SUCTION_X = -UNIT_W * 0.39         # larger suction valve, nearest the wall
LIQUID_X = -UNIT_W * 0.28
MAN_POS = Vector((0.30, FACE_Y + 0.035, 0.80))   # manifold body centre, hung on the top edge

# ---------------------------------------------------------------- gauge manifold, hung on the unit's top edge
man_parts = []
# Upright body (0.17 wide x 0.045 deep x 0.05 tall), gauges above it facing the street, ports below.
man_parts.append(smooth(bevel(prim(bpy.ops.mesh.primitive_cube_add, "man-body", "alu", location=(0, 0, 0), scale=(0.085, 0.0225, 0.025), size=2), 0.006, 2), 45))
for side, mat in ((-1, "blue"), (1, "red")):  # low side (blue) toward the suction valve, high side (red)
    knob = lathe(f"knob{side}", mat, [(0.0, 0.0), (0.019, 0.0), (0.021, 0.004), (0.021, 0.026), (0.018, 0.03), (0.0, 0.03)], 20)
    knob.rotation_euler = (0, side * math.pi / 2, 0)
    knob.location = (side * 0.085, 0, 0)
    man_parts.append(knob)
    stem = lathe(f"stem{side}", "chrome", [(0.0, 0.0), (0.006, 0.0), (0.006, 0.012), (0.0, 0.012)], 10)
    stem.rotation_euler = (0, side * math.pi / 2, 0)
    stem.location = (side * 0.079, 0, 0)
    man_parts.append(stem)
ports = []
for x in (-0.05, 0.0, 0.05):  # low, utility, high: pointing down
    port = lathe(f"port{x}", "brass", [(0.0, 0.0), (0.008, 0.0), (0.008, 0.014), (0.006, 0.016), (0.006, 0.024), (0.0, 0.024)], 12)
    port.rotation_euler = (math.pi, 0, 0)
    port.location = (x, 0, -0.025)
    man_parts.append(port)
    ports.append(MAN_POS + Vector((x, 0, -0.049)))
for x, face in ((-0.048, "face-low"), (0.048, "face-high")):
    neck = lathe(f"neck{x}", "brass", [(0.0, 0.0), (0.006, 0.0), (0.006, 0.03), (0.0, 0.03)], 10)
    neck.location = (x, 0, 0.025)
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
    # Gauge built facing +Z, then stood up to face the street (+Y), centred above the body.
    # Rx(-90°) maps (x, y, z) to (x, z, -y); ZYX order applies the needle's in-plane angle first.
    for part in (case, bezel, dial, needle):
        spin = part.rotation_euler.z
        part.rotation_mode = "ZYX"
        part.rotation_euler = (-math.pi / 2, 0, spin)
        part.location = Vector((x, -0.01, 0.1)) + Vector((part.location.x, part.location.z, -part.location.y))
        man_parts.append(part)
# Hook up behind the gauges and over the top edge of the cabinet.
hook_x = 0.0
man_parts.append(tube("hook", "chrome", [(hook_x, -0.02, 0.02), (hook_x, -0.03, UNIT_TOP + 0.025 - MAN_POS.z), (hook_x, -0.07, UNIT_TOP + 0.03 - MAN_POS.z), (hook_x, -0.095, UNIT_TOP + 0.008 - MAN_POS.z)], 0.003, resolution=6, bevel_res=1))
manifold = join("manifold", man_parts)
manifold.location = MAN_POS

# Charging hoses: blue (low side) to the suction valve port, red (high side) to the liquid valve
# port, each sagging over the pad in front of the unit; the yellow utility hose drops off the pad
# into a loose coil beside the technician. Brass couplers seat on the service ports.
hose_parts = []
P = lambda x, y, z: Vector((x, y, z))
COUPLER = 0.026
routes = {  # each ends straight in front of its port so the coupler seats on the port tip
    "hose-blue": [ports[0], P(ports[0].x, 0.50, 0.62), P(0.18, 0.57, 0.30), P(-0.05, 0.64, 0.16), P(SUCTION_X + 0.03, 0.665, 0.215), P(SUCTION_X, 0.63, VALVE_PORT_Z), P(SUCTION_X, VALVE_PORT_Y + COUPLER, VALVE_PORT_Z)],
    "hose-red": [ports[2], P(ports[2].x, 0.52, 0.60), P(0.28, 0.62, 0.26), P(0.02, 0.70, 0.16), P(LIQUID_X + 0.06, 0.72, 0.22), P(LIQUID_X, 0.665, VALVE_PORT_Z), P(LIQUID_X, VALVE_PORT_Y + COUPLER, VALVE_PORT_Z)],
}
for i, (mat, pts) in enumerate(routes.items()):
    hose_parts.append(tube(f"hose-{i}", mat, [tuple(v) for v in pts], 0.0065, resolution=10, bevel_res=2))
    coupler = lathe(f"coupler-{i}", "brass", [(0.0, 0.0), (0.009, 0.0), (0.009, 0.022), (0.006, COUPLER), (0.0, COUPLER)], 12)
    coupler.rotation_euler = (math.pi / 2, 0, 0)  # pointing toward the unit, onto the port tip
    coupler.location = pts[-1]
    hose_parts.append(coupler)
yellow = [ports[1], P(ports[1].x + 0.01, 0.52, 0.55), P(0.36, 0.60, 0.20), P(0.40, 0.68, 0.115), P(0.43, 0.725, 0.06), P(0.47, 0.775, 0.0125), P(0.52, 0.82, 0.0095)]
cx, cy, r = 0.64, 0.96, 0.13
for k in range(1, 15):
    a = math.pi * 0.9 + (k / 14) * 2 * math.pi * 1.15
    rk = r * (1 - 0.3 * k / 14)
    yellow.append(P(cx + math.cos(a) * rk, cy + math.sin(a) * rk * 0.85, 0.0095))  # resting on the ground
hose_parts.append(tube("hose-yellow", "hose-yellow", [tuple(v) for v in yellow], 0.0065, resolution=8, bevel_res=2))
cap = lathe("coupler-y", "brass", [(0.0, 0.0), (0.009, 0.0), (0.009, 0.022), (0.006, 0.026), (0.0, 0.026)], 12)
cap.rotation_mode = "QUATERNION"
cap.rotation_quaternion = Vector((0, 0, 1)).rotation_difference((yellow[-1] - yellow[-2]).normalized())
cap.location = yellow[-1]
hose_parts.append(cap)
hoses = join("hoses", hose_parts)
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
cylinder.location = (1.05, 0.30, 0)         # beside the unit's open side (install jobs only)
bag.location = (1.12, 1.52, 0)              # set down behind the technician's right side, clear of his kneeling leg
bag.rotation_euler = (0, 0, math.radians(-12))

# ---------------------------------------------------------------- validation
def dims(ob):
    pts = [ob.matrix_world @ Vector(c) for c in ob.bound_box]
    lo = Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts)))
    hi = Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
    return lo, hi


def tris(ob):
    return sum(len(p.vertices) - 2 for p in ob.data.polygons)


report = []
EXPECT = {  # name: (min size xyz, max size xyz) in metres; every part reaches the ground (bag, cylinder, coiled hose)
    "bag": ((0.42, 0.28, 0.32), (0.52, 0.40, 0.40)),
    "manifold": ((0.9, 0.5, 0.9), (1.3, 0.85, 1.1)),
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
    # Stand-in condenser (not exported) so the staging reads in context.
    bpy.ops.mesh.primitive_cube_add(size=1, location=(0, 0, 0.05))
    pad = bpy.context.active_object
    pad.scale = (UNIT_W + 0.4, UNIT_W + 0.4, 0.1)
    pad.data.materials.append(material("pad", "#bdb8ae", roughness=0.9))
    bpy.ops.mesh.primitive_cube_add(size=1, location=(0, 0, 0.1 + 0.43))
    unit = bpy.context.active_object
    unit.scale = (UNIT_W, UNIT_W, 0.86)
    unit.data.materials.append(material("unit", "#e4e6e8", roughness=0.5))
    for vx in (SUCTION_X, LIQUID_X):
        bpy.ops.mesh.primitive_cylinder_add(radius=0.008, depth=0.035, location=(vx, VALVE_PORT_Y - 0.0175, VALVE_PORT_Z), rotation=(math.pi / 2, 0, 0))
        bpy.context.active_object.data.materials.append(M["brass"])
    for name, target, dist, az, el in (("kit-front", (0.3, 0.7, 0.45), 2.6, math.pi - 0.45, 0.42), ("kit-top", (0.3, 0.8, 0.2), 2.1, math.pi + 0.3, 1.0), ("valves-close", (-0.3, 0.6, 0.26), 0.55, math.pi - 0.6, 0.35)):
        t = Vector(target)
        cam.location = t + Vector((math.sin(az) * math.cos(el), -math.cos(az) * math.cos(el), math.sin(el))) * dist
        cam.rotation_euler = (t - cam.location).to_track_quat("-Z", "Y").to_euler()
        scene.render.filepath = os.path.join(PREVIEW_DIR, f"{name}.png")
        bpy.ops.render.render(write_still=True)
        print(f"[kit] rendered {scene.render.filepath}")
