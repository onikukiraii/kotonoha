import type { FileNode, SearchResult, BacklinkResult, GitStatus } from '@kotonoha/types'

async function fetchApi<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  }

  const res = await fetch(path, { ...options, headers })

  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error((body as { error?: string }).error ?? `HTTP ${res.status}`)
  }

  return res.json()
}

// Files
export async function getFileTree(): Promise<FileNode[]> {
  const { tree } = await fetchApi<{ tree: FileNode[] }>('/api/files/tree')
  return tree
}

export async function getFileContent(path: string): Promise<{ content: string; updated_at: number }> {
  return fetchApi(`/api/files/content?path=${encodeURIComponent(path)}`)
}

export async function saveFileContent(path: string, content: string): Promise<{ ok: boolean; updated_at: number }> {
  return fetchApi('/api/files/content', {
    method: 'PUT',
    body: JSON.stringify({ path, content }),
  })
}

export async function createNewFile(path: string, content?: string): Promise<void> {
  await fetchApi('/api/files', {
    method: 'POST',
    body: JSON.stringify({ path, content }),
  })
}

export async function deleteFileApi(path: string): Promise<void> {
  await fetchApi(`/api/files?path=${encodeURIComponent(path)}`, {
    method: 'DELETE',
  })
}

export async function renameFileApi(from: string, to: string): Promise<void> {
  await fetchApi('/api/files/rename', {
    method: 'PATCH',
    body: JSON.stringify({ from, to }),
  })
}

// Search
export async function searchFiles(query: string): Promise<SearchResult[]> {
  const { results } = await fetchApi<{ results: SearchResult[] }>(
    `/api/search/files?q=${encodeURIComponent(query)}`,
  )
  return results
}

export async function searchFullText(query: string): Promise<SearchResult[]> {
  const { results } = await fetchApi<{ results: SearchResult[] }>(
    `/api/search/fulltext?q=${encodeURIComponent(query)}`,
  )
  return results
}

export async function getBacklinksApi(filename: string): Promise<BacklinkResult[]> {
  const { backlinks } = await fetchApi<{ backlinks: BacklinkResult[] }>(
    `/api/search/backlinks?filename=${encodeURIComponent(filename)}`,
  )
  return backlinks
}

export async function getAllTagsApi(): Promise<string[]> {
  const { tags } = await fetchApi<{ tags: string[] }>('/api/search/tags')
  return tags
}

export async function searchByTagApi(tag: string): Promise<SearchResult[]> {
  const { results } = await fetchApi<{ results: SearchResult[] }>(
    `/api/search/tags?tag=${encodeURIComponent(tag)}`,
  )
  return results
}

// Daily
export async function openDailyNote(): Promise<{ path: string; created: boolean }> {
  return fetchApi('/api/files/daily', { method: 'POST' })
}

// Git
export async function getGitStatus(): Promise<GitStatus> {
  return fetchApi('/api/git/status')
}

export async function gitPullApi(): Promise<{ updated: boolean; conflicts: string[] }> {
  return fetchApi('/api/git/pull', { method: 'POST' })
}

export async function gitCommitPush(message?: string): Promise<{ ok: boolean; commit_hash: string }> {
  return fetchApi('/api/git/commit-push', {
    method: 'POST',
    body: JSON.stringify({ message }),
  })
}
