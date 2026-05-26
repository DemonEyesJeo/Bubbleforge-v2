import { store } from '../store.js'
import { pop } from '../router.js'
import { icons } from '../components/icons.js'

const GRADIENT_PRESETS = [
  'linear-gradient(135deg, #667eea, #764ba2)',
  'linear-gradient(135deg, #f093fb, #f5576c)',
  'linear-gradient(135deg, #4facfe, #00f2fe)',
  'linear-gradient(135deg, #43e97b, #38f9d7)',
  'linear-gradient(135deg, #fa709a, #fee140)',
  'linear-gradient(135deg, #a18cd1, #fbc2eb)',
  'linear-gradient(135deg, #ffecd2, #fcb69f)',
  'linear-gradient(135deg, #ff9a9e, #fecfef)',
  'linear-gradient(135deg, #2af598, #009efd)',
  'linear-gradient(135deg, #f7971e, #ffd200)',
  'linear-gradient(135deg, #ee0979, #ff6a00)',
  'linear-gradient(135deg, #1a1a2e, #16213e)',
  'linear-gradient(135deg, #0f0c29, #302b63)',
  'linear-gradient(135deg, #232526, #414345)',
  'linear-gradient(135deg, #000000, #434343)',
  'linear-gradient(135deg, #ffffff, #e0e0e0)',
]

const COLOR_PRESETS = ['#000000', '#0f0f12', '#1c1c1f', '#2b2b2f', '#3a3a40', '#52525a', '#8b8b93', '#c7c7cc', '#ffffff', '#2979FF', '#F50057', '#00BFA5']

function defaultTitleData() {
  return {
    title: '',
    subtitle: '',
    bg_mode: 'gradient',
    bg_gradient: GRADIENT_PRESETS[11],
    bg_color: '#000000',
    bg_image: null,
    bg_overlay: 0.3,
    text_align: 'center',
    title_size: 48,
    subtitle_size: 22,
    text_color_mode: 'white',
    text_shadow: true,
  }
}

export class TitleEditorScreen {
  constructor({ projectId, sceneId }) {
    this.projectId = projectId
    this.sceneId = sceneId
    this._activeTab = 'background'
    this._bgModeTab = 'gradient'
    this._draft = defaultTitleData()
    this._ignoreNextProjectEvent = false
    this._onProjectChange = (changedProjectId) => {
      if (this._ignoreNextProjectEvent) {
        this._ignoreNextProjectEvent = false
        return
      }
      if (!changedProjectId || changedProjectId === this.projectId) this._refresh()
    }
  }

  render() {
    const el = document.createElement('div')
    el.className = 'title-editor-screen'
    el.innerHTML = `
      <div class="title-bg-layer" id="titleBgLayer"></div>
      <div class="title-editor-floating-nav">
        <button class="title-float-btn" id="titleBackBtn" type="button">✕</button>
        <button class="title-float-btn" id="titleTextToolsBtn" type="button">Aa</button>
        <button class="title-float-btn" id="titleImageBtn" type="button">${icons.image}</button>
      </div>
      <div class="title-editor-canvas" id="titleCanvas">
        <div class="title-canvas-title" id="titleText" contenteditable="true" spellcheck="false"></div>
        <div class="title-canvas-subtitle" id="subtitleText" contenteditable="true" spellcheck="false"></div>
      </div>
      <div class="title-editor-sheet" id="titleEditorSheet"></div>
      <input id="titleBgImageInput" type="file" accept="image/*" hidden />
    `
    return el
  }

  bind() {
    store.on('project-changed', this._onProjectChange)
    this._el.querySelector('#titleBackBtn')?.addEventListener('click', () => pop())
    this._el.querySelector('#titleTextToolsBtn')?.addEventListener('click', () => {
      this._activeTab = this._activeTab === 'text' ? 'background' : 'text'
      this._renderSheet()
    })
    this._el.querySelector('#titleImageBtn')?.addEventListener('click', () => this._el.querySelector('#titleBgImageInput')?.click())
    this._el.querySelector('#titleBgImageInput')?.addEventListener('change', (e) => this._pickBgImage(e.target))

    const titleEl = this._el.querySelector('#titleText')
    const subtitleEl = this._el.querySelector('#subtitleText')
    titleEl?.addEventListener('input', () => {
      this._draft.title = titleEl.textContent || ''
      this._saveDraft()
    })
    subtitleEl?.addEventListener('input', () => {
      this._draft.subtitle = subtitleEl.textContent || ''
      this._saveDraft()
    })
    this._refresh()
  }

  resume() {
    this._refresh()
  }

  destroy() {
    store.off('project-changed', this._onProjectChange)
  }

  _refresh() {
    const project = store.getProject(this.projectId)
    const scene = store.getScene(this.projectId, this.sceneId) || store.getActiveScene(this.projectId)
    if (!project || !scene) {
      pop()
      return
    }
    if (scene.id !== this.sceneId) this.sceneId = scene.id
    this._draft = { ...defaultTitleData(), ...(scene.title_data || {}) }
    this._renderCanvas()
    this._renderSheet()
  }

  _renderCanvas() {
    const bgLayer = this._el.querySelector('#titleBgLayer')
    const canvas = this._el.querySelector('#titleCanvas')
    const titleEl = this._el.querySelector('#titleText')
    const subtitleEl = this._el.querySelector('#subtitleText')
    if (!bgLayer || !canvas || !titleEl || !subtitleEl) return

    const data = this._draft
    canvas.style.textAlign = data.text_align || 'center'
    if (data.bg_mode === 'image' && data.bg_image) {
      bgLayer.style.background = `center / cover no-repeat url(${data.bg_image})`
    } else if (data.bg_mode === 'color') {
      bgLayer.style.background = data.bg_color || '#000000'
    } else {
      bgLayer.style.background = data.bg_gradient || GRADIENT_PRESETS[11]
    }
    bgLayer.style.setProperty('--title-overlay', String(Math.max(0, Math.min(0.8, Number(data.bg_overlay) || 0))))

    titleEl.textContent = data.title || 'Add title'
    subtitleEl.textContent = data.subtitle || 'Add subtitle'
    titleEl.style.fontSize = `${data.title_size || 48}px`
    subtitleEl.style.fontSize = `${data.subtitle_size || 22}px`
    const textColor = this._resolveTextColor(data)
    titleEl.style.color = textColor
    subtitleEl.style.color = this._withAlpha(textColor, 0.85)
    const shadow = data.text_shadow ? '0 2px 12px rgba(0,0,0,0.5)' : 'none'
    titleEl.style.textShadow = shadow
    subtitleEl.style.textShadow = shadow
  }

  _renderSheet() {
    const sheet = this._el.querySelector('#titleEditorSheet')
    if (!sheet) return
    const data = this._draft

    if (this._activeTab === 'text') {
      sheet.innerHTML = `
        <div class="title-sheet-head">Text</div>
        <div class="hub-range-wrap">
          <div class="hub-range-head"><span>Title size</span><span>${data.title_size || 48}px</span></div>
          <input class="hub-range" id="titleSizeRange" type="range" min="24" max="80" step="1" value="${data.title_size || 48}" />
        </div>
        <div class="hub-range-wrap">
          <div class="hub-range-head"><span>Subtitle size</span><span>${data.subtitle_size || 22}px</span></div>
          <input class="hub-range" id="subtitleSizeRange" type="range" min="14" max="36" step="1" value="${data.subtitle_size || 22}" />
        </div>
        <div class="editor-control-row">
          ${['left', 'center', 'right'].map(value => `<button class="hub-pill ${data.text_align === value ? 'active' : ''}" data-text-align="${value}" type="button">${value[0].toUpperCase()}${value.slice(1)}</button>`).join('')}
        </div>
        <div class="editor-control-row">
          ${['white', 'black', 'auto'].map(value => `<button class="hub-pill ${data.text_color_mode === value ? 'active' : ''}" data-text-mode="${value}" type="button">${value[0].toUpperCase()}${value.slice(1)}</button>`).join('')}
          <button class="hub-pill ${data.text_shadow ? 'active' : ''}" id="titleShadowToggle" type="button">Shadow</button>
        </div>
      `
      sheet.querySelector('#titleSizeRange')?.addEventListener('input', (e) => this._updateAndSave({ title_size: Number(e.target.value) }))
      sheet.querySelector('#subtitleSizeRange')?.addEventListener('input', (e) => this._updateAndSave({ subtitle_size: Number(e.target.value) }))
      sheet.querySelectorAll('[data-text-align]').forEach(btn => btn.addEventListener('click', () => this._updateAndSave({ text_align: btn.dataset.textAlign })))
      sheet.querySelectorAll('[data-text-mode]').forEach(btn => btn.addEventListener('click', () => this._updateAndSave({ text_color_mode: btn.dataset.textMode })))
      sheet.querySelector('#titleShadowToggle')?.addEventListener('click', () => this._updateAndSave({ text_shadow: !this._draft.text_shadow }))
      return
    }

    sheet.innerHTML = `
      <div class="title-sheet-head">Background</div>
      <div class="editor-control-row">
        <button class="hub-pill ${this._bgModeTab === 'gradient' ? 'active' : ''}" data-bg-tab="gradient" type="button">Gradient</button>
        <button class="hub-pill ${this._bgModeTab === 'color' ? 'active' : ''}" data-bg-tab="color" type="button">Color</button>
        <button class="hub-pill ${this._bgModeTab === 'picture' ? 'active' : ''}" data-bg-tab="picture" type="button">Picture</button>
      </div>
      <div class="title-swatch-row" id="titleSwatchRow"></div>
      <div class="hub-range-wrap">
        <div class="hub-range-head"><span>Overlay</span><span>${Math.round((Number(data.bg_overlay) || 0) * 100)}%</span></div>
        <input class="hub-range" id="titleOverlayRange" type="range" min="0" max="80" step="1" value="${Math.round((Number(data.bg_overlay) || 0) * 100)}" />
      </div>
    `
    sheet.querySelectorAll('[data-bg-tab]').forEach(btn => {
      btn.addEventListener('click', () => {
        this._bgModeTab = btn.dataset.bgTab || 'gradient'
        this._renderSheet()
      })
    })
    sheet.querySelector('#titleOverlayRange')?.addEventListener('input', (e) => this._updateAndSave({ bg_overlay: Number(e.target.value) / 100 }))

    const row = sheet.querySelector('#titleSwatchRow')
    if (!row) return
    if (this._bgModeTab === 'picture') {
      row.innerHTML = `<button class="hub-action-primary secondary" id="titlePickImageBtn" type="button">Pick image</button>`
      row.querySelector('#titlePickImageBtn')?.addEventListener('click', () => this._el.querySelector('#titleBgImageInput')?.click())
      return
    }

    const swatches = this._bgModeTab === 'color'
      ? COLOR_PRESETS.map(value => ({ value, style: `background:${value}` }))
      : GRADIENT_PRESETS.map(value => ({ value, style: `background:${value}` }))

    row.innerHTML = swatches.map((item) => {
      const active = this._bgModeTab === 'color'
        ? (data.bg_mode === 'color' && data.bg_color === item.value)
        : (data.bg_mode === 'gradient' && data.bg_gradient === item.value)
      return `<button class="title-swatch ${active ? 'active' : ''}" data-swatch="${this._escAttr(item.value)}" style="${item.style}" type="button"></button>`
    }).join('')

    row.querySelectorAll('[data-swatch]').forEach(btn => {
      btn.addEventListener('click', () => {
        const value = btn.dataset.swatch || ''
        if (this._bgModeTab === 'color') {
          this._updateAndSave({ bg_mode: 'color', bg_color: value })
        } else {
          this._updateAndSave({ bg_mode: 'gradient', bg_gradient: value })
        }
      })
    })
  }

  _pickBgImage(input) {
    const file = input?.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      this._updateAndSave({ bg_mode: 'image', bg_image: String(reader.result || '') })
      this._bgModeTab = 'picture'
    }
    reader.readAsDataURL(file)
    input.value = ''
  }

  _updateAndSave(patch) {
    this._draft = { ...this._draft, ...(patch || {}) }
    this._renderCanvas()
    this._renderSheet()
    this._saveDraft()
  }

  _saveDraft() {
    this._ignoreNextProjectEvent = true
    store.updateScene(this.projectId, this.sceneId, { title_data: { ...this._draft } })
  }

  _resolveTextColor(data) {
    const mode = data.text_color_mode || 'white'
    if (mode === 'white') return '#ffffff'
    if (mode === 'black') return '#0a0a0a'
    const color = data.bg_mode === 'color' ? (data.bg_color || '#000000') : '#1a1a1a'
    const rgb = this._hexToRgb(color)
    const brightness = (rgb.r * 299 + rgb.g * 587 + rgb.b * 114) / 1000
    return brightness > 140 ? '#111111' : '#ffffff'
  }

  _hexToRgb(hex) {
    const clean = String(hex || '#000000')
    const normalized = clean.startsWith('#') ? clean : '#000000'
    return {
      r: parseInt(normalized.slice(1, 3), 16) || 0,
      g: parseInt(normalized.slice(3, 5), 16) || 0,
      b: parseInt(normalized.slice(5, 7), 16) || 0,
    }
  }

  _withAlpha(hex, alpha) {
    const rgb = this._hexToRgb(hex)
    return `rgba(${rgb.r},${rgb.g},${rgb.b},${alpha})`
  }

  _escAttr(str) {
    return String(str ?? '')
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
  }
}
