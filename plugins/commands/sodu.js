const Logger = require('../../utils/logger');
const Database = require('../../utils/db');

const db = new Database();

/**
 * So du command - Check user balance
 */
module.exports = {
  name: 'sodu',
  pattern: /^\.sodu/,
  async execute(bot, msg, match) {
    const chatId = msg.chat.id;
    const userId = msg.from?.id || chatId.toString();
    
    try {
      const userBalance = db.getUserBalance(userId);
      const balance = userBalance.balance || 0;
      const transactions = userBalance.transactions || [];
      
      // Get recent transactions (last 5)
      const recentTransactions = transactions.slice(-5).reverse();
      
      let message = `💰 *Số dư tài khoản*\n\n`;
      message += `💵 Số dư hiện tại: *${balance.toLocaleString('vi-VN')}đ*\n\n`;
      
      if (recentTransactions.length > 0) {
        message += `📋 *Lịch sử giao dịch gần đây:*\n\n`;
        recentTransactions.forEach((tx, index) => {
          const date = new Date(tx.timestamp);
          const dateStr = date.toLocaleString('vi-VN');
          const amount = tx.amount > 0 ? `+${tx.amount.toLocaleString('vi-VN')}đ` : `${tx.amount.toLocaleString('vi-VN')}đ`;
          const icon = tx.type === 'deposit' ? '💳' : '💸';
          message += `${icon} ${amount} - ${tx.description || 'Giao dịch'}\n`;
          message += `   📅 ${dateStr}\n\n`;
        });
      } else {
        message += `📋 Chưa có giao dịch nào.\n\n`;
      }
      
      message += `💡 Sử dụng .naptien <số_tiền> để nạp tiền`;
      
      await bot.sendMessage(chatId, message);
      Logger.info(`[SODU] User ${userId} đã xem số dư: ${balance}đ`);
    } catch (error) {
      Logger.error(`[SODU] Lỗi: ${error.message}`);
      await bot.sendMessage(chatId, 
        `❌ *Lỗi khi lấy số dư*\n\n` +
        `Vui lòng thử lại sau.`
      );
    }
  }
};