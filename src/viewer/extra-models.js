import * as THREE from "three";

export const extraModelFormats = [
  ".3mf",
  ".3ds",
  ".amf",
  ".vtk",
  ".vtp",
  ".wrl",
  ".vrml",
];

export function vtkBuffer(buffer) {
  if (buffer.byteLength >= 250) return buffer;
  const bytes = new Uint8Array(250).fill(10);
  bytes.set(new Uint8Array(buffer));
  return bytes.buffer;
}

export async function loadExtraModel(ext, url, manager) {
  let object;
  if (ext === ".3mf") {
    const { ThreeMFLoader } = await import("three/addons/loaders/3MFLoader.js");
    object = await new ThreeMFLoader(manager).loadAsync(url);
    object.rotation.x = -Math.PI / 2;
  } else if (ext === ".3ds") {
    const { TDSLoader } = await import("three/addons/loaders/TDSLoader.js");
    object = await new TDSLoader(manager).loadAsync(url);
  } else if (ext === ".amf") {
    const { AMFLoader } = await import("three/addons/loaders/AMFLoader.js");
    object = await new AMFLoader(manager).loadAsync(url);
    object.rotation.x = -Math.PI / 2;
  } else if ([".vtk", ".vtp"].includes(ext)) {
    const { VTKLoader } = await import("three/addons/loaders/VTKLoader.js");
    const fileLoader = new THREE.FileLoader(manager).setResponseType(
      "arraybuffer",
    );
    const geometry = new VTKLoader(manager).parse(
      vtkBuffer(await fileLoader.loadAsync(url)),
    );
    if (!geometry.attributes.normal) geometry.computeVertexNormals();
    object = new THREE.Group();
    object.add(
      new THREE.Mesh(
        geometry,
        new THREE.MeshBasicMaterial({
          color: geometry.attributes.color ? 0xffffff : 0xcad3dc,
          vertexColors: !!geometry.attributes.color,
          side: THREE.DoubleSide,
        }),
      ),
    );
  } else {
    const { VRMLLoader } = await import("three/addons/loaders/VRMLLoader.js");
    object = await new VRMLLoader(manager).loadAsync(url);
  }
  let count = 0;
  object.traverse((node) => {
    if (node.isMesh) count += node.geometry.attributes.position?.count || 0;
  });
  if (!count)
    throw new Error("此文件没有可显示的网格，可能使用了尚不支持的格式扩展");
  return object;
}
