import { animate, stagger } from 'animejs'

const PRESSABLE_SELECTOR = 'button, .sam-motion-pressable'
const ENTER_ITEM_SELECTOR = [
  '.sam-sidebar-section',
  '.sam-panel',
  '.sam-stage',
  '.sam-assets-hero',
  '.sam-assets-toolbar',
  '.sam-assets-bulkbar',
  '.sam-asset-card',
  '.sam-prompts-hero',
  '.sam-prompts-toolbar',
  '.sam-prompts-syncbar',
  '.sam-prompt-market-card',
  '.sam-settings-hero',
  '.sam-settings-sidebar',
  '.sam-settings-main',
  '.sam-project-card',
  '.sam-tasks-summary article',
  '.sam-task-row',
  '.sam-current-work-card',
  '.sam-compare-result-card',
].join(',')

function prefersReducedMotion() {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

function isDisabledPressable(target: HTMLElement) {
  return (
    target.matches(':disabled') ||
    target.getAttribute('aria-disabled') === 'true' ||
    target.classList.contains('disabled')
  )
}

function closestPressable(target: EventTarget | null) {
  if (!(target instanceof Element)) {
    return null
  }
  const pressable = target.closest<HTMLElement>(PRESSABLE_SELECTOR)
  if (!pressable || isDisabledPressable(pressable)) {
    return null
  }
  return pressable
}

function releasePressable(target: HTMLElement) {
  target.classList.remove('sam-motion-pressing')
  if (prefersReducedMotion()) {
    return
  }
  animate(target, {
    scale: 1,
    duration: 180,
    ease: 'outCubic',
  })
}

function createTouchRipple(target: HTMLElement, event: PointerEvent) {
  const rect = target.getBoundingClientRect()
  const size = Math.max(rect.width, rect.height)
  const ripple = document.createElement('span')
  ripple.className = 'sam-touch-ripple'
  ripple.style.width = `${size}px`
  ripple.style.height = `${size}px`
  ripple.style.left = `${event.clientX - rect.left - size / 2}px`
  ripple.style.top = `${event.clientY - rect.top - size / 2}px`
  target.appendChild(ripple)

  animate(ripple, {
    scale: [0.2, 1.9],
    opacity: [0.22, 0],
    duration: 420,
    ease: 'outCubic',
    onComplete: () => ripple.remove(),
  })
}

export function installAppMotion(root: Document | HTMLElement = document) {
  const activePressables = new Set<HTMLElement>()

  function press(target: HTMLElement, event?: PointerEvent) {
    target.classList.add('sam-motion-target', 'sam-motion-pressing')
    activePressables.add(target)
    if (prefersReducedMotion()) {
      return
    }
    animate(target, {
      scale: 0.972,
      duration: 82,
      ease: 'outCubic',
    })
    if (event && event.pointerType !== 'mouse') {
      createTouchRipple(target, event)
    }
  }

  function handlePointerDown(event: Event) {
    if (event instanceof PointerEvent && event.button !== 0) {
      return
    }
    const pressable = closestPressable(event.target)
    if (!pressable) {
      return
    }
    press(pressable, event instanceof PointerEvent ? event : undefined)
  }

  function handlePointerUp() {
    for (const pressable of activePressables) {
      releasePressable(pressable)
    }
    activePressables.clear()
  }

  function handleKeyDown(event: Event) {
    if (!(event instanceof KeyboardEvent) || (event.key !== 'Enter' && event.key !== ' ')) {
      return
    }
    const pressable = closestPressable(event.target)
    if (pressable) {
      press(pressable)
    }
  }

  function handleKeyUp(event: Event) {
    if (event instanceof KeyboardEvent && (event.key === 'Enter' || event.key === ' ')) {
      handlePointerUp()
    }
  }

  root.addEventListener('pointerdown', handlePointerDown, true)
  root.addEventListener('pointerup', handlePointerUp, true)
  root.addEventListener('pointercancel', handlePointerUp, true)
  root.addEventListener('pointerleave', handlePointerUp, true)
  root.addEventListener('keydown', handleKeyDown, true)
  root.addEventListener('keyup', handleKeyUp, true)

  return () => {
    root.removeEventListener('pointerdown', handlePointerDown, true)
    root.removeEventListener('pointerup', handlePointerUp, true)
    root.removeEventListener('pointercancel', handlePointerUp, true)
    root.removeEventListener('pointerleave', handlePointerUp, true)
    root.removeEventListener('keydown', handleKeyDown, true)
    root.removeEventListener('keyup', handleKeyUp, true)
  }
}

export function animatePageEnter(el: Element, done: () => void) {
  if (!(el instanceof HTMLElement) || prefersReducedMotion()) {
    done()
    return
  }

  animate(el, {
    opacity: [0, 1],
    translateY: [10, 0],
    filter: ['blur(4px)', 'blur(0px)'],
    duration: 300,
    ease: 'outCubic',
    onComplete: done,
  })

  const items = Array.from(el.querySelectorAll<HTMLElement>(ENTER_ITEM_SELECTOR)).slice(0, 42)
  if (items.length) {
    animate(items, {
      opacity: [0, 1],
      translateY: [12, 0],
      duration: 360,
      delay: stagger(22, { start: 48 }),
      ease: 'outCubic',
    })
  }
}

export function animatePageLeave(el: Element, done: () => void) {
  if (!(el instanceof HTMLElement) || prefersReducedMotion()) {
    done()
    return
  }
  animate(el, {
    opacity: [1, 0],
    translateY: [0, -6],
    duration: 150,
    ease: 'inCubic',
    onComplete: done,
  })
}
