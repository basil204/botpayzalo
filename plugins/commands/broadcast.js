const UserController = require('../../core/controller/UserController');
const Logger = require('../../utils/logger');

/**
 * Broadcast command (Admin only)
 */
module.exports = {
  name: 'broadcast',
  pattern: /^\.broadcast(.*)/,
  async execute(bot, msg, match) {
    const userController = new UserController();
    const userId = msg.from?.id;
    const chatId = msg.chat.id;
    
    // Check admin permission
    if (!userController.isAdmin(userId)) {
      return bot.sendMessage(chatId, 
        `❌ Bạn không có quyền sử dụng lệnh này!\n\n` +
        `💡 Chỉ admin mới có thể gửi thông báo cho tất cả user.`
      );
    }
    
    // Get message content
    const message = match[1] ? match[1].trim() : '';
    
    if (!message) {
      return bot.sendMessage(chatId,
        `📢 *Gửi thông báo cho tất cả user*\n\n` +
        `💡 Cú pháp: .broadcast <nội dung thông báo>\n\n` +
        `📝 Ví dụ:\n` +
        `   .broadcast Thông báo quan trọng: Bot sẽ bảo trì vào 2h sáng mai.\n\n` +
        `⚠️ Lưu ý: Thông báo sẽ được gửi cho tất cả chatId đã từng sử dụng bot.`
      );
    }
    
    // Get all chat IDs
    const allChatIds = userController.getAllChatIds();
    
    if (allChatIds.length === 0) {
      return bot.sendMessage(chatId,
        `❌ Không có chatId nào trong hệ thống!\n\n` +
        `💡 Chưa có user nào sử dụng bot.`
      );
    }
    
    // Send confirmation
    await bot.sendMessage(chatId,
      `📢 *Bắt đầu gửi thông báo*\n\n` +
      `📊 Số lượng user: ${allChatIds.length}\n` +
      `📝 Nội dung: ${message}\n\n` +
      `⏳ Đang gửi...`
    );
    
    // Send to all chat IDs
    let successCount = 0;
    let failCount = 0;
    const failedChatIds = [];
    
    for (let i = 0; i < allChatIds.length; i++) {
      const targetChatId = allChatIds[i];
      
      try {
        await bot.sendMessage(targetChatId, message);
        successCount++;
        Logger.success(`[${i + 1}/${allChatIds.length}] Đã gửi thông báo cho chatId: ${targetChatId}`);
        
        // Delay to avoid rate limit
        if (i < allChatIds.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      } catch (error) {
        failCount++;
        failedChatIds.push(targetChatId);
        Logger.error(`[${i + 1}/${allChatIds.length}] Lỗi khi gửi cho chatId ${targetChatId}: ${error.message}`);
      }
    }
    
    // Send report
    let reportMsg = `📊 *Kết quả gửi thông báo*\n\n`;
    reportMsg += `✅ Thành công: ${successCount}/${allChatIds.length}\n`;
    reportMsg += `❌ Thất bại: ${failCount}/${allChatIds.length}\n`;
    
    if (failedChatIds.length > 0 && failedChatIds.length <= 10) {
      reportMsg += `\n❌ ChatId thất bại:\n`;
      failedChatIds.forEach(id => {
        reportMsg += `   • ${id}\n`;
      });
    } else if (failedChatIds.length > 10) {
      reportMsg += `\n❌ Có ${failedChatIds.length} chatId thất bại (quá nhiều để hiển thị)`;
    }
    
    await bot.sendMessage(chatId, reportMsg);
  }
};

