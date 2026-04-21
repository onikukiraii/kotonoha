import { stringify } from 'yaml'
import type { BaseFile, BaseView, FilterNode } from './schema.js'

export function serializeBase(base: BaseFile): string {
  const obj: Record<string, unknown> = {}

  if (base.filters !== undefined) {
    obj['filters'] = filterToYaml(base.filters)
  }
  if (Object.keys(base.formulas).length > 0) {
    obj['formulas'] = base.formulas
  }
  if (Object.keys(base.properties).length > 0) {
    const props: Record<string, unknown> = {}
    for (const [k, meta] of Object.entries(base.properties)) {
      const entry: Record<string, unknown> = {}
      if (meta.displayName !== undefined) entry['displayName'] = meta.displayName
      props[k] = entry
    }
    obj['properties'] = props
  }
  if (Object.keys(base.summaries).length > 0) {
    obj['summaries'] = base.summaries
  }
  if (base.views.length > 0) {
    obj['views'] = base.views.map(viewToYaml)
  }

  return stringify(obj)
}

function filterToYaml(node: FilterNode): unknown {
  if (node.kind === 'expr') {
    return node.source
  }
  if (node.kind === 'and') {
    if (node.children.length === 1) {
      return filterToYaml(node.children[0]!)
    }
    return { and: node.children.map(filterToYaml) }
  }
  if (node.kind === 'or') {
    return { or: node.children.map(filterToYaml) }
  }
  return { not: node.children.map(filterToYaml) }
}

function viewToYaml(view: BaseView): Record<string, unknown> {
  const out: Record<string, unknown> = {
    type: view.type,
    name: view.name,
  }
  if (view.filters !== undefined) out['filters'] = filterToYaml(view.filters)
  if (view.order !== undefined) out['order'] = view.order
  if (view.sort !== undefined) out['sort'] = view.sort
  if (view.limit !== undefined) out['limit'] = view.limit
  if (view.groupBy !== undefined) out['groupBy'] = view.groupBy
  if (view.summaries !== undefined) out['summaries'] = view.summaries
  if (view.image !== undefined) out['image'] = view.image
  return out
}
