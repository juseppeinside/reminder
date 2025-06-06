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

module.exports = {
  parseReminderParams,
};
