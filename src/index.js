require("dotenv").config();

const config = require("../config");

const TelegramBot = require("node-telegram-bot-api");
const cron = require("node-cron");
const sqlite3 = require("sqlite3").verbose();
const { v4: uuidv4 } = require("uuid");
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

// Создание экземпляра бота
const token = config.TELEGRAM_BOT_TOKEN;
const adminId = config.ADMIN_ID;

if (!token) {
  console.error("Ошибка: TELEGRAM_BOT_TOKEN не задан в файле конфигурации");
  process.exit(1);
}

const bot = new TelegramBot(token, { polling: true });

// Обработчик команды /start
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  saveUser(msg.from);
  sendHelpMessage(chatId);
});

// Обработчик команды /help
bot.onText(/\/help/, (msg) => {
  const chatId = msg.chat.id;
  sendHelpMessage(chatId);
});

// Обработчик команды /users (только для админа)
bot.onText(/\/users/, (msg) => {
  const chatId = msg.chat.id;

  if (chatId.toString() === adminId) {
    // Сначала получаем количество
    db.get("SELECT COUNT(*) as count FROM users", (err, countRow) => {
      if (err) {
        console.error("Ошибка при получении количества пользователей:", err);
        bot.sendMessage(
          chatId,
          "Ошибка при получении количества пользователей"
        );
        return;
      }

      // Теперь получаем список пользователей
      db.all(
        "SELECT * FROM users ORDER BY created_at DESC LIMIT 10",
        (err, users) => {
          if (err) {
            console.error("Ошибка при получении списка пользователей:", err);
            bot.sendMessage(
              chatId,
              "Ошибка при получении списка пользователей"
            );
            return;
          }

          let message = `Всего пользователей: ${countRow.count}\n\n`;

          if (users.length > 0) {
            message += "Последние пользователи:\n";
            users.forEach((user) => {
              message += `ID: ${user.id}, Username: ${
                user.username || "-"
              }, Имя: ${user.first_name || "-"}\n`;
            });
          } else {
            message += "Список пользователей пуст.";
          }

          bot.sendMessage(chatId, message);
        }
      );
    });
  } else {
    bot.sendMessage(chatId, "У вас нет прав для выполнения этой команды");
  }
});

// Обработчик команды /notification (только для админа)
bot.onText(/\/notification (.+)/, (msg, match) => {
  const chatId = msg.chat.id;
  const notificationText = match[1];

  if (chatId.toString() === adminId) {
    db.all("SELECT id FROM users", (err, users) => {
      if (err) {
        console.error(err);
        bot.sendMessage(chatId, "Ошибка при получении списка пользователей");
        return;
      }

      let sentCount = 0;
      users.forEach((user) => {
        bot
          .sendMessage(user.id, notificationText)
          .then(() => {
            sentCount++;
            if (sentCount === users.length) {
              bot.sendMessage(
                chatId,
                `Уведомление отправлено ${sentCount} пользователям`
              );
            }
          })
          .catch((error) => {
            console.error(
              `Ошибка отправки сообщения пользователю ${user.id}:`,
              error
            );
          });
      });
    });
  } else {
    bot.sendMessage(chatId, "У вас нет прав для выполнения этой команды");
  }
});

// Обработчик команды /delete
bot.onText(/\/delete (.+)/, (msg, match) => {
  const chatId = msg.chat.id;
  const reminderId = match[1];

  db.run(
    "DELETE FROM reminders WHERE id = ? AND user_id = ?",
    [reminderId, chatId],
    function (err) {
      if (err) {
        console.error(err);
        bot.sendMessage(chatId, "Ошибка при удалении уведомления");
        return;
      }

      if (this.changes > 0) {
        bot.sendMessage(chatId, "Уведомление успешно удалено");
      } else {
        bot.sendMessage(
          chatId,
          "Уведомление не найдено или не принадлежит вам"
        );
      }
    }
  );
});

// Обработчик команды /delete_all
bot.onText(/\/delete_all/, (msg) => {
  const chatId = msg.chat.id;

  db.run("DELETE FROM reminders WHERE user_id = ?", [chatId], function (err) {
    if (err) {
      console.error(err);
      bot.sendMessage(chatId, "Ошибка при удалении уведомлений");
      return;
    }

    bot.sendMessage(chatId, `Удалено ${this.changes} уведомлений`);
  });
});

// Обработчик команды /list
bot.onText(/\/list/, (msg) => {
  const chatId = msg.chat.id;

  db.all(
    "SELECT * FROM reminders WHERE user_id = ? ORDER BY time",
    [chatId],
    (err, reminders) => {
      if (err) {
        console.error("Ошибка при получении списка уведомлений:", err);
        bot.sendMessage(chatId, "Ошибка при получении списка уведомлений");
        return;
      }

      if (reminders.length === 0) {
        bot.sendMessage(chatId, "У вас нет активных уведомлений");
        return;
      }

      let message = "📋 *Ваши уведомления:*\n\n";

      reminders.forEach((reminder) => {
        // Определяем оставшиеся дни
        let remainingDays = "";
        if (reminder.count_in_days === 99999) {
          remainingDays = "♾️ (бесконечно)";
        } else {
          remainingDays = reminder.count_in_days;
        }

        message += `📝 *Сообщение:* ${reminder.text}\n`;

        // Форматируем время, если оно содержит несколько значений
        const times = reminder.time.split(",");
        if (times.length > 1) {
          message += `🕒 *Время:* ${times.join(", ")}\n`;
        } else {
          message += `🕒 *Время:* ${reminder.time}\n`;
        }

        message += `🆔 *ID:* \`${reminder.id}\`\n`;
        message += `⏳ *Осталось дней:* ${remainingDays}\n`;

        if (reminder.days && reminder.days !== "пн,вт,ср,чт,пт,сб,вс") {
          message += `📅 *Дни недели:* ${reminder.days}\n`;
        }

        // Форматируем текст периодичности недель
        let periodText = "";
        // Преобразуем к числу, так как в БД хранится как INTEGER
        const everyWeekValue = parseInt(reminder.every_week);

        if (everyWeekValue === 0) {
          periodText = "каждую неделю";
        } else if (everyWeekValue === 1) {
          periodText = "через неделю";
        } else if (everyWeekValue >= 2) {
          periodText = `каждые ${everyWeekValue + 1} недели`;
        } else {
          // На случай, если в БД некорректное значение
          periodText = `${reminder.every_week}`;
        }

        message += `🔄 *Периодичность:* ${periodText}\n`;

        message += "\n";
      });

      bot.sendMessage(chatId, message, { parse_mode: "Markdown" });
    }
  );
});

// Обработчик для создания уведомления
bot.on("message", (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;

  // Игнорируем команды
  if (text && !text.startsWith("/")) {
    try {
      const params = parseReminderParams(text);
      if (params) {
        saveReminder(chatId, params);
      }
    } catch (error) {
      bot.sendMessage(chatId, `Ошибка: ${error.message}`);
    }
  }
});

// Обработчик callback-запросов (для кнопок)
bot.on("callback_query", (callbackQuery) => {
  const msg = callbackQuery.message;
  const data = callbackQuery.data;
  const userId = callbackQuery.from.id;

  // Обработка нажатия на кнопку воссоздания уведомления
  if (data.startsWith("recreate_")) {
    const reminderId = data.replace("recreate_", "");
    const templateId = `template_${reminderId}`;

    // Получаем шаблон уведомления из базы
    db.get(
      "SELECT * FROM reminder_templates WHERE id = ? AND user_id = ?",
      [templateId, userId],
      (err, template) => {
        if (err || !template) {
          console.error("Ошибка при получении шаблона уведомления:", err);
          bot.answerCallbackQuery(callbackQuery.id, {
            text: "Ошибка: шаблон уведомления не найден",
            show_alert: true,
          });
          return;
        }

        // Создаем новое уведомление на основе шаблона
        const params = {
          text: template.text,
          time: template.time,
          days: template.days,
          countInDays: "1",
          everyWeek: template.every_week.toString(),
        };

        // Сохраняем новое уведомление
        saveReminder(userId, params);

        // Отвечаем на callback-запрос
        bot.answerCallbackQuery(callbackQuery.id, {
          text: "Уведомление успешно создано!",
          show_alert: false,
        });
      }
    );
  }
});

// Функция парсинга параметров уведомления
function parseReminderParams(text) {
  const params = {};
  const parts = text.split("&");

  parts.forEach((part) => {
    const [key, value] = part.split("=");
    if (key && value) {
      params[key.trim()] = value.trim();
    }
  });

  // Проверка обязательных параметров
  if (!params.text) {
    throw new Error("Не указан текст уведомления (text)");
  }

  if (!params.time) {
    throw new Error("Не указано время уведомления (time)");
  }

  if (!params.countInDays) {
    throw new Error("Не указано количество отправок (countInDays)");
  }

  // Установка значений по умолчанию
  if (!params.days) {
    params.days = "пн,вт,ср,чт,пт,сб,вс"; // Все дни недели по умолчанию
  }

  // Обработка значения everyWeek
  if (!params.everyWeek) {
    params.everyWeek = "0"; // Каждую неделю по умолчанию
  } else {
    // Преобразование текстовых значений в числовые
    const everyWeekLower = params.everyWeek.toLowerCase();

    if (everyWeekLower === "каждую" || everyWeekLower === "каждую неделю") {
      params.everyWeek = "0";
    } else if (
      everyWeekLower === "через" ||
      everyWeekLower === "через неделю"
    ) {
      params.everyWeek = "1";
    } else if (
      everyWeekLower === "две" ||
      everyWeekLower === "two" ||
      everyWeekLower === "каждые 2 недели"
    ) {
      params.everyWeek = "2";
    } else if (
      everyWeekLower === "три" ||
      everyWeekLower === "three" ||
      everyWeekLower === "каждые 3 недели"
    ) {
      params.everyWeek = "3";
    } else {
      // Проверяем, является ли значение числом
      const numValue = parseInt(params.everyWeek);
      if (!isNaN(numValue)) {
        // Если это число, приводим к строке для корректного сохранения
        params.everyWeek = numValue.toString();
      } else {
        // Если не является ни текстовым форматом, ни числом, устанавливаем по умолчанию
        console.log(
          `Некорректное значение everyWeek: ${params.everyWeek}, установлено значение по умолчанию`
        );
        params.everyWeek = "0";
      }
    }
  }

  return params;
}

// Функция сохранения пользователя
function saveUser(user) {
  console.log("Сохраняем пользователя:", user);

  if (!user || !user.id) {
    console.error("Ошибка: данные пользователя некорректны", user);
    return;
  }

  db.run(
    "INSERT OR IGNORE INTO users (id, username, first_name, last_name) VALUES (?, ?, ?, ?)",
    [user.id, user.username || "", user.first_name || "", user.last_name || ""],
    function (err) {
      if (err) {
        console.error("Ошибка при сохранении пользователя:", err);
      } else {
        console.log(
          `Пользователь ${user.id} сохранен. Изменено строк: ${this.changes}`
        );
      }
    }
  );
}

// Функция сохранения уведомления
function saveReminder(userId, params) {
  const reminderId = uuidv4();

  // Преобразуем countInDays и everyWeek в числа для сохранения
  const countInDays = parseInt(params.countInDays) || 99999;
  const everyWeek = parseInt(params.everyWeek) || 0;

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
        bot.sendMessage(userId, "Ошибка при сохранении уведомления");
        return;
      }

      bot.sendMessage(
        userId,
        `ID: \`${reminderId}\`\nТекст: ${params.text}\nВремя: ${params.time}\nДни: ${params.days}\nКоличество отправок: ${countInDays}\nПериодичность (недель): ${everyWeek}`,
        { parse_mode: "Markdown" }
      );
    }
  );
}

// Функция отправки справочного сообщения
function sendHelpMessage(chatId) {
  const helpText = `
Привет! Я бот для отправки уведомлений.

Чтобы создать уведомление, отправьте сообщение в формате:
text=Текст уведомления&time=14:00&days=пн,чт,пт&countInDays=10&everyWeek=0

Параметры:
- text: Текст уведомления (обязательно)
- time: Время отправки в формате ЧЧ:ММ, по МСК (обязательно). Можно указать несколько значений через запятую, например: 09:00,12:30,18:00
- days: Дни недели для отправки (пн,вт,ср,чт,пт,сб,вс), если не указано - каждый день
- countInDays: Количество отправок (обязательно), для бесконечных отправок укажите 99999
- everyWeek: Периодичность в неделях:
  * 0 или "каждую" - каждую неделю
  * 1 или "через" - через неделю
  * 2 или "две" - каждые 2 недели и т.д.

Команды:
/help - показать эту справку
/list - показать список всех ваших уведомлений
/delete ID - удалить уведомление по ID
/delete_all - удалить все ваши уведомления
`;

  bot.sendMessage(chatId, helpText);
}

// Функция для запуска планировщика уведомлений
function setupReminderScheduler() {
  // Запускаем проверку каждую минуту
  cron.schedule("* * * * *", () => {
    const now = new Date();
    const moscowTime = new Date(now.getTime() + 3 * 60 * 60 * 1000); // МСК = UTC+3
    const currentHour = moscowTime.getUTCHours();
    const currentMinute = moscowTime.getUTCMinutes();
    const timeString = `${currentHour
      .toString()
      .padStart(2, "0")}:${currentMinute.toString().padStart(2, "0")}`;

    // Получаем текущий день недели на русском
    const daysMap = {
      0: "вс",
      1: "пн",
      2: "вт",
      3: "ср",
      4: "чт",
      5: "пт",
      6: "сб",
    };
    const currentDay = daysMap[moscowTime.getUTCDay()];

    // Получаем номер недели в году
    const weekNumber = getWeekNumber(moscowTime);

    // Запрос на получение всех уведомлений
    db.all("SELECT * FROM reminders", [], (err, reminders) => {
      if (err) {
        console.error("Ошибка при получении уведомлений:", err);
        return;
      }

      reminders.forEach((reminder) => {
        // Проверяем соответствие текущего времени одному из указанных в уведомлении времен
        const reminderTimes = reminder.time.split(",");
        if (!reminderTimes.includes(timeString)) {
          return;
        }

        // Проверяем, должно ли уведомление быть отправлено сегодня
        const reminderDays = reminder.days.split(",");
        if (!reminderDays.includes(currentDay)) {
          return;
        }

        // Проверяем периодичность недель
        if (
          reminder.every_week > 0 &&
          weekNumber % (parseInt(reminder.every_week) + 1) !== 0
        ) {
          return;
        }

        // Формируем текст сообщения
        let messageText = reminder.text;

        // Отправляем уведомление
        bot
          .sendMessage(reminder.user_id, messageText)
          .then(() => {
            console.log(
              `Отправлено уведомление ${reminder.id} пользователю ${reminder.user_id}`
            );

            // Уменьшаем счетчик отправок
            if (reminder.count_in_days !== 99999) {
              const newCount = reminder.count_in_days - 1;

              if (newCount <= 0) {
                // Получаем период в текстовом формате
                let periodText = "";
                const everyWeekValue = parseInt(reminder.every_week);

                if (everyWeekValue === 0) {
                  periodText = "каждую неделю";
                } else if (everyWeekValue === 1) {
                  periodText = "через неделю";
                } else if (everyWeekValue >= 2) {
                  periodText = `каждые ${everyWeekValue + 1} недели`;
                }

                // Уведомляем пользователя о завершении
                const completionMessage = `\n\n⚠️ *Это было последнее уведомление из серии!*\n`;

                const replyMarkup = {
                  inline_keyboard: [
                    [
                      {
                        text: "📝 Создать такое же уведомление еще на 1 отправку?",
                        callback_data: `recreate_${reminder.id}`,
                      },
                    ],
                  ],
                };

                bot.sendMessage(reminder.user_id, completionMessage, {
                  parse_mode: "Markdown",
                  reply_markup: replyMarkup,
                });

                // Сохраняем шаблон уведомления в базе для восстановления
                const templateId = `template_${reminder.id}`;
                db.run(
                  "INSERT OR REPLACE INTO reminder_templates (id, user_id, text, time, days, every_week) VALUES (?, ?, ?, ?, ?, ?)",
                  [
                    templateId,
                    reminder.user_id,
                    reminder.text,
                    reminder.time,
                    reminder.days,
                    reminder.every_week,
                  ],
                  (err) => {
                    if (err) {
                      console.error(
                        "Ошибка при сохранении шаблона уведомления:",
                        err
                      );
                    }
                  }
                );

                // Удаляем уведомление, если достигнут лимит отправок
                db.run("DELETE FROM reminders WHERE id = ?", [reminder.id]);
              } else {
                // Обновляем счетчик
                db.run("UPDATE reminders SET count_in_days = ? WHERE id = ?", [
                  newCount,
                  reminder.id,
                ]);
              }
            }
          })
          .catch((error) => {
            console.error(`Ошибка отправки уведомления ${reminder.id}:`, error);
          });
      });
    });
  });
}

// Функция для получения номера недели в году
function getWeekNumber(date) {
  const firstDayOfYear = new Date(date.getFullYear(), 0, 1);
  const pastDaysOfYear = (date - firstDayOfYear) / 86400000;
  return Math.ceil((pastDaysOfYear + firstDayOfYear.getDay() + 1) / 7);
}

// Запускаем планировщик уведомлений
setupReminderScheduler();

console.log("Бот запущен...");
