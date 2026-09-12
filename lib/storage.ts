import {
  ArchiveSchema,
  MemorySchema,
  MAX_REFERENCE_DATA_LENGTH,
  type Memory,
  type Photo,
} from "./contracts";

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("memory-journal", 1);
    request.onupgradeneeded = () =>
      request.result.createObjectStore("memories", { keyPath: "id" });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(
        new Error(
          "Your browser could not open local storage. Allow site storage or use a regular browser window.",
        ),
      );
  });
}

async function transaction<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("memories", mode);
    const request = run(tx.objectStore("memories"));
    tx.oncomplete = () => {
      db.close();
      resolve(request.result);
    };
    tx.onabort = tx.onerror = () => {
      db.close();
      reject(
        new Error(
          "Memory could not be saved. Your browser storage may be full. Export a backup before clearing anything.",
        ),
      );
    };
  });
}

export async function listMemories(): Promise<Memory[]> {
  const values = await transaction("readonly", (store) => store.getAll());
  return values
    .map((value) => MemorySchema.parse(value))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function saveMemory(memory: Memory): Promise<void> {
  await transaction("readwrite", (store) =>
    store.put(MemorySchema.parse(memory)),
  );
}

export async function removeMemory(id: string): Promise<void> {
  await transaction("readwrite", (store) => store.delete(id));
}

export async function importArchive(file: File): Promise<Memory> {
  if (file.size > 70_000_000)
    throw new Error(
      "This backup is too large. Choose a Memory backup under 70 MB.",
    );
  const parsed = ArchiveSchema.safeParse(JSON.parse(await file.text()));
  if (!parsed.success)
    throw new Error(
      "This is not a valid Memory backup. Choose a .memory.json file exported from this app.",
    );
  const memory = {
    ...parsed.data.memory,
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
  };
  await saveMemory(memory);
  return memory;
}

export function exportArchive(memory: Memory): void {
  const blob = new Blob([JSON.stringify({ format: "memory-v1", memory })], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${memory.title.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.memory.json`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function readPhoto(file: File): Promise<Photo> {
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type))
    throw new Error(
      `${file.name}: choose a JPG, PNG, or WebP photo. Export HEIC photos as JPG first.`,
    );
  if (file.size > 15_000_000)
    throw new Error(`${file.name}: photos must be smaller than 15 MB.`);
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error(
      `${file.name} could not be opened. Try exporting it as a JPG.`,
    );
  }
  try {
    if (bitmap.width * bitmap.height > 40_000_000)
      throw new Error(`${file.name}: resize this photo below 40 megapixels.`);
    const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const context = canvas.getContext("2d");
    if (!context) throw new Error("This browser could not process the photo.");
    context.fillStyle = "#fff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    return {
      id: crypto.randomUUID(),
      title:
        file.name
          .replace(/\.[^.]+$/, "")
          .replace(/[_-]+/g, " ")
          .slice(0, 100) || "A moment",
      note: "",
      image: canvas.toDataURL("image/jpeg", 0.88),
      width: canvas.width,
      height: canvas.height,
    };
  } finally {
    bitmap.close();
  }
}

export async function imageData(image: string): Promise<string> {
  if (image.startsWith("data:") && image.length <= MAX_REFERENCE_DATA_LENGTH)
    return image;
  const response = await fetch(image);
  if (!response.ok)
    throw new Error("The source photo could not be loaded. Try again.");
  const bitmap = await createImageBitmap(await response.blob());
  try {
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");
    if (!context)
      throw new Error("This browser could not prepare the reference photo.");
    for (const maxSide of [1536, 1024, 768]) {
      const scale = Math.min(
        1,
        maxSide / Math.max(bitmap.width, bitmap.height),
      );
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      context.fillStyle = "#fff";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      const reference = canvas.toDataURL("image/jpeg", 0.8);
      if (reference.length <= MAX_REFERENCE_DATA_LENGTH) return reference;
    }
    throw new Error(
      "This reference photo is too large for cloud processing. Try a smaller photo.",
    );
  } finally {
    bitmap.close();
  }
}
