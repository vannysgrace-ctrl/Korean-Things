import Database from 'better-sqlite3';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// DB_PATH lets a deployment point the database file at persistent storage
// (e.g. a Railway Volume) instead of the container's ephemeral filesystem.
// Falls back to the old relative path so local development needs no setup.
const dbPath = process.env.DB_PATH || path.join(__dirname, '..', 'vocab.db');
const db = new Database(dbPath);

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
const allVocabStmt = db.prepare('SELECT * FROM vocab ORDER BY date_added DESC');
const randomLearningWordStmt = db.prepare(
  "SELECT * FROM vocab WHERE status = 'Learning' ORDER BY RANDOM() LIMIT 1"
);
const randomAnyWordStmt = db.prepare('SELECT * FROM vocab ORDER BY RANDOM() LIMIT 1');
const randomDistractorsStmt = db.prepare(
  'SELECT * FROM vocab WHERE id != ? ORDER BY RANDOM() LIMIT ?'
);
const getVocabByIdStmt = db.prepare('SELECT * FROM vocab WHERE id = ?');
const updateAfterCorrectAnswerStmt = db.prepare(
  'UPDATE vocab SET correct_count = ?, status = ? WHERE id = ?'
);

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

export function getAllVocab() {
  return allVocabStmt.all();
}

// Prefers a word still being learned; falls back to any word if none are
// left in "Learning" status. Returns undefined if the vocab list is empty.
export function getRandomVocabWord() {
  return randomLearningWordStmt.get() ?? randomAnyWordStmt.get();
}

export function getRandomDistractors({ excludeId, limit }) {
  return randomDistractorsStmt.all(excludeId, limit);
}

// Increments a word's correct-answer count and promotes it to "Learnt" once
// it reaches 3 correct answers. Returns the updated row, or null if the
// word no longer exists.
export function recordCorrectAnswer(id) {
  const word = getVocabByIdStmt.get(id);
  if (!word) {
    return null;
  }
  const correct_count = word.correct_count + 1;
  const status = correct_count >= 3 ? 'Learnt' : word.status;
  updateAfterCorrectAnswerStmt.run(correct_count, status, id);
  return { ...word, correct_count, status };
}
