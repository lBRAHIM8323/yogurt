import { createTracerSchedule, TRACER_DURATION_MS } from '../../shared/askTracer'

const TRACER_PEAK_OPACITY = 0.85
const TRACER_EASING = 'cubic-bezier(.37,0,.63,1)'

/** Decorative SVG only: input, focus and submission stay with the composer. */
export function attachAskTracer(box: HTMLFormElement) {
  const field = box.querySelector('textarea')!
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)')
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  svg.setAttribute('class', 'ask-tracer')
  svg.setAttribute('aria-hidden', 'true')
  const segments = Array.from({ length: 20 }, (_, i) => {
    const segment = document.createElementNS(svg.namespaceURI, 'rect') as SVGRectElement
    for (const [key, value] of Object.entries({ x: 1, y: 1, rx: 11, pathLength: 100 })) segment.setAttribute(key, String(value))
    segment.style.strokeDashoffset = String(-i)
    segment.style.opacity = String(Math.sin(Math.PI * (i + .5) / 20) ** 2)
    svg.append(segment)
    return segment
  })
  box.append(svg)
  const resize = () => {
    const { width, height } = box.getBoundingClientRect()
    svg.setAttribute('viewBox', `0 0 ${width} ${height}`)
    for (const segment of segments) {
      segment.setAttribute('width', String(Math.max(0, width - 2)))
      segment.setAttribute('height', String(Math.max(0, height - 2)))
    }
  }
  resize()
  const observer = new ResizeObserver(resize)
  observer.observe(box)
  let bloom: Animation | undefined
  const stop = () => { bloom?.cancel(); bloom = undefined }
  const play = () => {
    stop()
    bloom = svg.animate([
      { opacity: 0, easing: TRACER_EASING },
      { opacity: TRACER_PEAK_OPACITY, offset: 0.4, easing: TRACER_EASING },
      { opacity: 0 },
    ], { duration: TRACER_DURATION_MS })
  }
  // A pointer resting where the panel opened isn't hovering; only movement inside the box counts.
  let moved = false
  const state = () => ({ focused: box.contains(document.activeElement), hovered: moved, hasText: !!field.value,
    reduced: reduced.matches, hidden: document.hidden })
  const schedule = createTracerSchedule(state(), play, stop)
  const update = () => schedule.update(state())
  const blur = () => queueMicrotask(update)
  const move = () => { if (!moved) { moved = true; update() } }
  const leave = () => { moved = false; update() }
  for (const event of ['input', 'focusin']) box.addEventListener(event, update)
  box.addEventListener('pointermove', move)
  box.addEventListener('pointerleave', leave)
  box.addEventListener('focusout', blur)
  document.addEventListener('visibilitychange', update)
  reduced.addEventListener('change', update)
  return {
    update,
    dispose() {
      schedule.dispose(); observer.disconnect(); svg.remove()
      for (const event of ['input', 'focusin']) box.removeEventListener(event, update)
      box.removeEventListener('pointermove', move)
      box.removeEventListener('pointerleave', leave)
      box.removeEventListener('focusout', blur)
      document.removeEventListener('visibilitychange', update)
      reduced.removeEventListener('change', update)
    },
  }
}
