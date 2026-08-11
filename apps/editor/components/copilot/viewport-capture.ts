'use client'

/**
 * Renders what the user is looking at, as a data URL for the vision model.
 *
 * The editor already does this for its "Take Screenshot" command
 * (`packages/editor/src/components/ui/command-palette/editor-commands.tsx`),
 * which is proof the WebGL context keeps its drawing buffer — otherwise both
 * would come back blank.
 *
 * The result is downscaled: a 4K canvas is several megabytes of base64 for no
 * extra insight, and every one of those bytes is billed as input tokens.
 */

const MAX_EDGE = 1280

export async function captureViewport(): Promise<string | null> {
  if (typeof document === 'undefined') return null

  const canvas = document.querySelector('canvas')
  if (!canvas || canvas.width === 0 || canvas.height === 0) return null

  try {
    const scale = Math.min(1, MAX_EDGE / Math.max(canvas.width, canvas.height))
    if (scale === 1) return canvas.toDataURL('image/png')

    const target = document.createElement('canvas')
    target.width = Math.round(canvas.width * scale)
    target.height = Math.round(canvas.height * scale)

    const context = target.getContext('2d')
    if (!context) return canvas.toDataURL('image/png')

    context.drawImage(canvas, 0, 0, target.width, target.height)
    return target.toDataURL('image/png')
  } catch {
    // A tainted or lost context is not worth failing a whole turn over — the
    // tool reports it and the model falls back to the scene data.
    return null
  }
}
