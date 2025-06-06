const formatReminderInfo = (params, reminder) => {
  // Проверяем, содержит ли строка дней все дни недели
  const allDays = "пн,вт,ср,чт,пт,сб,вс";
  const sortedDays = params.days.split(",").sort().join(",");
  const sortedAllDays = allDays.split(",").sort().join(",");

  // Если указаны все дни недели, не показываем поле "Дни"
  if (sortedDays === sortedAllDays) {
    return `📝 Текст: ${params.text}\n🕒 Время: ${params.time}\n⏳ Количество отправок: ${reminder.count_in_days}`;
  } else {
    return `📝 Текст: ${params.text}\n🕒 Время: ${params.time}\n📅 Дни: ${params.days}\n⏳ Количество отправок: ${reminder.count_in_days}`;
  }
};

/**
 * Отправляет сообщение о создании напоминания с кнопкой "Удалить", которая исчезает через 10 секунд
 * @param {Object} bot - Объект бота Telegram
 * @param {Number} chatId - ID чата
 * @param {Object} params - Параметры напоминания
 * @param {Object} reminder - Объект напоминания из базы
 * @returns {Promise<Object>} - Объект отправленного сообщения
 */
const sendReminderCreatedMessage = async (bot, chatId, params, reminder) => {
  // Создаем кнопку "Удалить" с передачей ID напоминания
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
    `✅ Напоминание создано!\n\n${formatReminderInfo(params, reminder)}`,
    {
      parse_mode: "Markdown",
      reply_markup: replyMarkup,
    }
  );

  // Устанавливаем таймер на удаление кнопки и подробностей через 10 секунд
  setTimeout(() => {
    try {
      // Проверяем, существует ли сообщение перед редактированием
      bot
        .getChat(chatId)
        .then(() => {
          // Редактируем сообщение, оставляя только "Напоминание создано!" и удаляя кнопку
          return bot.editMessageText(`✅ Напоминание создано!`, {
            chat_id: chatId,
            message_id: sentMessage.message_id,
            parse_mode: "Markdown",
            reply_markup: { inline_keyboard: [] },
          });
        })
        .catch((err) => {
          // Если сообщение не найдено, значит оно уже удалено
          console.log(
            `Сообщение ${sentMessage.message_id} уже удалено или недоступно для редактирования`
          );
        });
    } catch (error) {
      console.error("Ошибка при удалении кнопки и подробностей:", error);
    }
  }, 10000);

  return sentMessage;
};

module.exports = {
  formatReminderInfo,
  sendReminderCreatedMessage,
};
