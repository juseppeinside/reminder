require("dotenv").config();

const config = require("../config");

const TelegramBot = require("node-telegram-bot-api");
const cron = require("node-cron");
const sqlite3 = require("sqlite3").verbose();
const { v4: uuidv4 } = require("uuid");
const fs = require("fs");
const axios = require("axios");
const https = require("https");

let accessToken = null;

// Функция для получения токена доступа к GigaChat API
const getGigaChatAccessToken = async () => {
  try {
    const response = await axios({
      method: "post",
      url: "https://ngw.devices.sberbank.ru:9443/api/v2/oauth",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
        RqUID: uuidv4(),
        Authorization: `Basic ${config.GIGACHAT_API_KEY}`,
      },
      data: `scope=${config.GIGACHAT_SCOPE}`,
      httpsAgent: new https.Agent({
        rejectUnauthorized: false, // Для обхода проблемы с самоподписанным сертификатом
      }),
    });

    return response.data.access_token;
  } catch (error) {
    console.error("Ошибка при получении токена GigaChat:", error.message);
    return null;
  }
};

// Функция для отправки запроса в GigaChat
const sendGigaChatRequest = async (accessToken, prompt, userMessage) => {
  try {
    const chatResponse = await axios({
      method: "post",
      url: "https://gigachat.devices.sberbank.ru/api/v1/chat/completions",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      data: {
        model: "GigaChat",
        messages: [
          {
            role: "system",
            content: prompt,
          },
          {
            role: "user",
            content: userMessage,
          },
        ],
        temperature: 0.7,
        max_tokens: 1500,
        n: 1,
        stream: false,
        top_p: 0.95,
      },
      httpsAgent: new https.Agent({
        rejectUnauthorized: false, // Для обхода проблемы с самоподписанным сертификатом
      }),
    });

    return chatResponse.data.choices[0].message.content;
  } catch (error) {
    console.error("Ошибка при запросе к API GigaChat:", error.message);
    throw error;
  }
};

// Инициализация токена GigaChat при запуске
(async () => {
  try {
    accessToken = await getGigaChatAccessToken();
    if (accessToken) {
      console.log("✅ Токен GigaChat успешно получен!");
    } else {
      console.log(
        "⚠️ Не удалось получить токен GigaChat при запуске. Будем пытаться получить при обработке сообщений."
      );
    }
  } catch (error) {
    console.error("❌ Ошибка при получении токена GigaChat:", error.message);
    console.log(
      "🔄 Бот будет пытаться получить токен при обработке сообщений."
    );
  }
})();

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

// Обработчик команды /manual для прямого создания напоминаний
bot.onText(/\/manual (.+)/, (msg, match) => {
  const chatId = msg.chat.id;
  const manualText = match[1];

  try {
    // Проверяем, что текст содержит обязательные параметры
    if (!manualText.includes("text=") || !manualText.includes("time=")) {
      bot.sendMessage(
        chatId,
        "Ошибка: необходимо указать как минимум параметры text и time"
      );
      return;
    }

    // Передаем параметры напрямую, без обработки
    const params = parseReminderParams(manualText);
    if (params) {
      saveReminder(chatId, params);
    }
  } catch (error) {
    bot.sendMessage(
      chatId,
      `Ошибка при создании напоминания: ${error.message}`
    );
  }
});

// Обработчик команды /users (только для админа)
bot.onText(/\/users/, (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id; // Получаем ID пользователя

  if (userId.toString() === adminId.toString()) {
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
  const userId = msg.from.id; // Получаем ID пользователя
  const notificationText = match[1];

  if (userId.toString() === adminId.toString()) {
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
              bot.sendMessage(chatId, `Уведомление отправлено`);
            }
          })
          .catch((error) => {
            console.error(`Ошибка отправки сообщения`, error);
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
        bot.sendMessage(chatId, "❌ Ошибка при удалении уведомления");
        return;
      }

      if (this.changes > 0) {
        bot.sendMessage(chatId, "✅ Уведомление успешно удалено!");
      } else {
        bot.sendMessage(
          chatId,
          "🔍 Уведомление не найдено или не принадлежит вам"
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
      bot.sendMessage(chatId, "❌ Ошибка при удалении уведомлений");
      return;
    }

    bot.sendMessage(chatId, `🧹 Удалено ${this.changes} уведомлений!`);
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

function getCurrentMoscowTime() {
  const currentDate = new Date();
  return currentDate;
}

// Функция для обработки запросов на естественном языке через GigaChat
async function processNaturalLanguageWithGigaChat(text) {
  try {
    // Проверяем только наличие токена доступа
    if (!accessToken) {
      console.log("⚠️ Отсутствует токен GigaChat, получаем новый");
      accessToken = await getGigaChatAccessToken();
      if (!accessToken) {
        console.log(
          "❌ Не удалось получить токен GigaChat, используем локальную обработку"
        );
        return parseNaturalLanguage(text);
      }
    }

    // Текущее время по МСК
    const moscowTime = getCurrentMoscowTime();
    const currentTimeStr = `${moscowTime
      .getHours()
      .toString()
      .padStart(2, "0")}:${moscowTime
      .getMinutes()
      .toString()
      .padStart(2, "0")}`;
    console.log("Текущее время МСК:", currentTimeStr);

    // Функция для расчета относительного времени
    const calculateRelativeTime = (date, value, unit) => {
      const result = new Date(date);
      if (unit === "minutes") {
        result.setMinutes(result.getMinutes() + value);
      } else if (unit === "hours") {
        result.setHours(result.getHours() + value);
      }
      return `${result.getHours().toString().padStart(2, "0")}:${result
        .getMinutes()
        .toString()
        .padStart(2, "0")}`;
    };

    // Формируем промпт для GigaChat с чёткими инструкциями
    const prompt = `
Ты ассистент для приложения напоминаний. Преобразуй запрос пользователя в строго заданный формат.

ТЕКУЩЕЕ ВРЕМЯ: ${currentTimeStr}

ЗАДАЧА:
Твоя задача - преобразовать текст пользователя в структурированный формат для создания напоминания. 
Формат ДОЛЖЕН содержать ВСЕ эти параметры: text, time и countInDays.

ОБЯЗАТЕЛЬНЫЙ ФОРМАТ ОТВЕТА:
text=Текст напоминания&time=ЧЧ:ММ&countInDays=1

ПРАВИЛА:
1. text: Краткий текст напоминания (3-4 слова)
2. time: Время в формате 24-часов (ЧЧ:ММ)
   - Для "в 13" используй "13:00"
   - Для "утром" - "09:00", "днем" - "13:00", "вечером" - "19:00"
3. countInDays: По умолчанию 1, для "ежедневно/постоянно" - 999999
4. days: Укажи только если явно упоминаются дни недели: пн, вт, ср, чт, пт, сб, вс

ОЧЕНЬ ВАЖНО: При указании относительного времени "через X минут/часов", рассчитай абсолютное время от текущего момента.
- Если сейчас ${currentTimeStr}, то "через 5 минут" будет ${calculateRelativeTime(
      moscowTime,
      5,
      "minutes"
    )}
- Если сейчас ${currentTimeStr}, то "через 30 минут" будет ${calculateRelativeTime(
      moscowTime,
      30,
      "minutes"
    )}
- Если сейчас ${currentTimeStr}, то "через 2 часа" будет ${calculateRelativeTime(
      moscowTime,
      2,
      "hours"
    )}

ПРИМЕРЫ:
1. Запрос: "Напомни через 5 минут полить цветы"
   Ответ: text=Полить цветы&time=${calculateRelativeTime(
     moscowTime,
     5,
     "minutes"
   )}&countInDays=1

2. Запрос: "Напомни позвонить маме завтра в 18:00"
   Ответ: text=Позвонить маме&time=18:00&countInDays=1

3. Запрос: "Напоминай каждый вторник пить глютамин в 12"
   Ответ: text=Пить глютамин&time=12:00&countInDays=999999&days=вт

4. Запрос: "Через 3 минуты напомни позвонить"
   Ответ: text=Позвонить&time=${calculateRelativeTime(
     moscowTime,
     3,
     "minutes"
   )}&countInDays=1

5. Запрос: "Напомни завтра в 18:00 выгулять собаку"
   Ответ: text=Выгулять собаку&time=18:00&countInDays=1

6. Запрос: "Напомни в 9 утра принять таблетки"
   Ответ: text=Принять таблетки&time=09:00&countInDays=1

7. Запрос: "Каждый понедельник и пятницу в 9:00 напоминай про планерку"
Ответ: text=Планерка&time=09:00&countInDays=999999&days=пн,пт

8. Запрос: "напоминай каждый вторник помыть машину в 19:36"
Ответ: text=Помыть машину&time=19:36&countInDays=999999&days=вт

9. Запрос: "напоминай каждый вторник и четверг помыть машину в 19:36"
Ответ: text=Помыть машину&time=19:36&countInDays=999999&days=вт,чт

10. Запрос: "Помыть машину каждый день в 19:44"
Ответ: text=Помыть машину&time=19:44&countInDays=999999

11. Запрос: "Помыть машину в пятницу в 19:47"
Ответ: text=Помыть машину&time=19:47&countInDays=1&days=пт

12. Запрос: "помыть машину в пятницу и в субботу в 12:00"
Ответ: text=Помыть машину&time=12:00&countInDays=1&days=пт,сб

13. Запрос: "попей воды каждый день в 13"
Ответ: text=Попей воды&time=13:00&countInDays=999999

14. Запрос: "ежедневно в 7:30 делать зарядку"
Ответ: text=Делать зарядку&time=07:30&countInDays=999999

15. Запрос: "каждый день проверять почту в 9:00"
Ответ: text=Проверять почту&time=09:00&countInDays=999999

16. Запрос: "выпить таблетки каждый день в 10 утра и в 5 вечера"
Ответ: text=Выпить таблетки&time=10:00,17:00&countInDays=999999

17. Запрос: "выпить воды каждый день в 22"
Ответ: text=Выпить воды&time=22:00&countInDays=999999

18. Запрос: "принять лекарство в 8"
Ответ: text=Принять лекарство&time=08:00&countInDays=1

19. Запрос: "раз в 2 недели напоминай про митинг в синтезе в 14:00 каждый вторник"
Ответ: text=Митинг в синтезе&time=14:00&countInDays=999999&days=вт&countInWeeks=1

ЗАПРОС ПОЛЬЗОВАТЕЛЯ: "${text}"

ВАЖНО: Дай ответ только в указанном формате, без пояснений и дополнительного текста.`;

    console.log("Отправляем запрос в GigaChat:", text);

    try {
      // Отправляем запрос к GigaChat API
      const result = await sendGigaChatRequest(accessToken, prompt, text);
      console.log("✅ Ответ от GigaChat получен:", result);

      // Дополнительная проверка и коррекция формата ответа
      let formattedResult = result.trim();

      // Если ответ не содержит необходимых параметров, пытаемся исправить
      if (
        !formattedResult.includes("time=") ||
        !formattedResult.includes("countInDays=")
      ) {
        console.log(
          "Некорректный формат ответа от GigaChat, пытаемся исправить"
        );

        // Извлекаем текст напоминания, если он есть
        let reminderText = "";
        if (formattedResult.includes("text=")) {
          const textMatch = formattedResult.match(/text=([^&]+)/);
          if (textMatch) {
            reminderText = textMatch[1];
          }
        } else {
          // Если текст не указан, используем сам запрос пользователя
          reminderText = text
            .replace(/напомни(ть)?|через \d+ (минут|час[а-я]*)/gi, "")
            .trim();
        }

        // Используем локальную функцию для определения остальных параметров
        const localResult = parseNaturalLanguage(text);

        // Извлекаем время и количество дней из локального результата
        let time = "";
        let countInDays = "1";
        let days = "";

        if (localResult.includes("time=")) {
          const timeMatch = localResult.match(/time=([^&]+)/);
          if (timeMatch) time = timeMatch[1];
        }

        if (localResult.includes("countInDays=")) {
          const daysMatch = localResult.match(/countInDays=([^&]+)/);
          if (daysMatch) countInDays = daysMatch[1];
        }

        if (localResult.includes("days=")) {
          const daysWeekMatch = localResult.match(/days=([^&]+)/);
          if (daysWeekMatch) days = daysWeekMatch[1];
        }

        // Формируем корректный ответ
        formattedResult = `text=${reminderText}&time=${time}&countInDays=${countInDays}`;
        if (days) formattedResult += `&days=${days}`;

        console.log("Исправленный формат:", formattedResult);
      }

      return formattedResult;
    } catch (apiError) {
      // Если ошибка авторизации, попробуем получить новый токен
      if (
        apiError.message.includes("401") ||
        apiError.message.includes("auth")
      ) {
        console.log("🔄 Токен устарел, получаем новый");
        accessToken = await getGigaChatAccessToken();

        if (accessToken) {
          // Повторяем запрос с новым токеном
          try {
            const result = await sendGigaChatRequest(accessToken, prompt, text);
            console.log("✅ Ответ от GigaChat с новым токеном:", result);
            return result;
          } catch (retryError) {
            console.error(
              "❌ Ошибка при повторном запросе к GigaChat:",
              retryError.message
            );
            return parseNaturalLanguage(text);
          }
        } else {
          console.log(
            "❌ Не удалось обновить токен, используем локальную обработку"
          );
          return parseNaturalLanguage(text);
        }
      }

      console.error(
        "❌ Ошибка при обращении к GigaChat API:",
        apiError.message
      );
      console.log("⚠️ Используем локальную обработку текста");
      return parseNaturalLanguage(text);
    }
  } catch (error) {
    console.error(
      "❌ Общая ошибка при обработке запроса через GigaChat:",
      error.message
    );
    return parseNaturalLanguage(text);
  }
}

// Функция для парсинга естественного языка в параметры напоминания (локальная)
function parseNaturalLanguage(text) {
  // Текущее время по МСК
  const moscowTime = getCurrentMoscowTime();

  // Исходный текст запроса для отладки
  console.log("Обрабатываем запрос:", text);
  console.log(
    "Текущее время МСК:",
    `${moscowTime.getHours().toString().padStart(2, "0")}:${moscowTime
      .getMinutes()
      .toString()
      .padStart(2, "0")}`
  );

  // Ищем упоминания времени
  const timeRegex = /в (\d{1,2})[:\.]?(\d{2})?/g;
  const timeMatches = [...text.matchAll(timeRegex)];

  let reminderTime = "";
  if (timeMatches.length > 0) {
    const times = timeMatches.map((match) => {
      const hours = match[1].padStart(2, "0");
      const minutes = match[2] ? match[2] : "00";
      return `${hours}:${minutes}`;
    });

    reminderTime = times.join(",");
  }

  // Если время не найдено, проверяем указания на "утром", "днем", "вечером", "ночью"
  if (!reminderTime) {
    if (text.includes("утром")) reminderTime = "09:00";
    else if (text.includes("днем") || text.includes("днём"))
      reminderTime = "13:00";
    else if (text.includes("вечером")) reminderTime = "19:00";
    else if (text.includes("ночью")) reminderTime = "23:00";
  }

  // Проверяем относительное время
  const relativeTimeRegex = /через (\d+) ?(минут|час[а-я]*)/i;
  const relativeMatch = text.match(relativeTimeRegex);

  if (relativeMatch) {
    const value = parseInt(relativeMatch[1]);
    const unit = relativeMatch[2];

    const relativeTime = new Date(moscowTime);

    if (unit.startsWith("минут")) {
      relativeTime.setMinutes(relativeTime.getMinutes() + value);
    } else if (unit.startsWith("час")) {
      relativeTime.setHours(relativeTime.getHours() + value);
    }

    // Форматируем время в формат ЧЧ:ММ
    const hours = relativeTime.getHours().toString().padStart(2, "0");
    const minutes = relativeTime.getMinutes().toString().padStart(2, "0");
    reminderTime = `${hours}:${minutes}`;
    console.log(
      `Установлено относительное время: через ${value} ${unit} → ${reminderTime}`
    );
  }

  // Если время не удалось определить, используем текущее время + 5 минут
  if (!reminderTime) {
    const defaultTime = new Date(moscowTime);
    defaultTime.setMinutes(defaultTime.getMinutes() + 5);

    const hours = defaultTime.getHours().toString().padStart(2, "0");
    const minutes = defaultTime.getMinutes().toString().padStart(2, "0");
    reminderTime = `${hours}:${minutes}`;
  }

  // Определяем дни недели
  let reminderDays = "пн,вт,ср,чт,пт,сб,вс"; // По умолчанию все дни
  let countInDays = "1"; // По умолчанию одна отправка

  // Словарь для маппинга дней недели
  const daysMapping = {
    понедельник: "пн",
    вторник: "вт",
    среду: "ср",
    среда: "ср",
    четверг: "чт",
    пятницу: "пт",
    пятница: "пт",
    субботу: "сб",
    суббота: "сб",
    воскресенье: "вс",
  };

  // Проверяем наличие дней недели в тексте
  const dayMatches = Object.keys(daysMapping).filter((day) =>
    text.toLowerCase().includes(day.toLowerCase())
  );

  if (dayMatches.length > 0) {
    // Если упоминается "каждый" или "по", это повторяющееся напоминание
    const isRecurring = text.match(/(кажд[а-я]+|по|еженедельно|регулярно)/i);

    if (isRecurring) {
      countInDays = "99999"; // Бесконечное число отправок
      reminderDays = dayMatches.map((day) => daysMapping[day]).join(",");
    } else {
      // Одноразовое напоминание на конкретный день
      countInDays = "1";
      reminderDays = dayMatches.map((day) => daysMapping[day]).join(",");
    }
  }

  // Проверяем "каждый день", "ежедневно", "бесконечно" и т.д.
  if (text.match(/(кажд[а-я]+ день|ежедневно|бесконечно|всегда|постоянно)/i)) {
    countInDays = "99999";
  }

  // Проверяем "завтра"
  if (text.toLowerCase().includes("завтра")) {
    const tomorrow = new Date(moscowTime);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const tomorrowDay = tomorrow.getDay();
    const daysMap = ["вс", "пн", "вт", "ср", "чт", "пт", "сб"];

    reminderDays = daysMap[tomorrowDay];
    countInDays = "1"; // Одноразовое
  }

  // Извлекаем суть напоминания (убираем служебные слова)
  let reminderText = text
    .replace(/напомни(ть)?/i, "")
    .replace(/через \d+ (минут|час[а-я]*)/gi, "")
    .replace(/в \d{1,2}[:\.]?\d{0,2}/g, "")
    .replace(/(завтра|сегодня|послезавтра)/gi, "")
    .replace(/(утром|днем|днём|вечером|ночью)/gi, "")
    .replace(/(каждый|кажд[а-я]+|ежедневно|еженедельно|по|регулярно)/gi, "");

  // Убираем упоминания дней недели
  Object.keys(daysMapping).forEach((day) => {
    reminderText = reminderText.replace(new RegExp(day, "gi"), "");
  });

  // Удаляем лишние пробелы и знаки препинания
  reminderText = reminderText
    .replace(/\s+/g, " ")
    .replace(/^\s+|\s+$|\s+(?=\W)/g, "")
    .trim();

  // Если текст слишком короткий, используем стандартный
  if (reminderText.length < 3) {
    reminderText = "Напоминание";
  }

  // Формируем итоговую строку в нужном формате
  const result = `text=${reminderText}&time=${reminderTime}&countInDays=${countInDays}`;

  // Добавляем дни, если они не стандартные
  if (reminderDays !== "пн,вт,ср,чт,пт,сб,вс") {
    return `${result}&days=${reminderDays}`;
  }

  return result;
}

// Обработчик для создания уведомления
bot.on("message", async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;

  // Игнорируем команды
  if (text && !text.startsWith("/")) {
    try {
      // Проверяем формат сообщения
      if (text.includes("=") && text.includes("&")) {
        // Стандартный формат text=текст&time=время
        const params = parseReminderParams(text);
        if (params) {
          saveReminder(chatId, params);
        }
      } else {
        console.log(`Обрабатываем сообщение от пользователя: "${text}"`);

        // Сначала пробуем обработать через GigaChat
        try {
          console.log("Начинаем обработку через GigaChat API");
          const formattedText = await processNaturalLanguageWithGigaChat(text);
          console.log("Преобразовано в формат (GigaChat):", formattedText);

          // Проверяем, что ответ соответствует нашему формату
          if (
            formattedText &&
            formattedText.includes("text=") &&
            formattedText.includes("time=")
          ) {
            const params = parseReminderParams(formattedText);
            if (params) {
              saveReminder(chatId, params);
              return;
            }
          } else {
            console.log(
              "Ответ GigaChat не соответствует ожидаемому формату. Используем локальную обработку."
            );
            throw new Error("Некорректный формат ответа от GigaChat");
          }
        } catch (gigaChatError) {
          console.error(
            "Ошибка при обработке через GigaChat:",
            gigaChatError.message
          );
          console.log("Используем локальную функцию обработки текста");

          // Если GigaChat не сработал, используем локальную функцию
          const formattedText = parseNaturalLanguage(text);
          console.log("Преобразовано в формат (локально):", formattedText);

          const params = parseReminderParams(formattedText);
          if (params) {
            saveReminder(chatId, params);
          }
        }
      }
    } catch (error) {
      bot.sendMessage(chatId, `❌ Ошибка: ${error.message}`);
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
          text: "✅ Уведомление успешно создано!",
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
    // Проверяем, указан ли параметр countInWeeks, и если да - используем его
    if (params.countInWeeks) {
      params.everyWeek = params.countInWeeks;
      delete params.countInWeeks; // Удаляем лишний параметр
    } else {
      params.everyWeek = "0"; // Каждую неделю по умолчанию
    }
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
        bot.sendMessage(userId, "❌ Ошибка при сохранении уведомления");
        return;
      }

      bot.sendMessage(
        userId,
        `✅ Напоминание создано!\n\n🆔 ID: \`${reminderId}\`\n📝 Текст: ${
          params.text
        }\n🕒 Время: ${params.time}\n📅 Дни: ${
          params.days
        }\n⏳ Количество отправок: ${countInDays}\n🔄 Периодичность: ${everyWeek} ${getWeekPeriodText(
          everyWeek
        )}`,
        { parse_mode: "Markdown" }
      );
    }
  );
}

// Вспомогательная функция для получения текста о периодичности
function getWeekPeriodText(everyWeek) {
  if (everyWeek === 0) return "(каждую неделю)";
  if (everyWeek === 1) return "(через неделю)";
  if (everyWeek >= 2) return `(каждые ${everyWeek + 1} недели)`;
  return "";
}

// Функция отправки справочного сообщения
function sendHelpMessage(chatId) {
  let helpText = `
👋 Привет! Я бот для отправки уведомлений.

✅ Вы можете создать напоминание тремя способами:

1️⃣ Напишите запрос на естественном языке, например:
   - "Напомни завтра в 18:00 выгулять собаку"
   - "Напомни в 9 утра принять таблетки"
   - "Напомни мне каждый понедельник в 10:00 про планерку"
   - "Через 30 минут напомни про встречу"

2️⃣ Используйте структурированный формат:
text=Текст уведомления&time=14:00&days=пн,чт,пт&countInDays=10&everyWeek=0

3️⃣ Используйте команду для прямого создания без обработки текста:
/manual text=Текст напоминания&time=14:00&countInDays=999999&days=вт&everyWeek=1
или
/manual text=Митинг в синтезе&time=14:00&countInDays=999999&days=вт&countInWeeks=1
`;

  helpText += `
📝 Параметры структурированного формата:
- text: Текст уведомления (обязательно)
- time: Время отправки в формате ЧЧ:ММ, по МСК (обязательно). Можно указать несколько значений через запятую, например: 09:00,12:30,18:00
- days: Дни недели для отправки (пн,вт,ср,чт,пт,сб,вс), если не указано - каждый день
- countInDays: Количество отправок (обязательно), для бесконечных отправок укажите 99999
- everyWeek или countInWeeks: Периодичность в неделях:
  * 0 - каждую неделю
  * 1 - через неделю
  * 2 - каждые 2 недели и т.д.

⌨️ Команды:
🔍 /help - показать эту справку
📋 /list - показать список всех ваших уведомлений
🗑️ /delete ID - удалить уведомление по ID
🧹 /delete_all - удалить все ваши уведомления
`;

  bot.sendMessage(chatId, helpText);
}

// Функция для запуска планировщика уведомлений
function setupReminderScheduler() {
  // Запускаем проверку каждую минуту
  cron.schedule("* * * * *", () => {
    // Получаем текущее московское время
    const moscowTime = getCurrentMoscowTime();
    const currentHour = moscowTime.getHours();
    const currentMinute = moscowTime.getMinutes();
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
    const currentDay = daysMap[moscowTime.getDay()];

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

        // Добавляем эмодзи в зависимости от типа напоминания
        if (
          messageText.toLowerCase().includes("звонок") ||
          messageText.toLowerCase().includes("звонить") ||
          messageText.toLowerCase().includes("позвонить")
        ) {
          messageText = `📞 ${messageText}`;
        } else if (
          messageText.toLowerCase().includes("встреча") ||
          messageText.toLowerCase().includes("митинг") ||
          messageText.toLowerCase().includes("собрание")
        ) {
          messageText = `👥 ${messageText}`;
        } else if (
          messageText.toLowerCase().includes("лекарств") ||
          messageText.toLowerCase().includes("таблетк") ||
          messageText.toLowerCase().includes("принять")
        ) {
          messageText = `💊 ${messageText}`;
        } else if (
          messageText.toLowerCase().includes("купить") ||
          messageText.toLowerCase().includes("заказать") ||
          messageText.toLowerCase().includes("оплатить")
        ) {
          messageText = `🛒 ${messageText}`;
        } else if (
          messageText.toLowerCase().includes("день рождения") ||
          messageText.toLowerCase().includes("праздник")
        ) {
          messageText = `🎂 ${messageText}`;
        } else if (
          messageText.toLowerCase().includes("поесть") ||
          messageText.toLowerCase().includes("еда") ||
          messageText.toLowerCase().includes("покушать") ||
          messageText.toLowerCase().includes("обед")
        ) {
          messageText = `🍽️ ${messageText}`;
        } else {
          // Если не подошло ни одно условие, добавляем стандартную иконку напоминания
          messageText = `⏰ ${messageText}`;
        }

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

console.log("🚀 Бот запущен и готов к работе...");
