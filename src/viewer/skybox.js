import { dirname, extension, stem } from "../core/paths.js";

const aliases = {
  px: ["px", "posx", "right", "rt"],
  nx: ["nx", "negx", "left", "lf"],
  py: ["py", "posy", "up", "top"],
  ny: ["ny", "negy", "down", "bottom", "dn"],
  pz: ["pz", "posz", "front", "ft"],
  nz: ["nz", "negz", "back", "bk"],
};
export const faceOrder = ["px", "nx", "py", "ny", "pz", "nz"];
export const skyHint = (path) =>
  /skybox|panorama|equirect|天空盒|全景|环境贴图/i.test(path);

export function cubeFaces(entry, entries) {
  const name = stem(entry.name).toLowerCase();
  for (const terms of Object.values(aliases))
    for (const term of terms) {
      const match = name.match(new RegExp("(^|[_ .-])" + term + "$"));
      if (!match) continue;
      const prefix = name.slice(0, match.index);
      const candidates = entries.filter(
        (item) =>
          item.kind === "texture" &&
          item.scope === entry.scope &&
          dirname(item.path) === dirname(entry.path),
      );
      const faces = faceOrder.map((face) =>
        candidates.filter((item) =>
          aliases[face].some((alias) => {
            const key = stem(item.name).toLowerCase();
            return key === (prefix ? prefix + match[1] : "") + alias;
          }),
        ),
      );
      if (faces.every((items) => items.length === 1))
        return faces.map((items) => items[0]);
    }
  return null;
}

export function shouldShowSky(entry, data, entries) {
  if (cubeFaces(entry, entries)) return true;
  const hdr = [".hdr", ".exr"].includes(entry.format || extension(entry.path));
  return (
    (hdr || skyHint(entry.path)) &&
    Math.abs(data.width / data.height - 2) < 0.02
  );
}

export async function loadSkyTexture(entry, entries, images) {
  const THREE = await import("three");
  const faces = cubeFaces(entry, entries);
  if (faces) {
    const data = await Promise.all(faces.map((face) => images.decode(face)));
    if (
      data.some(
        (image) =>
          image.width !== image.height || image.width !== data[0].width,
      )
    )
      throw new Error("天空盒六面贴图必须为相同尺寸的正方形");
    const urls = await Promise.all(faces.map((face) => images.url(face)));
    const texture = await new THREE.CubeTextureLoader().loadAsync(urls);
    texture.colorSpace = THREE.SRGBColorSpace;
    return { texture, label: "六面天空盒 · 拖动查看方向 · 滚轮缩放视野" };
  }
  const data = await images.decode(entry);
  if (Math.abs(data.width / data.height - 2) >= 0.02)
    throw new Error(
      "全景天空盒需要宽高比 2:1 的等距柱状贴图，或同目录下完整的六面贴图",
    );
  const ext = entry.format || extension(entry.path);
  let texture;
  if ([".hdr", ".exr"].includes(ext)) {
    const file = await entry.read();
    if (ext === ".hdr") {
      const { HDRLoader } = await import("three/addons/loaders/HDRLoader.js");
      const raw = new HDRLoader().parse(await file.arrayBuffer());
      texture = new THREE.DataTexture(
        raw.data,
        raw.width,
        raw.height,
        THREE.RGBAFormat,
        raw.type,
      );
      texture.flipY = true;
    } else {
      const { EXRLoader } = await import("three/addons/loaders/EXRLoader.js");
      const raw = new EXRLoader().parse(await file.arrayBuffer());
      texture = new THREE.DataTexture(
        raw.data,
        raw.width,
        raw.height,
        raw.format,
        raw.type,
      );
      texture.flipY = false;
    }
    texture.colorSpace = THREE.LinearSRGBColorSpace;
    texture.needsUpdate = true;
  } else {
    texture = await new THREE.TextureLoader().loadAsync(
      await images.url(entry),
    );
    texture.colorSpace = THREE.SRGBColorSpace;
  }
  texture.mapping = THREE.EquirectangularReflectionMapping;
  return { texture, label: "全景天空盒 · 拖动环视 · 滚轮缩放视野" };
}

export class SkyViewer {
  static async create(canvas, loaded) {
    const THREE = await import("three");
    const { OrbitControls } =
      await import("three/addons/controls/OrbitControls.js");
    return new SkyViewer(canvas, loaded, THREE, OrbitControls);
  }
  constructor(canvas, loaded, THREE, OrbitControls) {
    this.texture = loaded.texture;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.5));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.NoToneMapping;
    this.scene = new THREE.Scene();
    this.scene.background = this.texture;
    this.camera = new THREE.PerspectiveCamera(70, 1, 0.001, 10);
    this.camera.position.z = 0.01;
    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enablePan = false;
    this.controls.enableZoom = false;
    this.controls.rotateSpeed = -0.3;
    this.controls.addEventListener("change", () => this.draw());
    this.wheel = (event) => {
      event.preventDefault();
      this.camera.fov = Math.max(
        30,
        Math.min(100, this.camera.fov + Math.sign(event.deltaY) * 3),
      );
      this.camera.updateProjectionMatrix();
      this.draw();
    };
    canvas.addEventListener("wheel", this.wheel, { passive: false });
    this.canvas = canvas;
    this.observer = new ResizeObserver(() => {
      const { width, height } = canvas.parentElement.getBoundingClientRect();
      if (!width || !height) return;
      this.renderer.setSize(width, height, false);
      this.camera.aspect = width / height;
      this.camera.updateProjectionMatrix();
      this.draw();
    });
    this.observer.observe(canvas.parentElement);
    this.visibility = () => this.draw();
    document.addEventListener("visibilitychange", this.visibility);
  }
  fit() {
    this.camera.position.set(0, 0, 0.01);
    this.camera.fov = 70;
    this.camera.updateProjectionMatrix();
    this.controls.target.set(0, 0, 0);
    this.controls.update();
    this.draw();
  }
  draw() {
    if (this.pending || this.disposed || document.hidden) return;
    this.pending = requestAnimationFrame(() => {
      this.pending = 0;
      if (!this.disposed) this.renderer.render(this.scene, this.camera);
    });
  }
  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.pending);
    this.observer.disconnect();
    this.controls.dispose();
    this.canvas.removeEventListener("wheel", this.wheel);
    document.removeEventListener("visibilitychange", this.visibility);
    this.scene.background = null;
    this.texture.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
  }
}
