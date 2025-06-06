const gigaChatService = require("./gigachat");
const {
  getCurrentMoscowTime,
  calculateRelativeTime,
} = require("../utils/datetime");

// Функция для обработки запросов на естественном языке через GigaChat
async function processNaturalLanguageWithGigaChat(text) {
  try {
    // Проверяем только наличие токена доступа
    let accessToken = gigaChatService.getAccessToken();
    if (!accessToken) {
      console.log("⚠️ Отсутствует токен GigaChat, получаем новый");
      accessToken = await gigaChatService.getGigaChatAccessToken();
      if (!accessToken) {
        console.log(
          "❌ Не удалось получить токен GigaChat, используем локальную обработку"
        );
        return parseNaturalLanguage(text);
      }
      gigaChatService.setAccessToken(accessToken);
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
      const result = await gigaChatService.sendGigaChatRequest(
        accessToken,
        prompt,
        text
      );
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
        accessToken = await gigaChatService.getGigaChatAccessToken();
        gigaChatService.setAccessToken(accessToken);

        if (accessToken) {
          // Повторяем запрос с новым токеном
          try {
            const result = await gigaChatService.sendGigaChatRequest(
              accessToken,
              prompt,
              text
            );
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

module.exports = {
  processNaturalLanguageWithGigaChat,
  parseNaturalLanguage,
};
