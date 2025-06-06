const cron = require("node-cron");
const { getCurrentMoscowTime, getWeekNumber } = require("../utils/datetime");
const reminderModel = require("../models/reminders");

function setupReminderScheduler(bot) {
  // Запускаем проверку каждую минуту
  cron.schedule("* * * * *", async () => {
    try {
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
      const reminders = await reminderModel.getAllReminders();

      for (const reminder of reminders) {
        try {
          // Проверяем соответствие текущего времени одному из указанных в уведомлении времен
          const reminderTimes = reminder.time.split(",");
          if (!reminderTimes.includes(timeString)) {
            continue;
          }

          // Проверяем, должно ли уведомление быть отправлено сегодня
          const reminderDays = reminder.days.split(",");
          if (!reminderDays.includes(currentDay)) {
            continue;
          }

          // Проверяем периодичность недель
          if (
            reminder.every_week > 0 &&
            weekNumber % (parseInt(reminder.every_week) + 1) !== 0
          ) {
            continue;
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
          try {
            await bot.sendMessage(reminder.user_id, messageText);
            console.log(
              `Отправлено уведомление ${reminder.id} пользователю ${reminder.user_id}`
            );
          } catch (sendError) {
            console.error(
              `Ошибка при отправке уведомления ${reminder.id} пользователю ${reminder.user_id}:`,
              sendError.message
            );
            // Продолжаем выполнение, чтобы обработать остальные напоминания
            continue;
          }

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

              // Отправляем временное сообщение о подтверждении
              try {
                await bot.sendMessage(reminder.user_id, completionMessage, {
                  parse_mode: "Markdown",
                  reply_markup: replyMarkup,
                });
              } catch (sendError) {
                console.error(
                  `Ошибка при отправке сообщения о завершении напоминания ${reminder.id}:`,
                  sendError.message
                );
              }

              // Сохраняем шаблон уведомления в базе для восстановления
              const templateId = `template_${reminder.id}`;
              await reminderModel.saveReminderTemplate(
                templateId,
                reminder.user_id,
                reminder.text,
                reminder.time,
                reminder.days,
                reminder.every_week
              );

              // Удаляем уведомление, если достигнут лимит отправок
              await reminderModel.deleteReminder(reminder.id, reminder.user_id);
            } else {
              // Обновляем счетчик
              await reminderModel.updateReminderCount(reminder.id, newCount);
            }
          }
        } catch (reminderError) {
          console.error(
            `Ошибка при обработке напоминания ${reminder.id}:`,
            reminderError
          );
        }
      }
    } catch (error) {
      console.error("Ошибка в планировщике напоминаний:", error);
    }
  });
}

module.exports = {
  setupReminderScheduler,
};
