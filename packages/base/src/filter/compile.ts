import { parseExpression } from './parse.js'
import { evaluateExpr, type EvalContext } from './evaluate.js'
import type { Expr } from './ast.js'

export type CompiledExpression = (ctx: EvalContext) => unknown

const FILE_ALLOWED_FNS = new Set(['hasTag', 'inFolder', 'hasLink'])
const TOP_LEVEL_IDENTS = new Set(['file', 'note', 'formula'])
const GLOBAL_FNS = new Set([
  'date',
  'today',
  'now',
  'if',
  'contains',
  'startsWith',
  'endsWith',
  'in',
  'matches',
  'length',
])

export function compileExpression(source: string): CompiledExpression {
  const ast = parseExpression(source)
  validate(ast)
  return (ctx) => evaluateExpr(ast, ctx)
}

function validate(expr: Expr): void {
  switch (expr.kind) {
    case 'literal':
      return
    case 'ident':
      return
    case 'member':
      if (expr.property === '__proto__' || expr.property === 'prototype' || expr.property === 'constructor') {
        throw new Error(`blocked property access: ${expr.property}`)
      }
      validate(expr.object)
      return
    case 'call': {
      const callee = expr.callee
      if (callee.kind === 'member' && callee.object.kind === 'ident') {
        const base = callee.object.name
        if (base === 'file') {
          if (!FILE_ALLOWED_FNS.has(callee.property)) {
            throw new Error(`unknown function file.${callee.property}`)
          }
          expr.args.forEach(validate)
          return
        }
      }
      if (callee.kind === 'ident') {
        if (!GLOBAL_FNS.has(callee.name)) {
          if (TOP_LEVEL_IDENTS.has(callee.name)) {
            throw new Error(`cannot call bare identifier "${callee.name}"`)
          }
          throw new Error(`unknown function ${callee.name}`)
        }
        expr.args.forEach(validate)
        return
      }
      throw new Error(`unsupported call shape`)
    }
    case 'unary':
      validate(expr.argument)
      return
    case 'binary':
    case 'logical':
      validate(expr.left)
      validate(expr.right)
      return
  }
}
