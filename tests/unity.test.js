import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseMaterial, parsePrefab, parseRemaps } from '../src/unity/metadata.js';

test('重命名不影响贴图 GUID、UV、透明度与材质色', () => {
  const data = parseMaterial(`Material:
  m_Name: renamed
  m_TexEnvs:
  - _MainTex:
      m_Texture: {fileID: 2800000, guid: aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa, type: 3}
      m_Scale: {x: 2, y: 3}
      m_Offset: {x: 0.1, y: 0.2}
  - _EmissionMap:
      m_Texture: {fileID: 2800000, guid: bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb, type: 3}
  m_Floats:
  - _RenderingMode: 2
  m_Colors:
  - _Color: {r: 0.2, g: 0.3, b: 0.4, a: 0.5}`);
  assert.equal(data.main.guid, 'a'.repeat(32)); assert.deepEqual(data.main.scale, [2, 3]); assert.deepEqual(data.color, [.2, .3, .4, .5]); assert.equal(data.transparent, true);
});
test('预制体保留空材质槽，读取变体材质目标', () => {
  const data = parsePrefab(`--- !u!1 &1
GameObject:
  m_Name: mesh
  m_IsActive: 1
--- !u!137 &2
SkinnedMeshRenderer:
  m_GameObject: {fileID: 1}
  m_Enabled: 1
  m_Materials:
  - {fileID: 0}
  - {fileID: 2100000, guid: bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb, type: 2}
  m_Mesh: {fileID: 4300000, guid: aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa, type: 3}
--- !u!1001 &3
PrefabInstance:
    - target: {fileID: 2, guid: aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa, type: 3}
      propertyPath: m_Materials.Array.data[0]
      value:
      objectReference: {fileID: 2100000, guid: bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb, type: 2}`);
  assert.deepEqual(data.renderers[0].materials, [null, 'b'.repeat(32)]); assert.equal(data.overrides[0].target, 'a'.repeat(32));
});
test('外部材质映射按名称和 GUID 解析', () => {
  const data = parseRemaps(`ModelImporter:
  externalObjects:
  - first:
      type: UnityEngine:Material
      name: A
    second: {fileID: 2100000, guid: bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb, type: 2}
  materials:
    materialImportMode: 2`);
  assert.equal(data.get('a'), 'b'.repeat(32));
});
