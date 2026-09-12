import Database from 'better-sqlite3';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const db = new Database(path.join(__dirname, '..', 'vocab.db'));

db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS vocab (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    korean TEXT NOT NULL UNIQUE,
    english TEXT NOT NULL,
    example_sentence TEXT,
    date_added TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'Learning',
    correct_count INTEGER NOT NULL DEFAULT 0
  )
`);

const insertVocabStmt = db.prepare(`
  INSERT INTO vocab (korean, english, example_sentence, date_added)
  VALUES (@korean, @english, @example_sentence, @date_added)
  ON CONFLICT(korean) DO NOTHING
`);

const allKoreanWordsStmt = db.prepare('SELECT korean FROM vocab');

// Returns true if the word was newly saved, false if it was already known.
export function saveVocabWord({ korean, english, example_sentence }) {
  const result = insertVocabStmt.run({
    korean,
    english,
    example_sentence,
    date_added: new Date().toISOString(),
  });
  return result.changes > 0;
}

export function getAllKoreanWords() {
  return allKoreanWordsStmt.all().map((row) => row.korean);
}
