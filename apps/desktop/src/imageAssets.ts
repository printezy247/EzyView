/**
 * Binary assets for image drawings.
 *
 * localStorage is the wrong place for a raster: a 4 MB screenshot becomes a
 * ~5.5 MB base64 string and blows the ~5 MB origin quota. Drawings keep only an
 * `assetId`; the bytes live in IndexedDB, which is designed for blobs and is
 * available in the Tauri WebView on every supported platform.
 */

const DB_NAME = "ezyview-assets";
const DB_VERSION = 1;
const STORE = "images";

function openDb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === "undefined") return Promise.resolve(null);
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.addEventListener("upgradeneeded", () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    });
    request.addEventListener("success", () => resolve(request.result));
    request.addEventListener("error", () => reject(request.error ?? new Error("Could not open the image asset store")));
  });
}

/** Persist one image blob under `assetId`; resolves false when unavailable. */
export async function putImageAsset(assetId: string, blob: Blob): Promise<boolean> {
  const db = await openDb().catch(() => null);
  if (!db) return false;
  return new Promise((resolve) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(blob, assetId);
    tx.addEventListener("complete", () => {
      db.close();
      resolve(true);
    });
    tx.addEventListener("error", () => {
      db.close();
      resolve(false);
    });
  });
}

export async function getImageAsset(assetId: string): Promise<Blob | null> {
  const db = await openDb().catch(() => null);
  if (!db) return null;
  return new Promise((resolve) => {
    const tx = db.transaction(STORE, "readonly");
    const request = tx.objectStore(STORE).get(assetId);
    request.addEventListener("success", () => resolve(request.result instanceof Blob ? request.result : null));
    request.addEventListener("error", () => resolve(null));
    tx.addEventListener("complete", () => db.close());
  });
}

export async function deleteImageAsset(assetId: string): Promise<void> {
  const db = await openDb().catch(() => null);
  if (!db) return;
  await new Promise<void>((resolve) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(assetId);
    tx.addEventListener("complete", () => {
      db.close();
      resolve();
    });
    tx.addEventListener("error", () => {
      db.close();
      resolve();
    });
  });
}

/** Decode stored blobs into a map the chart renderer can paint. */
export async function loadImageAssets(assetIds: readonly string[]): Promise<Map<string, CanvasImageSource>> {
  const out = new Map<string, CanvasImageSource>();
  if (assetIds.length === 0) return out;
  await Promise.all(
    [...new Set(assetIds)].map(async (id) => {
      const blob = await getImageAsset(id);
      if (!blob) return;
      try {
        if (typeof createImageBitmap === "function") out.set(id, await createImageBitmap(blob));
      } catch {
        // A corrupt asset is left out; the drawing renders its placeholder.
      }
    }),
  );
  return out;
}

/** Read the image's intrinsic size so the drawing can keep its aspect ratio. */
export async function readImageSize(blob: Blob): Promise<{ width: number; height: number }> {
  try {
    if (typeof createImageBitmap === "function") {
      const bitmap = await createImageBitmap(blob);
      const size = { width: bitmap.width, height: bitmap.height };
      bitmap.close?.();
      return size;
    }
  } catch {
    // fall through to the default
  }
  return { width: 640, height: 360 };
}

/** Stable-ish id for a newly imported asset. */
export function newAssetId(): string {
  return `img_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}
