/**
 * What an image file ACTUALLY is, read from its bytes.
 *
 * Not `file.type`, and never the extension. Four of the seven team crests on
 * this site were AVIF files named `.png`, uploaded through a picker that
 * trusted both — and because browsers sniff past a wrong label, the site looked
 * perfect for months. WhatsApp does not sniff and cannot render AVIF, so every
 * shared team and player link previewed with no image at all.
 *
 * The magic numbers are the only thing that doesn't lie.
 */

/** Formats a link unfurler (WhatsApp, Facebook, Slack…) will reliably render. */
export const SAFE_IMAGE_TYPES = ['png', 'jpeg']

export const IMAGE_TYPE_ERROR = 'unsupported-image-type'

/** Human copy for a rejected file, in the app's language. */
export const IMAGE_TYPE_MESSAGE = 'קובץ PNG או JPEG בלבד — פורמטים אחרים (AVIF, WebP, HEIC) לא מוצגים בתצוגה המקדימה של וואטסאפ'

/**
 * Reads the first bytes of a File/Blob and returns 'png' | 'jpeg' | 'avif' |
 * 'webp' | 'gif' | null (null = unrecognised, including a decoy extension).
 */
export async function sniffImageType(file) {
  if (!file) return null
  let bytes
  try {
    bytes = new Uint8Array(await file.slice(0, 16).arrayBuffer())
  } catch {
    return null
  }
  if (bytes.length < 12) return null

  const at = (i, sig) => sig.every((b, k) => bytes[i + k] === b)

  if (at(0, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'png'
  if (at(0, [0xff, 0xd8, 0xff])) return 'jpeg'
  if (at(0, [0x47, 0x49, 0x46, 0x38])) return 'gif'
  // RIFF....WEBP
  if (at(0, [0x52, 0x49, 0x46, 0x46]) && at(8, [0x57, 0x45, 0x42, 0x50])) return 'webp'
  // ISO-BMFF: ....ftypavif / ftypavis
  if (at(4, [0x66, 0x74, 0x79, 0x70]) && at(8, [0x61, 0x76, 0x69])) return 'avif'
  return null
}

/** True when the bytes are a format every link unfurler can render. */
export async function isSafeImage(file) {
  return SAFE_IMAGE_TYPES.includes(await sniffImageType(file))
}
