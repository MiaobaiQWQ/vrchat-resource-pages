import * as THREE from "three";
import { ModelViewer, releaseObject } from "./engine.js";

export async function surfacePreview(data, images, shape = "sphere") {
  const material = new THREE.MeshBasicMaterial({
    side: THREE.DoubleSide,
    toneMapped: false,
  });
  let object;
  try {
    material.color.setRGB(
      ...(data.color || [1, 1, 1, 1]).slice(0, 3),
      THREE.SRGBColorSpace,
    );
    material.opacity = data.color?.[3] ?? 1;
    material.transparent = !!data.transparent || material.opacity < 1;
    material.alphaTest = data.cutoff || 0;
    material.depthWrite = !material.transparent;
    const load = async (entry, slot, role) => {
      if (!entry) return null;
      const texture = await new THREE.TextureLoader().loadAsync(
        await images.url(entry),
      );
      texture.colorSpace =
        role === "color" ? THREE.SRGBColorSpace : THREE.NoColorSpace;
      texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
      texture.repeat.fromArray(slot?.scale || [1, 1]);
      texture.offset.fromArray(slot?.offset || [0, 0]);
      return texture;
    };
    material.map = await load(data.texture, data.main, "color");
    material.alphaMap = await load(
      data.alphaTexture,
      data.alpha || data.main,
      "data",
    );
    object = new THREE.Group();
    object.add(
      new THREE.Mesh(
        shape === "plane"
          ? new THREE.PlaneGeometry(2, 2)
          : new THREE.SphereGeometry(1, 64, 32),
        material,
      ),
    );
    return { object, warnings: [], stats: {}, animations: [] };
  } catch (error) {
    if (object) releaseObject(object);
    else {
      material.map?.dispose();
      material.alphaMap?.dispose();
      material.dispose();
    }
    throw error;
  }
}
export { ModelViewer };
