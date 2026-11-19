import { Euler, Quaternion, Vector3 } from "three";

/**
 * Signed-distance shapes voxelized into small cubes (ported from odama.io's service scene):
 * a pushing hand, a pinching hand and a question mark.
 */

type Sdf = (x: number, y: number, z: number) => number;
type V3 = readonly [number, number, number];

const capsule =
  (a: V3, b: V3, r: number): Sdf =>
  (x, y, z) => {
    const px = x - a[0];
    const py = y - a[1];
    const pz = z - a[2];
    const bx = b[0] - a[0];
    const by = b[1] - a[1];
    const bz = b[2] - a[2];
    const h = Math.min(1, Math.max(0, (px * bx + py * by + pz * bz) / (bx * bx + by * by + bz * bz)));
    return Math.hypot(px - bx * h, py - by * h, pz - bz * h) - r;
  };

const roundBox =
  (c: V3, half: V3, r: number): Sdf =>
  (x, y, z) => {
    const qx = Math.abs(x - c[0]) - half[0] + r;
    const qy = Math.abs(y - c[1]) - half[1] + r;
    const qz = Math.abs(z - c[2]) - half[2] + r;
    return Math.hypot(Math.max(qx, 0), Math.max(qy, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qy, qz), 0) - r;
  };

const smoothUnion =
  (k: number, ...fns: Sdf[]): Sdf =>
  (x, y, z) => {
    let d = fns[0](x, y, z);
    for (let i = 1; i < fns.length; i++) {
      const e = fns[i](x, y, z);
      const h = Math.max(k - Math.abs(d - e), 0) / k;
      d = Math.min(d, e) - h * h * k * 0.25;
    }
    return d;
  };

const scaled =
  (s: number, f: Sdf): Sdf =>
  (x, y, z) =>
    f(x / s, y / s, z / s) * s;

const sphere =
  (c: V3, r: number): Sdf =>
  (x, y, z) =>
    Math.hypot(x - c[0], y - c[1], z - c[2]) - r;

const PUSH = smoothUnion(
  0.08,
  roundBox([-0.12, 0, 0], [0.11, 0.36, 0.29], 0.1),
  capsule([-0.12, 0.3, 0.21], [-0.15, 0.98, 0.22], 0.075),
  capsule([-0.12, 0.32, 0.07], [-0.15, 1.08, 0.07], 0.078),
  capsule([-0.12, 0.3, -0.07], [-0.15, 1.02, -0.07], 0.076),
  capsule([-0.12, 0.26, -0.21], [-0.14, 0.86, -0.22], 0.068),
  capsule([-0.14, -0.22, 0.29], [-0.12, 0.26, 0.33], 0.072),
  capsule([-0.16, -0.3, 0], [-0.46, -0.44, 0], 0.19),
  capsule([-0.46, -0.44, 0], [-1.5, -0.58, 0], 0.21),
);

const PINCH = smoothUnion(
  0.07,
  scaled(
    1.9,
    smoothUnion(
      0.05,
      roundBox([-0.45, 0, -0.04], [0.26, 0.22, 0.14], 0.11),
      capsule([-0.22, 0.14, -0.08], [-0.04, 0.3, -0.1], 0.07),
      capsule([-0.04, 0.3, -0.1], [0.14, 0.26, -0.1], 0.066),
      capsule([0.14, 0.26, -0.1], [0.22, 0.07, -0.06], 0.062),
      capsule([-0.42, -0.14, 0.1], [-0.08, -0.08, 0.12], 0.08),
      capsule([-0.08, -0.08, 0.12], [0.2, 0.02, 0.07], 0.07),
      capsule([-0.22, 0.04, -0.12], [-0.06, -0.04, -0.16], 0.066),
      capsule([-0.06, -0.04, -0.16], [-0.16, -0.12, -0.12], 0.062),
      capsule([-0.24, -0.06, -0.11], [-0.1, -0.14, -0.14], 0.062),
      capsule([-0.1, -0.14, -0.14], [-0.2, -0.2, -0.1], 0.058),
      capsule([-0.28, -0.15, -0.08], [-0.18, -0.24, -0.1], 0.056),
    ),
  ),
  capsule([-1.3, -0.03, -0.03], [-2, -0.12, 0], 0.22),
);

const ARC_C: V3 = [0, 0.38, 0];
const questionArc: Sdf = (x, y, z) => {
  const ox = x - ARC_C[0];
  const oy = y - ARC_C[1];
  const a = Math.atan2(oy, ox);
  if (a >= -0.87 && a <= 2.8) return Math.hypot(Math.hypot(ox, oy) - 0.4, z - ARC_C[2]) - 0.12;
  const end = (t: number) => Math.hypot(ox - 0.4 * Math.cos(t), oy - 0.4 * Math.sin(t), z - ARC_C[2]);
  return Math.min(end(-0.87), end(2.8)) - 0.12;
};

const QUESTION = smoothUnion(
  0.05,
  questionArc,
  capsule([0.257, 0.074, 0], [0.02, -0.14, 0], 0.12),
  capsule([0.02, -0.14, 0], [0.02, -0.36, 0], 0.12),
  sphere([0.02, -0.72, 0], 0.15),
);

export type HandName = "Push" | "Pinch";
export type ShapeName = HandName | "Question";

export interface HandSpec {
  grid: V3;
  centre: V3;
  pose: Euler;
  touch?: V3;
}

const HAND_SDF: Record<HandName, Sdf> = { Push: PUSH, Pinch: PINCH };

export const HANDS: Record<HandName, HandSpec> = {
  Push: { grid: [29, 33, 22], centre: [-0.86, 0.2, 0], pose: new Euler(-0.1, -0.3, 0, "XYZ") },
  Pinch: {
    grid: [44, 22, 14],
    centre: [-0.86, 0.1, 0],
    pose: new Euler(-0.15, -0.85, 0, "XYZ"),
    touch: [0.38, 0.04, 0.13],
  },
};

export const isHand = (name: ShapeName | null): name is HandName => name === "Push" || name === "Pinch";

/** Boxes as [minX, minY, minZ, maxX, maxY, maxZ] per voxel, centred on the origin. */
export interface VoxelSet {
  box: Float32Array;
  n: number;
  /** Per-voxel brightness (hands only): baked light from the SDF normal. */
  lit?: Float32Array;
}

function voxelize(sdf: Sdf, voxel: number, grid: V3, centre: V3 = [0, 0, 0]): VoxelSet {
  const [nx, ny, nz] = grid;
  const solid = new Uint8Array(nx * ny * nz);
  const idx = (x: number, y: number, z: number) => (z * ny + y) * nx + x;
  for (let z = 0; z < nz; z++)
    for (let y = 0; y < ny; y++)
      for (let x = 0; x < nx; x++)
        if (
          sdf(
            (x + 0.5 - nx / 2) * voxel + centre[0],
            (y + 0.5 - ny / 2) * voxel + centre[1],
            (z + 0.5 - nz / 2) * voxel + centre[2],
          ) < 0
        )
          solid[idx(x, y, z)] = 1;
  const at = (x: number, y: number, z: number) =>
    x >= 0 && y >= 0 && z >= 0 && x < nx && y < ny && z < nz && solid[idx(x, y, z)] === 1;
  const keys: number[] = [];
  for (let y = 0; y < ny; y++)
    for (let x = 0; x < nx; x++)
      for (let z = 0; z < nz; z++) {
        if (!at(x, y, z)) continue;
        const inner =
          at(x - 1, y, z) && at(x + 1, y, z) && at(x, y - 1, z) && at(x, y + 1, z) && at(x, y, z - 1) && at(x, y, z + 1);
        if (!inner) keys.push(x, y, z);
      }
  const n = keys.length / 3;
  const box = new Float32Array(6 * n);
  const ox = -(nx * voxel) / 2;
  const oy = -(ny * voxel) / 2;
  const oz = -(nz * voxel) / 2;
  for (let i = 0; i < n; i++) {
    const [x, y, z] = [keys[3 * i], keys[3 * i + 1], keys[3 * i + 2]];
    box[6 * i] = ox + x * voxel;
    box[6 * i + 1] = oy + y * voxel;
    box[6 * i + 2] = oz + z * voxel;
    box[6 * i + 3] = ox + (x + 1) * voxel;
    box[6 * i + 4] = oy + (y + 1) * voxel;
    box[6 * i + 5] = oz + (z + 1) * voxel;
  }
  return { box, n };
}

const LIGHT = new Vector3(-0.4, 0.6, 0.7).normalize();
const HAND_VOXEL = 0.0625;
const QUESTION_VOXEL = 1 / 24;

export function buildShapes(): Map<ShapeName, VoxelSet> {
  const out = new Map<ShapeName, VoxelSet>();
  for (const name of ["Push", "Pinch"] as const) {
    const spec = HANDS[name];
    const sdf = HAND_SDF[name];
    const set = voxelize(sdf, HAND_VOXEL, spec.grid, spec.centre);
    const light = LIGHT.clone().applyQuaternion(new Quaternion().setFromEuler(spec.pose).invert());
    const lit = new Float32Array(set.n);
    const h = HAND_VOXEL / 2;
    const normal = new Vector3();
    for (let i = 0; i < set.n; i++) {
      const b = 6 * i;
      const x = (set.box[b] + set.box[b + 3]) / 2 + spec.centre[0];
      const y = (set.box[b + 1] + set.box[b + 4]) / 2 + spec.centre[1];
      const z = (set.box[b + 2] + set.box[b + 5]) / 2 + spec.centre[2];
      normal
        .set(sdf(x + h, y, z) - sdf(x - h, y, z), sdf(x, y + h, z) - sdf(x, y - h, z), sdf(x, y, z + h) - sdf(x, y, z - h))
        .normalize();
      lit[i] = 0.3 + 0.7 * Math.max(0, normal.dot(light));
    }
    out.set(name, { ...set, lit });
  }
  out.set("Question", voxelize(QUESTION, QUESTION_VOXEL, [56, 60, 24]));
  return out;
}
