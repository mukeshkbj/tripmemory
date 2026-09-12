import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = new URL("../", import.meta.url);
const output = new URL("media/devpost/", root);
await mkdir(output, { recursive: true });
const screenshots = [
  [
    "test-results/memory-sample-navigation-i-35634--and-makes-no-paid-requests-desktop/library.png",
    "01-memory-cover.jpg",
  ],
  [
    "test-results/memory-sample-navigation-i-35634--and-makes-no-paid-requests-desktop/viewer.png",
    "02-revisit-a-place.jpg",
  ],
  [
    "test-results/memory-validates-uploads-p-ca69b-handles-missing-cloud-setup-desktop/create.png",
    "03-create-a-memory.jpg",
  ],
];
for (const [source, name] of screenshots) {
  const path = fileURLToPath(new URL(name, output));
  await sharp(fileURLToPath(new URL(source, root)))
    .resize(1500, 1000, { fit: "contain", background: "#f8f9f5" })
    .jpeg({ quality: 92 })
    .toFile(path);
  console.log(path);
}
