// Adapted from Magic UI's MIT-licensed Cool Mode registry component.
import { useEffect, useRef, type ReactNode } from 'react'

export function CoolMode({ children }: { children: ReactNode }) {
  const hostRef = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)')
    let pressed = false
    const particles = new Set<HTMLElement>()

    const emit = (event: PointerEvent, count: number) => {
      if (reducedMotion.matches) return
      const button = host.querySelector('button')
      if (button?.disabled) return
      for (let index = 0; index < count; index++) {
        if (particles.size >= 48) break
        const particle = document.createElement('span')
        const size = 5 + Math.random() * 7
        particle.style.cssText = `position:fixed;left:${event.clientX}px;top:${event.clientY}px;width:${size}px;height:${size}px;border-radius:50%;background:var(--primary);pointer-events:none;z-index:2147483647;`
        document.body.appendChild(particle)
        particles.add(particle)
        const dx = (Math.random() - 0.5) * 130
        const dy = -25 - Math.random() * 100
        const animation = particle.animate(
          [{ transform: 'translate(-50%, -50%) scale(1)', opacity: 0.9 }, { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(0.2)`, opacity: 0 }],
          { duration: 500 + Math.random() * 400, easing: 'ease-out' },
        )
        animation.onfinish = () => { particle.remove(); particles.delete(particle) }
      }
    }
    const down = (event: PointerEvent) => { pressed = true; emit(event, 12) }
    const move = (event: PointerEvent) => { if (pressed) emit(event, 2) }
    const up = () => { pressed = false }
    host.addEventListener('pointerdown', down)
    host.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    return () => {
      host.removeEventListener('pointerdown', down)
      host.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      for (const particle of particles) particle.remove()
    }
  }, [])

  return <span ref={hostRef} className="block">{children}</span>
}
