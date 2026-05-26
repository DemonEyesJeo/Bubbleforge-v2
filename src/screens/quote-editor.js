import { store } from '../store.js'
import { pop } from '../router.js'
import { icons } from '../components/icons.js'

function defaultQuoteData() {
  return {
    platform: 'x',
    avatar: null,
    avatar_color: '#1DA1F2',
    display_name: '',
    handle: '',
    verified: false,
    date: '',
    text: '',
    image: null,
    stats: {
      replies: '',
      retweets: '',
      likes: '',
      views: '',
    },
    show_stats: true,
    show_verified: true,
    bg_color: '#000000',
    text_color: '#ffffff',
  }
}

export class QuoteEditorScreen {
  constructor({ projectId, sceneId }) {
    this.projectId = projectId
    this.sceneId = sceneId
    this._draft = defaultQuoteData()
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
    el.className = 'quote-editor-screen'
    el.innerHTML = `
      <div class="nav-bar">
        <div class="nav-back" id="quoteBackBtn">${icons.back} Stories</div>
        <div class="nav-center">
          <div class="nav-title" id="quoteNavTitle">Post</div>
          <div class="nav-sub" id="quoteNavSub"></div>
        </div>
        <div class="nav-btn" id="quoteMenuBtn" title="Menu">${icons.dots}</div>
      </div>
      <div class="quote-editor-body">
        <div class="post-card-wrap" id="postCardWrap"></div>
        <div class="post-controls" id="postControls"></div>
      </div>
      <input id="quotePostImageInput" type="file" accept="image/*" hidden />
      <input id="quoteAvatarImageInput" type="file" accept="image/*" hidden />
    `
    return el
  }

  bind() {
    store.on('project-changed', this._onProjectChange)
    this._el.querySelector('#quoteBackBtn')?.addEventListener('click', () => pop())
    this._el.querySelector('#quotePostImageInput')?.addEventListener('change', (e) => this._pickImage(e.target, 'image'))
    this._el.querySelector('#quoteAvatarImageInput')?.addEventListener('change', (e) => this._pickImage(e.target, 'avatar'))
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
    this._draft = { ...defaultQuoteData(), ...(scene.quote_data || {}) }
    this._draft.stats = { ...defaultQuoteData().stats, ...(this._draft.stats || {}) }
    this._el.querySelector('#quoteNavTitle').textContent = scene.name || 'Post'
    this._el.querySelector('#quoteNavSub').textContent = project.name || ''
    this._renderEditor()
  }

  _renderEditor() {
    const preview = this._el.querySelector('#postCardWrap')
    const controls = this._el.querySelector('#postControls')
    if (!preview || !controls) return
    const data = this._draft
    const displayName = data.display_name || 'Display name'
    const handle = this._formatHandle(data.handle)
    const date = data.date || 'Date'
    const postText = data.text || 'Post text goes here and can wrap across multiple lines'
    const initials = (displayName || '?').trim().charAt(0).toUpperCase() || '?'

    preview.innerHTML = `
      <div class="post-card" style="background:${data.bg_color || '#000'};color:${data.text_color || '#fff'};">
        <div class="post-card-header">
          <div class="post-card-identity">
            <button class="post-card-avatar" id="postAvatarBtn" type="button" style="background:${data.avatar ? 'transparent' : (data.avatar_color || '#1DA1F2')};">${data.avatar ? `<img src="${data.avatar}" alt="avatar" />` : initials}</button>
            <div class="post-card-names">
              <div class="post-card-display" id="postDisplayName" contenteditable="true" spellcheck="false">${this._escHtml(displayName)}</div>
              <div class="post-card-handle" id="postHandle" contenteditable="true" spellcheck="false">${this._escHtml(handle)}</div>
            </div>
          </div>
          <div class="post-card-head-right">
            ${data.show_verified && data.verified ? '<div class="post-card-verified">✓</div>' : ''}
            <div class="post-card-date" id="postDate" contenteditable="true" spellcheck="false">${this._escHtml(date)}</div>
          </div>
        </div>
        <div class="post-card-text" id="postText" contenteditable="true" spellcheck="false">${this._escHtml(postText)}</div>
        ${data.image ? `<img class="post-card-image" src="${data.image}" alt="post image" />` : ''}
        ${data.show_stats ? `
          <div class="post-card-stats">
            <div class="post-card-stat"><span class="post-card-stat-icon">💬</span><span>${this._escHtml(data.stats?.replies || '')}</span></div>
            <div class="post-card-stat"><span class="post-card-stat-icon">🔁</span><span>${this._escHtml(data.stats?.retweets || '')}</span></div>
            <div class="post-card-stat"><span class="post-card-stat-icon">♥</span><span>${this._escHtml(data.stats?.likes || '')}</span></div>
            <div class="post-card-stat"><span class="post-card-stat-icon">👁</span><span>${this._escHtml(data.stats?.views || '')}</span></div>
          </div>` : ''}
      </div>
    `

    controls.innerHTML = `
      <div class="post-controls-row">
        <button class="hub-pill ${data.verified ? 'active' : ''}" id="quoteVerifiedToggle" type="button">✓ Verified</button>
        <button class="hub-pill ${data.show_verified ? 'active' : ''}" id="quoteShowVerifiedToggle" type="button">Show verified</button>
        <button class="hub-pill" id="quoteImageBtn" type="button">📷 Image</button>
        <button class="hub-pill ${data.show_stats ? 'active' : ''}" id="quoteShowStatsToggle" type="button">Show stats</button>
      </div>
      <div class="post-controls-row post-controls-stats">
        <label>💬<input id="quoteReplies" type="text" value="${this._escAttr(data.stats?.replies || '')}" placeholder="167" /></label>
        <label>🔁<input id="quoteRetweets" type="text" value="${this._escAttr(data.stats?.retweets || '')}" placeholder="3,928" /></label>
        <label>♥<input id="quoteLikes" type="text" value="${this._escAttr(data.stats?.likes || '')}" placeholder="18,300" /></label>
        <label>👁<input id="quoteViews" type="text" value="${this._escAttr(data.stats?.views || '')}" placeholder="429,080" /></label>
      </div>
      <div class="post-controls-row post-controls-avatar">
        <label class="post-color-label">Avatar color <input id="quoteAvatarColor" type="color" value="${data.avatar_color || '#1DA1F2'}" /></label>
        <button class="hub-pill" id="quoteAvatarImageBtn" type="button">Avatar image</button>
        <button class="hub-pill" id="quoteAvatarClearBtn" type="button">Clear avatar image</button>
      </div>
    `

    preview.querySelector('#postAvatarBtn')?.addEventListener('click', () => {
      this._el.querySelector('#quoteAvatarImageInput')?.click()
    })
    preview.querySelector('#postDisplayName')?.addEventListener('input', (e) => {
      this._updateAndSave({ display_name: e.currentTarget.textContent || '' }, false)
    })
    preview.querySelector('#postHandle')?.addEventListener('input', (e) => {
      const value = (e.currentTarget.textContent || '').replace(/@/g, '')
      this._updateAndSave({ handle: value }, false)
    })
    preview.querySelector('#postDate')?.addEventListener('input', (e) => {
      this._updateAndSave({ date: e.currentTarget.textContent || '' }, false)
    })
    preview.querySelector('#postText')?.addEventListener('input', (e) => {
      this._updateAndSave({ text: e.currentTarget.textContent || '' }, false)
    })

    controls.querySelector('#quoteVerifiedToggle')?.addEventListener('click', () => this._updateAndSave({ verified: !this._draft.verified }))
    controls.querySelector('#quoteShowVerifiedToggle')?.addEventListener('click', () => this._updateAndSave({ show_verified: !this._draft.show_verified }))
    controls.querySelector('#quoteImageBtn')?.addEventListener('click', () => this._el.querySelector('#quotePostImageInput')?.click())
    controls.querySelector('#quoteShowStatsToggle')?.addEventListener('click', () => this._updateAndSave({ show_stats: !this._draft.show_stats }))
    controls.querySelector('#quoteAvatarImageBtn')?.addEventListener('click', () => this._el.querySelector('#quoteAvatarImageInput')?.click())
    controls.querySelector('#quoteAvatarClearBtn')?.addEventListener('click', () => this._updateAndSave({ avatar: null }))
    controls.querySelector('#quoteAvatarColor')?.addEventListener('input', (e) => this._updateAndSave({ avatar_color: e.target.value }))

    controls.querySelector('#quoteReplies')?.addEventListener('input', (e) => this._updateStats('replies', e.target.value))
    controls.querySelector('#quoteRetweets')?.addEventListener('input', (e) => this._updateStats('retweets', e.target.value))
    controls.querySelector('#quoteLikes')?.addEventListener('input', (e) => this._updateStats('likes', e.target.value))
    controls.querySelector('#quoteViews')?.addEventListener('input', (e) => this._updateStats('views', e.target.value))
  }

  _updateAndSave(patch, rerender = true) {
    this._draft = { ...this._draft, ...(patch || {}) }
    this._saveDraft()
    if (rerender) this._renderEditor()
  }

  _updateStats(key, value) {
    this._draft = {
      ...this._draft,
      stats: {
        ...defaultQuoteData().stats,
        ...(this._draft.stats || {}),
        [key]: value,
      },
    }
    this._saveDraft()
  }

  _pickImage(input, target) {
    const file = input?.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      const result = String(reader.result || '')
      if (target === 'avatar') {
        this._updateAndSave({ avatar: result })
      } else {
        this._updateAndSave({ image: result })
      }
    }
    reader.readAsDataURL(file)
    input.value = ''
  }

  _saveDraft() {
    this._ignoreNextProjectEvent = true
    store.updateScene(this.projectId, this.sceneId, { quote_data: { ...this._draft } })
  }

  _formatHandle(value) {
    const clean = String(value || '').replace(/^@+/, '').trim()
    return clean ? `@${clean}` : '@handle'
  }

  _escHtml(str) {
    return String(str ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
  }

  _escAttr(str) {
    return String(str ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  }
}
