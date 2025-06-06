// Функция для получения текущего московского времени
function getCurrentMoscowTime() {
  const currentDate = new Date();
  return currentDate;
}

// Функция для получения номера недели в году
function getWeekNumber(date) {
  const firstDayOfYear = new Date(date.getFullYear(), 0, 1);
  const pastDaysOfYear = (date - firstDayOfYear) / 86400000;
  return Math.ceil((pastDaysOfYear + firstDayOfYear.getDay() + 1) / 7);
}

// Функция для расчета относительного времени
function calculateRelativeTime(date, value, unit) {
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
}

// Функция для форматирования текста периодичности
function getWeekPeriodText(everyWeek) {
  if (everyWeek === 0) return "(каждую неделю)";
  if (everyWeek === 1) return "(через неделю)";
  if (everyWeek >= 2) return `(каждые ${everyWeek + 1} недели)`;
  return "";
}

module.exports = {
  getCurrentMoscowTime,
  getWeekNumber,
  calculateRelativeTime,
  getWeekPeriodText,
};
