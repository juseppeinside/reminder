const config = require("../config");
const userModel = require("../models/users");
const reminderModel = require("../models/reminders");
const { parseReminderParams } = require("../utils/reminder-parser");
const { getWeekPeriodText } = require("../utils/datetime");

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

        // Отправляем сообщение об успешном создании
        bot.sendMessage(chatId, `✅ Напоминание создано!`, {
          parse_mode: "Markdown",
        });
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

        // Получаем список последних пользователей
        const users = await userModel.getRecentUsers(10);

        let message = `Всего пользователей: ${userCount}\n\n`;

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
  bot.onText(/\/notification (.+)/, async (msg, match) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id; // Получаем ID пользователя
    const notificationText = match[1];

    if (userId.toString() === config.ADMIN_ID.toString()) {
      try {
        const users = await userModel.getAllUsers();

        let sentCount = 0;
        for (const user of users) {
          try {
            await bot.sendMessage(user.id, notificationText);
            sentCount++;
          } catch (error) {
            console.error(
              `Ошибка отправки сообщения пользователю ${user.id}`,
              error
            );
          }
        }

        bot.sendMessage(
          chatId,
          `Уведомление отправлено ${sentCount} пользователям из ${users.length}`
        );
      } catch (error) {
        console.error("Ошибка при отправке уведомления:", error);
        bot.sendMessage(chatId, "Ошибка при отправке уведомления");
      }
    } else {
      bot.sendMessage(chatId, "У вас нет прав для выполнения этой команды");
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
    } catch (error) {
      console.error("Ошибка при получении списка уведомлений:", error);
      bot.sendMessage(chatId, "Ошибка при получении списка уведомлений");
    }
  });
}

// Функция отправки справочного сообщения
function sendHelpMessage(bot, chatId) {
  const isAdmin = chatId.toString() === config.ADMIN_ID.toString();

  let helpText = `
👋 Привет! Я бот для отправки уведомлений.

✅ Вы можете создать напоминание двумя способами:

1️⃣ Напишите запрос на естественном языке, например:
   - "Напомни завтра в 18:00 выгулять собаку"
   - "Напомни в 9 утра принять таблетки"
   - "Напомни мне каждый понедельник в 10:00 про планерку"
   - "Через 30 минут напомни про встречу"

2️⃣ Используйте структурированный формат:
text=Текст уведомления&time=14:00&days=пн,чт,пт&countInDays=10&everyWeek=0
`;

  // Добавляем информацию о команде /manual только для администратора
  if (isAdmin) {
    helpText += `
3️⃣ Используйте команду для прямого создания без обработки текста (только для администратора):
/manual text=Текст напоминания&time=14:00&countInDays=999999&days=вт&everyWeek=1
или
/manual text=Митинг в синтезе&time=14:00&countInDays=999999&days=вт&countInWeeks=1
`;
  }

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

  // Добавляем команды администратора
  if (isAdmin) {
    helpText += `
👑 Команды администратора:
👥 /users - показать список пользователей бота
📢 /notification ТЕКСТ - отправить сообщение всем пользователям бота
📝 /manual ПАРАМЕТРЫ - создать напоминание вручную
`;
  }

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
