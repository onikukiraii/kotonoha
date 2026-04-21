import type Database from 'better-sqlite3'

export function upsertBaseFile(
  db: Database.Database,
  filePath: string,
  rawYaml: string,
  parsedJson: string,
  mtime: number,
): void {
  db.prepare(
    `INSERT INTO bases (path, raw_yaml, parsed_json, mtime) VALUES (?, ?, ?, ?)
     ON CONFLICT(path) DO UPDATE SET raw_yaml = excluded.raw_yaml, parsed_json = excluded.parsed_json, mtime = excluded.mtime`,
  ).run(filePath, rawYaml, parsedJson, mtime)
}

export function getBaseFile(
  db: Database.Database,
  filePath: string,
): { raw_yaml: string; parsed_json: string; mtime: number } | null {
  const row = db
    .prepare('SELECT raw_yaml, parsed_json, mtime FROM bases WHERE path = ?')
    .get(filePath) as { raw_yaml: string; parsed_json: string; mtime: number } | undefined
  return row ?? null
}

export function listBaseFiles(
  db: Database.Database,
): { path: string; mtime: number }[] {
  return db.prepare('SELECT path, mtime FROM bases').all() as { path: string; mtime: number }[]
}
