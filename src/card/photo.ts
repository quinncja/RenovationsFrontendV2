// Receipt photos straight off a phone camera are large (and on iPhone may be
// HEIC). Before upload they're redrawn as a JPEG no wider or taller than
// 2400px: plenty to read fine print, quick on cell data, and a format the
// receipt reader accepts. PDFs and anything that can't be decoded go as is.
const MAX = 2400;

export async function prepare(file: File): Promise<File> {
  if (file.type === "application/pdf" || !file.type.startsWith("image/")) return file;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((done) => canvas.toBlob(done, "image/jpeg", 0.85));
    if (!blob) return file;
    const name = (file.name || "receipt").replace(/\.[^.]+$/, "") + ".jpg";
    return new File([blob], name, { type: "image/jpeg" });
  } catch {
    return file;
  }
}
