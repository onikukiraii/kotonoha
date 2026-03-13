CREATE TABLE IF NOT EXISTS files (
  path TEXT PRIMARY KEY,
  filename TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS links (
  source_path TEXT NOT NULL,
  target TEXT NOT NULL,
  PRIMARY KEY (source_path, target)
);

CREATE TABLE IF NOT EXISTS tags (
  path TEXT NOT NULL,
  tag TEXT NOT NULL,
  PRIMARY KEY (path, tag)
);

CREATE VIRTUAL TABLE IF NOT EXISTS fts USING fts5(
  path UNINDEXED,
  content,
  tokenize = 'trigram'
);
