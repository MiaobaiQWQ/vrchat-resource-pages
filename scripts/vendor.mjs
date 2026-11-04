import { mkdir, copyFile, readdir, writeFile } from "node:fs/promises";
const target = new URL("../public/vendor/libarchive/", import.meta.url);
await mkdir(target, { recursive: true });
for (const file of ["worker-bundle.js", "libarchive.wasm"])
  await copyFile(
    new URL("../node_modules/libarchive.js/dist/" + file, import.meta.url),
    new URL(file, target),
  );
for (const [directory, files] of Object.entries({
  draco: ["draco_decoder.wasm", "draco_wasm_wrapper.js", "draco_decoder.js"],
  basis: ["basis_transcoder.wasm", "basis_transcoder.js"],
})) {
  const output = new URL(
    "../public/vendor/" + directory + "/",
    import.meta.url,
  );
  await mkdir(output, { recursive: true });
  for (const file of files)
    await copyFile(
      new URL(
        "../node_modules/three/examples/jsm/libs/" +
          (directory === "draco" ? "draco/gltf" : "basis") +
          "/" +
          file,
        import.meta.url,
      ),
      new URL(file, output),
    );
}
const licenseOutput = new URL("../public/licenses/", import.meta.url);
await mkdir(licenseOutput, { recursive: true });
const notices = [];
for (const name of [
  "three",
  "@zip.js/zip.js",
  "libarchive.js",
  "ag-psd",
  "fflate",
  "pako",
  "comlink",
]) {
  const source = new URL("../node_modules/" + name + "/", import.meta.url);
  for (const file of (await readdir(source)).filter((file) =>
    /^licen[cs]e(?:\.|$)/i.test(file),
  )) {
    const output = name.replaceAll("/", "-").replace("@", "") + "-" + file;
    await copyFile(new URL(file, source), new URL(output, licenseOutput));
    notices.push(name + ": " + output);
  }
}
await writeFile(
  new URL("NOTICE.txt", licenseOutput),
  "Third-party licenses\n\n" +
    notices.join("\n") +
    "\n\nlibarchive upstream: https://www.libarchive.org/\n",
  "utf8",
);
