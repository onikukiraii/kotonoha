import type { FilterNode } from '../schema.js'
import type { Expr } from './ast.js'
import { compileExpression } from './compile.js'
import { parseDuration, addDuration, subDuration, isDuration, type Duration } from '../duration.js'

export type FileCtx = {
  name: string
  basename: string
  path: string
  folder: string
  size: number
  ctime: number
  mtime: number
  tags: string[]
  links: string[]
  backlinks: string[]
}

export type EvalContext = {
  file: FileCtx
  note: Record<string, unknown>
  formula?: Record<string, unknown>
}

export function evaluateExpr(expr: Expr, ctx: EvalContext): unknown {
  switch (expr.kind) {
    case 'literal':
      return expr.value
    case 'ident':
      return resolveIdent(expr.name, ctx)
    case 'member':
      return resolveMember(expr, ctx)
    case 'call':
      return callFunction(expr, ctx)
    case 'unary': {
      const v = evaluateExpr(expr.argument, ctx)
      if (expr.op === '!') return !truthy(v)
      if (expr.op === '-') return -(Number(v) || 0)
      throw new EvalError(`unknown unary op ${expr.op}`)
    }
    case 'binary': {
      const l = evaluateExpr(expr.left, ctx)
      const r = evaluateExpr(expr.right, ctx)
      return applyBinary(expr.op, l, r)
    }
    case 'logical':
      if (expr.op === '&&') {
        const l = evaluateExpr(expr.left, ctx)
        if (!truthy(l)) return l
        return evaluateExpr(expr.right, ctx)
      }
      if (expr.op === '||') {
        const l = evaluateExpr(expr.left, ctx)
        if (truthy(l)) return l
        return evaluateExpr(expr.right, ctx)
      }
      throw new EvalError(`unknown logical op ${expr.op}`)
  }
}

export class EvalError extends Error {}

function resolveIdent(name: string, ctx: EvalContext): unknown {
  if (name === 'file') return ctx.file
  if (name === 'note') return ctx.note
  if (name === 'formula') return ctx.formula ?? {}
  if (Object.prototype.hasOwnProperty.call(ctx.note, name)) {
    return ctx.note[name]
  }
  if (ctx.formula && Object.prototype.hasOwnProperty.call(ctx.formula, name)) {
    return ctx.formula[name]
  }
  return undefined
}

function resolveMember(expr: Expr & { kind: 'member' }, ctx: EvalContext): unknown {
  const obj = evaluateExpr(expr.object, ctx)
  if (obj === null || obj === undefined) return undefined
  if (typeof obj !== 'object') return undefined
  const prop = expr.property
  if (isUnsafeProperty(prop)) {
    throw new EvalError(`blocked access to "${prop}"`)
  }
  return (obj as Record<string, unknown>)[prop]
}

function isUnsafeProperty(name: string): boolean {
  return name === '__proto__' || name === 'prototype' || name === 'constructor'
}

type FnImpl = (args: unknown[], ctx: EvalContext) => unknown

const FILE_FNS: Record<string, FnImpl> = {
  hasTag: (args, ctx) => {
    const tag = String(args[0])
    return ctx.file.tags.includes(tag)
  },
  inFolder: (args, ctx) => {
    const folder = String(args[0])
    return ctx.file.folder === folder || ctx.file.folder.startsWith(folder + '/')
  },
  hasLink: (args, ctx) => {
    const target = String(args[0])
    return ctx.file.links.some((l) => l === target || l.endsWith('/' + target))
  },
}

const GLOBAL_FNS: Record<string, FnImpl> = {
  date: (args) => {
    if (args.length !== 1) throw new EvalError('date() takes one argument')
    const arg = args[0]
    if (arg instanceof Date) return arg
    if (typeof arg === 'string') {
      const d = new Date(arg)
      if (Number.isNaN(d.getTime())) throw new EvalError(`invalid date string: ${arg}`)
      return d
    }
    throw new EvalError('date() argument must be a string or Date')
  },
  today: () => {
    const now = new Date()
    return new Date(now.getFullYear(), now.getMonth(), now.getDate())
  },
  now: () => new Date(),
  if: (args) => {
    if (args.length !== 3) throw new EvalError('if() takes three arguments')
    return truthy(args[0]) ? args[1] : args[2]
  },
  contains: (args) => {
    if (args.length !== 2) throw new EvalError('contains() takes two arguments')
    const [haystack, needle] = args
    if (Array.isArray(haystack)) return haystack.includes(needle as never)
    if (typeof haystack === 'string') return haystack.includes(String(needle))
    return false
  },
  startsWith: (args) => {
    const [s, p] = args
    return typeof s === 'string' && typeof p === 'string' && s.startsWith(p)
  },
  endsWith: (args) => {
    const [s, p] = args
    return typeof s === 'string' && typeof p === 'string' && s.endsWith(p)
  },
  in: (args) => {
    if (args.length !== 2) throw new EvalError('in() takes two arguments')
    const [needle, haystack] = args
    if (Array.isArray(haystack)) return haystack.includes(needle as never)
    if (typeof haystack === 'string') return typeof needle === 'string' && haystack.includes(needle)
    return false
  },
  matches: (args) => {
    const [value, pattern] = args
    if (typeof value !== 'string' || typeof pattern !== 'string') return false
    try {
      return new RegExp(pattern).test(value)
    } catch {
      return false
    }
  },
  length: (args) => {
    const [v] = args
    if (Array.isArray(v) || typeof v === 'string') return v.length
    return 0
  },
}

function callFunction(expr: Expr & { kind: 'call' }, ctx: EvalContext): unknown {
  const callee = expr.callee
  const args = expr.args.map((a) => evaluateExpr(a, ctx))

  if (callee.kind === 'member' && callee.object.kind === 'ident') {
    const obj = callee.object.name
    const fn = callee.property
    if (obj === 'file') {
      const impl = FILE_FNS[fn]
      if (!impl) throw new EvalError(`unknown function file.${fn}`)
      return impl(args, ctx)
    }
  }
  if (callee.kind === 'ident') {
    const impl = GLOBAL_FNS[callee.name]
    if (!impl) throw new EvalError(`unknown function ${callee.name}`)
    return impl(args, ctx)
  }
  throw new EvalError(`unknown function call`)
}

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?)?$/

function coerceDate(v: unknown): Date | null {
  if (v instanceof Date) return v
  if (typeof v === 'string' && ISO_DATE_RE.test(v)) {
    const d = new Date(v)
    return Number.isNaN(d.getTime()) ? null : d
  }
  return null
}

function applyBinary(op: string, l: unknown, r: unknown): unknown {
  switch (op) {
    case '==':
      return looseEqual(l, r)
    case '!=':
      return !looseEqual(l, r)
    case '>':
    case '<':
    case '>=':
    case '<=':
      return compareOrdered(op, l, r)
    case '+': {
      const ld = coerceDate(l)
      const rdur = coerceDuration(r)
      if (ld && rdur) return addDuration(ld, rdur)
      const rd = coerceDate(r)
      const ldur = coerceDuration(l)
      if (rd && ldur) return addDuration(rd, ldur)
      if (typeof l === 'string' || typeof r === 'string') return String(l) + String(r)
      return Number(l) + Number(r)
    }
    case '-': {
      const ld2 = coerceDate(l)
      const rdur2 = coerceDuration(r)
      if (ld2 && rdur2) return subDuration(ld2, rdur2)
      const rd2 = coerceDate(r)
      if (ld2 && rd2) {
        return Math.round((ld2.getTime() - rd2.getTime()) / 86400000)
      }
      return Number(l) - Number(r)
    }
    case '*':
      return Number(l) * Number(r)
    case '/':
      return Number(l) / Number(r)
    case '%':
      return Number(l) % Number(r)
  }
  throw new EvalError(`unknown binary op ${op}`)
}

function looseEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (a === null || a === undefined) return b === null || b === undefined
  if (b === null || b === undefined) return false
  const ad = coerceDate(a)
  const bd = coerceDate(b)
  if (ad && bd) return ad.getTime() === bd.getTime()
  return a === b
}

function compareOrdered(op: string, l: unknown, r: unknown): boolean {
  if (l === undefined || l === null || r === undefined || r === null) return false
  const ld = coerceDate(l)
  const rd = coerceDate(r)
  if (ld && rd) {
    const la = ld.getTime()
    const ra = rd.getTime()
    if (op === '>') return la > ra
    if (op === '<') return la < ra
    if (op === '>=') return la >= ra
    if (op === '<=') return la <= ra
  }
  const ln = typeof l === 'number' ? l : Number(l)
  const rn = typeof r === 'number' ? r : Number(r)
  if (!Number.isNaN(ln) && !Number.isNaN(rn)) {
    if (op === '>') return ln > rn
    if (op === '<') return ln < rn
    if (op === '>=') return ln >= rn
    if (op === '<=') return ln <= rn
  }
  const ls = String(l)
  const rs = String(r)
  if (op === '>') return ls > rs
  if (op === '<') return ls < rs
  if (op === '>=') return ls >= rs
  if (op === '<=') return ls <= rs
  return false
}

function coerceDuration(v: unknown): Duration | null {
  if (isDuration(v)) return v
  if (typeof v === 'string') return parseDuration(v)
  return null
}

function truthy(v: unknown): boolean {
  if (v === null || v === undefined) return false
  if (typeof v === 'boolean') return v
  if (typeof v === 'number') return v !== 0 && !Number.isNaN(v)
  if (typeof v === 'string') return v.length > 0
  if (Array.isArray(v)) return v.length > 0
  return true
}

export function evaluateFilter(node: FilterNode, ctx: EvalContext): boolean {
  if (node.kind === 'expr') {
    const fn = compileExpression(node.source)
    return truthy(fn(ctx))
  }
  if (node.kind === 'and') {
    return node.children.every((c) => evaluateFilter(c, ctx))
  }
  if (node.kind === 'or') {
    return node.children.some((c) => evaluateFilter(c, ctx))
  }
  if (node.kind === 'not') {
    return !node.children.every((c) => evaluateFilter(c, ctx))
  }
  return false
}
