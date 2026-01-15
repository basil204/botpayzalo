/**
 * Start command
 */
module.exports = {
  name: 'start',
  pattern: /^\.start/,
  async execute(bot, msg, match) {
    const chatId = msg.chat.id;
    const senderName = msg.from?.display_name || msg.from?.first_name || "Bạn";
    
    await bot.sendMessage(chatId, `Chào ${senderName}! Tôi là chatbot!`);
  }
};

