const SCROLLBAR_FADE_MS = 2000
const activeTimers = new WeakMap()
const MENU_SCROLL_SCOPE = [
  '.hub-panel',
  '.export-rail',
  '.ep-panel',
  '.new-project-sheet',
  '.bubble-options-sheet',
  '.compose-attach-sheet',
  '.project-scene-menu',
  '.title-editor-sheet',
  '.groups-sheet',
  '.credits-sheet',
  '.pro-sheet',
].join(', ')

function isScrollable(el) {
  return el.scrollHeight > el.clientHeight || el.scrollWidth > el.clientWidth
}

function isMenuSurface(el) {
  return !!el.closest(MENU_SCROLL_SCOPE)
}

function showScrollbar(el) {
  if (!(el instanceof Element)) return
  if (!isScrollable(el)) return
  if (!isMenuSurface(el)) return

  el.classList.add('bf-menu-scroll')
  el.classList.add('bf-scroll-active')

  const existing = activeTimers.get(el)
  if (existing) window.clearTimeout(existing)

  const timer = window.setTimeout(() => {
    el.classList.remove('bf-scroll-active')
    activeTimers.delete(el)
  }, SCROLLBAR_FADE_MS)

  activeTimers.set(el, timer)
}

export function initScrollbarPolicy() {
  document.addEventListener('scroll', event => {
    const target = event.target
    if (target instanceof Element) {
      showScrollbar(target)
      return
    }
    showScrollbar(document.documentElement)
  }, true)
}
