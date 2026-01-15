/**
 * Menu command
 */
module.exports = {
  name: 'menu',
  pattern: /^\.menu/,
  async execute(bot, msg, match) {
    const chatId = msg.chat.id;
    
    let menuMsg = `ℹ️ *Thông tin và tiện ích:*\n\n`;
    menuMsg += `   .info - Xem thông tin user\n`;
    menuMsg += `   .start - Khởi động bot\n`;
    menuMsg += `   .echo <text> - Echo tin nhắn\n`;
    menuMsg += `   .menu - Xem danh sách lệnh này\n\n`;
    menuMsg += `💰 *Nạp tiền:*\n`;
    menuMsg += `   .naptien <số_tiền> - Nạp tiền vào tài khoản\n`;
    menuMsg += `   .sodu - Xem số dư tài khoản\n\n`;
    menuMsg += `🛒 *Mua hàng:*\n`;
    menuMsg += `   .buy hoặc .mua - Xem danh sách sản phẩm\n`;
    menuMsg += `   .buy <id> - Mua sản phẩm theo ID\n\n`;
    menuMsg += `💡 Gửi lệnh bất kỳ để xem hướng dẫn chi tiết\n`;
    menuMsg += `   Ví dụ: .phatnguoi hoặc .checklive`;
    
    await bot.sendMessage(chatId, menuMsg);
  }
};

