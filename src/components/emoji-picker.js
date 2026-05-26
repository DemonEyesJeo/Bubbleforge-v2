let _emojiData = null

const LONG_PRESS_MS = 400

function svgUrl(hexcode) {
  return `/openmoji/svg/${hexcode}.svg`
}

async function getEmojiData() {
  if (_emojiData) return _emojiData
  const res = await fetch('/openmoji/openmoji.json')
  if (!res.ok) throw new Error('Failed to load emoji data')
  _emojiData = await res.json()
  return _emojiData
}

function getBaseEmojis(data) {
  return (data || []).filter(e => !e.skintone)
}

function getGroups(base) {
  const seen = new Set()
  const groups = []
  for (const row of base) {
    if (!row.group || seen.has(row.group)) continue
    seen.add(row.group)
    groups.push(row.group)
  }
  return groups
}

export async function createEmojiPicker({ onSelect, onClose }) {
  const data = await getEmojiData()
  const base = getBaseEmojis(data)
  const groups = getGroups(base)
  const firstGroup = groups[0] || ''

  let activeGroup = firstGroup
  let query = ''
  let longPressTimer = null
  let longPressTriggered = false
  let popupEl = null

  const panel = document.createElement('div')
  panel.className = 'ep-panel'
  panel.innerHTML = `
    <input class="ep-search" type="text" placeholder="Search emoji" />
    <div class="ep-cats"></div>
    <div class="ep-grid"></div>
  `

  const search = panel.querySelector('.ep-search')
  const cats = panel.querySelector('.ep-cats')
  const grid = panel.querySelector('.ep-grid')

  let scrollTimer = null
  grid.addEventListener('scroll', () => {
    grid.classList.remove('scrollbar-hidden')
    clearTimeout(scrollTimer)
    scrollTimer = setTimeout(() => grid.classList.add('scrollbar-hidden'), 2000)
  })

  const byGroup = new Map()
  for (const g of groups) byGroup.set(g, [])
  for (const row of base) {
    if (!byGroup.has(row.group)) byGroup.set(row.group, [])
    byGroup.get(row.group).push(row)
  }

  function closeSkinPopup() {
    if (!popupEl) return
    popupEl.remove()
    popupEl = null
  }

  function renderCats() {
    cats.innerHTML = groups.map(g => {
      const icon = byGroup.get(g)?.[0]?.emoji || '•'
      const active = g === activeGroup ? 'active' : ''
      return `<button class="ep-cat ${active}" data-group="${g}" type="button" title="${g}">${icon}</button>`
    }).join('')

    cats.querySelectorAll('[data-group]').forEach(btn => {
      btn.addEventListener('click', () => {
        activeGroup = btn.dataset.group || firstGroup
        renderCats()
        renderGrid()
      })
    })
  }

  function renderGrid() {
    closeSkinPopup()
    const q = query.trim().toLowerCase()
    const rows = (byGroup.get(activeGroup) || []).filter(row => {
      if (!q) return true
      const text = `${row.annotation || ''} ${row.tags || ''}`.toLowerCase()
      return text.includes(q)
    })

    grid.innerHTML = rows.map(row => {
      return `<button class="ep-cell" data-hexcode="${row.hexcode}" data-emoji="${row.emoji}" type="button" aria-label="${row.annotation || row.emoji}"><img src="${svgUrl(row.hexcode)}" alt="${row.emoji}" loading="lazy" /></button>`
    }).join('')

    const showSkintonePopup = (cell, variants) => {
      closeSkinPopup()
      popupEl = document.createElement('div')
      popupEl.className = 'ep-skintone-popup'
      popupEl.innerHTML = variants.map(v => `
        <button class="ep-cell" data-emoji="${v.emoji}" type="button" aria-label="${v.annotation || v.emoji}">
          <img src="${svgUrl(v.hexcode)}" alt="${v.emoji}" loading="lazy" />
        </button>
      `).join('')
      panel.appendChild(popupEl)

      const panelRect = panel.getBoundingClientRect()
      const cellRect = cell.getBoundingClientRect()
      const popupWidth = Math.max(180, variants.length * 38 + 12)
      popupEl.style.width = `${popupWidth}px`
      const left = Math.max(8, Math.min(cellRect.left - panelRect.left - popupWidth / 2 + cellRect.width / 2, panelRect.width - popupWidth - 8))
      const top = Math.max(8, cellRect.top - panelRect.top - 52)
      popupEl.style.left = `${left}px`
      popupEl.style.top = `${top}px`

      popupEl.querySelectorAll('[data-emoji]').forEach(btn => {
        btn.addEventListener('click', () => {
          onSelect?.(btn.dataset.emoji || '')
          onClose?.()
        })
      })
    }

    grid.querySelectorAll('.ep-cell').forEach(cell => {
      const hex = cell.dataset.hexcode || ''
      const emoji = cell.dataset.emoji || ''
      const baseRow = rows.find(r => r.hexcode === hex)
      const variants = (data || []).filter(v => v.skintone_base_hexcode === hex && !!v.skintone)

      cell.addEventListener('pointerdown', () => {
        longPressTriggered = false
        clearTimeout(longPressTimer)
        if (!baseRow || !variants.length) return
        longPressTimer = setTimeout(() => {
          longPressTriggered = true
          showSkintonePopup(cell, variants)
        }, LONG_PRESS_MS)
      })

      const clearPress = () => {
        clearTimeout(longPressTimer)
      }
      cell.addEventListener('pointerup', clearPress)
      cell.addEventListener('pointercancel', clearPress)
      cell.addEventListener('pointerleave', clearPress)

      cell.addEventListener('click', () => {
        if (longPressTriggered) {
          longPressTriggered = false
          return
        }
        onSelect?.(emoji)
        onClose?.()
      })
    })
  }

  const onDocumentPointerDown = (e) => {
    if (panel.contains(e.target)) return
    onClose?.()
  }

  search.addEventListener('input', () => {
    query = search.value || ''
    renderGrid()
  })

  panel.destroyPicker = () => {
    clearTimeout(longPressTimer)
    closeSkinPopup()
    document.removeEventListener('pointerdown', onDocumentPointerDown, true)
  }

  renderCats()
  renderGrid()

  setTimeout(() => {
    document.addEventListener('pointerdown', onDocumentPointerDown, true)
  }, 0)

  return panel
}
