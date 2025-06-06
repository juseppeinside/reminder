const axios = require("axios");
const { v4: uuidv4 } = require("uuid");
const https = require("https");
const config = require("../config");

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
    console.error("❌ Ошибка при получении токена GigaChat:", error.message);
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
    console.error("❌ Ошибка при запросе к API GigaChat:", error.message);
    throw error;
  }
};

// Инициализация токена GigaChat при импорте модуля
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

module.exports = {
  getAccessToken: () => accessToken,
  setAccessToken: (token) => {
    accessToken = token;
  },
  getGigaChatAccessToken,
  sendGigaChatRequest,
};
