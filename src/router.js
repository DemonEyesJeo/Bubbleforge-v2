const screenRegistry = {}
const screenStack = []
const getStack = () => document.getElementById('screen-stack')

export function register(name, screenClass) {
  screenRegistry[name] = screenClass
}

export function push(name, params = {}) {
  const ScreenClass = screenRegistry[name]
  if (!ScreenClass) return console.error(`Screen "${name}" not registered`)
  const stack = getStack()
  if (!stack) return console.error('Screen stack element not found')

  const instance = new ScreenClass(params)
  const el = instance.render()
  el.classList.add('screen')
  el.dataset.screenName = name

  // Push current active screen behind
  const current = stack.querySelector('.screen.active, .screen.base')
  if (current) {
    current.classList.remove('active', 'base')
    current.classList.add('behind')
  }

  stack.appendChild(el)
  // Force reflow then animate in
  el.getBoundingClientRect()
  el.classList.add('active')

  instance._el = el
  instance.bind?.()
  screenStack.push({ name, instance, el })
}

export function pop() {
  if (screenStack.length <= 1) return
  const stack = getStack()
  if (!stack) return

  const { instance, el } = screenStack.pop()

  el.style.transition = 'transform 0.32s cubic-bezier(0.32,0,0.15,1)'
  el.style.transform = 'translateX(100%)'
  setTimeout(() => {
    instance.destroy?.()
    el.remove()
  }, 340)

  const prev = screenStack[screenStack.length - 1]
  if (prev) {
    prev.el.classList.remove('behind')
    prev.el.classList.add('active')
    prev.instance.resume?.()
  }
}

export function replace(name, params = {}) {
  const ScreenClass = screenRegistry[name]
  if (!ScreenClass) return
  const stack = getStack()
  if (!stack) return

  const instance = new ScreenClass(params)
  const el = instance.render()
  el.classList.add('screen', 'active')
  el.dataset.screenName = name

  if (screenStack.length) {
    const { instance: old, el: oldEl } = screenStack.pop()
    stack.appendChild(el)
    instance._el = el
    instance.bind?.()
    old.destroy?.()
    oldEl.remove()
    screenStack.push({ name, instance, el })
  } else {
    stack.appendChild(el)
    instance._el = el
    instance.bind?.()
    screenStack.push({ name, instance, el })
  }
}

export function currentScreen() {
  return screenStack[screenStack.length - 1] || null
}
