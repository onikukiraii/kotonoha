export type Expr =
  | { kind: 'literal'; value: string | number | boolean | null }
  | { kind: 'ident'; name: string }
  | { kind: 'member'; object: Expr; property: string }
  | { kind: 'call'; callee: Expr; args: Expr[] }
  | { kind: 'binary'; op: string; left: Expr; right: Expr }
  | { kind: 'unary'; op: string; argument: Expr }
  | { kind: 'logical'; op: '&&' | '||'; left: Expr; right: Expr }

export class ParseError extends Error {}
