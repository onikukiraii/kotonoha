export const env = {
  VAULT_PATH: process.env['VAULT_PATH'] ?? '/app/vault',
  GITHUB_REPO_URL: process.env['GITHUB_REPO_URL'] ?? '',
  GITHUB_PAT: process.env['GITHUB_PAT'] ?? '',
  GIT_USER_NAME: process.env['GIT_USER_NAME'] ?? 'kotonoha',
  GIT_USER_EMAIL: process.env['GIT_USER_EMAIL'] ?? 'kotonoha@auto',
  PORT: parseInt(process.env['PORT'] ?? '3000', 10),
  AUTO_COMMIT: (process.env['AUTO_COMMIT'] ?? 'true') === 'true',
  AUTO_COMMIT_IDLE_SEC: parseInt(process.env['AUTO_COMMIT_IDLE_SEC'] ?? '300', 10),
  AUTO_PULL_INTERVAL: parseInt(process.env['AUTO_PULL_INTERVAL'] ?? '300', 10),
} as const
