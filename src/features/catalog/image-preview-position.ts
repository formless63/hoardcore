const previewSize = 256
const gap = 16
const edge = 8

/** Keep the preview beside the pointer, flipping before it crosses an edge. */
export function imagePreviewPosition(x: number, y: number, viewportWidth: number, viewportHeight: number) {
  return {
    left: x + gap + previewSize <= viewportWidth - edge ? x + gap : Math.max(edge, x - gap - previewSize),
    top: y + gap + previewSize <= viewportHeight - edge ? y + gap : Math.max(edge, y - gap - previewSize),
  }
}
