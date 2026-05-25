const DEFAULT_STATUS_BAR = {
  time: '9:41',
  carrier: '',
  network: 'LTE',
  signal: 'full',
  wifi: 'full',
  battery: 'full',
  charging: false,
  low_power: false,
  show_percent: false,
  icons: [],
}

export const STATUS_ICON_GROUPS = {
  Focus: ['sleep_focus', 'work_focus', 'personal_focus', 'driving_focus'],
  Audio: ['headphones', 'airpods', 'speaker', 'music_playing', 'podcast', 'carplay'],
  Connectivity: ['bluetooth', 'hotspot', 'vpn', 'private_relay', 'roaming', 'public_wifi', 'in_flight_wifi'],
  Activity: ['location', 'screen_recording', 'live_activity', 'on_call', 'muted_call', 'microphone'],
  Notifications: ['dnd', 'notifications_silenced', 'alarm_set'],
  Security: ['managed_device', 'screen_locked', 'camera_active', 'screen_share'],
  Emergency: ['sos_active', 'emergency_bypass', 'crash_detection', 'check_in', 'medical_id'],
  Network: ['searching', 'network_switching'],
}

const ICON_SYMBOLS = {
  sleep_focus: '🌙', work_focus: '💼', personal_focus: '❤', driving_focus: '🚗',
  headphones: '🎧', airpods: '◖◗', speaker: '🔊', music_playing: '♪', podcast: '◉', carplay: '▣',
  bluetooth: 'ᛒ', hotspot: '⟲', vpn: 'V', private_relay: '◌', roaming: 'R', public_wifi: 'W', in_flight_wifi: '✈',
  location: '⌖', screen_recording: '●', live_activity: '◍', on_call: '☎', muted_call: '◌', microphone: '🎙',
  dnd: '⛔', notifications_silenced: '🔕', alarm_set: '⏰',
  managed_device: '▦', screen_locked: '🔒', camera_active: '📷', screen_share: '⧉',
  sos_active: 'SOS', emergency_bypass: '!', crash_detection: '⚠', check_in: '✓', medical_id: '✚',
  searching: '…', network_switching: '⇄',
}

function escHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function tinyIcon(symbol) {
  const text = escHtml(symbol || '•')
  return `<svg width="12" height="12" viewBox="0 0 12 12" fill="none"><text x="6" y="8.3" text-anchor="middle" font-size="7" fill="rgba(255,255,255,0.92)">${text}</text></svg>`
}

function signalSvg(signal) {
  if (signal === 'sos') return '<span class="sb-sos">SOS</span>'
  if (signal === 'airplane') return tinyIcon('✈')
  const levelMap = { full: 4, '3bar': 3, '2bar': 2, '1bar': 1, none: 0 }
  const level = levelMap[signal] ?? 4
  const bars = [1, 2, 3, 4].map((h, idx) => {
    const opacity = idx < level ? 0.95 : 0.24
    const x = 1 + idx * 3
    const y = 11 - h * 2
    return `<rect x="${x}" y="${y}" width="2" height="${h * 2}" rx="1" fill="rgba(255,255,255,${opacity})"/>`
  }).join('')
  return `<svg width="14" height="12" viewBox="0 0 14 12" fill="none">${bars}</svg>`
}

function wifiSvg(wifi) {
  if (wifi === 'off') return tinyIcon('×')
  const arcs = wifi === 'weak' ? 1 : wifi === 'medium' ? 2 : 3
  const stroke = 'rgba(255,255,255,0.9)'
  const p1 = arcs >= 1 ? `<path d="M6 10.2a1 1 0 1 0 .001 0Z" fill="${stroke}"/>` : ''
  const p2 = arcs >= 2 ? `<path d="M3.8 8.4a3.3 3.3 0 0 1 4.4 0" stroke="${stroke}" stroke-width="1.2" stroke-linecap="round"/>` : ''
  const p3 = arcs >= 3 ? `<path d="M2.2 6.3a5.8 5.8 0 0 1 7.6 0" stroke="${stroke}" stroke-width="1.2" stroke-linecap="round"/>` : ''
  return `<svg width="12" height="12" viewBox="0 0 12 12" fill="none">${p3}${p2}${p1}</svg>`
}

function batterySvg(battery, charging, lowPower, showPercent) {
  const levelMap = { full: 1, medium: 0.58, low: 0.24, critical: 0.08, dead: 0 }
  const fillPct = Math.max(0, Math.min(1, levelMap[battery] ?? 1))
  const fillColor = charging ? '#30D158' : (lowPower || battery === 'low' ? '#FFD60A' : (battery === 'critical' || battery === 'dead' ? '#FF453A' : '#fff'))
  const innerW = Math.round(fillPct * 15)
  const bolt = charging ? '<path d="M10 3 8 6h2l-2 3" stroke="#081018" stroke-width="1.1" stroke-linecap="round" stroke-linejoin="round"/>' : ''
  const percentText = showPercent ? `<span class="sb-battery-pct">${Math.round(fillPct * 100)}%</span>` : ''
  return `<span class="sb-battery-wrap"><svg width="22" height="12" viewBox="0 0 22 12" fill="none"><rect x="0.7" y="1" width="18" height="10" rx="2.4" stroke="rgba(255,255,255,0.9)" stroke-width="1.2"/><rect x="19.3" y="4" width="2" height="4" rx="1" fill="rgba(255,255,255,0.55)"/><rect x="2.1" y="2.5" width="${innerW}" height="7" rx="1.6" fill="${fillColor}"/>${bolt}</svg>${percentText}</span>`
}

function renderStatusIcons(icons) {
  const arr = Array.isArray(icons) ? icons : []
  const shown = arr.slice(0, 4)
  const overflow = arr.length - shown.length
  const html = shown.map(key => {
    const symbol = ICON_SYMBOLS[key] || '•'
    return `<span class="sb-status-icon" title="${escHtml(key)}">${tinyIcon(symbol)}</span>`
  }).join('')
  return html + (overflow > 0 ? `<span class="sb-more">+${overflow}</span>` : '')
}

export function renderStatusBar(statusBar = {}) {
  const sb = { ...DEFAULT_STATUS_BAR, ...(statusBar || {}) }
  const signal = String(sb.signal || 'full')
  const airplane = signal === 'airplane'
  const left = airplane
    ? `<span class="sb-airplane">${signalSvg('airplane')}</span>`
    : `<span class="sb-carrier">${escHtml(sb.carrier || '')}</span><span class="sb-signal">${signalSvg(signal)}</span><span class="sb-network">${escHtml(sb.network || '')}</span>`

  const right = `${renderStatusIcons(sb.icons)}${airplane ? '' : `<span class="sb-wifi">${wifiSvg(String(sb.wifi || 'full'))}</span>`}<span class="sb-battery">${batterySvg(String(sb.battery || 'full'), Boolean(sb.charging), Boolean(sb.low_power), Boolean(sb.show_percent))}</span>`

  return `<div class="status-left">${left}</div><div class="status-center">${escHtml(sb.time || '9:41')}</div><div class="status-right">${right}</div>`
}
