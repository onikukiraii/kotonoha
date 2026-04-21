import { tokenize, type Token } from './tokenize.js'
import { type Expr, ParseError } from './ast.js'

const PRECEDENCE: Record<string, number> = {
  '||': 1,
  '&&': 2,
  '==': 3,
  '!=': 3,
  '<': 4,
  '>': 4,
  '<=': 4,
  '>=': 4,
  '+': 5,
  '-': 5,
  '*': 6,
  '/': 6,
  '%': 6,
}

export function parseExpression(source: string): Expr {
  const tokens = tokenize(source)
  const parser = new Parser(tokens)
  const expr = parser.parseExpr(0)
  parser.expect('eof')
  return expr
}

class Parser {
  private pos = 0
  constructor(private tokens: Token[]) {}

  peek(): Token {
    return this.tokens[this.pos]!
  }

  consume(): Token {
    return this.tokens[this.pos++]!
  }

  expect(kind: Token['kind'], value?: string): Token {
    const t = this.peek()
    if (t.kind !== kind || (value !== undefined && t.value !== value)) {
      throw new ParseError(`expected ${kind}${value ? ` "${value}"` : ''}, got ${t.kind} "${t.value}" at ${t.pos}`)
    }
    return this.consume()
  }

  parseExpr(minPrec: number): Expr {
    let left = this.parsePrefix()
    while (true) {
      const t = this.peek()
      if (t.kind !== 'op') break
      const prec = PRECEDENCE[t.value]
      if (prec === undefined || prec < minPrec) break
      this.consume()
      const right = this.parseExpr(prec + 1)
      if (t.value === '&&' || t.value === '||') {
        left = { kind: 'logical', op: t.value, left, right }
      } else {
        left = { kind: 'binary', op: t.value, left, right }
      }
    }
    return left
  }

  parsePrefix(): Expr {
    const t = this.peek()
    if (t.kind === 'op' && (t.value === '!' || t.value === '-')) {
      this.consume()
      const arg = this.parsePrefix()
      return { kind: 'unary', op: t.value, argument: arg }
    }
    if (t.kind === 'number') {
      this.consume()
      return { kind: 'literal', value: Number(t.value) }
    }
    if (t.kind === 'string') {
      this.consume()
      return { kind: 'literal', value: t.value }
    }
    if (t.kind === 'bool') {
      this.consume()
      return { kind: 'literal', value: t.value === 'true' }
    }
    if (t.kind === 'null') {
      this.consume()
      return { kind: 'literal', value: null }
    }
    if (t.kind === 'lparen') {
      this.consume()
      const inner = this.parseExpr(0)
      this.expect('rparen')
      return inner
    }
    if (t.kind === 'ident') {
      this.consume()
      let node: Expr = { kind: 'ident', name: t.value }
      while (true) {
        const next = this.peek()
        if (next.kind === 'dot') {
          this.consume()
          const prop = this.expect('ident')
          node = { kind: 'member', object: node, property: prop.value }
        } else if (next.kind === 'lparen') {
          this.consume()
          const args: Expr[] = []
          if (this.peek().kind !== 'rparen') {
            args.push(this.parseExpr(0))
            while (this.peek().kind === 'comma') {
              this.consume()
              args.push(this.parseExpr(0))
            }
          }
          this.expect('rparen')
          node = { kind: 'call', callee: node, args }
        } else {
          break
        }
      }
      return node
    }
    throw new ParseError(`unexpected token ${t.kind} "${t.value}" at ${t.pos}`)
  }
}
