const UserController = require('../../core/controller/UserController');

/**
 * Info command
 */
module.exports = {
  name: 'info',
  pattern: /^\.info/,
  async execute(bot, msg, match) {
    const userController = new UserController();
    const chatId = msg.chat.id;
    const userId = msg.from?.id;
    
    const isAdmin = userController.isAdmin(userId);
    const userInfo = userController.getUserInfo(msg);
    
    let infoMessage = `📋 Thông tin User\n\n`;
    infoMessage += `🆔 ID: ${userInfo.id}\n`;
    infoMessage += `👤 Tên hiển thị: ${userInfo.display_name}\n`;
    infoMessage += `🤖 Là Bot: ${userInfo.is_bot ? 'Có' : 'Không'}\n`;
    if (userInfo.username && userInfo.username !== 'Không có') {
      infoMessage += `@ Username: ${userInfo.username}\n`;
    }
    infoMessage += `💬 Chat ID: ${userInfo.chat_id}\n`;
    infoMessage += `📱 Loại chat: ${userInfo.chat_type}\n`;
    infoMessage += `\n${isAdmin ? '👑 Bạn là Admin' : '👤 Bạn là User thường'}\n`;
    
    if (isAdmin) {
      infoMessage += `\n✨ Quyền Admin:\n`;
      infoMessage += `- Không bị giới hạn cooldown\n`;
      infoMessage += `- Có thể check phạt nguội không giới hạn\n`;
      infoMessage += `- Có thể gửi thông báo cho tất cả user (.broadcast)\n`;
    }
    
    await bot.sendMessage(chatId, infoMessage);
  }
};

