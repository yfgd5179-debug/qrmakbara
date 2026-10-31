/**
 * Client-side photo compression. Runs in the browser before upload so that
 * multi-megabyte camera photos become ~100-300 KB WebP files — comfortably
 * under the Supabase free-plan 50 MB/file cap and much cheaper on the
 * 5 GB/month egress quota. Videos are NOT compressed here (they go to R2).
 *
 * Keep this module free of server-only imports: it is bundled for the client.
 */

const MAX_DIMENSION = 2048; // plenty for on-screen memorial pages
const WEBP_QUALITY = 0.82;
const SKIP_BELOW_BYTES = 200 * 1024; // already small enough

function canvasToWebp(
  canvas: HTMLCanvasElement,
  quality: number
): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, "image/webp", quality));
}

/**
 * Returns a compressed WebP copy of the photo, or the original file when
 * compression would not help (small files, GIFs, exotic formats, failures).
 */
export async function compressImage(file: File): Promise<File> {
  if (file.size <= SKIP_BELOW_BYTES) return file;
  // keep animated GIFs as-is; the canvas would flatten them to one frame
  if (file.type === "image/gif") return file;

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    return file; // undecodable format — let the server-side validation decide
  }

  try {
    const scale = Math.min(
      1,
      MAX_DIMENSION / Math.max(bitmap.width, bitmap.height)
    );
    const width = Math.round(bitmap.width * scale);
    const height = Math.round(bitmap.height * scale);

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, width, height);

    const blob = await canvasToWebp(canvas, WEBP_QUALITY);
    // If WebP came out bigger (rare), keep the original bytes.
    if (!blob || blob.size >= file.size) return file;

    const baseName = file.name.replace(/\.[^.]+$/, "") || "photo";
    return new File([blob], `${baseName}.webp`, {
      type: "image/webp",
      lastModified: Date.now(),
    });
  } catch {
    return file;
  } finally {
    bitmap.close();
  }
}
