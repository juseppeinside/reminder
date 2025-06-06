require("dotenv").config();

const TelegramBot = require("node-telegram-bot-api");
const config = require("./config");
const { setupReminderScheduler } = require("./services/scheduler");
const { setupCommandHandlers } = require("./handlers/commands");
const { setupMessageHandlers } = require("./handlers/messages");

const token = config.TELEGRAM_BOT_TOKEN;

if (!token) {
  console.error("Ошибка: TELEGRAM_BOT_TOKEN не задан в файле конфигурации");
  process.exit(1);
}

const bot = new TelegramBot(token, { polling: true });

// Настройка обработчиков
setupCommandHandlers(bot);
setupMessageHandlers(bot);

// Запускаем планировщик уведомлений
setupReminderScheduler(bot);

console.log("🚀 Бот запущен и готов к работе...");
