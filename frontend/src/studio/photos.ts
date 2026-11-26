// Turns an uploaded photo into the two web sizes the shop uses:
// large (1000px, product page) and small (480px, cards/thumbnails/bag).

export interface PreparedPhoto {
  /** filename inside public/products (and public/products/sm) */
  name: string
  large: string // base64 JPEG
  small: string // base64 JPEG
  preview: string // data URL for showing it before it is published
}

async function loadImage(file: File): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(file)
  try {
    const img = new Image()
    img.src = url
    await img.decode()
    return img
  } catch {
    throw new Error(`"${file.name}" is not an image this browser can read. Use JPG, PNG or WebP.`)
  } finally {
    URL.revokeObjectURL(url)
  }
}

function toJpeg(img: HTMLImageElement, max: number, quality: number) {
  const scale = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(img.naturalWidth * scale)
  canvas.height = Math.round(img.naturalHeight * scale)
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#fff' // transparent PNGs get a white background, not black
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
  return canvas.toDataURL('image/jpeg', quality)
}

export async function preparePhoto(file: File, baseName: string): Promise<PreparedPhoto> {
  const img = await loadImage(file)
  const large = toJpeg(img, 1000, 0.8)
  const small = toJpeg(img, 480, 0.76)
  // A new, unique filename per upload so browsers never show an old cached photo.
  const name = `${baseName}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}.jpg`
  return { name, large: large.split(',')[1], small: small.split(',')[1], preview: small }
}
