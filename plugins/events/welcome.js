const UserController = require('../../core/controller/UserController');
const Logger = require('../../utils/logger');

/**
 * Welcome event - Send welcome message to new users
 */
module.exports = {
  name: 'welcome',
  eventName: 'message',
  async execute(bot, msg) {
    const userController = new UserController();
    const chatId = msg.chat?.id;
    const userId = msg.from?.id;
    const senderName = msg.from?.display_name || msg.from?.first_name || "Bạn";

    if (!chatId) {
      return;
    }

    // Check if already welcomed
    if (userController.isChatWelcomed(chatId)) {
      return; // Already welcomed
    }

    // Mark as welcomed
    userController.markChatAsWelcomed(chatId);

    // Create welcome message
    let welcomeMsg = `👋 *Xin chào ${senderName}!*\n\n`;
    welcomeMsg += `🤖 Tôi là Bot Zalo - Trợ lý thông minh của bạn!\n\n`;
    welcomeMsg += `✨ *Tính năng:*\n`;
    welcomeMsg += `   🚦 Tra cứu phạt nguội\n`;
    welcomeMsg += `   📅 Đăng ký check hằng ngày\n`;
    welcomeMsg += `   🔍 Check live/die Facebook\n`;
    welcomeMsg += `   ℹ️ Thông tin và tiện ích khác\n\n`;
    welcomeMsg += `📖 *Xem danh sách lệnh:*\n`;
    welcomeMsg += `   .menu\n\n`;
    welcomeMsg += `💡 Gửi lệnh bất kỳ để xem hướng dẫn chi tiết\n\n`;
    welcomeMsg += `🎉 Chúc bạn sử dụng vui vẻ!`;

    try {
      await bot.sendMessage(chatId, welcomeMsg);
      Logger.success(`Đã gửi tin nhắn chào cho chatId: ${chatId}`);
    } catch (error) {
      Logger.error(`Lỗi khi gửi tin nhắn chào cho chatId ${chatId}: ${error.message}`);
    }
  }
};

