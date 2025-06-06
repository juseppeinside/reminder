const config = require("../config");
const userModel = require("../models/users");
const reminderModel = require("../models/reminders");
const { parseReminderParams } = require("../utils/reminder-parser");
const { sendReminderCreatedMessage } = require("../utils/reminder-utils");

// Обработчик команды /start
function handleStart(bot) {
  bot.onText(/\/start/, async (msg) => {
    const chatId = msg.chat.id;
    await userModel.saveUser(msg.from);
    sendHelpMessage(bot, chatId);
  });
}

// Обработчик команды /help
function handleHelp(bot) {
  bot.onText(/\/help/, (msg) => {
    const chatId = msg.chat.id;
    sendHelpMessage(bot, chatId);
  });
}

// Обработчик команды /manual для прямого создания напоминаний
function handleManual(bot) {
  bot.onText(/\/manual (.+)/, async (msg, match) => {
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
        const reminder = await reminderModel.saveReminder(chatId, params);

        // Используем общую функцию для отправки сообщения
        await sendReminderCreatedMessage(bot, chatId, params, reminder);
      }
    } catch (error) {
      bot.sendMessage(
        chatId,
        `❌ Ошибка при создании напоминания: ${error.message}`
      );
    }
  });
}

// Обработчик команды /users (только для админа)
function handleUsers(bot) {
  bot.onText(/\/users/, async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id; // Получаем ID пользователя

    if (userId.toString() === config.ADMIN_ID.toString()) {
      try {
        // Получаем количество пользователей
        const userCount = await userModel.getUserCount();

        // Сначала отправим общую информацию о количестве пользователей
        await bot.sendMessage(chatId, `👥 Всего пользователей: ${userCount}`);

        // Если пользователей много, запросим все данные и разобьем на пакеты
        if (userCount > 10) {
          const allUsers = await userModel.getAllUsers();

          // Разбиваем на пакеты по 50 пользователей
          const MAX_USERS_PER_MESSAGE = 50;
          const totalPages = Math.ceil(allUsers.length / MAX_USERS_PER_MESSAGE);

          await bot.sendMessage(
            chatId,
            `Информация будет отправлена в ${totalPages} сообщениях.`
          );

          // Для каждой страницы формируем и отправляем отдельное сообщение
          for (let page = 0; page < totalPages; page++) {
            const startIdx = page * MAX_USERS_PER_MESSAGE;
            const endIdx = Math.min(
              startIdx + MAX_USERS_PER_MESSAGE,
              allUsers.length
            );
            const pageUsers = allUsers.slice(startIdx, endIdx);

            let message = `📄 Страница ${page + 1} из ${totalPages}\n\n`;

            pageUsers.forEach((user) => {
              message += `ID: ${user.id}, Username: ${
                user.username || "-"
              }, Имя: ${user.first_name || "-"}, Регистрация: ${
                user.created_at || "-"
              }\n`;
            });

            // Добавляем небольшую задержку между сообщениями
            await new Promise((resolve) => setTimeout(resolve, 100));
            await bot.sendMessage(chatId, message);
          }
        } else {
          // Если пользователей немного, отправляем одним сообщением
          const users = await userModel.getRecentUsers(10);

          let message = "Последние пользователи:\n";
          if (users.length > 0) {
            users.forEach((user) => {
              message += `ID: ${user.id}, Username: ${
                user.username || "-"
              }, Имя: ${user.first_name || "-"}\n`;
            });
          } else {
            message += "Список пользователей пуст.";
          }

          await bot.sendMessage(chatId, message);
        }
      } catch (error) {
        console.error("Ошибка при получении списка пользователей:", error);
        bot.sendMessage(chatId, "Ошибка при получении списка пользователей");
      }
    } else {
      bot.sendMessage(chatId, "У вас нет прав для выполнения этой команды");
    }
  });
}

// Обработчик команды /notification (только для админа)
function handleNotification(bot) {
  bot.onText(/\/notification[\s\S]*/, async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id; // Получаем ID пользователя
    const text = msg.text; // Используем полный текст сообщения

    if (userId.toString() === config.ADMIN_ID.toString()) {
      try {
        // Извлекаем текст уведомления из сообщения с поддержкой многострочного текста
        const commandRegex = /\/notification\s+"([\s\S]+?)"/;
        const matches = text.match(commandRegex);

        if (!matches || !matches[1]) {
          bot.sendMessage(
            chatId,
            '❌ Неверный формат команды. Используйте /notification "Текст сообщения в кавычках"'
          );
          return;
        }

        const notificationText = matches[1];

        const users = await userModel.getAllUsers();

        let sentCount = 0;
        let errorCount = 0;

        // Разбиваем пользователей на группы по 30 для отображения прогресса
        const BATCH_SIZE = 30;
        const totalBatches = Math.ceil(users.length / BATCH_SIZE);

        // Обрабатываем пользователей группами
        for (let batch = 0; batch < totalBatches; batch++) {
          const startIdx = batch * BATCH_SIZE;
          const endIdx = Math.min(startIdx + BATCH_SIZE, users.length);
          const batchUsers = users.slice(startIdx, endIdx);

          // Отправляем сообщения пользователям в текущей группе
          for (const user of batchUsers) {
            try {
              await bot.sendMessage(user.id, notificationText, {
                parse_mode: "HTML",
              });
              sentCount++;
            } catch (error) {
              // Если не удалось отправить с HTML форматированием, пробуем без него
              try {
                await bot.sendMessage(user.id, notificationText);
                sentCount++;
              } catch (secondError) {
                console.error(
                  `Ошибка отправки сообщения пользователю ${user.id}`,
                  secondError
                );
                errorCount++;
              }
            }

            // Добавляем небольшую задержку между отправками
            await new Promise((resolve) => setTimeout(resolve, 50));
          }

          // Если групп больше одной, показываем прогресс
          if (totalBatches > 1) {
            await bot.sendMessage(
              chatId,
              `✅ Прогресс: ${Math.min(
                100,
                Math.round(((batch + 1) * 100) / totalBatches)
              )}% (отправлено ${sentCount}, ошибок: ${errorCount})`
            );
          }
        }

        // Отправляем итоговый отчет
        await bot.sendMessage(chatId, `✅ Рассылка завершена!`);
      } catch (error) {
        console.error("Ошибка при отправке уведомления:", error);
        bot.sendMessage(chatId, "❌ Ошибка при отправке уведомления");
      }
    } else {
      bot.sendMessage(chatId, "⛔ У вас нет прав для выполнения этой команды");
    }
  });
}

// Обработчик команды /delete
function handleDelete(bot) {
  bot.onText(/\/delete (.+)/, async (msg, match) => {
    const chatId = msg.chat.id;
    const reminderId = match[1];

    try {
      const changes = await reminderModel.deleteReminder(reminderId, chatId);

      if (changes > 0) {
        bot.sendMessage(chatId, "✅ Уведомление успешно удалено!");
      } else {
        bot.sendMessage(
          chatId,
          "🔍 Уведомление не найдено или не принадлежит вам"
        );
      }
    } catch (error) {
      console.error("Ошибка при удалении уведомления:", error);
      bot.sendMessage(chatId, "❌ Ошибка при удалении уведомления");
    }
  });
}

// Обработчик команды /delete_all
function handleDeleteAll(bot) {
  bot.onText(/\/delete_all/, async (msg) => {
    const chatId = msg.chat.id;

    try {
      const changes = await reminderModel.deleteAllUserReminders(chatId);
      bot.sendMessage(chatId, `🧹 Удалено ${changes} уведомлений!`);
    } catch (error) {
      console.error("Ошибка при удалении уведомлений:", error);
      bot.sendMessage(chatId, "❌ Ошибка при удалении уведомлений");
    }
  });
}

// Обработчик команды /list
function handleList(bot) {
  bot.onText(/\/list/, async (msg) => {
    const chatId = msg.chat.id;

    try {
      const reminders = await reminderModel.getUserReminders(chatId);

      if (reminders.length === 0) {
        bot.sendMessage(chatId, "У вас нет активных уведомлений");
        return;
      }

      // Разбиваем список напоминаний на пакеты по 5 напоминаний для отправки
      const MAX_REMINDERS_PER_MESSAGE = 5;
      const totalPages = Math.ceil(
        reminders.length / MAX_REMINDERS_PER_MESSAGE
      );

      // Отправляем краткую информацию о количестве напоминаний
      await bot.sendMessage(
        chatId,
        `📋 *Найдено ${reminders.length} напоминаний*\n` +
          (totalPages > 1
            ? `Информация будет отправлена в ${totalPages} сообщениях.`
            : ""),
        { parse_mode: "Markdown" }
      );

      // Разбиваем напоминания на пакеты и отправляем
      for (let page = 0; page < totalPages; page++) {
        const startIdx = page * MAX_REMINDERS_PER_MESSAGE;
        const endIdx = Math.min(
          startIdx + MAX_REMINDERS_PER_MESSAGE,
          reminders.length
        );
        const pageReminders = reminders.slice(startIdx, endIdx);

        let message =
          totalPages > 1
            ? `📄 *Страница ${page + 1} из ${totalPages}*\n\n`
            : "";

        pageReminders.forEach((reminder) => {
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

        // Добавляем небольшую задержку между сообщениями, чтобы избежать ограничений API
        await new Promise((resolve) => setTimeout(resolve, 100));
        await bot.sendMessage(chatId, message, { parse_mode: "Markdown" });
      }
    } catch (error) {
      console.error("Ошибка при получении списка уведомлений:", error);
      bot.sendMessage(chatId, "Ошибка при получении списка уведомлений");
    }
  });
}

// Функция отправки справочного сообщения
function sendHelpMessage(bot, chatId) {
  let helpText = `
👋 Привет! Я бот для отправки уведомлений.

✅ Вы можете создать напоминание двумя способами:

1️⃣ Напишите запрос на естественном языке, например:
   - "Напомни завтра в 18:00 выгулять собаку"
   - "Напомни в 9 утра принять таблетки"
   - "Напомни мне каждый понедельник в 10:00 про планерку"
   - "Через 30 минут напомни про встречу"

2️⃣ Используйте команду для прямого создания без нейросети в структурированном формате:
${`/manual text=Текст напоминания&time=14:00,16:00&countInDays=1&days=вт,пт&everyWeek=0`}
`;

  helpText += `
📝 Параметры структурированного формата:
- text: Текст уведомления (обязательно)
- time: Время отправки в формате ЧЧ:ММ, по МСК (обязательно). Можно указать несколько значений через запятую, например: 09:00,12:30,18:00
- days: Дни недели для отправки (пн,вт,ср,чт,пт,сб,вс), если не указано - каждый день
- countInDays: Количество отправок (обязательно), для бесконечных отправок укажите 999999
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

// Инициализация всех обработчиков команд
function setupCommandHandlers(bot) {
  handleStart(bot);
  handleHelp(bot);
  handleManual(bot);
  handleUsers(bot);
  handleNotification(bot);
  handleDelete(bot);
  handleDeleteAll(bot);
  handleList(bot);
}

module.exports = {
  setupCommandHandlers,
  sendHelpMessage,
};
