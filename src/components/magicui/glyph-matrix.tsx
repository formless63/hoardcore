// Adapted from Magic UI's MIT-licensed Glyph Matrix registry component.
import { useEffect, useRef } from 'react'

export function GlyphMatrix({ className = '' }: { className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    const context = canvas?.getContext('2d')
    if (!canvas || !context) return

    const glyphs = '01·•+*/\\<>='
    const cellSize = 16
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)')
    let cells: string[] = []
    let opacity: number[] = []
    let columns = 0
    let rows = 0
    let frame = 0
    let last = 0

    const draw = () => {
      const width = canvas.clientWidth
      const height = canvas.clientHeight
      context.clearRect(0, 0, width, height)
      context.fillStyle = getComputedStyle(canvas).color
      context.font = '12px ui-monospace, SFMono-Regular, Menlo, monospace'
      context.textBaseline = 'top'
      for (let y = 0; y < rows; y++) {
        const fade = 1 - (y / Math.max(rows, 1)) * 0.72
        for (let x = 0; x < columns; x++) {
          const index = y * columns + x
          context.globalAlpha = opacity[index] * fade
          context.fillText(cells[index], x * cellSize, y * cellSize)
        }
      }
      context.globalAlpha = 1
    }

    const resize = () => {
      const ratio = window.devicePixelRatio || 1
      const width = canvas.clientWidth
      const height = canvas.clientHeight
      canvas.width = Math.round(width * ratio)
      canvas.height = Math.round(height * ratio)
      context.setTransform(ratio, 0, 0, ratio, 0, 0)
      columns = Math.ceil(width / cellSize)
      rows = Math.ceil(height / cellSize)
      const count = columns * rows
      cells = Array.from({ length: count }, () => glyphs[Math.floor(Math.random() * glyphs.length)])
      opacity = Array.from({ length: count }, () => 0.08 + Math.random() * 0.32)
      draw()
    }

    const tick = (now: number) => {
      if (now - last >= 110) {
        last = now
        const count = columns * rows
        for (let n = 0; n < Math.max(1, Math.floor(count * 0.025)); n++) {
          const index = Math.floor(Math.random() * count)
          cells[index] = glyphs[Math.floor(Math.random() * glyphs.length)]
          opacity[index] = 0.08 + Math.random() * 0.42
        }
        draw()
      }
      frame = requestAnimationFrame(tick)
    }

    const observer = new ResizeObserver(resize)
    observer.observe(canvas)
    resize()
    if (!reducedMotion.matches) frame = requestAnimationFrame(tick)
    const onMotionChange = () => {
      cancelAnimationFrame(frame)
      if (!reducedMotion.matches) frame = requestAnimationFrame(tick)
    }
    reducedMotion.addEventListener('change', onMotionChange)
    return () => {
      observer.disconnect()
      reducedMotion.removeEventListener('change', onMotionChange)
      cancelAnimationFrame(frame)
    }
  }, [])

  return <canvas ref={canvasRef} aria-hidden="true" className={`pointer-events-none block h-full w-full text-muted-foreground ${className}`} />
}
