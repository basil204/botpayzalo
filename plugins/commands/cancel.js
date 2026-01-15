const Logger = require('../../utils/logger');
const Database = require('../../utils/db');

const db = new Database();

/**
 * Cancel command - Cancel pending transaction (top-up or purchase)
 */
module.exports = {
  name: 'cancel',
  pattern: /^\.(cancel|huy)/,
  async execute(bot, msg, match) {
    const chatId = msg.chat.id;
    const userId = msg.from?.id || chatId.toString();
    
    // Check if user has a pending transaction
    const existingTransaction = db.getPendingTransactionByUserId(userId);
    
    if (!existingTransaction) {
      return bot.sendMessage(chatId,
        `❌ *Không có giao dịch đang chờ xử lý*\n\n` +
        `💡 Bạn chưa có giao dịch nào đang pending.\n\n` +
        `📋 Sử dụng:\n` +
        `   .naptien <số_tiền> - Để nạp tiền\n` +
        `   .buy <id> - Để mua hàng`
      );
    }
    
    // Get transaction details
    const transactionId = existingTransaction.id;
    const transactionType = (existingTransaction.type === 'purchase') ? 'mua hàng' : 'nạp tiền';
    const expiresAt = new Date(existingTransaction.expiresAt);
    const now = new Date();
    const minutesLeft = Math.max(0, Math.ceil((expiresAt - now) / (1000 * 60)));
    
    // Remove the transaction
    const removed = db.removePendingTransaction(transactionId);
    
    if (removed) {
      Logger.info(`[CANCEL] User ${userId} đã hủy giao dịch ${transactionId} (${transactionType})`);
      
      return bot.sendMessage(chatId,
        `✅ *Đã hủy giao dịch thành công!*\n\n` +
        `🔑 Mã giao dịch: *${existingTransaction.code}*\n` +
        `💰 Số tiền: ${parseInt(existingTransaction.amount).toLocaleString('vi-VN')}đ\n` +
        `📋 Loại: ${transactionType}\n` +
        `⏰ Còn lại: ${minutesLeft} phút\n\n` +
        `💡 Bạn có thể tạo giao dịch mới bây giờ.`
      );
    } else {
      return bot.sendMessage(chatId,
        `❌ *Lỗi khi hủy giao dịch*\n\n` +
        `Vui lòng thử lại sau.`
      );
    }
  }
};
