import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { FBXLoader } from "three/addons/loaders/FBXLoader.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { OBJLoader } from "three/addons/loaders/OBJLoader.js";
import { STLLoader } from "three/addons/loaders/STLLoader.js";
import { PLYLoader } from "three/addons/loaders/PLYLoader.js";
import { ColladaLoader } from "three/addons/loaders/ColladaLoader.js";
import { TGALoader } from "three/addons/loaders/TGALoader.js";
import { TIFFLoader } from "three/addons/loaders/TIFFLoader.js";
import { DDSLoader } from "three/addons/loaders/DDSLoader.js";
import { EXRLoader } from "three/addons/loaders/EXRLoader.js";
import { HDRLoader } from "three/addons/loaders/HDRLoader.js";
import { DRACOLoader } from "three/addons/loaders/DRACOLoader.js";
import { KTX2Loader } from "three/addons/loaders/KTX2Loader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";
import {
  extension,
  resolveReference,
  comparisonKey,
  stem,
} from "../core/paths.js";
import { isColorTexture } from "../core/formats.js";
import { buildBindings } from "../unity/metadata.js";
import { mapLimit } from "../core/async.js";
import { canvasBlob, loadImage } from "../images/service.js";
import { randomTextureOptions } from "./texture-options.js";

const WHITE =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jR1kAAAAASUVORK5CYII=";
let coverRenderer;

export function releaseObject(object) {
  if (!object) return;
  const textures = new Set(),
    materials = new Set(),
    geometries = new Set();
  object.traverse((node) => {
    if (node.geometry) geometries.add(node.geometry);
    for (const material of Array.isArray(node.material)
      ? node.material
      : node.material
        ? [node.material]
        : []) {
      materials.add(material);
      for (const value of Object.values(material))
        if (value?.isTexture) textures.add(value);
    }
    if (node.skeleton) node.skeleton.dispose();
  });
  textures.forEach((value) => value.dispose());
  materials.forEach((value) => value.dispose());
  geometries.forEach((value) => value.dispose());
}

function rendererFor(canvas, thumbnail = false) {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: false,
    powerPreference: thumbnail ? "low-power" : "high-performance",
  });
  renderer.setPixelRatio(thumbnail ? 1 : Math.min(devicePixelRatio || 1, 1.5));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NoToneMapping;
  return renderer;
}

async function dependencies(entry, resource, catalog) {
  const mappings = new Map(),
    ext = entry.format || extension(entry.path);
  if (![".gltf", ".glb", ".vrm"].includes(ext)) return mappings;
  const file = await entry.read();
  let json;
  if (ext === ".gltf") json = JSON.parse(await file.text());
  else {
    const bytes = await file.slice(0, 20).arrayBuffer();
    if (bytes.byteLength < 20) throw new Error("GLB 文件头不完整");
    const header = new DataView(bytes);
    if (header.getUint32(0, true) !== 0x46546c67)
      throw new Error("GLB / VRM 文件签名不正确");
    const size = header.getUint32(12, true);
    if (size > 32 * 1024 * 1024) throw new Error("GLB JSON 索引过大");
    json = JSON.parse(await file.slice(20, 20 + size).text());
  }
  for (const item of [...(json.buffers || []), ...(json.images || [])]) {
    if (!item.uri || item.uri.startsWith("data:")) continue;
    const related = resolveReference(
      item.uri,
      entry,
      resource.references || resource.entries,
    );
    if (!related) throw new Error("缺少模型关联文件：" + item.uri);
    mappings.set(item.uri, await catalog.url(related));
  }
  return mappings;
}

async function textureFromEntry(entry, images, data, role, thumbnail) {
  const image = await images.decode(entry),
    url = thumbnail
      ? URL.createObjectURL(await images.thumbnail(entry))
      : await images.url(entry);
  try {
    const texture = new THREE.Texture(await loadImage(url));
    texture.colorSpace =
      role === "color" ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.fromArray(data?.scale || [1, 1]);
    texture.offset.fromArray(data?.offset || [0, 0]);
    texture.userData.entryId = entry.id;
    texture.name = entry.name;
    texture.needsUpdate = true;
    return texture;
  } finally {
    if (thumbnail) URL.revokeObjectURL(url);
  }
}

export async function loadModel(
  resource,
  entry,
  catalog,
  images,
  { thumbnail = false, progress = () => {} } = {},
) {
  const started = performance.now();
  progress("正在读取模型…");
  const mappings = await dependencies(entry, resource, catalog),
    manager = new THREE.LoadingManager(),
    missing = new Set();
  manager.addHandler(/\.tga$/i, new TGALoader(manager));
  manager.setURLModifier((url) => {
    let decoded = url;
    try {
      decoded = decodeURIComponent(url);
    } catch {}
    for (const [path, actual] of mappings)
      if (decoded === path || decoded.endsWith("/" + path)) return actual;
    if (/^(blob:|data:)/.test(url)) return url;
    missing.add(decoded);
    return WHITE;
  });
  const file = await entry.read();
  if (file.size > 512 * 1024 * 1024)
    throw new Error("模型超过浏览器解析限制，请使用精简版模型");
  const url = await catalog.url(entry),
    ext = entry.format || extension(entry.path);
  let object, draco, ktx;
  try {
    if (ext === ".fbx") object = await new FBXLoader(manager).loadAsync(url);
    else if (ext === ".obj")
      object = await new OBJLoader(manager).loadAsync(url);
    else if (ext === ".dae")
      object = (await new ColladaLoader(manager).loadAsync(url)).scene;
    else if (ext === ".stl" || ext === ".ply") {
      const geometry = await (
        ext === ".stl" ? new STLLoader(manager) : new PLYLoader(manager)
      ).loadAsync(url);
      if (!geometry.attributes.normal) geometry.computeVertexNormals();
      object = new THREE.Group();
      object.add(
        new THREE.Mesh(
          geometry,
          new THREE.MeshBasicMaterial({
            color: 0xcad3dc,
            vertexColors: !!geometry.attributes.color,
            side: THREE.DoubleSide,
          }),
        ),
      );
    } else {
      draco = new DRACOLoader().setDecoderPath("/vendor/draco/");
      if (!coverRenderer)
        coverRenderer = rendererFor(document.createElement("canvas"), true);
      ktx = new KTX2Loader()
        .setTranscoderPath("/vendor/basis/")
        .detectSupport(coverRenderer);
      const gltf = await new GLTFLoader(manager)
        .setDRACOLoader(draco)
        .setKTX2Loader(ktx)
        .setMeshoptDecoder(MeshoptDecoder)
        .loadAsync(url);
      object = gltf.scene;
      object.animations = gltf.animations;
    }
    progress("正在匹配材质与贴图…");
    const bindings = await buildBindings(resource, entry),
      warnings = [],
      pool = new Map(),
      tasks = [],
      originalMaterials = new Set();
    let meshes = 0,
      vertices = 0,
      triangles = 0;
    const gltf = [".glb", ".gltf", ".vrm"].includes(ext);
    const getTexture = (target, data, role) => {
      const key = target.id + role + data?.scale + data?.offset;
      if (!pool.has(key))
        pool.set(key, textureFromEntry(target, images, data, role, thumbnail));
      return pool.get(key);
    };
    object.traverse((node) => {
      if (node.isLight || node.isCamera) node.visible = false;
      if (!node.isMesh) return;
      meshes++;
      vertices += node.geometry.attributes.position?.count || 0;
      triangles +=
        (node.geometry.index?.count ||
          node.geometry.attributes.position?.count ||
          0) / 3;
      const active = bindings.visibility(node.name);
      if (active !== undefined) node.visible = active;
      node.frustumCulled = !node.isSkinnedMesh;
      const used = [
        ...new Set(
          node.geometry.groups
            .filter((group) => group.count > 0)
            .map((group) => group.materialIndex),
        ),
      ].sort((a, b) => a - b);
      const materials = (
        Array.isArray(node.material) ? node.material : [node.material]
      ).map((source, slot) => {
        originalMaterials.add(source);
        const material = new THREE.MeshBasicMaterial({
          name: source.name,
          color: source.map ? 0xffffff : source.color || 0xcad3dc,
          map: source.map,
          transparent: source.transparent,
          opacity: source.opacity,
          alphaTest: source.alphaTest,
          side: THREE.DoubleSide,
          vertexColors: !!source.vertexColors,
          toneMapped: false,
        });
        let data = bindings.resolve(node.name, source.name, slot, used);
        if (!data && !gltf) {
          const candidates = (resource.references || resource.entries).filter(
            (e) => e.kind === "texture" && isColorTexture(e.name),
          );
          const keys = [
            comparisonKey(stem(source.map?.name || "")),
            comparisonKey(source.name),
          ];
          const matches = candidates.filter((e) =>
            keys.some(
              (key) => key.length > 2 && comparisonKey(stem(e.path)) === key,
            ),
          );
          if (matches.length === 1)
            data = {
              texture: matches[0],
              color: [1, 1, 1, 1],
              scale: [1, 1],
              offset: [0, 0],
              cull: 0,
            };
        }
        if (data)
          tasks.push(async () => {
            if (data.inferred)
              warnings.push(
                node.name +
                  "：未提供原始槽位绑定，已匹配同名部件材质，可手动或随机切换配色",
              );
            if (data.main?.guid && !data.texture) {
              warnings.push(node.name + "：主贴图未包含在所选来源中");
              return;
            }
            const texture = data.texture
              ? await getTexture(data.texture, data, "color")
              : null;
            if (texture) {
              texture.flipY = !gltf;
              texture.needsUpdate = true;
            }
            material.map = texture;
            material.color.setHex(0xffffff);
            if (!texture)
              material.color.setRGB(
                ...data.color.slice(0, 3),
                THREE.SRGBColorSpace,
              );
            material.opacity = data.color?.[3] ?? 1;
            material.transparent = !!data.transparent;
            material.alphaTest = data.cutoff || 0;
            material.depthWrite = !material.transparent;
            material.side =
              data.cull === 0
                ? THREE.DoubleSide
                : data.cull === 1
                  ? THREE.BackSide
                  : THREE.FrontSide;
            if (data.alphaTexture && (data.transparent || data.cutoff)) {
              material.alphaMap = await getTexture(
                data.alphaTexture,
                {
                  scale: data.alpha?.scale || data.scale,
                  offset: data.alpha?.offset || data.offset,
                },
                "data",
              );
              material.alphaMap.flipY = !gltf;
              material.alphaMap.needsUpdate = true;
            }
            material.needsUpdate = true;
          });
        return material;
      });
      node.material = Array.isArray(node.material) ? materials : materials[0];
    });
    await mapLimit(tasks, thumbnail ? 2 : 4, async (task) => {
      try {
        await task();
      } catch (error) {
        warnings.push(error.message);
      }
    });
    originalMaterials.forEach((material) => material.dispose());
    if (!meshes) throw new Error("文件中没有可以展示的网格");
    if (
      !tasks.length &&
      !gltf &&
      resource.entries.some((e) => e.kind === "texture")
    )
      warnings.push("未发现明确的材质引用，保留模型原材质；可手动选择贴图");
    return {
      object,
      warnings: [...new Set(warnings)],
      stats: {
        meshes,
        vertices,
        triangles: Math.round(triangles),
        loadMs: Math.round(performance.now() - started),
      },
      animations: object.animations || [],
      origin: bindings.origin,
    };
  } catch (error) {
    releaseObject(object);
    throw error;
  } finally {
    draco?.dispose();
    ktx?.dispose();
  }
}

function visibleBounds(object) {
  object.updateMatrixWorld(true);
  const box = new THREE.Box3(),
    point = new THREE.Vector3();
  object.traverse((node) => {
    if (!node.isMesh || !node.geometry.attributes.position) return;
    for (let parent = node; parent; parent = parent.parent)
      if (!parent.visible) return;
    const position = node.geometry.attributes.position,
      step = Math.max(1, Math.floor(position.count / 5000));
    if (node.skeleton) node.skeleton.update();
    for (let index = 0; index < position.count; index += step) {
      point.fromBufferAttribute(position, index);
      if (node.isSkinnedMesh) node.applyBoneTransform(index, point);
      point.applyMatrix4(node.matrixWorld);
      if (Number.isFinite(point.x + point.y + point.z))
        box.expandByPoint(point);
    }
  });
  if (box.isEmpty()) throw new Error("模型没有可见网格，暂不展示");
  return box;
}

function fit(object, camera, controls) {
  const box = visibleBounds(object),
    center = box.getCenter(new THREE.Vector3()),
    size = box.getSize(new THREE.Vector3()),
    max = Math.max(size.x, size.y, size.z) || 1;
  object.position.sub(center);
  object.updateMatrixWorld(true);
  const distance =
    Math.max(
      size.y / 2 / Math.tan((camera.fov * Math.PI) / 360),
      size.x / 2 / Math.tan((camera.fov * Math.PI) / 360) / camera.aspect,
    ) *
      1.18 +
    size.z / 2;
  camera.position.set(distance * 0.16, max * 0.035, distance);
  camera.near = max / 1000;
  camera.far = max * 100;
  camera.updateProjectionMatrix();
  camera.lookAt(0, 0, 0);
  if (controls) {
    controls.target.set(0, 0, 0);
    controls.update();
  }
  return max;
}

export async function modelCover(loaded) {
  if (!coverRenderer)
    coverRenderer = rendererFor(document.createElement("canvas"), true);
  coverRenderer.setSize(640, 480, false);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color("#242a34");
  scene.add(loaded.object);
  const camera = new THREE.PerspectiveCamera(35, 4 / 3);
  fit(loaded.object, camera);
  coverRenderer.render(scene, camera);
  coverRenderer.render(scene, camera);
  const blob = await canvasBlob(coverRenderer.domElement, "image/jpeg");
  scene.remove(loaded.object);
  return blob;
}

export class ModelViewer {
  constructor(canvas) {
    this.renderer = rendererFor(canvas);
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color("#242a34");
    this.camera = new THREE.PerspectiveCamera(38, 1, 0.001, 1000);
    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.addEventListener("change", () => this.draw());
    this.visibilityChanged = () => this.draw();
    document.addEventListener("visibilitychange", this.visibilityChanged);
    this.grid = new THREE.GridHelper(4, 20, 0x657080, 0x3b4452);
    this.scene.add(this.grid);
    this.observer = new ResizeObserver(() => {
      const box = canvas.parentElement.getBoundingClientRect();
      if (!box.width || !box.height) return;
      this.renderer.setSize(box.width, box.height, false);
      this.camera.aspect = box.width / box.height;
      this.camera.updateProjectionMatrix();
      this.draw();
    });
    this.observer.observe(canvas.parentElement);
  }
  set(loaded) {
    if (this.loaded) {
      this.scene.remove(this.loaded.object);
      releaseObject(this.loaded.object);
    }
    this.loaded = loaded;
    this.scene.add(loaded.object);
    this.fit();
    this.draw();
  }
  fit() {
    if (!this.loaded) return;
    const max = fit(this.loaded.object, this.camera, this.controls);
    this.grid.scale.setScalar(max / 2);
    this.grid.position.y =
      -visibleBounds(this.loaded.object).getSize(new THREE.Vector3()).y / 2;
    this.draw();
  }
  draw() {
    if (this.pending || this.disposed || document.hidden) return;
    this.pending = requestAnimationFrame(() => {
      this.pending = 0;
      if (!this.disposed) this.renderer.render(this.scene, this.camera);
    });
  }
  toggleGrid() {
    this.grid.visible = !this.grid.visible;
    this.draw();
  }
  expressions() {
    const list = new Map();
    this.loaded?.object.traverse((node) => {
      for (const [name, index] of Object.entries(
        node.morphTargetDictionary || {},
      )) {
        if (!list.has(name)) list.set(name, []);
        list.get(name).push({ node, index });
      }
    });
    return [...list].map(([name, targets]) => ({
      name,
      set: (value) => {
        targets.forEach(({ node, index }) => {
          node.morphTargetInfluences[index] = value;
        });
        this.draw();
      },
    }));
  }
  materials() {
    const items = [];
    this.loaded?.object.traverse((node) => {
      if (node.isMesh)
        for (const material of Array.isArray(node.material)
          ? node.material
          : [node.material])
          items.push({
            index: items.length,
            name: `${node.name || "网格"} / ${material.name || "材质"}`,
            material,
          });
    });
    return items;
  }
  color(value, indices) {
    for (const item of this.materials())
      if (!indices || indices.includes(item.index))
        item.material.color.set(value);
    this.draw();
  }
  async texture(entry, images, indices) {
    const texture = await textureFromEntry(entry, images, null, "color", false),
      gltf =
        this.loaded?.entry && /\.(glb|gltf|vrm)$/i.test(this.loaded.entry.path);
    texture.flipY = !gltf;
    if (this.disposed) {
      texture.dispose();
      return;
    }
    texture.needsUpdate = true;
    this.retiredTextures ||= new Set();
    for (const item of this.materials())
      if (!indices || indices.includes(item.index)) {
        if (item.material.map) this.retiredTextures.add(item.material.map);
        item.material.map = texture;
        item.material.color.setHex(0xffffff);
        item.material.needsUpdate = true;
      }
    this.draw();
  }
  async randomTextures(entries, images, indices) {
    const choices = new Map();
    for (const item of this.materials()) {
      if (indices && !indices.includes(item.index)) continue;
      const options = randomTextureOptions(
        entries,
        item.material.map?.name,
        item.material.name,
      );
      if (!options.length) continue;
      const chosen = options[Math.floor(Math.random() * options.length)];
      if (!choices.has(chosen)) choices.set(chosen, []);
      choices.get(chosen).push(item.index);
    }
    for (const [entry, targets] of choices)
      await this.texture(entry, images, targets);
    return [...choices.values()].reduce(
      (count, targets) => count + targets.length,
      0,
    );
  }
  dispose() {
    this.disposed = true;
    if (this.pending) cancelAnimationFrame(this.pending);
    this.observer.disconnect();
    document.removeEventListener("visibilitychange", this.visibilityChanged);
    this.controls.dispose();
    releaseObject(this.loaded?.object);
    this.retiredTextures?.forEach((texture) => texture.dispose());
    this.grid.geometry.dispose();
    this.grid.material.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
  }
}

export async function engineImage(file, ext) {
  const data = (ext === ".tga" ? new TGALoader() : new TIFFLoader()).parse(
    await file.arrayBuffer(),
  );
  const canvas = document.createElement("canvas");
  canvas.width = data.width;
  canvas.height = data.height;
  canvas
    .getContext("2d")
    .putImageData(
      new ImageData(new Uint8ClampedArray(data.data), data.width, data.height),
      0,
      0,
    );
  return {
    blob: await canvasBlob(canvas),
    width: data.width,
    height: data.height,
  };
}

export async function renderImageFile(file, ext) {
  if (!coverRenderer)
    coverRenderer = rendererFor(document.createElement("canvas"), true);
  const url = URL.createObjectURL(file);
  let texture, loader;
  try {
    loader =
      ext === ".dds"
        ? new DDSLoader()
        : ext === ".exr"
          ? new EXRLoader()
          : ext === ".ktx2"
            ? new KTX2Loader()
                .setTranscoderPath("/vendor/basis/")
                .detectSupport(coverRenderer)
            : new HDRLoader();
    texture = await loader.loadAsync(url);
    texture.colorSpace = [".hdr", ".exr"].includes(ext)
      ? THREE.LinearSRGBColorSpace
      : THREE.SRGBColorSpace;
    const width = texture.image?.width || texture.mipmaps?.[0]?.width,
      height = texture.image?.height || texture.mipmaps?.[0]?.height;
    if (!width || !height) throw new Error("纹理没有可显示的图像层");
    const ratio = Math.min(1, 2048 / Math.max(width, height));
    coverRenderer.setSize(
      Math.max(1, Math.round(width * ratio)),
      Math.max(1, Math.round(height * ratio)),
      false,
    );
    const scene = new THREE.Scene(),
      material = new THREE.MeshBasicMaterial({
        map: texture,
        toneMapped: false,
      }),
      geometry = new THREE.PlaneGeometry(2, 2);
    scene.add(new THREE.Mesh(geometry, material));
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 2);
    camera.position.z = 1;
    coverRenderer.render(scene, camera);
    const blob = await canvasBlob(coverRenderer.domElement);
    geometry.dispose();
    material.dispose();
    return { blob, width, height };
  } finally {
    URL.revokeObjectURL(url);
    texture?.dispose();
    if (loader instanceof KTX2Loader) loader.dispose();
  }
}
