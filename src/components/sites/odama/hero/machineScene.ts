import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";

/**
 * The Odama machine: renders /sites/odama/device/inquiry-device-5.glb and reproduces the
 * source's hero choreography (values read from odama.io's device scene):
 *  - camera fov 28, AgX tone mapping, exposure 1
 *  - rest yaw -0.42 rad, pointer adds 0.5*x yaw and -0.22*y pitch, faded out by smoothstep(0,.5,p)
 *  - spin = easeInOutCubic(p) * 2PI
 *  - camera lerps from an orbit pose (elevation 0.3 rad) to face the LCD by p^2
 */

export type MachineKey = "prev" | "next" | "select";

export interface MachineProject {
  name: string;
  marquee: string;
  video: string;
}

interface KeyRig {
  node: THREE.Group;
  rest: THREE.Vector3;
  axis: THREE.Vector3;
  depth: number;
  pressed: boolean;
  meshes: THREE.Object3D[];
}

interface Panel {
  center: THREE.Vector3;
  normal: THREE.Vector3;
  up: THREE.Vector3;
  right: THREE.Vector3;
  w: number;
  h: number;
}

const FOV = 28;
const REST_YAW = -0.42;
const DRACO_PATH = "/sites/odama/draco/";
const GLB_PATH = "/sites/odama/device/inquiry-device-5.glb";

const smoothstep = (a: number, b: number, v: number) => {
  const t = THREE.MathUtils.clamp((v - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
const easeInOutCubic = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const damp = THREE.MathUtils.damp;
// GLTFLoader sanitises node names; the original Blender names live in userData.name.
const nameOf = (o: THREE.Object3D): string => (typeof o.userData.name === "string" ? o.userData.name : o.name);

export class MachineScene {
  readonly canvas: HTMLCanvasElement;
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(FOV, 1, 0.5, 200);
  private pivot = new THREE.Group(); // rotates (yaw / pitch)
  private inner = new THREE.Group(); // device recentred on its bounding box
  private shadow: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial> | null = null;
  private envTarget: THREE.WebGLRenderTarget | null = null;
  private raycaster = new THREE.Raycaster();
  private clock = new THREE.Clock();
  private frame = 0;
  private disposed = false;
  private visible = true;

  private size = new THREE.Vector3(1, 1, 1);
  private fullWidth = 1;
  private panel: Panel | null = null;
  private keys: Partial<Record<MachineKey, KeyRig>> = {};

  private lcdMaterial: THREE.MeshBasicMaterial | null = null;
  private marquee: { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D; texture: THREE.CanvasTexture; offset: number; text: string; dots: HTMLCanvasElement } | null = null;
  private videoTextures = new Map<HTMLVideoElement, THREE.VideoTexture>();
  private currentVideo: HTMLVideoElement | null = null;

  // animated state
  private scroll = 0; // target progress 0..1
  private p = 0; // damped progress
  private pointer = { x: 0, y: 0, active: false };
  private mx = 0;
  private my = 0;
  private entrance = 0;
  private still: boolean;
  private reduced: boolean;
  private time = 0;

  private tmpPos = new THREE.Vector3();
  private tmpTgt = new THREE.Vector3();
  private tmpUp = new THREE.Vector3();

  onReady?: () => void;
  onProgress?: (ratio: number) => void;

  constructor(canvas: HTMLCanvasElement, opts: { still: boolean; reduced: boolean }) {
    this.canvas = canvas;
    this.still = opts.still;
    this.reduced = opts.reduced;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.AgXToneMapping;
    this.renderer.toneMappingExposure = 1;
    this.renderer.setClearColor(0x000000, 0);

    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.envTarget = pmrem.fromScene(new RoomEnvironment(), 0.04);
    this.scene.environment = this.envTarget.texture;
    this.scene.environmentIntensity = 0.9;
    pmrem.dispose();

    const key = new THREE.DirectionalLight(0xffffff, 1.4);
    key.position.set(-8, 14, 12);
    this.scene.add(key, new THREE.AmbientLight(0xffffff, 0.25));

    this.scene.add(this.pivot);
    this.pivot.add(this.inner);
    this.resize();
  }

  async load(): Promise<void> {
    const draco = new DRACOLoader().setDecoderPath(DRACO_PATH);
    const loader = new GLTFLoader().setDRACOLoader(draco);
    const gltf = await loader.loadAsync(GLB_PATH, (e) => {
      if (e.total) this.onProgress?.(e.loaded / e.total);
    });
    draco.dispose();
    if (this.disposed) return;
    this.prepare(gltf.scene);
    this.onReady?.();
    this.loop();
  }

  private prepare(root: THREE.Object3D) {
    const find = (re: RegExp) => {
      let hit: THREE.Object3D | undefined;
      root.traverse((o) => {
        if (!hit && re.test(nameOf(o))) hit = o;
      });
      return hit;
    };
    const findAll = (re: RegExp) => {
      const out: THREE.Object3D[] = [];
      root.traverse((o) => {
        if (re.test(nameOf(o))) out.push(o);
      });
      return out;
    };

    // The source keeps the model in centimetres (camera sits at z=26).
    find(/^Units/)?.scale.setScalar(1);
    root.updateMatrixWorld(true);

    const box = new THREE.Box3().setFromObject(root);
    const center = box.getCenter(new THREE.Vector3());
    const base = find(/^WEB \/ Base Hardware$/);
    const bodyBox = base ? new THREE.Box3().setFromObject(base) : box.clone();
    const cube = find(/^Cube/);
    if (cube) bodyBox.union(new THREE.Box3().setFromObject(cube));
    bodyBox.getSize(this.size);
    this.fullWidth = this.size.x;
    const bodyCenter = bodyBox.getCenter(new THREE.Vector3());
    center.copy(bodyCenter);
    // Centre horizontally on the front fascia so the screen sits mid-frame.
    const fascia = find(/^WEB \/ Front fascia/);
    if (fascia) {
      const fasciaBox = new THREE.Box3().setFromObject(fascia);
      center.x = (fasciaBox.min.x + fasciaBox.max.x) / 2;
      this.fullWidth = Math.max(this.fullWidth, fasciaBox.max.x - fasciaBox.min.x);
    }

    root.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh) {
        mesh.castShadow = false;
        mesh.receiveShadow = false;
      }
    });

    // Keys: wrap each keycap assembly in a group that can travel along its local up axis.
    const keyNames: Record<MachineKey, RegExp> = {
      prev: /^WEB \/ left /,
      next: /^WEB \/ right /,
      select: /^WEB \/ select /,
    };
    const capNames: Record<MachineKey, RegExp> = {
      prev: /^WEB \/ left tactile keycap/,
      next: /^WEB \/ right tactile keycap/,
      select: /^WEB \/ select tactile keycap/,
    };

    // LCD panel geometry in world space.
    // A node with several primitives loads as a Group of meshes.
    const meshesOf = (o: THREE.Object3D | undefined): THREE.Mesh[] => {
      const out: THREE.Mesh[] = [];
      o?.traverse((c) => {
        if ((c as THREE.Mesh).isMesh) out.push(c as THREE.Mesh);
      });
      return out;
    };
    const lcd = meshesOf(find(/^WEB \/ LCD - replaceable video surface/))[0];
    if (lcd) {
      this.panel = this.measurePanel(lcd);
      this.setupLcd(lcd);
    }
    for (const smoked of findAll(/^WEB \/ LCD inactive black glass/).flatMap(meshesOf)) {
      const mats = Array.isArray(smoked.material) ? smoked.material : [smoked.material];
      if (mats.some((m) => /Smoked/.test(m.name))) smoked.visible = false;
    }

    this.setupMarquee(root, findAll(/^WEB \/ Marquee diode row/), findAll(/^WEB \/ Marquee text/));

    // Move device into the recentred inner group.
    this.inner.add(root);
    root.position.sub(center);
    root.updateMatrixWorld(true);
    if (this.panel) this.panel.center.sub(center);

    for (const k of Object.keys(keyNames) as MachineKey[]) {
      const cap = find(capNames[k]);
      if (!cap) continue;
      const parts = findAll(keyNames[k]).filter((o) => o.parent && !keyNames[k].test(nameOf(o.parent)));
      const capBox = new THREE.Box3().setFromObject(cap);
      const rest = capBox.getCenter(new THREE.Vector3());
      const axis = new THREE.Vector3(0, 1, 0).transformDirection(cap.matrixWorld).normalize();
      const node = new THREE.Group();
      node.position.copy(this.inner.worldToLocal(rest.clone()));
      this.inner.add(node);
      node.updateMatrixWorld(true);
      for (const part of parts) node.attach(part);
      this.keys[k] = { node, rest: node.position.clone(), axis, depth: 0, pressed: false, meshes: parts };
    }

    // Soft floor shadow (the source uses contact shadows that fade out as the machine spins).
    const shadowCanvas = document.createElement("canvas");
    shadowCanvas.width = shadowCanvas.height = 256;
    const sctx = shadowCanvas.getContext("2d");
    if (sctx) {
      const g = sctx.createRadialGradient(128, 128, 0, 128, 128, 128);
      g.addColorStop(0, "rgba(34,34,34,0.55)");
      g.addColorStop(0.45, "rgba(34,34,34,0.22)");
      g.addColorStop(1, "rgba(34,34,34,0)");
      sctx.fillStyle = g;
      sctx.fillRect(0, 0, 256, 256);
    }
    const shadowTex = new THREE.CanvasTexture(shadowCanvas);
    this.shadow = new THREE.Mesh(
      new THREE.PlaneGeometry(this.size.x * 2.6, this.size.z * 2.6),
      new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false, toneMapped: false }),
    );
    this.shadow.rotation.x = -Math.PI / 2;
    this.scene.add(this.shadow);
  }

  private measurePanel(mesh: THREE.Mesh): Panel {
    const geo = mesh.geometry;
    const pos = geo.attributes.position;
    const world: THREE.Vector3[] = [];
    for (let i = 0; i < pos.count; i++) world.push(new THREE.Vector3().fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld));
    const center = new THREE.Box3().setFromPoints(world).getCenter(new THREE.Vector3());
    // Average face normal.
    const normal = new THREE.Vector3();
    const index = geo.index;
    const tri = index ? index.count / 3 : pos.count / 3;
    const a = new THREE.Vector3();
    const b = new THREE.Vector3();
    const c = new THREE.Vector3();
    for (let t = 0; t < tri; t++) {
      const ia = index ? index.getX(t * 3) : t * 3;
      const ib = index ? index.getX(t * 3 + 1) : t * 3 + 1;
      const ic = index ? index.getX(t * 3 + 2) : t * 3 + 2;
      a.copy(world[ia]);
      b.copy(world[ib]).sub(a);
      c.copy(world[ic]).sub(a);
      normal.add(b.cross(c));
    }
    normal.normalize();
    if (normal.z < 0) normal.negate();
    const up = new THREE.Vector3(0, 1, 0).addScaledVector(normal, -normal.y).normalize();
    const right = new THREE.Vector3().crossVectors(up, normal).normalize();
    let minX = Infinity,
      maxX = -Infinity,
      minY = Infinity,
      maxY = -Infinity;
    const d = new THREE.Vector3();
    for (const v of world) {
      d.subVectors(v, center);
      const x = d.dot(right);
      const y = d.dot(up);
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    }
    return { center, normal, up, right, w: maxX - minX, h: maxY - minY };
  }

  /** Replace the LCD material with an unlit video surface using planar UVs (cover fit). */
  private setupLcd(mesh: THREE.Mesh) {
    const panel = this.panel;
    if (!panel) return;
    const geo = mesh.geometry.clone();
    const pos = geo.attributes.position;
    const uv = new Float32Array(pos.count * 2);
    const v = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld).sub(panel.center);
      uv[i * 2] = v.dot(panel.right) / panel.w + 0.5;
      uv[i * 2 + 1] = v.dot(panel.up) / panel.h + 0.5;
    }
    geo.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
    mesh.geometry = geo;
    this.lcdMaterial = new THREE.MeshBasicMaterial({ color: 0xf1f0ec, toneMapped: false });
    mesh.material = this.lcdMaterial;
  }

  /** LED marquee: a dot-matrix canvas texture laid over the diode rows. */
  private setupMarquee(root: THREE.Object3D, rows: THREE.Object3D[], texts: THREE.Object3D[]) {
    if (!rows.length) return;
    const box = new THREE.Box3();
    for (const r of rows) box.union(new THREE.Box3().setFromObject(r));
    for (const t of texts) t.visible = false;
    const w = box.max.x - box.min.x;
    const h = box.max.y - box.min.y;
    const canvas = document.createElement("canvas");
    const cols = 220;
    canvas.width = cols * 4;
    canvas.height = Math.round((cols * 4 * h) / Math.max(w, 1e-3));
    const ctx = canvas.getContext("2d");
    const dots = document.createElement("canvas");
    if (!ctx) return;
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 4;
    const plane = new THREE.Mesh(
      new THREE.PlaneGeometry(w, h),
      new THREE.MeshBasicMaterial({ map: texture, toneMapped: false, transparent: true }),
    );
    // Rows sit on the front face; place the quad just in front of them.
    plane.position.set((box.min.x + box.max.x) / 2, (box.min.y + box.max.y) / 2, box.max.z + 0.01);
    root.add(plane);
    plane.updateMatrixWorld(true);
    this.marquee = { canvas, ctx, texture, offset: 0, text: "", dots };
  }

  setMarqueeText(text: string) {
    if (!this.marquee) return;
    this.marquee.text = text;
    const { dots } = this.marquee;
    // Rasterise the message at LED resolution (7 rows) once; the canvas then scrolls it.
    const rowsPx = 9;
    const tmp = dots.getContext("2d");
    if (!tmp) return;
    tmp.font = `bold ${rowsPx}px "Space Mono", monospace`;
    const unit = `${text}  •  `;
    const unitW = Math.ceil(tmp.measureText(unit).width);
    dots.width = unitW;
    dots.height = rowsPx;
    tmp.font = `bold ${rowsPx}px "Space Mono", monospace`;
    tmp.fillStyle = "#fff";
    tmp.textBaseline = "middle";
    tmp.fillText(unit, 0, rowsPx / 2 + 0.5);
  }

  private drawMarquee(dt: number) {
    const m = this.marquee;
    if (!m || !m.dots.width) return;
    const { ctx, canvas, dots } = m;
    const srcCtx = dots.getContext("2d");
    if (!srcCtx) return;
    m.offset = (m.offset + dt * 14) % dots.width;
    const data = srcCtx.getImageData(0, 0, dots.width, dots.height).data;
    const cols = 220;
    const rows = dots.height;
    const cw = canvas.width / cols;
    const ch = canvas.height / rows;
    ctx.fillStyle = "#121212";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    const r = Math.min(cw, ch) * 0.36;
    for (let x = 0; x < cols; x++) {
      const sx = Math.floor((x + m.offset) % dots.width);
      for (let y = 0; y < rows; y++) {
        const on = data[(y * dots.width + sx) * 4 + 3] > 90;
        ctx.fillStyle = on ? "#f4ecd8" : "#2a2a28";
        ctx.beginPath();
        ctx.arc(x * cw + cw / 2, y * ch + ch / 2, r, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    m.texture.needsUpdate = true;
  }

  setVideo(video: HTMLVideoElement | null) {
    if (!this.lcdMaterial || video === this.currentVideo) return;
    this.currentVideo = video;
    if (!video) {
      this.lcdMaterial.map = null;
      this.lcdMaterial.needsUpdate = true;
      return;
    }
    let tex = this.videoTextures.get(video);
    if (!tex) {
      tex = new THREE.VideoTexture(video);
      tex.colorSpace = THREE.SRGBColorSpace;
      this.videoTextures.set(video, tex);
    }
    const fit = () => {
      if (!tex || !this.panel || !video.videoWidth) return;
      const panelAspect = this.panel.w / this.panel.h;
      const videoAspect = video.videoWidth / video.videoHeight;
      tex.repeat.set(1, 1);
      tex.offset.set(0, 0);
      if (videoAspect > panelAspect) {
        tex.repeat.x = panelAspect / videoAspect;
        tex.offset.x = (1 - tex.repeat.x) / 2;
      } else {
        tex.repeat.y = videoAspect / panelAspect;
        tex.offset.y = (1 - tex.repeat.y) / 2;
      }
    };
    if (video.videoWidth) fit();
    else video.addEventListener("loadedmetadata", fit, { once: true });
    this.lcdMaterial.map = this.noiseOn && this.noise ? this.noise.tex : tex;
    this.lcdMaterial.color.set(0xffffff);
    this.lcdMaterial.needsUpdate = true;
    void video.play().catch(() => undefined);
  }

  private noise: { tex: THREE.DataTexture; data: Uint8Array } | null = null;
  private noiseOn = false;

  /** "noise" swaps the LCD to animated static, as the source does mid-spin. */
  setNoise(on: boolean) {
    if (!this.lcdMaterial || on === this.noiseOn) return;
    this.noiseOn = on;
    if (on) {
      if (!this.noise) {
        const w = 160;
        const h = 100;
        const data = new Uint8Array(w * h * 4);
        const tex = new THREE.DataTexture(data, w, h);
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.magFilter = THREE.NearestFilter;
        this.noise = { tex, data };
      }
      this.lcdMaterial.map = this.noise.tex;
    } else {
      const video = this.currentVideo;
      this.lcdMaterial.map = video ? (this.videoTextures.get(video) ?? null) : null;
    }
    this.lcdMaterial.needsUpdate = true;
  }

  private drawNoise() {
    if (!this.noiseOn || !this.noise) return;
    const { data, tex } = this.noise;
    for (let i = 0; i < data.length; i += 4) {
      const v = Math.random() * 255;
      data[i] = v;
      data[i + 1] = v;
      data[i + 2] = v;
      data[i + 3] = 255;
    }
    tex.needsUpdate = true;
  }

  setScroll(p: number) {
    this.scroll = p;
  }

  setEntrance(v: number) {
    this.entrance = v;
  }

  setPointer(x: number, y: number, active: boolean) {
    this.pointer.x = x;
    this.pointer.y = y;
    this.pointer.active = active;
  }

  setVisible(v: boolean) {
    this.visible = v;
  }

  press(key: MachineKey, down: boolean) {
    const rig = this.keys[key];
    if (rig) rig.pressed = down;
  }

  /** Returns which machine key (if any) is under the given client point. */
  hitKey(clientX: number, clientY: number): MachineKey | null {
    const rect = this.canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
    for (const k of Object.keys(this.keys) as MachineKey[]) {
      const rig = this.keys[k];
      if (rig && this.raycaster.intersectObjects(rig.meshes, true).length) return k;
    }
    return null;
  }

  hitDevice(clientX: number, clientY: number): boolean {
    const rect = this.canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
    return this.raycaster.intersectObject(this.inner, true).length > 0;
  }

  resize() {
    const parent = this.canvas.parentElement;
    const w = parent?.clientWidth ?? window.innerWidth;
    const h = parent?.clientHeight ?? window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  private loop = () => {
    if (this.disposed) return;
    this.frame = requestAnimationFrame(this.loop);
    const dt = Math.min(Math.max(this.clock.getDelta(), 1 / 240), 1 / 30);
    this.time += dt;
    if (!this.visible) return;
    this.update(dt);
    this.renderer.render(this.scene, this.camera);
  };

  private update(dt: number) {
    this.p = damp(this.p, this.scroll, 9, dt);
    const ep = this.p;
    const em = smoothstep(0, 0.5, ep);
    const usePointer = this.pointer.active && !this.reduced;
    this.mx = damp(this.mx, usePointer ? this.pointer.x : 0, 3.2, dt);
    this.my = damp(this.my, usePointer ? this.pointer.y : 0, 3.2, dt);

    const spin = this.reduced || this.still ? 0 : easeInOutCubic(ep) * Math.PI * 2;
    const restYaw = this.still ? 0 : REST_YAW;
    const yaw = (restYaw + 0.5 * this.mx) * (1 - em) + spin;
    const pitch = -(0.22 * this.my) * (1 - em);
    this.pivot.rotation.set(pitch, yaw, 0);

    const lift = -(1 - this.entrance) * 2.4;
    this.pivot.position.y = lift;

    if (this.shadow) {
      this.shadow.position.y = lift - this.size.y / 2 - 0.04;
      this.shadow.material.opacity = 0.9 * (1 - smoothstep(0, 0.5, ep)) * this.entrance;
    }

    // Camera framing (source formula).
    const width = this.canvas.clientWidth || window.innerWidth;
    const height = this.canvas.clientHeight || window.innerHeight;
    const tanHalf = Math.tan(THREE.MathUtils.degToRad(FOV) / 2);
    const aspect = width / height;
    const fitH = this.size.y / (1.156 * tanHalf);
    const widthShare = width < 768 ? 1.125 : 0.663;
    const dist = Math.max(fitH, this.fullWidth / (2 * widthShare * tanHalf * aspect));
    const elev = this.still ? 0.1 : 0.3;
    const posH = this.tmpPos.set(0, dist * Math.sin(elev) - 0.45, dist * Math.cos(elev));
    const tgtH = this.tmpTgt.set(0, -0.45, 0);
    const upH = this.tmpUp.set(0, 1, 0);
    if (this.panel) {
      const { center, normal, up, w, h } = this.panel;
      const near = Math.min(h / (2 * tanHalf), w / (2 * tanHalf * aspect)) * 0.985;
      const posF = center.clone().addScaledVector(normal, near);
      const k = this.still ? 0 : ep * ep;
      posH.lerp(posF, k);
      tgtH.lerp(center, k);
      upH.lerp(up, k).normalize();
    }
    posH.y += lift * (1 - ep * ep);
    tgtH.y += lift * (1 - ep * ep);
    this.camera.position.copy(posH);
    this.camera.up.copy(upH);
    this.camera.lookAt(tgtH);

    for (const rig of Object.values(this.keys)) {
      if (!rig) continue;
      rig.depth = damp(rig.depth, rig.pressed ? 1 : 0, rig.pressed ? 40 : 16, dt);
      rig.node.position.copy(rig.rest).addScaledVector(rig.axis, -0.12 * rig.depth);
    }

    this.drawMarquee(dt);
    this.drawNoise();
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.frame);
    this.scene.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh) {
        mesh.geometry.dispose();
        const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        for (const m of mats) {
          for (const value of Object.values(m)) {
            if (value instanceof THREE.Texture) value.dispose();
          }
          m.dispose();
        }
      }
    });
    for (const t of this.videoTextures.values()) t.dispose();
    this.noise?.tex.dispose();
    this.marquee?.texture.dispose();
    this.envTarget?.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
  }
}
