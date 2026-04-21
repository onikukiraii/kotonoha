export type TokenKind =
  | 'number'
  | 'string'
  | 'ident'
  | 'bool'
  | 'null'
  | 'op'
  | 'lparen'
  | 'rparen'
  | 'comma'
  | 'dot'
  | 'eof'

export type Token = {
  kind: TokenKind
  value: string
  pos: number
}

export class TokenizeError extends Error {}

const SINGLE_OPS = new Set(['+', '-', '*', '/', '%', '!'])
const TWO_CHAR_OPS = new Set(['==', '!=', '>=', '<=', '&&', '||'])

export function tokenize(source: string): Token[] {
  const tokens: Token[] = []
  let i = 0
  while (i < source.length) {
    const c = source[i]!
    if (c === ' ' || c === '\t' || c === '\n' || c === '\r') {
      i++
      continue
    }
    if (c === '(') {
      tokens.push({ kind: 'lparen', value: c, pos: i++ })
      continue
    }
    if (c === ')') {
      tokens.push({ kind: 'rparen', value: c, pos: i++ })
      continue
    }
    if (c === ',') {
      tokens.push({ kind: 'comma', value: c, pos: i++ })
      continue
    }
    if (c === '.') {
      tokens.push({ kind: 'dot', value: c, pos: i++ })
      continue
    }
    if (c === '"' || c === "'") {
      const quote = c
      const start = i
      i++
      let value = ''
      while (i < source.length && source[i] !== quote) {
        if (source[i] === '\\' && i + 1 < source.length) {
          value += source[i + 1]
          i += 2
          continue
        }
        value += source[i]
        i++
      }
      if (i >= source.length) {
        throw new TokenizeError(`unterminated string starting at ${start}`)
      }
      i++
      tokens.push({ kind: 'string', value, pos: start })
      continue
    }
    if (/[0-9]/.test(c) || (c === '-' && /[0-9]/.test(source[i + 1] ?? ''))) {
      const start = i
      if (c === '-') i++
      while (i < source.length && /[0-9.]/.test(source[i]!)) i++
      tokens.push({ kind: 'number', value: source.slice(start, i), pos: start })
      continue
    }
    if (/[a-zA-Z_$]/.test(c)) {
      const start = i
      while (i < source.length && /[a-zA-Z0-9_$]/.test(source[i]!)) i++
      const value = source.slice(start, i)
      if (value === 'true' || value === 'false') {
        tokens.push({ kind: 'bool', value, pos: start })
      } else if (value === 'null') {
        tokens.push({ kind: 'null', value, pos: start })
      } else {
        tokens.push({ kind: 'ident', value, pos: start })
      }
      continue
    }
    const two = source.slice(i, i + 2)
    if (TWO_CHAR_OPS.has(two)) {
      tokens.push({ kind: 'op', value: two, pos: i })
      i += 2
      continue
    }
    if (c === '>' || c === '<') {
      tokens.push({ kind: 'op', value: c, pos: i++ })
      continue
    }
    if (SINGLE_OPS.has(c)) {
      tokens.push({ kind: 'op', value: c, pos: i++ })
      continue
    }
    throw new TokenizeError(`unexpected character "${c}" at position ${i}`)
  }
  tokens.push({ kind: 'eof', value: '', pos: source.length })
  return tokens
}
