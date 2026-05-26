import { store, ACTOR_COLORS } from '../store.js'
import { pop } from '../router.js'
import { icons } from '../components/icons.js'
import { hexToRgb } from '../components/bubble.js'
import { renderStatusBar } from '../components/status-bar.js'

export class ActorEditorScreen {
  constructor({ projectId, actorId, sceneId = null }) {
    this.projectId = projectId
    this.actorId   = actorId
    this.sceneId   = sceneId
    this.isNew     = !actorId
    this._color    = ACTOR_COLORS[0]
    this._side     = 'left'
    this._name     = ''
    this._pendingAvatar = null
    this._avatarTouched = false
  }

  render() {
    const p     = store.getProject(this.projectId)
    const baseActor = this.actorId ? p?.actors.find(a => a.id === this.actorId) : null
    const actor = (this.actorId && this.sceneId)
      ? (store.getEffectiveActor(this.projectId, this.sceneId, this.actorId) || baseActor)
      : baseActor

    if (actor) {
      this._color = actor.color
      this._side  = actor.side
      this._name  = actor.name
      this._pendingAvatar = actor.avatar || null
      this._avatarTouched = false
    } else {
      // Pick a color not yet used
      const usedColors = new Set((p?.actors || []).map(a => a.color))
      this._color = ACTOR_COLORS.find(c => !usedColors.has(c)) || ACTOR_COLORS[0]
      this._side  = p?.actors.some(a => a.side === 'left') ? 'right' : 'left'
    }

    const canDelete = !this.isNew && (p?.actors?.length || 0) > 1
    const el = document.createElement('div')
    el.innerHTML = `
      <div class="status-bar"><div id="statusBarHost">${renderStatusBar()}</div></div>
      <div class="nav-bar">
        <div class="nav-back" id="backBtn">${icons.back} Back</div>
        <div class="nav-center"><div class="nav-title">${this.isNew ? 'New Actor' : 'Edit Actor'}</div></div>
        <div style="min-width:60px;"></div>
      </div>
      <div class="scroll-body" style="padding-bottom:16px;overflow-y:hidden;">
        <div class="actor-preview-zone">
          <div style="display:flex;flex-direction:column;align-items:center;gap:8px;">
            <div class="actor-preview-avatar" id="previewAvatar"
                style="background:${this._color};box-shadow:0 0 0 3px rgba(${hexToRgb(this._color)},0.3),0 8px 24px rgba(${hexToRgb(this._color)},0.25);">
              ${this._name ? this._name[0].toUpperCase() : '?'}
            </div>
            <div class="actor-preview-name" id="previewName">${this._name || 'New Actor'}</div>
            <div class="actor-preview-sample" id="previewSample"
                 style="background:var(--accent-g);">
              Preview message
            </div>
            <div class="avatar-actions">
              <button class="avatar-action-btn" id="chooseAvatarBtn" type="button" title="Choose image">${icons.image}</button>
              <button class="avatar-action-btn" id="clearAvatarBtn" type="button" title="Remove photo">${icons.trash}</button>
              <input id="avatarInput" type="file" accept="image/*" hidden />
            </div>
          </div>
        </div>

        <div class="form-section">
          <div class="form-field">
            <label>Name</label>
            <input id="nameInput" type="text" value="${this._name}" placeholder="Actor name…" maxlength="32" />
          </div>
        </div>

        <div style="padding:8px 20px 0;">
          <div style="color:var(--t3);font-size:11px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;margin-bottom:6px;">Color</div>
          <div class="color-picker-grid" id="colorGrid">
            ${ACTOR_COLORS.map(c => `
              <div class="color-swatch ${c === this._color ? 'active' : ''}"
                   data-color="${c}" style="background:${c};"></div>`).join('')}
          </div>
        </div>

        <div style="padding:8px 20px 0;">
          <div style="color:var(--t3);font-size:11px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;margin-bottom:4px;">Conversation side</div>
        </div>
        <div class="side-picker">
          <div class="side-opt ${this._side === 'right' ? 'active' : ''}" data-side="right">Right (you)</div>
          <div class="side-opt ${this._side === 'left'  ? 'active' : ''}" data-side="left">Left (them)</div>
        </div>

        <div class="btn-primary" id="saveBtn" style="margin-top:12px;">
          ${this.isNew ? 'Add Actor' : 'Save Changes'}
        </div>
        ${canDelete ? `<div class="btn-danger" id="deleteBtn">Remove Actor</div>` : ''}
        ${!this.isNew && !canDelete ? `<div style="margin:12px 20px 0;color:var(--t3);font-size:12px;text-align:center;">A story must keep at least one actor.</div>` : ''}
      </div>`
    return el
  }

  bind() {
    this._refreshStatusBar()
    this._el.querySelector('#backBtn').addEventListener('click', () => pop())

    const nameInput = this._el.querySelector('#nameInput')
    nameInput.addEventListener('input', () => {
      this._name = nameInput.value
      this._updatePreview()
    })

    this._el.querySelectorAll('.color-swatch').forEach(sw => {
      sw.addEventListener('click', () => {
        this._color = sw.dataset.color
        this._el.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('active'))
        sw.classList.add('active')
        this._updatePreview()
      })
    })

    this._el.querySelectorAll('.side-opt').forEach(opt => {
      opt.addEventListener('click', () => {
        this._side = opt.dataset.side
        this._el.querySelectorAll('.side-opt').forEach(o => o.classList.remove('active'))
        opt.classList.add('active')
        this._updatePreview()
      })
    })

    this._el.querySelector('#saveBtn').addEventListener('click', () => this._save())
    this._el.querySelector('#chooseAvatarBtn').addEventListener('click', () => {
      this._el.querySelector('#avatarInput')?.click()
    })
    this._el.querySelector('#clearAvatarBtn').addEventListener('click', () => {
      this._pendingAvatar = null
      this._avatarTouched = true
      this._updatePreview()
    })
    this._el.querySelector('#avatarInput').addEventListener('change', e => {
      const file = e.target.files?.[0]
      if (!file) return
      const reader = new FileReader()
      reader.onload = ev => {
        this._pendingAvatar = String(ev.target?.result || '')
        this._avatarTouched = true
        this._updatePreview()
      }
      reader.readAsDataURL(file)
      e.target.value = ''
    })

    this._el.querySelector('#deleteBtn')?.addEventListener('click', () => {
      const deleted = store.deleteActor(this.projectId, this.actorId)
      if (deleted) {
        pop()
      } else {
        this._snack('At least one actor is required.')
      }
    })
  }

  resume() {
    this._refreshStatusBar()
  }

  _refreshStatusBar() {
    const scene = store.getActiveScene(this.projectId)
    const status = store.getSceneStatusBar(this.projectId, scene?.id)
    const host = this._el.querySelector('#statusBarHost')
    if (host) host.innerHTML = renderStatusBar(status)
  }

  _snack(msg) {
    const s = document.createElement('div')
    s.className = 'snackbar'
    s.textContent = msg
    this._el.appendChild(s)
    setTimeout(() => {
      s.style.opacity = '0'
      s.style.transition = 'opacity 0.25s'
      setTimeout(() => s.remove(), 280)
    }, 2200)
  }

  _updatePreview() {
    const rgb = hexToRgb(this._color)
    const avatar = this._el.querySelector('#previewAvatar')
    const name   = this._el.querySelector('#previewName')
    const sample = this._el.querySelector('#previewSample')

    avatar.style.background  = this._color
    if (this._pendingAvatar) {
      avatar.style.backgroundImage = `url('${this._pendingAvatar.replace(/'/g, '%27')}')`
      avatar.style.backgroundSize = 'cover'
      avatar.style.backgroundPosition = 'center'
    } else {
      avatar.style.backgroundImage = 'none'
      avatar.style.background = this._color
    }
    avatar.style.boxShadow   = `0 0 0 3px rgba(${rgb},0.3),0 8px 24px rgba(${rgb},0.25)`
    avatar.textContent        = this._name ? this._name[0].toUpperCase() : '?'
    if (this._pendingAvatar) avatar.textContent = ''
    name.textContent          = this._name || 'New Actor'

    if (this._side === 'right') {
      sample.style.background   = 'var(--accent-g)'
      sample.style.borderRadius = '18px 5px 18px 18px'
      sample.style.color        = '#fff'
    } else {
      sample.style.background   = `rgba(${rgb},0.12)`
      sample.style.border       = `1px solid rgba(${rgb},0.20)`
      sample.style.borderRadius = '18px 18px 18px 5px'
      sample.style.color        = 'rgba(255,255,255,0.88)'
    }
  }

  _save() {
    const name = (this._el.querySelector('#nameInput').value || '').trim()
    if (!name) {
      this._el.querySelector('#nameInput').focus()
      return
    }
    if (this.isNew) {
      store.addActor(this.projectId, name, this._color, this._side, this._pendingAvatar)
    } else {
      const project = store.getProject(this.projectId)
      const existing = project?.actors?.find(a => a.id === this.actorId)
      if (!existing) return

      if (this.sceneId) {
        const globalPatch = {}
        if (name !== existing.name) globalPatch.name = name
        if (this._side !== existing.side) globalPatch.side = this._side
        if (Object.keys(globalPatch).length) {
          store.updateActor(this.projectId, this.actorId, globalPatch)
        }

        const overridePatch = {}
        overridePatch.color = this._color === existing.color ? null : this._color
        if (this._avatarTouched) {
          const baseAvatar = existing.avatar || null
          overridePatch.avatar = this._pendingAvatar === baseAvatar ? null : this._pendingAvatar
        }
        store.updateSceneActorOverride(this.projectId, this.sceneId, this.actorId, overridePatch)
      } else {
        const avatar = this._avatarTouched ? this._pendingAvatar : (existing?.avatar || null)
        store.updateActor(this.projectId, this.actorId, { name, color: this._color, side: this._side, avatar })
      }
    }
    pop()
  }
}
