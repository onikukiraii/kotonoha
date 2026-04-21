export function applySummary(fn: string, values: unknown[]): unknown {
  const clean = values.filter((v) => v !== null && v !== undefined)
  switch (fn) {
    case 'Sum':
      return clean.reduce<number>((a, b) => a + toNumber(b), 0)
    case 'Average': {
      const nums = clean.map(toNumber).filter((n) => !Number.isNaN(n))
      if (nums.length === 0) return 0
      return nums.reduce((a, b) => a + b, 0) / nums.length
    }
    case 'Min': {
      const nums = clean.map(toNumber).filter((n) => !Number.isNaN(n))
      return nums.length === 0 ? null : Math.min(...nums)
    }
    case 'Max': {
      const nums = clean.map(toNumber).filter((n) => !Number.isNaN(n))
      return nums.length === 0 ? null : Math.max(...nums)
    }
    case 'Earliest':
      return pickDate(clean, (a, b) => a - b)
    case 'Latest':
      return pickDate(clean, (a, b) => b - a)
    case 'Checked':
      return values.filter((v) => v === true).length
    case 'Unchecked':
      return values.filter((v) => v === false).length
    case 'Unique':
      return Array.from(new Set(clean.map((v) => JSON.stringify(v)))).map((s) => JSON.parse(s))
    case 'Empty':
      return values.filter((v) => v === null || v === undefined).length
    case 'Filled':
      return clean.length
    default:
      throw new Error(`unsupported summary function: ${fn}`)
  }
}

function pickDate(values: unknown[], cmp: (a: number, b: number) => number): unknown {
  const dated = values
    .map((v) => {
      if (v instanceof Date) return { value: v.toISOString(), ms: v.getTime() }
      if (typeof v === 'string') {
        const d = new Date(v)
        if (!Number.isNaN(d.getTime())) return { value: v, ms: d.getTime() }
      }
      return null
    })
    .filter((x): x is { value: string; ms: number } => x !== null)
  if (dated.length === 0) return null
  dated.sort((a, b) => cmp(a.ms, b.ms))
  return dated[0]!.value
}

function toNumber(v: unknown): number {
  if (typeof v === 'number') return v
  if (typeof v === 'boolean') return v ? 1 : 0
  const n = Number(v)
  return Number.isNaN(n) ? 0 : n
}
