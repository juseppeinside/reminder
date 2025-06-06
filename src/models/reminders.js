const { v4: uuidv4 } = require("uuid");
const db = require("../database");

// Функция сохранения уведомления
function saveReminder(userId, params) {
  const reminderId = uuidv4();

  // Преобразуем countInDays и everyWeek в числа для сохранения
  const countInDays = parseInt(params.countInDays) || 99999;
  const everyWeek = parseInt(params.everyWeek) || 0;

  return new Promise((resolve, reject) => {
    db.run(
      "INSERT INTO reminders (id, user_id, text, time, days, count_in_days, every_week) VALUES (?, ?, ?, ?, ?, ?, ?)",
      [
        reminderId,
        userId,
        params.text,
        params.time,
        params.days,
        countInDays,
        everyWeek,
      ],
      (err) => {
        if (err) {
          console.error("Ошибка при сохранении уведомления:", err);
          reject(err);
          return;
        }

        resolve({
          id: reminderId,
          user_id: userId,
          text: params.text,
          time: params.time,
          days: params.days,
          count_in_days: countInDays,
          every_week: everyWeek,
        });
      }
    );
  });
}

// Функция получения всех напоминаний пользователя
function getUserReminders(userId) {
  return new Promise((resolve, reject) => {
    db.all(
      "SELECT * FROM reminders WHERE user_id = ? ORDER BY time",
      [userId],
      (err, reminders) => {
        if (err) {
          reject(err);
          return;
        }
        resolve(reminders);
      }
    );
  });
}

// Функция получения всех напоминаний
function getAllReminders() {
  return new Promise((resolve, reject) => {
    db.all("SELECT * FROM reminders", [], (err, reminders) => {
      if (err) {
        reject(err);
        return;
      }
      resolve(reminders);
    });
  });
}

// Функция удаления напоминания
function deleteReminder(reminderId, userId) {
  return new Promise((resolve, reject) => {
    db.run(
      "DELETE FROM reminders WHERE id = ? AND user_id = ?",
      [reminderId, userId],
      function (err) {
        if (err) {
          reject(err);
          return;
        }
        resolve(this.changes);
      }
    );
  });
}

// Функция удаления всех напоминаний пользователя
function deleteAllUserReminders(userId) {
  return new Promise((resolve, reject) => {
    db.run("DELETE FROM reminders WHERE user_id = ?", [userId], function (err) {
      if (err) {
        reject(err);
        return;
      }
      resolve(this.changes);
    });
  });
}

// Функция обновления счетчика дней для напоминания
function updateReminderCount(reminderId, newCount) {
  return new Promise((resolve, reject) => {
    db.run(
      "UPDATE reminders SET count_in_days = ? WHERE id = ?",
      [newCount, reminderId],
      function (err) {
        if (err) {
          reject(err);
          return;
        }
        resolve(this.changes);
      }
    );
  });
}

// Функция для сохранения шаблона напоминания
function saveReminderTemplate(templateId, userId, text, time, days, everyWeek) {
  return new Promise((resolve, reject) => {
    db.run(
      "INSERT OR REPLACE INTO reminder_templates (id, user_id, text, time, days, every_week) VALUES (?, ?, ?, ?, ?, ?)",
      [templateId, userId, text, time, days, everyWeek],
      function (err) {
        if (err) {
          reject(err);
          return;
        }
        resolve(this.changes);
      }
    );
  });
}

// Функция для получения шаблона напоминания
function getReminderTemplate(templateId, userId) {
  return new Promise((resolve, reject) => {
    db.get(
      "SELECT * FROM reminder_templates WHERE id = ? AND user_id = ?",
      [templateId, userId],
      (err, template) => {
        if (err) {
          reject(err);
          return;
        }
        resolve(template);
      }
    );
  });
}

module.exports = {
  saveReminder,
  getUserReminders,
  getAllReminders,
  deleteReminder,
  deleteAllUserReminders,
  updateReminderCount,
  saveReminderTemplate,
  getReminderTemplate,
};
