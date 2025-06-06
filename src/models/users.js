const db = require("../database");

// Функция сохранения пользователя
function saveUser(user) {
  console.log("Сохраняем пользователя:", user);

  if (!user || !user.id) {
    console.error("Ошибка: данные пользователя некорректны", user);
    return;
  }

  return new Promise((resolve, reject) => {
    db.run(
      "INSERT OR IGNORE INTO users (id, username, first_name, last_name) VALUES (?, ?, ?, ?)",
      [
        user.id,
        user.username || "",
        user.first_name || "",
        user.last_name || "",
      ],
      function (err) {
        if (err) {
          console.error("Ошибка при сохранении пользователя:", err);
          reject(err);
        } else {
          console.log(
            `Пользователь ${user.id} сохранен. Изменено строк: ${this.changes}`
          );
          resolve(this.changes);
        }
      }
    );
  });
}

// Функция для получения списка всех пользователей
function getAllUsers() {
  return new Promise((resolve, reject) => {
    db.all("SELECT * FROM users", (err, users) => {
      if (err) {
        reject(err);
        return;
      }
      resolve(users);
    });
  });
}

// Функция для получения количества пользователей
function getUserCount() {
  return new Promise((resolve, reject) => {
    db.get("SELECT COUNT(*) as count FROM users", (err, countRow) => {
      if (err) {
        reject(err);
        return;
      }
      resolve(countRow.count);
    });
  });
}

// Функция для получения последних пользователей
function getRecentUsers(limit = 10) {
  return new Promise((resolve, reject) => {
    db.all(
      "SELECT * FROM users ORDER BY created_at DESC LIMIT ?",
      [limit],
      (err, users) => {
        if (err) {
          reject(err);
          return;
        }
        resolve(users);
      }
    );
  });
}

module.exports = {
  saveUser,
  getAllUsers,
  getUserCount,
  getRecentUsers,
};
