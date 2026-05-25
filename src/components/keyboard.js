const ROWS = [
  ['Q','W','E','R','T','Y','U','I','O','P'],
  ['A','S','D','F','G','H','J','K','L'],
  ['⇧','Z','X','C','V','B','N','M','⌫'],
  ['123','space','return'],
]

const KEY_CLASS = {
  '⇧': 'wide shift', '⌫': 'wide', '123': 'wide', 'return': 'wide', 'space': 'space',
}

export class KeyboardOverlay {
  constructor(container, style = 'ios') {
    this.container = container
    this.style = style
    this._el = null
    this._litTimers = new Map()
    this._sfxPool = []
    this._loadSfx(style === 'ios' ? 'soft' : 'mechanical')
  }

  mount() {
    const el = document.createElement('div')
    el.className = 'keyboard-overlay'
    el.innerHTML = ROWS.map(row => `
      <div class="kb-row">
        ${row.map(k => `<div class="key ${KEY_CLASS[k] || ''}">${k === 'space' ? '' : k}</div>`).join('')}
      </div>`).join('')

    if (this.style === 'android') {
      el.querySelectorAll('.key').forEach(k => {
        k.style.borderRadius = '4px'
        k.style.background = 'rgba(255,255,255,0.07)'
      })
    }

    this.container.appendChild(el)
    this._el = el
    return el
  }

  show() {
    if (!this._el) this.mount()
    requestAnimationFrame(() => this._el.classList.add('visible'))
  }

  hide() {
    this._el?.classList.remove('visible')
  }

  destroy() {
    this._litTimers.forEach((timerId) => clearTimeout(timerId))
    this._litTimers.clear()
    this._el?.remove()
    this._el = null
  }

  // Animate a key press for a given character
  pressKey(char) {
    if (!this._el) return
    const upper = char.toUpperCase()
    let target = null

    // Find matching key
    this._el.querySelectorAll('.key').forEach(k => {
      if (k.textContent === upper) target = k
    })

    if (!target) {
      // Space
      if (char === ' ') target = this._el.querySelector('.key.space')
      // Numbers/symbols → flash 123 key
      else if (/[^a-zA-Z]/.test(char)) target = this._el.querySelector('.key.wide:first-child')
    }

    if (target) {
      target.classList.add('lit')
      this._playSfx()
      const prev = this._litTimers.get(target)
      if (prev) clearTimeout(prev)
      const nextTimer = setTimeout(() => {
        target.classList.remove('lit')
        this._litTimers.delete(target)
      }, 120)
      this._litTimers.set(target, nextTimer)
    }
  }

  async _loadSfx(type) {
    try {
      const pool = []
      for (let i = 1; i <= 5; i++) {
        const num = String(i).padStart(2, '0')
        const a = new Audio(`/src/assets/audio/keyboard_sfx/${type}/click_${num}.wav`)
        a.load()
        pool.push(a)
      }
      this._sfxPool = pool
    } catch { /* no sfx available */ }
  }

  _playSfx() {
    if (!this._sfxPool.length) return
    try {
      const clip = this._sfxPool[Math.floor(Math.random() * this._sfxPool.length)]
      const copy = clip.cloneNode()
      copy.volume = 0.6
      copy.play().catch(() => {})
    } catch { /* ignore */ }
  }
}
