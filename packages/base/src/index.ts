export { splitFrontmatter, parseFrontmatter } from './frontmatter.js'
export type { SplitResult, ParseResult, TypedProperty, PropertyType } from './frontmatter.js'
export { updateFrontmatterProperty } from './frontmatter-write.js'

export { parseBase, BaseParseError } from './parser.js'
export type {
  BaseFile,
  BaseView,
  FilterNode,
  SortSpec,
  GroupBySpec,
  SummarySpec,
  PropertyMeta,
  ViewType,
} from './schema.js'

export { runBase } from './query.js'
export type { QueryResult, ViewResult, Row, Group, IndexedFile, RunOptions } from './query.js'

export { compileExpression } from './filter/compile.js'
export { evaluateFilter, evaluateExpr } from './filter/evaluate.js'
export type { EvalContext, FileCtx } from './filter/evaluate.js'

export { applySummary } from './summaries.js'
export { buildFileCtx } from './fileCtx.js'
export { serializeBase } from './serialize.js'
export { summarizeProperties } from './schema-detect.js'
export type { PropertySchema, PropertyStat, DetectedType, SummarizeOpts } from './schema-detect.js'
