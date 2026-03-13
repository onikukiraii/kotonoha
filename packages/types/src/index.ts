export type FileNode = {
  name: string
  path: string
  is_dir: boolean
  children?: FileNode[]
  updated_at?: number
}

export type SearchResult = {
  path: string
  filename: string
  snippet?: string
  score: number
}

export type BacklinkResult = {
  source_path: string
  snippet: string
}

export type GitStatus = {
  branch: string
  staged: string[]
  unstaged: string[]
  untracked: string[]
}

export type VaultMeta = {
  path: string
  name: string
  file_count: number
}

export type AppConfig = {
  vault_path: string
  github_repo_url: string
  github_pat: string
  auto_save_delay_ms: number
  theme: 'dark' | 'light' | 'system'
  font_size: number
}
