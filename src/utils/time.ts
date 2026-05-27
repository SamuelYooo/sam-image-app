const beijingFormatter = new Intl.DateTimeFormat('zh-CN', {
  timeZone: 'Asia/Shanghai',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
})

function dateFromUnixTimestamp(value: string) {
  const raw = value.replace(/^unix:/, '').trim()
  if (!/^\d+$/.test(raw)) {
    return null
  }
  const milliseconds =
    raw.length > 13 ? Number(BigInt(raw) / 1_000_000n) : Number(BigInt(raw) * 1_000n)
  return Number.isFinite(milliseconds) ? new Date(milliseconds) : null
}

function dateFromStoredTimestamp(value: string) {
  const trimmed = value.trim()
  if (!trimmed) {
    return null
  }
  if (trimmed.startsWith('unix:')) {
    return dateFromUnixTimestamp(trimmed)
  }
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(trimmed)) {
    return new Date(`${trimmed.replace(' ', 'T')}Z`)
  }
  const parsed = Date.parse(trimmed.includes('T') ? trimmed : trimmed.replace(' ', 'T'))
  return Number.isNaN(parsed) ? null : new Date(parsed)
}

export function formatBeijingDateTime(value?: string, fallback = '未记录') {
  if (!value) {
    return fallback
  }
  const date = dateFromStoredTimestamp(value)
  if (!date) {
    return value.replace('T', ' ').slice(0, 16) || fallback
  }
  const parts = Object.fromEntries(beijingFormatter.formatToParts(date).map((part) => [part.type, part.value]))
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}`
}
