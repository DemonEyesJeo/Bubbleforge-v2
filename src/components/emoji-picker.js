let _emojiData = null
let _emojiIndex = null
const _emojiImageCache = new Set()

const LONG_PRESS_MS = 90

function svgUrl(hexcode) {
  return `/openmoji/svg/${hexcode}.svg`
}

function preloadEmojiHexcodes(hexcodes = []) {
  for (const hex of hexcodes) {
    if (!hex || _emojiImageCache.has(hex)) continue
    _emojiImageCache.add(hex)
    const img = new Image()
    img.decoding = 'async'
    img.src = svgUrl(hex)
  }
}

async function getEmojiData() {
  if (_emojiData) return _emojiData
  const res = await fetch('/openmoji/openmoji.json')
  if (!res.ok) throw new Error('Failed to load emoji data')
  _emojiData = await res.json()
  return _emojiData
}

async function getEmojiIndex() {
  if (_emojiIndex) return _emojiIndex
  const data = await getEmojiData()
  const base = getBaseEmojis(data)
  const groups = getGroups(base)
  const byGroup = new Map()
  for (const g of groups) byGroup.set(g, [])
  for (const row of base) {
    if (!byGroup.has(row.group)) byGroup.set(row.group, [])
    byGroup.get(row.group).push(row)
  }

  const variantMap = new Map()
  for (const row of data || []) {
    if (!row?.skintone_base_hexcode || !row?.skintone) continue
    if (!variantMap.has(row.skintone_base_hexcode)) variantMap.set(row.skintone_base_hexcode, [])
    variantMap.get(row.skintone_base_hexcode).push(row)
  }

  _emojiIndex = { data, base, groups, byGroup, variantMap }
  return _emojiIndex
}

export function prefetchEmojiData() {
  getEmojiIndex().catch(() => {})
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
  let currentOnSelect = onSelect
  let currentOnClose = onClose
  const { groups, byGroup, variantMap } = await getEmojiIndex()
  const firstGroup = groups[0] || ''

  let activeGroup = firstGroup
  let query = ''
  let longPressTimer = null
  let longPressTriggered = false
  let popupEl = null
  let gridEventsBound = false
  const groupGridMarkupCache = new Map()
  let gridRenderToken = 0

  const panel = document.createElement('div')
  panel.className = 'ep-panel'
  panel.innerHTML = `
    <input class="ep-search" type="text" placeholder="Search emoji" />
    <div class="ep-grid"></div>
    <div class="ep-cats ep-cats-bottom"></div>
  `

  const search = panel.querySelector('.ep-search')
  const catsBottom = panel.querySelector('.ep-cats-bottom')
  const grid = panel.querySelector('.ep-grid')

  const initialGroupRows = byGroup.get(firstGroup) || []
  preloadEmojiHexcodes(initialGroupRows.slice(0, 48).map(r => r.hexcode))
  preloadEmojiHexcodes(groups.map(g => byGroup.get(g)?.[0]?.hexcode).filter(Boolean))

  function closeSkinPopup() {
    if (!popupEl) return
    popupEl.remove()
    popupEl = null
  }

  function renderCats() {
    const catsHtml = groups.map(g => {
      const first = byGroup.get(g)?.[0]
      const icon = first?.hexcode
        ? `<img class="ep-cat-img" src="${svgUrl(first.hexcode)}" alt="${first.emoji || g}" loading="eager" />`
        : `<span class="ep-cat-fallback">${first?.emoji || '•'}</span>`
      const active = g === activeGroup ? 'active' : ''
      return `<button class="ep-cat ${active}" data-group="${g}" type="button" title="${g}">${icon}</button>`
    }).join('')
    catsBottom.innerHTML = catsHtml

    catsBottom.querySelectorAll('[data-group]').forEach(btn => {
      btn.addEventListener('click', () => {
        activeGroup = btn.dataset.group || firstGroup
        const groupRows = byGroup.get(activeGroup) || []
        preloadEmojiHexcodes(groupRows.slice(0, 48).map(r => r.hexcode))
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

    const token = ++gridRenderToken
    grid.innerHTML = ''

    if (!q && groupGridMarkupCache.has(activeGroup)) {
      grid.innerHTML = groupGridMarkupCache.get(activeGroup) || ''
    } else {
      const CHUNK = 72
      let idx = 0
      let fullMarkup = ''
      const renderChunk = () => {
        if (token !== gridRenderToken) return
        const end = Math.min(rows.length, idx + CHUNK)
        let chunkHtml = ''
        for (let i = idx; i < end; i += 1) {
          const row = rows[i]
          const loading = i < 36 ? 'eager' : 'lazy'
          chunkHtml += `<button class="ep-cell" data-hexcode="${row.hexcode}" data-emoji="${row.emoji}" type="button" aria-label="${row.annotation || row.emoji}"><img src="${svgUrl(row.hexcode)}" alt="${row.emoji}" loading="${loading}" /></button>`
        }
        fullMarkup += chunkHtml
        grid.insertAdjacentHTML('beforeend', chunkHtml)
        idx = end
        if (idx < rows.length) {
          requestAnimationFrame(renderChunk)
        } else if (!q) {
          groupGridMarkupCache.set(activeGroup, fullMarkup)
        }
      }
      renderChunk()
    }

    const showSkintonePopup = (cell, variants) => {
      closeSkinPopup()
      popupEl = document.createElement('div')
      popupEl.className = 'ep-skintone-popup'
      popupEl.innerHTML = variants.map(v => `
        <button class="ep-cell" data-emoji="${v.emoji}" type="button" aria-label="${v.annotation || v.emoji}">
          <img src="${svgUrl(v.hexcode)}" alt="${v.emoji}" loading="eager" />
        </button>
      `).join('')
      panel.appendChild(popupEl)

      const panelRect = panel.getBoundingClientRect()
      const cellRect = cell.getBoundingClientRect()
      const popupWidth = Math.max(180, variants.length * 38 + 12)
      popupEl.style.width = `${popupWidth}px`
      const left = Math.max(8, Math.min(cellRect.left - panelRect.left - popupWidth / 2 + cellRect.width / 2, panelRect.width - popupWidth - 8))
      const popupHeight = popupEl.getBoundingClientRect().height || 52
      const gap = 6
      const cellTop = cellRect.top - panelRect.top
      const cellBottom = cellRect.bottom - panelRect.top
      const spaceAbove = cellTop - 8
      const spaceBelow = panelRect.height - cellBottom - 8

      const shouldPlaceAbove = spaceAbove >= (popupHeight + gap) || spaceAbove > spaceBelow
      let top = shouldPlaceAbove
        ? (cellTop - popupHeight - gap)
        : (cellBottom + gap)
      top = Math.max(8, Math.min(top, panelRect.height - popupHeight - 8))

      popupEl.dataset.placement = shouldPlaceAbove ? 'above' : 'below'
      popupEl.style.left = `${left}px`
      popupEl.style.top = `${top}px`

      popupEl.querySelectorAll('[data-emoji]').forEach(btn => {
        btn.addEventListener('click', () => {
          currentOnSelect?.(btn.dataset.emoji || '')
          currentOnClose?.()
        })
      })
    }

    if (!gridEventsBound) {
      const clearPress = () => {
        clearTimeout(longPressTimer)
      }
      let pressedCell = null
      let pressedVariants = null
      let pressedAt = 0

      grid.addEventListener('pointerdown', (e) => {
        const cell = e.target?.closest?.('.ep-cell')
        if (!cell || !grid.contains(cell)) return
        const hex = cell.dataset.hexcode || ''
        const variants = variantMap.get(hex) || []
        pressedCell = cell
        pressedVariants = variants
        pressedAt = performance.now()
        longPressTriggered = false
        clearTimeout(longPressTimer)
        if (!variants.length) return
        preloadEmojiHexcodes(variants.map(v => v.hexcode))
        longPressTimer = setTimeout(() => {
          longPressTriggered = true
          showSkintonePopup(cell, variants)
        }, LONG_PRESS_MS)
      })

      grid.addEventListener('contextmenu', (e) => {
        if (e.target?.closest?.('.ep-cell')) e.preventDefault()
      })

      grid.addEventListener('pointerup', clearPress)
      grid.addEventListener('pointercancel', clearPress)
      grid.addEventListener('pointerleave', clearPress)

      grid.addEventListener('click', (e) => {
        const cell = e.target?.closest?.('.ep-cell')
        if (!cell || !grid.contains(cell)) return

        if (!longPressTriggered && pressedCell === cell && (pressedVariants?.length || 0) > 0) {
          const heldMs = performance.now() - pressedAt
          if (heldMs >= LONG_PRESS_MS * 0.75) {
            longPressTriggered = true
            showSkintonePopup(cell, pressedVariants)
            return
          }
        }

        if (longPressTriggered) {
          longPressTriggered = false
          return
        }
        currentOnSelect?.(cell.dataset.emoji || '')
        currentOnClose?.()
      })

      gridEventsBound = true
    }
  }

  const onDocumentPointerDown = (e) => {
    if (panel.contains(e.target)) return
    currentOnClose?.()
  }

  let outsideListenerActive = false
  const activateOutsideListener = () => {
    if (outsideListenerActive) return
    document.addEventListener('pointerdown', onDocumentPointerDown, true)
    outsideListenerActive = true
  }
  const deactivateOutsideListener = () => {
    if (!outsideListenerActive) return
    document.removeEventListener('pointerdown', onDocumentPointerDown, true)
    outsideListenerActive = false
  }

  search.addEventListener('input', () => {
    query = search.value || ''
    renderGrid()
  })

  panel.destroyPicker = () => {
    clearTimeout(longPressTimer)
    closeSkinPopup()
    deactivateOutsideListener()
  }

  panel.setPickerHandlers = ({ onSelect: nextOnSelect, onClose: nextOnClose } = {}) => {
    if (typeof nextOnSelect === 'function') currentOnSelect = nextOnSelect
    if (typeof nextOnClose === 'function') currentOnClose = nextOnClose
  }

  panel.activatePicker = () => {
    activateOutsideListener()
  }

  panel.deactivatePicker = () => {
    clearTimeout(longPressTimer)
    closeSkinPopup()
    deactivateOutsideListener()
  }

  renderCats()
  renderGrid()

  return panel
}
