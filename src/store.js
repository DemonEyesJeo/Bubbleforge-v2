const STORAGE_KEY = 'bf_v2_projects'

function uuid() {
  return crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2)
}

function now() { return Date.now() }

export const ACTOR_COLORS = [
  '#2979FF','#00BFA5','#FF6D00','#7C4DFF',
  '#F50057','#00ACC1','#43A047','#E53935',
  '#FB8C00','#8E24AA','#00897B','#D81B60',
]

function defaultRenderSettings() {
  return {
    fps: 30,
    sfx_type: 'soft',
    sfx_enabled: true,
    keyboard_style: 'ios',
    typing_duration: 0.08,
    typing_indicator_duration: 1.2,
    typing_indicator_gap: 0.4,
    fakeout: true,
    music_path: null,
    music_volume: 0.7,
    loop_music: true,
    fade_music: true,
    resolution: '1080p',
    format: 'mp4',
    preview_before_export: false,
    message_pause: 0.8,
  }
}

function sampleProject() {
  const alexId = uuid()
  const mayaId = uuid()
  const sceneId = uuid()
  return {
    id: uuid(),
    name: 'The Rooftop',
    created_at: now(),
    updated_at: now(),
    actors: [
      { id: alexId, name: 'Alex', color: '#2979FF', side: 'right', avatar: null },
      { id: mayaId, name: 'Maya', color: '#00BFA5', side: 'left',  avatar: null },
    ],
    scenes: [
      {
        id: sceneId,
        name: 'The Rooftop',
        quote: 'Some things don\'t need words.',
        messages: [
          { id: uuid(), actor_id: mayaId, text: 'You actually showed up.',                           ts: now() },
          { id: uuid(), actor_id: alexId, text: 'I said I would.',                                   ts: now() + 1 },
          { id: uuid(), actor_id: alexId, text: 'Didn\'t think you\'d be here though.',              ts: now() + 2 },
          { id: uuid(), actor_id: alexId, text: 'Nice view.',                                        ts: now() + 3 },
          { id: uuid(), actor_id: mayaId, text: 'It\'s the only thing left that\'s honest in this city.', ts: now() + 4 },
          { id: uuid(), actor_id: alexId, text: 'Then maybe we stay a while.',                       ts: now() + 5 },
        ]
      }
    ],
    render_settings: defaultRenderSettings(),
    active_scene_id: sceneId,
  }
}

class Store {
  constructor() {
    this._projects = []
    this._listeners = {}
    this._history = []
    this._load()
  }

  // ── Persistence ──────────────────────────────
  _load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      this._projects = raw ? JSON.parse(raw) : [sampleProject()]
    } catch {
      this._projects = [sampleProject()]
    }
    if (!this._projects.length) this._projects = [sampleProject()]
  }

  _save() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(this._projects))
  }

  _snapshot() {
    this._history.push(JSON.stringify(this._projects))
    if (this._history.length > 25) this._history.shift()
  }

  undoLastChange() {
    const previous = this._history.pop()
    if (!previous) return false
    try {
      this._projects = JSON.parse(previous)
      this._save()
      this._emit('projects-changed')
      this._emit('project-changed')
      return true
    } catch {
      return false
    }
  }

  // ── Events ───────────────────────────────────
  on(event, fn) {
    if (!this._listeners[event]) this._listeners[event] = []
    this._listeners[event].push(fn)
  }
  off(event, fn) {
    if (this._listeners[event])
      this._listeners[event] = this._listeners[event].filter(f => f !== fn)
  }
  _emit(event, data) {
    ;(this._listeners[event] || []).forEach(fn => fn(data))
  }

  // ── Projects ─────────────────────────────────
  getProjects() { return [...this._projects] }

  getProject(id) { return this._projects.find(p => p.id === id) || null }

  createProject(name = 'New Story') {
    this._snapshot()
    const p = { ...sampleProject(), id: uuid(), name, created_at: now(), updated_at: now(), scenes: [], actors: [] }
    const firstScene = { id: uuid(), name: 'Scene 1', quote: '', messages: [] }
    p.scenes = [firstScene]
    p.active_scene_id = firstScene.id
    this._projects.unshift(p)
    this._save()
    this._emit('projects-changed')
    return p
  }

  updateProject(id, patch) {
    const idx = this._projects.findIndex(p => p.id === id)
    if (idx < 0) return
    this._snapshot()
    this._projects[idx] = { ...this._projects[idx], ...patch, updated_at: now() }
    this._save()
    this._emit('project-changed', id)
  }

  deleteProject(id) {
    this._snapshot()
    this._projects = this._projects.filter(p => p.id !== id)
    this._save()
    this._emit('projects-changed')
  }

  // ── Scenes ───────────────────────────────────
  getScene(projectId, sceneId) {
    const p = this.getProject(projectId)
    return p ? (p.scenes.find(s => s.id === sceneId) || null) : null
  }

  getActiveScene(projectId) {
    const p = this.getProject(projectId)
    if (!p) return null
    return p.scenes.find(s => s.id === p.active_scene_id) || p.scenes[0] || null
  }

  addScene(projectId, name = 'New Scene') {
    const p = this.getProject(projectId)
    if (!p) return null
    this._snapshot()
    const s = { id: uuid(), name, quote: '', messages: [] }
    p.scenes.push(s)
    p.updated_at = now()
    this._save()
    this._emit('project-changed', projectId)
    return s
  }

  updateScene(projectId, sceneId, patch) {
    const p = this.getProject(projectId)
    if (!p) return
    const idx = p.scenes.findIndex(s => s.id === sceneId)
    if (idx < 0) return
    this._snapshot()
    p.scenes[idx] = { ...p.scenes[idx], ...patch }
    p.updated_at = now()
    this._save()
    this._emit('project-changed', projectId)
  }

  deleteScene(projectId, sceneId) {
    const p = this.getProject(projectId)
    if (!p || p.scenes.length <= 1) return
    this._snapshot()
    p.scenes = p.scenes.filter(s => s.id !== sceneId)
    if (p.active_scene_id === sceneId) p.active_scene_id = p.scenes[0].id
    p.updated_at = now()
    this._save()
    this._emit('project-changed', projectId)
  }

  setActiveScene(projectId, sceneId) {
    this.updateProject(projectId, { active_scene_id: sceneId })
  }

  // ── Messages ─────────────────────────────────
  addMessage(projectId, sceneId, actorId, text) {
    const p = this.getProject(projectId)
    if (!p) return null
    const scene = p.scenes.find(s => s.id === sceneId)
    if (!scene) return null
    this._snapshot()
    const msg = { id: uuid(), actor_id: actorId, text: text.trim(), ts: now() }
    scene.messages.push(msg)
    p.updated_at = now()
    this._save()
    this._emit('project-changed', projectId)
    return msg
  }

  updateMessage(projectId, sceneId, msgId, patch) {
    const p = this.getProject(projectId)
    if (!p) return
    const scene = p.scenes.find(s => s.id === sceneId)
    if (!scene) return
    const idx = scene.messages.findIndex(m => m.id === msgId)
    if (idx < 0) return
    this._snapshot()
    scene.messages[idx] = { ...scene.messages[idx], ...patch }
    p.updated_at = now()
    this._save()
    this._emit('project-changed', projectId)
  }

  deleteMessage(projectId, sceneId, msgId) {
    const p = this.getProject(projectId)
    if (!p) return
    const scene = p.scenes.find(s => s.id === sceneId)
    if (!scene) return
    this._snapshot()
    scene.messages = scene.messages.filter(m => m.id !== msgId)
    p.updated_at = now()
    this._save()
    this._emit('project-changed', projectId)
  }

  // ── Actors ───────────────────────────────────
  addActor(projectId, name, color, side = 'left', avatar = null) {
    const p = this.getProject(projectId)
    if (!p) return null
    this._snapshot()
    const actor = { id: uuid(), name, color, side, avatar }
    p.actors.push(actor)
    p.updated_at = now()
    this._save()
    this._emit('project-changed', projectId)
    return actor
  }

  updateActor(projectId, actorId, patch) {
    const p = this.getProject(projectId)
    if (!p) return
    const idx = p.actors.findIndex(a => a.id === actorId)
    if (idx < 0) return
    this._snapshot()
    p.actors[idx] = { ...p.actors[idx], ...patch }
    p.updated_at = now()
    this._save()
    this._emit('project-changed', projectId)
  }

  deleteActor(projectId, actorId) {
    const p = this.getProject(projectId)
    if (!p) return
    this._snapshot()
    p.actors = p.actors.filter(a => a.id !== actorId)
    p.updated_at = now()
    this._save()
    this._emit('project-changed', projectId)
  }

  // ── Render settings ──────────────────────────
  updateRenderSettings(projectId, patch) {
    const p = this.getProject(projectId)
    if (!p) return
    this._snapshot()
    p.render_settings = { ...p.render_settings, ...patch }
    p.updated_at = now()
    this._save()
    this._emit('project-changed', projectId)
  }
}

export const store = new Store()
