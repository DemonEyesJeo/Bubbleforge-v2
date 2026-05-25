import { store, ACTOR_COLORS } from '../store.js'
import { pop } from '../router.js'
import { icons, statusIcons } from '../components/icons.js'
import { hexToRgb } from '../components/bubble.js'

export class ActorEditorScreen {
  constructor({ projectId, actorId }) {
    this.projectId = projectId
    this.actorId   = actorId
    this.isNew     = !actorId
    this._color    = ACTOR_COLORS[0]
    this._side     = 'left'
    this._name     = ''
  }

  render() {
    const p     = store.getProject(this.projectId)
    const actor = this.actorId ? p?.actors.find(a => a.id === this.actorId) : null

    if (actor) {
      this._color = actor.color
      this._side  = actor.side
      this._name  = actor.name
    } else {
      // Pick a color not yet used
      const usedColors = new Set((p?.actors || []).map(a => a.color))
      this._color = ACTOR_COLORS.find(c => !usedColors.has(c)) || ACTOR_COLORS[0]
      this._side  = p?.actors.some(a => a.side === 'left') ? 'right' : 'left'
    }

    const el = document.createElement('div')
    el.innerHTML = `
      <div class="status-bar"><span class="time">9:41</span>${statusIcons()}</div>
      <div class="nav-bar">
        <div class="nav-back" id="backBtn">${icons.back} Back</div>
        <div class="nav-center"><div class="nav-title">${this.isNew ? 'New Actor' : 'Edit Actor'}</div></div>
        <div style="min-width:60px;"></div>
      </div>
      <div class="scroll-body" style="padding-bottom:32px;">
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
          </div>
        </div>

        <div class="form-section">
          <div class="form-field">
            <label>Name</label>
            <input id="nameInput" type="text" value="${this._name}" placeholder="Actor name…" maxlength="32" />
          </div>
        </div>

        <div style="padding:14px 20px 4px;">
          <div style="color:var(--t3);font-size:11px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;margin-bottom:10px;">Color</div>
          <div class="color-picker-grid" id="colorGrid">
            ${ACTOR_COLORS.map(c => `
              <div class="color-swatch ${c === this._color ? 'active' : ''}"
                   data-color="${c}" style="background:${c};"></div>`).join('')}
          </div>
        </div>

        <div style="padding:4px 20px 0;">
          <div style="color:var(--t3);font-size:11px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;margin-bottom:8px;">Conversation side</div>
        </div>
        <div class="side-picker">
          <div class="side-opt ${this._side === 'right' ? 'active' : ''}" data-side="right">Right (you)</div>
          <div class="side-opt ${this._side === 'left'  ? 'active' : ''}" data-side="left">Left (them)</div>
        </div>

        <div class="btn-primary" id="saveBtn" style="margin-top:20px;">
          ${this.isNew ? 'Add Actor' : 'Save Changes'}
        </div>
        ${!this.isNew ? `<div class="btn-danger" id="deleteBtn">Remove Actor</div>` : ''}
      </div>`
    return el
  }

  bind() {
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

    this._el.querySelector('#deleteBtn')?.addEventListener('click', () => {
      store.deleteActor(this.projectId, this.actorId)
      pop()
    })
  }

  _updatePreview() {
    const rgb = hexToRgb(this._color)
    const avatar = this._el.querySelector('#previewAvatar')
    const name   = this._el.querySelector('#previewName')
    const sample = this._el.querySelector('#previewSample')

    avatar.style.background  = this._color
    avatar.style.boxShadow   = `0 0 0 3px rgba(${rgb},0.3),0 8px 24px rgba(${rgb},0.25)`
    avatar.textContent        = this._name ? this._name[0].toUpperCase() : '?'
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
      store.addActor(this.projectId, name, this._color, this._side)
    } else {
      store.updateActor(this.projectId, this.actorId, { name, color: this._color, side: this._side })
    }
    pop()
  }
}
