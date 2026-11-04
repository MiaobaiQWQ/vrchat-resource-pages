import * as THREE from "three";

// FBX 没有材质实例，FBXLoader 按材质 ID 复用同一个材质对象，并把 vertexColors 直接写在
// 共享材质上（见 FBXLoader 里 `if ('color' in geometry.attributes)` 那段）。同一个材质只要
// 被任意一个带 color 图层的网格用过，标记就会留在材质上；之后没有 color 图层的网格仍会
// 开启 USE_COLOR，WebGL 取不到 color 属性时按 (0, 0, 0, 1) 补齐，于是整块网格变成纯黑。
// 所以这里按“当前网格自己的几何”决定是否启用顶点色，而不是照抄材质上的标记。
export function usesVertexColors(source, geometry) {
  return !!source?.vertexColors && !!geometry?.attributes?.color;
}

export function createMeshMaterial(source, geometry) {
  return new THREE.MeshBasicMaterial({
    name: source.name,
    color: source.map ? 0xffffff : source.color || 0xcad3dc,
    map: source.map,
    transparent: source.transparent,
    opacity: source.opacity,
    alphaTest: source.alphaTest,
    side: THREE.DoubleSide,
    vertexColors: usesVertexColors(source, geometry),
    toneMapped: false,
  });
}
