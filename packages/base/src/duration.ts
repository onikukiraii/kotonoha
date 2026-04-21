const DURATION_RE = /^(-?\d+)([yMwdhms])$/

const UNIT_MS: Record<string, number> = {
  s: 1000,
  m: 60 * 1000,
  h: 60 * 60 * 1000,
  d: 24 * 60 * 60 * 1000,
  w: 7 * 24 * 60 * 60 * 1000,
}

export type Duration = {
  kind: 'duration'
  years: number
  months: number
  ms: number
}

export function parseDuration(s: string): Duration | null {
  const m = DURATION_RE.exec(s)
  if (!m) return null
  const n = Number(m[1])
  const unit = m[2]!
  if (unit === 'y') return { kind: 'duration', years: n, months: 0, ms: 0 }
  if (unit === 'M') return { kind: 'duration', years: 0, months: n, ms: 0 }
  return { kind: 'duration', years: 0, months: 0, ms: n * UNIT_MS[unit]! }
}

export function addDuration(date: Date, d: Duration): Date {
  const out = new Date(date.getTime() + d.ms)
  if (d.years !== 0 || d.months !== 0) {
    const totalMonths = d.years * 12 + d.months
    out.setMonth(out.getMonth() + totalMonths)
  }
  return out
}

export function subDuration(date: Date, d: Duration): Date {
  return addDuration(date, { kind: 'duration', years: -d.years, months: -d.months, ms: -d.ms })
}

export function isDuration(v: unknown): v is Duration {
  return typeof v === 'object' && v !== null && (v as Duration).kind === 'duration'
}
