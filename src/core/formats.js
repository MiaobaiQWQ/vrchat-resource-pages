import { extension, comparisonKey } from './paths.js';

const groups = {
  model: ['fbx', 'glb', 'gltf', 'vrm', 'obj', 'stl', 'ply', 'dae'],
  texture: ['png', 'jpg', 'jpeg', 'webp', 'avif', 'gif', 'bmp', 'svg', 'tga', 'psd', 'dds', 'tif', 'tiff', 'exr', 'hdr', 'ktx2'],
  archive: ['zip', 'unitypackage', 'tar', 'gz', 'tgz', '7z', 'rar'],
  audio: ['mp3', 'wav', 'ogg', 'flac', 'aac', 'm4a', 'opus'],
  video: ['mp4', 'webm', 'mov', 'm4v', 'ogv'],
  document: ['txt', 'md', 'json', 'yaml', 'yml', 'csv', 'xml', 'html', 'css', 'js', 'ts', 'cs', 'shader', 'cginc', 'pdf', 'log'],
  unity: ['prefab', 'mat', 'asset', 'meta', 'controller', 'overridecontroller', 'anim', 'mask', 'blendshape'],
  unsupported: ['blend', 'max', 'ma', 'mb', 'pmx', 'pmd', 'vmd', 'vrca', 'ktx', 'psb', 'spp', 'sbsar'],
  world: ['unity', 'vrcw'],
};
const lookup = new Map(Object.entries(groups).flatMap(([kind, exts]) => exts.map(ext => ['.' + ext, kind])));
export function fileKind(name) { return lookup.get(extension(name)) || 'other'; }
export const kindNames = { all: '全部资源', model: '3D 模型', texture: '图像与贴图', archive: '压缩资源', unity: 'Unity 资源', audio: '音频', video: '视频', document: '文档', world: '世界', unsupported: '其他模型', other: '其他文件' };
export const renderableImage = name => /\.(?:png|jpe?g|webp|avif|gif|bmp|svg|tga|psd|dds|tiff?|exr|hdr)$/i.test(name);
export const isColorTexture = name => !/(?:normal|nrm|mask|matcap|rough|metal|occlusion|emission|opacity|alpha|_ao\b|_uv\b)/i.test(name);

const avatars = {
  Kipfel: ['kipfel', 'キプフェル'], Manuka: ['manuka', 'マヌカ'], Moe: ['moe', '萌'], Chiffon: ['chiffon', 'シフォン'],
  Shinra: ['shinra', '森羅'], Kikyo: ['kikyo', '桔梗'], Mamehinata: ['mamehinata', 'mamehi', 'まめひなた'],
  Rindo: ['rindo', '竜胆'], Lime: ['lime', 'ライム'], Selestia: ['selestia', 'serestia', 'selestia', 'セレスティア'],
  Sio: ['sio', 'しお'], Shinano: ['shinano', 'しなの'], Mizuki: ['mizuki', '瑞希'], Rurune: ['rurune', 'ルルネ'],
  Lasyusha: ['lasyusha', 'ラシューシャ'], Minase: ['minase', '水瀬'], Grus: ['grus', 'グルス'],
};
export function detectAvatars(text) {
  const input = String(text).normalize('NFKC').toLowerCase();
  return Object.entries(avatars).filter(([, words]) => words.some(word => /^[a-z]+$/.test(word)
    ? new RegExp(`(?:^|[^a-z])${word}(?:$|[^a-z])`, 'i').test(input)
    : input.includes(word))).map(([name]) => name);
}
export const materialKey = name => comparisonKey(String(name || '').replace(/\s*\(instance\)\s*$/i, '').replace(/\.\d+$/, ''));
