import { mkdir, copyFile } from 'node:fs/promises';
const target = new URL('../public/vendor/libarchive/', import.meta.url);
await mkdir(target, { recursive: true });
for (const file of ['worker-bundle.js', 'libarchive.wasm']) await copyFile(new URL('../node_modules/libarchive.js/dist/' + file, import.meta.url), new URL(file, target));
for (const [directory, files] of Object.entries({ draco: ['draco_decoder.wasm', 'draco_wasm_wrapper.js', 'draco_decoder.js'], basis: ['basis_transcoder.wasm', 'basis_transcoder.js'] })) {
  const output = new URL('../public/vendor/' + directory + '/', import.meta.url); await mkdir(output, { recursive: true });
  for (const file of files) await copyFile(new URL('../node_modules/three/examples/jsm/libs/' + (directory === 'draco' ? 'draco/gltf' : 'basis') + '/' + file, import.meta.url), new URL(file, output));
}
