const UserController = require('../../core/controller/UserController');

const userController = new UserController();

/**
 * Admin menu command - Show all admin commands
 */
module.exports = {
  name: 'admin',
  pattern: /^\.admin/,
  async execute(bot, msg, match) {
    const chatId = msg.chat.id;
    const userId = msg.from?.id;
    
    // Check admin permission
    if (!userController.isAdmin(userId)) {
      return bot.sendMessage(chatId, 
        `❌ Bạn không có quyền sử dụng lệnh này!\n\n` +
        `💡 Chỉ admin mới có thể xem menu này.`
      );
    }
    
    let menuMsg = `👑 *Menu Admin*\n\n`;
    
    menuMsg += `📢 *Quản lý thông báo:*\n`;
    menuMsg += `   .broadcast <nội_dung> - Gửi thông báo cho tất cả user\n\n`;
    
    menuMsg += `📦 *Quản lý sản phẩm:*\n`;
    menuMsg += `   .product hoặc .sp - Xem danh sách sản phẩm\n`;
    menuMsg += `   .product add <tên> | <giá> - Thêm sản phẩm mới\n`;
    menuMsg += `   .product edit <id> <tên> | <giá> - Sửa sản phẩm\n`;
    menuMsg += `   .product del <id> - Xóa sản phẩm\n`;
    menuMsg += `   .product addacc <id> - Thêm tài khoản cho sản phẩm\n`;
    menuMsg += `   .product cancel - Hủy thao tác thêm tài khoản\n\n`;
    
    menuMsg += `💰 *Quản lý nạp tiền:*\n`;
    menuMsg += `   Hệ thống tự động xử lý nạp tiền qua QR code\n`;
    menuMsg += `   API: http://160.191.245.27:6868/\n\n`;
    
    menuMsg += `📋 *Ví dụ sử dụng:*\n\n`;
    menuMsg += `1. Thêm sản phẩm:\n`;
    menuMsg += `   .product add Netflix Premium | 50000\n\n`;
    menuMsg += `2. Thêm tài khoản:\n`;
    menuMsg += `   .product addacc <id_sản_phẩm>\n`;
    menuMsg += `   Sau đó gửi danh sách:\n`;
    menuMsg += `   tk1|mk1\n`;
    menuMsg += `   tk2|mk2\n`;
    menuMsg += `   tk3|mk3\n\n`;
    menuMsg += `3. Gửi thông báo:\n`;
    menuMsg += `   .broadcast Thông báo quan trọng: Bot sẽ bảo trì vào 2h sáng mai.\n\n`;
    
    menuMsg += `💡 Gửi lệnh bất kỳ để xem hướng dẫn chi tiết.`;
    
    await bot.sendMessage(chatId, menuMsg);
  }
};