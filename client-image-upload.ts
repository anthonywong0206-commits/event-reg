const SAFE_UPLOAD_BYTES = 3.5 * 1024 * 1024;
const MAX_IMAGE_EDGE = 2600;
const OUTPUT_TYPE = "image/webp";

function fileNameWithoutExtension(name: string) {
  return name.replace(/\.[^.]+$/, "") || "image";
}

async function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number) {
  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("未能處理圖片，請嘗試另一張圖片"));
    }, type, quality);
  });
}

/**
 * Normalise large uploads in the browser before they reach the hosting request
 * body limit. Small files are kept unchanged; large/high-resolution images are
 * converted to WebP and resized while preserving their aspect ratio.
 */
export async function prepareImageForUpload(file: File): Promise<File> {
  const supported = new Set(["image/jpeg", "image/png", "image/webp"]);
  if (!supported.has(file.type)) throw new Error("只支援 JPG、PNG 或 WebP 圖片");

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error("無法讀取圖片，請確認檔案沒有損壞");
  }

  try {
    const longest = Math.max(bitmap.width, bitmap.height);
    const scale = longest > MAX_IMAGE_EDGE ? MAX_IMAGE_EDGE / longest : 1;
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));

    // If the source is already safely below the request limit and does not need
    // resizing, preserve the original file and quality.
    if (file.size <= SAFE_UPLOAD_BYTES && scale === 1) return file;

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("瀏覽器未能處理圖片");
    context.drawImage(bitmap, 0, 0, width, height);

    // Progressively lower WebP quality only when required. The loop keeps the
    // final multipart body comfortably below common serverless request limits.
    let quality = 0.9;
    let blob = await canvasToBlob(canvas, OUTPUT_TYPE, quality);
    while (blob.size > SAFE_UPLOAD_BYTES && quality > 0.5) {
      quality -= 0.1;
      blob = await canvasToBlob(canvas, OUTPUT_TYPE, quality);
    }

    if (blob.size > SAFE_UPLOAD_BYTES) {
      throw new Error("圖片壓縮後仍然過大，請使用較低解像度圖片（建議 3.5MB 以下）");
    }

    return new File([blob], `${fileNameWithoutExtension(file.name)}.webp`, {
      type: OUTPUT_TYPE,
      lastModified: Date.now(),
    });
  } finally {
    bitmap.close();
  }
}

export async function readJsonResponse<T extends Record<string, unknown>>(response: Response): Promise<T> {
  const contentType = response.headers.get("content-type") || "";
  const text = await response.text();

  if (contentType.includes("application/json")) {
    try {
      return JSON.parse(text) as T;
    } catch {
      // Fall through to a readable error below.
    }
  }

  if (!response.ok) {
    const lower = text.toLowerCase();
    if (response.status === 413 || lower.includes("request entity too large") || lower.includes("payload too large")) {
      throw new Error("圖片檔案太大，系統已嘗試壓縮；請改用較低解像度圖片後再試");
    }
    throw new Error(text.trim() || `圖片上載失敗（HTTP ${response.status}）`);
  }

  throw new Error("伺服器回傳格式異常，請重新嘗試上載圖片");
}
