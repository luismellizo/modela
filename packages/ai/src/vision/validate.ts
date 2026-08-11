/**
 * Attachment validation.
 *
 * Runs on the server. A client-side check is a courtesy to the user; it is not
 * a control, because anything that reaches `/api/copilot` may have skipped it.
 */

export type ImageValidationOptions = {
  /** Bytes. Vision endpoints choke well before this, but so does the wallet. */
  maxBytes?: number
  allowedTypes?: readonly string[]
}

const DEFAULTS = {
  maxBytes: 8 * 1024 * 1024,
  allowedTypes: ['image/png', 'image/jpeg', 'image/webp', 'image/gif'] as const,
}

export type ImageValidationResult =
  | { ok: true; mimeType: string; bytes: number }
  | { ok: false; code: ImageValidationError; message: string }

export type ImageValidationError =
  | 'not_a_data_url'
  | 'unsupported_type'
  | 'too_large'
  | 'malformed'
  | 'type_mismatch'

/**
 * Magic bytes for the formats we accept. The declared MIME type in a data URL
 * is attacker-controlled, so a PDF renamed to `.png` announces itself as PNG.
 * The header is the only honest signal.
 */
const SIGNATURES: { mime: string; bytes: number[]; offset?: number }[] = [
  { mime: 'image/png', bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
  { mime: 'image/jpeg', bytes: [0xff, 0xd8, 0xff] },
  { mime: 'image/gif', bytes: [0x47, 0x49, 0x46, 0x38] },
  // WEBP is RIFF....WEBP — check both halves.
  { mime: 'image/webp', bytes: [0x52, 0x49, 0x46, 0x46] },
]

export function validateImageDataUrl(
  dataUrl: string,
  options: ImageValidationOptions = {},
): ImageValidationResult {
  const config = { ...DEFAULTS, ...options }

  const match = /^data:([a-z]+\/[a-z0-9.+-]+)(;[^,]*)?,(.*)$/is.exec(dataUrl)
  if (!match) {
    return {
      ok: false,
      code: 'not_a_data_url',
      message: 'Attachment must be a base64 data URL',
    }
  }

  const declaredType = (match[1] ?? '').toLowerCase()
  const parameters = match[2] ?? ''
  const payload = match[3] ?? ''

  if (!config.allowedTypes.includes(declaredType)) {
    return {
      ok: false,
      code: 'unsupported_type',
      message: `Unsupported image type "${declaredType}". Allowed: ${config.allowedTypes.join(', ')}`,
    }
  }

  if (!parameters.toLowerCase().includes('base64')) {
    return { ok: false, code: 'malformed', message: 'Only base64 data URLs are accepted' }
  }

  let buffer: Uint8Array
  try {
    buffer = decodeBase64(payload)
  } catch {
    return { ok: false, code: 'malformed', message: 'Attachment is not valid base64' }
  }

  if (buffer.byteLength === 0) {
    return { ok: false, code: 'malformed', message: 'Attachment is empty' }
  }

  if (buffer.byteLength > config.maxBytes) {
    const limitMb = (config.maxBytes / (1024 * 1024)).toFixed(1)
    const actualMb = (buffer.byteLength / (1024 * 1024)).toFixed(1)
    return {
      ok: false,
      code: 'too_large',
      message: `Attachment is ${actualMb} MB, over the ${limitMb} MB limit`,
    }
  }

  const detected = detectMimeType(buffer)
  if (!detected) {
    return {
      ok: false,
      code: 'malformed',
      message: 'Attachment does not look like a PNG, JPEG, WEBP or GIF',
    }
  }
  if (detected !== declaredType) {
    return {
      ok: false,
      code: 'type_mismatch',
      message: `Attachment declares ${declaredType} but its contents are ${detected}`,
    }
  }

  return { ok: true, mimeType: detected, bytes: buffer.byteLength }
}

export function detectMimeType(buffer: Uint8Array): string | null {
  for (const signature of SIGNATURES) {
    const offset = signature.offset ?? 0
    if (buffer.byteLength < offset + signature.bytes.length) continue
    const matches = signature.bytes.every((byte, index) => buffer[offset + index] === byte)
    if (!matches) continue
    if (signature.mime === 'image/webp') {
      // Bytes 8..11 must spell WEBP, otherwise it is some other RIFF container.
      const isWebp =
        buffer[8] === 0x57 && buffer[9] === 0x45 && buffer[10] === 0x42 && buffer[11] === 0x50
      if (!isWebp) continue
    }
    return signature.mime
  }
  return null
}

function decodeBase64(value: string): Uint8Array {
  const normalised = value.replace(/\s/g, '')
  if (normalised === '' || !/^[A-Za-z0-9+/]*={0,2}$/.test(normalised)) {
    throw new Error('invalid base64')
  }
  const binary = atob(normalised)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }
  return bytes
}
