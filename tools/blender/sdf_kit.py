"""Signed-distance primitives and a surface-nets mesher, shared by the character's hard parts (boots, cap)."""
import numpy as np


class Ellipsoid:
    def __init__(self, c, r, bone=None, rot=None):
        self.c = np.asarray(c, float)
        self.r = np.asarray(r, float)
        self.bone = bone
        self.rot = rot

    def __call__(self, p):
        q = p - self.c
        if self.rot is not None:
            q = q @ self.rot
        k0 = np.linalg.norm(q / self.r, axis=1)
        k1 = np.linalg.norm(q / (self.r * self.r), axis=1)
        return k0 * (k0 - 1.0) / np.maximum(k1, 1e-9)


class Cone:
    """Round cone (capsule with radius r1 at a, r2 at b)."""

    def __init__(self, a, b, r1, r2, bone=None):
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


def smin(a, b, k):
    h = np.clip(0.5 + 0.5 * (b - a) / k, 0.0, 1.0)
    return b * (1 - h) + a * h - k * h * (1 - h)


def smax(a, b, k):
    return -smin(-a, -b, k)


class Shape:
    """A smooth union of primitives, each with its own blend radius against what came before."""

    def __init__(self, k=0.03):
        self.items = []
        self.k = k

    def add(self, prim, k=None):
        self.items.append((prim, self.k if k is None else k))
        return prim

    def __call__(self, p):
        d = None
        for prim, k in self.items:
            di = prim(p)
            d = di if d is None else smin(d, di, k)
        return d


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
    sgn = d < 0
    for axis in range(3):
        o = [0, 0, 0]
        o[axis] = 1
        a_ = sgn[: nx - o[0], : ny - o[1], : nz - o[2]]
        b_ = sgn[o[0]:, o[1]:, o[2]:]
        diff = a_ != b_
        u, w = [ax for ax in range(3) if ax != axis]
        e = np.argwhere(diff)
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
