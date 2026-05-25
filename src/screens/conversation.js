import { store } from '../store.js'
import { push, pop } from '../router.js'
import { icons, statusIcons } from '../components/icons.js'
import { renderMessages, renderTypingIndicator } from '../components/bubble.js'
import { HubPanel } from '../components/hub-panel.js'
import { ExportRail } from '../components/export-rail.js'

export class ConversationScreen {
  constructor({ projectId }) {
    this.projectId = projectId
    this._activeActorId = null
    this._hub = null
    this._exportRail = null
    this._onChange = () => this._refresh()
  }

  render() {
    const el = document.createElement('div')
    el.innerHTML = `
      <div class="status-bar">
        <span class="time">9:41</span>
        ${statusIcons()}
      </div>
      <div class="nav-bar">
        <div class="nav-back" id="backBtn">${icons.back} Stories</div>
        <div class="nav-center">
          <div class="nav-title" id="sceneTitle">…</div>
          <div class="nav-sub" id="sceneSub"></div>
        </div>
        <div class="nav-actions">
          <div class="nav-btn" id="undoBtn" title="Undo">${icons.undo}</div>
          <div class="nav-btn" id="playBtn" title="Preview">${icons.play}</div>
          <div class="nav-btn" id="menuBtn" title="Menu">${icons.dots}</div>
        </div>
      </div>
      <div class="conversation-canvas" id="convCanvas"></div>
      <div class="command-center">
        <div class="speaker-strip" id="speakerStrip"></div>
        <div class="compose-row">
          <textarea class="compose-input" id="composeInput" rows="1" placeholder="Message…"></textarea>
          <div class="nav-btn" id="exportBtn" title="Export">${icons.export}</div>
          <div class="send-btn" id="sendBtn">${icons.send}</div>
        </div>
      </div>`
    return el
  }

  bind() {
    store.on('project-changed', this._onChange)

    this._el.querySelector('#backBtn').addEventListener('click', () => pop())
    this._el.querySelector('#undoBtn').addEventListener('click', () => {
      if (store.undoLastChange()) this._refresh()
    })
    this._el.querySelector('#playBtn').addEventListener('click', () => {
      push('play', { projectId: this.projectId })
    })
    this._el.querySelector('#menuBtn').addEventListener('click', () => this._openHub())
    this._el.querySelector('#exportBtn').addEventListener('click', () => this._openExport())

    const input = this._el.querySelector('#composeInput')
    const sendBtn = this._el.querySelector('#sendBtn')

    input.addEventListener('input', () => {
      sendBtn.classList.toggle('ready', input.value.trim().length > 0)
      input.style.height = 'auto'
      input.style.height = Math.min(input.scrollHeight, 100) + 'px'
    })

    input.addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); this._send() }
    })

    sendBtn.addEventListener('click', () => this._send())

    this._refresh()
  }

  resume() { this._refresh() }

  destroy() {
    store.off('project-changed', this._onChange)
    this._hub?.dismiss()
    this._exportRail?.dismiss()
  }

  _refresh() {
    const p = store.getProject(this.projectId)
    if (!p) return

    const scene = store.getActiveScene(this.projectId)
    const totalMsgs = p.scenes.reduce((n, s) => n + s.messages.length, 0)

    this._el.querySelector('#sceneTitle').textContent = scene?.name || p.name
    this._el.querySelector('#sceneSub').textContent =
      `${p.scenes.length} scene${p.scenes.length !== 1 ? 's' : ''} · ${totalMsgs} messages`

    // Default active actor to first right-side actor
    if (!this._activeActorId || !p.actors.find(a => a.id === this._activeActorId)) {
      this._activeActorId = p.actors.find(a => a.side === 'right')?.id || p.actors[0]?.id || null
    }

    this._renderSpeakerStrip(p)
    this._renderCanvas(p, scene)
  }

  _renderSpeakerStrip(p) {
    const strip = this._el.querySelector('#speakerStrip')
    strip.innerHTML = p.actors.map(a => {
      const active = a.id === this._activeActorId
      const rgb = this._rgb(a.color)
      const avatarStyle = a.avatar
        ? `background-image:url('${a.avatar.replace(/'/g, '%27')}');background-size:cover;background-position:center;${active ? `box-shadow:0 0 0 1.5px rgba(${rgb},0.4);` : ''}`
        : `background:${a.color};${active ? `box-shadow:0 0 0 1.5px rgba(${rgb},0.4);` : ''}`
      return `
        <div class="speaker-chip ${active ? 'active' : ''}" data-actor-id="${a.id}">
          <div class="chip-avatar" style="${avatarStyle}">${a.avatar ? '' : a.name[0]}</div>
          <span class="chip-name">${a.name}</span>
        </div>`
    }).join('')

    strip.querySelectorAll('.speaker-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        this._activeActorId = chip.dataset.actorId
        this._renderSpeakerStrip(p)
        this._el.querySelector('#composeInput').focus()
      })
    })
  }

  _renderCanvas(p, scene) {
    const canvas = this._el.querySelector('#convCanvas')
    if (!scene) {
      canvas.innerHTML = `<div class="empty-state"><p style="color:var(--t3);">No scenes yet.</p></div>`
      return
    }

    const sceneHeader = `
      <div class="msg-timestamp">Today</div>
      <div class="scene-divider">
        <div class="scene-divider-rule left"></div>
        <div class="scene-divider-label">${scene.name.toUpperCase()}</div>
        <div class="scene-divider-rule right"></div>
      </div>`

    canvas.innerHTML = sceneHeader + renderMessages(scene.messages, p.actors)
    canvas.scrollTop = canvas.scrollHeight

    // Bubble tap → context menu
    canvas.querySelectorAll('.bubble').forEach(bub => {
      bub.addEventListener('click', (e) => {
        e.stopPropagation()
        this._showBubbleMenu(bub, p, scene)
      })
    })
  }

  _showBubbleMenu(bub, p, scene) {
    document.querySelectorAll('.bubble-menu').forEach(m => m.remove())
    const msgId = bub.dataset.msgId
    const menu = document.createElement('div')
    menu.className = 'bubble-menu fade-in'
    menu.innerHTML = `
      <div class="bubble-menu-item" data-action="edit">Edit</div>
      <div class="bubble-menu-item" data-action="actor">Change actor</div>
      <div class="bubble-menu-item danger" data-action="delete">Delete</div>`

    const rect = bub.getBoundingClientRect()
    const appRect = document.getElementById('app').getBoundingClientRect()
    menu.style.position = 'absolute'
    menu.style.top  = `${rect.top - appRect.top - 10}px`
    menu.style.left = bub.closest('.msg-row.right')
      ? `${rect.left - appRect.left - 150 + rect.width}px`
      : `${rect.left - appRect.left}px`
    menu.style.zIndex = '500'
    document.getElementById('app').appendChild(menu)

    menu.querySelector('[data-action="delete"]').addEventListener('click', () => {
      store.deleteMessage(this.projectId, scene.id, msgId)
      menu.remove()
    })
    menu.querySelector('[data-action="edit"]').addEventListener('click', () => {
      const msg = scene.messages.find(m => m.id === msgId)
      if (!msg) return menu.remove()
      const input = this._el.querySelector('#composeInput')
      input.value = msg.text
      input.dispatchEvent(new Event('input'))
      this._editingMsgId = msgId
      this._editingSceneId = scene.id
      menu.remove()
      input.focus()
    })
    menu.querySelector('[data-action="actor"]').addEventListener('click', () => {
      this._showActorPicker(bub, p, scene, msgId)
      menu.remove()
    })

    setTimeout(() => document.addEventListener('click', () => menu.remove(), { once: true }), 50)
  }

  _showActorPicker(bub, p, scene, msgId) {
    document.querySelectorAll('.bubble-menu').forEach(m => m.remove())
    const message = scene.messages.find(m => m.id === msgId)
    if (!message) return

    const picker = document.createElement('div')
    picker.className = 'bubble-menu actor-picker fade-in'
    picker.innerHTML = p.actors.map(actor => {
      const active = actor.id === message.actor_id
      return `
        <div class="bubble-menu-item actor-option ${active ? 'active' : ''}" data-actor-id="${actor.id}">
          <span class="actor-dot" style="background:${actor.color}"></span>
          <span>${actor.name}</span>
        </div>`
    }).join('')

    const rect = bub.getBoundingClientRect()
    const appRect = document.getElementById('app').getBoundingClientRect()
    picker.style.position = 'absolute'
    picker.style.top = `${rect.top - appRect.top - 10}px`
    picker.style.left = bub.closest('.msg-row.right')
      ? `${rect.left - appRect.left - 180 + rect.width}px`
      : `${rect.left - appRect.left}px`
    picker.style.zIndex = '500'
    document.getElementById('app').appendChild(picker)

    picker.querySelectorAll('.actor-option').forEach(opt => {
      opt.addEventListener('click', () => {
        store.updateMessage(this.projectId, scene.id, msgId, { actor_id: opt.dataset.actorId })
        picker.remove()
      })
    })

    setTimeout(() => document.addEventListener('click', () => picker.remove(), { once: true }), 50)
  }

  _send() {
    const input = this._el.querySelector('#composeInput')
    const text = input.value.trim()
    if (!text || !this._activeActorId) return

    const scene = store.getActiveScene(this.projectId)
    if (!scene) return

    if (this._editingMsgId) {
      store.updateMessage(this.projectId, this._editingSceneId, this._editingMsgId, { text })
      this._editingMsgId = null
      this._editingSceneId = null
    } else {
      store.addMessage(this.projectId, scene.id, this._activeActorId, text)
    }

    input.value = ''
    input.style.height = 'auto'
    input.dispatchEvent(new Event('input'))
  }

  _openHub() {
    const overlayLayer = document.getElementById('overlay-layer')
    this._hub = new HubPanel(overlayLayer, this.projectId, () => { this._hub = null; this._refresh() })
    this._hub.mount()
  }

  _openExport() {
    const overlayLayer = document.getElementById('overlay-layer')
    this._exportRail = new ExportRail(overlayLayer, this.projectId, () => { this._exportRail = null })
    this._exportRail.mount()
  }

  _rgb(hex) {
    const r = parseInt(hex.slice(1,3),16)
    const g = parseInt(hex.slice(3,5),16)
    const b = parseInt(hex.slice(5,7),16)
    return `${r},${g},${b}`
  }
}
