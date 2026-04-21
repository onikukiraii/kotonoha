export type FilterNode =
  | { kind: 'expr'; source: string }
  | { kind: 'and'; children: FilterNode[] }
  | { kind: 'or'; children: FilterNode[] }
  | { kind: 'not'; children: FilterNode[] }

export type SortSpec = {
  column: string
  direction: 'asc' | 'desc'
}

export type GroupBySpec = {
  property: string
}

export type SummarySpec = Record<string, string>

export type ViewType = 'table' | 'cards' | 'list'

export type BaseView = {
  type: ViewType
  name: string
  filters?: FilterNode
  order?: string[]
  sort?: SortSpec[]
  limit?: number
  groupBy?: GroupBySpec
  summaries?: SummarySpec
  image?: string
}

export type PropertyMeta = {
  displayName?: string
}

export type BaseFile = {
  filters?: FilterNode
  formulas: Record<string, string>
  properties: Record<string, PropertyMeta>
  summaries: Record<string, string>
  views: BaseView[]
}
