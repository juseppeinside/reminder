const naturalLanguageService = require("../services/natural-language");
const reminderModel = require("../models/reminders");
const { parseReminderParams } = require("../utils/reminder-parser");
const { getWeekPeriodText } = require("../utils/datetime");

// Обработчик для обычных сообщений
function handleMessages(bot) {
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
            const reminder = await reminderModel.saveReminder(chatId, params);

            // Создаем кнопку "Удалить"
            const replyMarkup = {
              inline_keyboard: [
                [
                  {
                    text: "🗑️ Удалить",
                    callback_data: `delete_reminder_${reminder.id}`,
                  },
                ],
              ],
            };

            // Отправляем сообщение об успешном создании с кнопкой удаления
            const sentMessage = await bot.sendMessage(
              chatId,
              `✅ Напоминание создано!`,
              {
                parse_mode: "Markdown",
                reply_markup: replyMarkup,
              }
            );

            // Устанавливаем таймер на удаление кнопки через 10 секунд
            setTimeout(() => {
              try {
                // Проверяем, существует ли сообщение перед редактированием
                bot
                  .getChat(chatId)
                  .then(() => {
                    // Пытаемся получить сообщение перед его редактированием
                    return bot.editMessageReplyMarkup(
                      { inline_keyboard: [] },
                      {
                        chat_id: chatId,
                        message_id: sentMessage.message_id,
                      }
                    );
                  })
                  .catch((err) => {
                    // Если сообщение не найдено, значит оно уже удалено
                    console.log(
                      `Сообщение ${sentMessage.message_id} уже удалено или недоступно для редактирования`
                    );
                  });
              } catch (error) {
                console.error("Ошибка при удалении кнопки:", error);
              }
            }, 10000);
          }
        } else {
          console.log(`Обрабатываем сообщение от пользователя: "${text}"`);

          // Сначала пробуем обработать через GigaChat
          try {
            console.log("Начинаем обработку через GigaChat API");
            const formattedText =
              await naturalLanguageService.processNaturalLanguageWithGigaChat(
                text
              );
            console.log("Преобразовано в формат (GigaChat):", formattedText);

            // Проверяем, что ответ соответствует нашему формату
            if (
              formattedText &&
              formattedText.includes("text=") &&
              formattedText.includes("time=")
            ) {
              const params = parseReminderParams(formattedText);
              if (params) {
                const reminder = await reminderModel.saveReminder(
                  chatId,
                  params
                );

                // Создаем кнопку "Удалить"
                const replyMarkup = {
                  inline_keyboard: [
                    [
                      {
                        text: "🗑️ Удалить",
                        callback_data: `delete_reminder_${reminder.id}`,
                      },
                    ],
                  ],
                };

                // Отправляем сообщение об успешном создании с подробной информацией и кнопкой удаления
                const sentMessage = await bot.sendMessage(
                  chatId,
                  `✅ Напоминание создано!\n\n🆔 ID: \`${reminder.id}\`\n📝 Текст: ${params.text}\n🕒 Время: ${params.time}\n📅 Дни: ${params.days}\n⏳ Количество отправок: ${reminder.count_in_days}`,
                  {
                    parse_mode: "Markdown",
                    reply_markup: replyMarkup,
                  }
                );

                // Устанавливаем таймер на удаление кнопки через 10 секунд
                setTimeout(() => {
                  try {
                    // Проверяем, существует ли сообщение перед редактированием
                    bot
                      .getChat(chatId)
                      .then(() => {
                        // Пытаемся получить сообщение перед его редактированием
                        return bot.editMessageReplyMarkup(
                          { inline_keyboard: [] },
                          {
                            chat_id: chatId,
                            message_id: sentMessage.message_id,
                          }
                        );
                      })
                      .catch((err) => {
                        // Если сообщение не найдено, значит оно уже удалено
                        console.log(
                          `Сообщение ${sentMessage.message_id} уже удалено или недоступно для редактирования`
                        );
                      });
                  } catch (error) {
                    console.error("Ошибка при удалении кнопки:", error);
                  }
                }, 10000);

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
            const formattedText =
              naturalLanguageService.parseNaturalLanguage(text);
            console.log("Преобразовано в формат (локально):", formattedText);

            const params = parseReminderParams(formattedText);
            if (params) {
              const reminder = await reminderModel.saveReminder(chatId, params);

              // Создаем кнопку "Удалить"
              const replyMarkup = {
                inline_keyboard: [
                  [
                    {
                      text: "🗑️ Удалить",
                      callback_data: `delete_reminder_${reminder.id}`,
                    },
                  ],
                ],
              };

              // Отправляем сообщение об успешном создании с кнопкой удаления
              const sentMessage = await bot.sendMessage(
                chatId,
                `✅ Напоминание создано!`,
                {
                  parse_mode: "Markdown",
                  reply_markup: replyMarkup,
                }
              );

              // Устанавливаем таймер на удаление кнопки через 10 секунд
              setTimeout(() => {
                try {
                  // Проверяем, существует ли сообщение перед редактированием
                  bot
                    .getChat(chatId)
                    .then(() => {
                      // Пытаемся получить сообщение перед его редактированием
                      return bot.editMessageReplyMarkup(
                        { inline_keyboard: [] },
                        {
                          chat_id: chatId,
                          message_id: sentMessage.message_id,
                        }
                      );
                    })
                    .catch((err) => {
                      // Если сообщение не найдено, значит оно уже удалено
                      console.log(
                        `Сообщение ${sentMessage.message_id} уже удалено или недоступно для редактирования`
                      );
                    });
                } catch (error) {
                  console.error("Ошибка при удалении кнопки:", error);
                }
              }, 10000);
            }
          }
        }
      } catch (error) {
        bot.sendMessage(chatId, `❌ Ошибка: ${error.message}`);
      }
    }
  });
}

// Обработчик callback-запросов (для кнопок)
function handleCallbacks(bot) {
  bot.on("callback_query", async (callbackQuery) => {
    const msg = callbackQuery.message;
    const data = callbackQuery.data;
    const userId = callbackQuery.from.id;
    const chatId = msg.chat.id;
    const messageId = msg.message_id;

    // Обработка нажатия на кнопку удаления сообщения и напоминания
    if (data.startsWith("delete_reminder_")) {
      try {
        // Извлекаем ID напоминания из данных callback
        const reminderId = data.replace("delete_reminder_", "");

        // Сначала отвечаем на callback-запрос с временным уведомлением в интерфейсе Telegram
        await bot.answerCallbackQuery(callbackQuery.id, {
          text: "Напоминание удалено",
          show_alert: false,
        });

        // Удаляем напоминание из базы данных
        await reminderModel
          .deleteReminder(reminderId, userId)
          .catch((error) => {
            console.error(
              "Ошибка при удалении напоминания из базы данных:",
              error
            );
          });

        // Затем удаляем сообщение без отправки дополнительного подтверждения
        await bot.deleteMessage(chatId, messageId).catch((error) => {
          console.error("Ошибка при удалении сообщения:", error);
          // Не отправляем уведомление об ошибке пользователю
        });
      } catch (error) {
        console.error("Ошибка при обработке запроса удаления:", error);
      }
    }
    // Обработка нажатия на кнопку воссоздания уведомления
    else if (data.startsWith("recreate_")) {
      const reminderId = data.replace("recreate_", "");
      const templateId = `template_${reminderId}`;

      try {
        // Получаем шаблон уведомления из базы
        const template = await reminderModel.getReminderTemplate(
          templateId,
          userId
        );

        if (!template) {
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
        await reminderModel.saveReminder(userId, params);

        // Отвечаем на callback-запрос
        bot.answerCallbackQuery(callbackQuery.id, {
          text: "✅ Уведомление успешно создано!",
          show_alert: false,
        });
      } catch (error) {
        console.error("Ошибка при воссоздании напоминания:", error);
        bot.answerCallbackQuery(callbackQuery.id, {
          text: "Ошибка при создании напоминания",
          show_alert: true,
        });
      }
    }
  });
}

// Инициализация всех обработчиков сообщений
function setupMessageHandlers(bot) {
  handleMessages(bot);
  handleCallbacks(bot);
}

module.exports = {
  setupMessageHandlers,
};
