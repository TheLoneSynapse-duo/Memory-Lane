/**
 * Reading a photograph off the device and keeping it as a data URL.
 *
 * Shared by the story editor and the person cards so a file chosen anywhere
 * in the app is handled the same way.
 */

export function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () =>
      typeof reader.result === "string"
        ? resolve(reader.result)
        : reject(new Error("That file could not be read."));
    reader.onerror = () => reject(reader.error ?? new Error("That file could not be read."));
    reader.readAsDataURL(file);
  });
}

/**
 * Photos are kept as data URLs, so a full-size phone picture would bloat the
 * store. Anything larger than the biggest card is scaled down first.
 */
export async function shrinkToDataUrl(file: File): Promise<string> {
  const original = await readFileAsDataUrl(file);
  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("That photo could not be opened."));
    img.src = original;
  });

  const maxEdge = 1600;
  const scale = Math.min(1, maxEdge / Math.max(image.naturalWidth, image.naturalHeight));
  if (scale === 1 && original.length < 1_200_000) return original;

  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) return original;
  // Fill first so a transparent PNG does not come out black on JPEG.
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.82);
}
