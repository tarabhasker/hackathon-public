// Centre-crop an image file to a square and scale it down, so profile photos
// are small and uniform before they are uploaded. Returns a JPEG Blob.
export async function squareJpeg(file, size = 256, quality = 0.85) {
  const bitmap = await createImageBitmap(file).catch(() => null)
  if (!bitmap) throw new Error("That file doesn't look like an image")
  const side = Math.min(bitmap.width, bitmap.height)
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = '#FFFFFF' // flatten transparency
  ctx.fillRect(0, 0, size, size)
  ctx.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, size, size)
  bitmap.close?.()
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality))
  if (!blob) throw new Error("Couldn't process that image")
  return blob
}
