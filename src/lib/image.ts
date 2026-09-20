/**
 * Photos from the phone's own camera app can be 12 MP / 5 MB, which is slow on a weak
 * connection. Shrink anything large to at most `maxSide` px on the long edge as JPEG.
 * Also bakes in EXIF rotation so the server always receives an upright image.
 * On any failure the original file is returned unchanged.
 */
export async function shrinkIfLarge(blob: Blob, maxSide = 2048, maxBytes = 3_000_000): Promise<Blob> {
  try {
    const bitmap = await createImageBitmap(blob)
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height))
    if (scale === 1 && blob.size <= maxBytes) {
      bitmap.close()
      return blob
    }
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(bitmap.width * scale)
    canvas.height = Math.round(bitmap.height * scale)
    const ctx = canvas.getContext('2d')
    if (!ctx) {
      bitmap.close()
      return blob
    }
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    bitmap.close()
    const out = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.9))
    return out && out.size < blob.size ? out : blob
  } catch {
    return blob
  }
}
