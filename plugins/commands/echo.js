/**
 * Echo command
 */
module.exports = {
  name: 'echo',
  pattern: /^\.echo (.+)/,
  async execute(bot, msg, match) {
    const chatId = msg.chat.id;
    const message = match[1];
    
    if (message) {
      await bot.sendMessage(chatId, `Bạn vừa nói: ${message}`);
    } else {
      await bot.sendMessage(chatId, "Hãy nhập gì đó sau lệnh .echo");
    }
  }
};

