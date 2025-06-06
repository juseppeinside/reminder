const sqlite3 = require("sqlite3").verbose();
const fs = require("fs");

// Убедимся, что директория для БД существует
const dbDir = "./db";
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir);
}

// Инициализация базы данных
const db = new sqlite3.Database("./db/reminders.db");

// Создание таблиц в базе данных
db.serialize(() => {
  // Таблица пользователей
  db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY,
    username TEXT,
    first_name TEXT,
    last_name TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // Таблица уведомлений
  db.run(`CREATE TABLE IF NOT EXISTS reminders (
    id TEXT PRIMARY KEY,
    user_id INTEGER,
    text TEXT,
    time TEXT,
    days TEXT,
    count_in_days INTEGER,
    every_week INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users (id)
  )`);

  // Таблица шаблонов уведомлений
  db.run(`CREATE TABLE IF NOT EXISTS reminder_templates (
    id TEXT PRIMARY KEY,
    user_id INTEGER,
    text TEXT,
    time TEXT,
    days TEXT,
    every_week INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users (id)
  )`);
});

module.exports = db;
