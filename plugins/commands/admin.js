const UserController = require('../../core/controller/UserController');
const Database = require('../../utils/db');
const Logger = require('../../utils/logger');

const userController = new UserController();
const db = new Database();

/**
 * Admin menu command - Show all admin commands
 */
module.exports = {
  name: 'admin',
  pattern: /^\.admin(?:\s+(add|sub|them|tru))?(.*)/,
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
    
    const action = match[1] ? match[1].trim() : null;
    const args = match[2] ? match[2].trim() : '';
    
    // Handle add/sub commands
    if (action === 'add' || action === 'them') {
      return await handleAddBalance(bot, chatId, userId, args);
    }
    
    if (action === 'sub' || action === 'tru') {
      return await handleSubBalance(bot, chatId, userId, args);
    }
    
    // Show menu
    let menuMsg = `👑 *Menu Admin*\n\n`;
    
    menuMsg += `💰 *Quản lý số dư:*\n`;
    menuMsg += `   .admin add <id_user> <số_tiền> - Cộng tiền cho user\n`;
    menuMsg += `   .admin sub <id_user> <số_tiền> - Trừ tiền cho user\n\n`;
    
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
    menuMsg += `1. Cộng tiền:\n`;
    menuMsg += `   .admin add 655e072f987b7125286a 100000\n\n`;
    menuMsg += `2. Trừ tiền:\n`;
    menuMsg += `   .admin sub 655e072f987b7125286a 50000\n\n`;
    menuMsg += `3. Thêm sản phẩm:\n`;
    menuMsg += `   .product add Netflix Premium | 50000\n\n`;
    menuMsg += `4. Gửi thông báo:\n`;
    menuMsg += `   .broadcast Thông báo quan trọng: Bot sẽ bảo trì vào 2h sáng mai.\n\n`;
    
    menuMsg += `💡 Gửi lệnh bất kỳ để xem hướng dẫn chi tiết.`;
    
    await bot.sendMessage(chatId, menuMsg);
  }
};

/**
 * Handle add balance command
 */
async function handleAddBalance(bot, adminChatId, adminUserId, args) {
  const parts = args.trim().split(/\s+/).filter(p => p);
  
  if (parts.length < 2) {
    return bot.sendMessage(adminChatId,
      `➕ *Cộng tiền cho user*\n\n` +
      `💡 Cú pháp: .admin add <id_user> <số_tiền>\n\n` +
      `📋 Ví dụ:\n` +
      `   .admin add 655e072f987b7125286a 100000\n\n` +
      `💰 Số tiền phải là số dương.`
    );
  }
  
  const targetUserId = parts[0];
  const amount = parseInt(parts[1]);
  
  if (isNaN(amount) || amount <= 0) {
    return bot.sendMessage(adminChatId,
      `❌ *Số tiền không hợp lệ*\n\n` +
      `💰 Số tiền phải là số dương.\n\n` +
      `💡 Ví dụ: .admin add 655e072f987b7125286a 100000`
    );
  }
  
  // Update balance
  const userBalance = db.updateUserBalance(targetUserId, amount, `Admin cộng tiền - Admin ID: ${adminUserId}`);
  
  // Try to send notification to user
  try {
    // Try to send to user's chatId (usually userId == chatId for private chats)
    await bot.sendMessage(targetUserId,
      `💰 *Bạn đã được cộng tiền!*\n\n` +
      `💵 Số tiền: +${amount.toLocaleString('vi-VN')}đ\n` +
      `📊 Số dư hiện tại: ${userBalance.balance.toLocaleString('vi-VN')}đ\n\n` +
      `💡 Cảm ơn bạn đã sử dụng dịch vụ!`
    );
  } catch (error) {
    Logger.warn(`[ADMIN] Không thể gửi thông báo đến user ${targetUserId}: ${error.message}`);
    // Continue anyway, admin will still see success message
  }
  
  Logger.info(`[ADMIN] Admin ${adminUserId} đã cộng ${amount}đ cho user ${targetUserId}`);
  
  return bot.sendMessage(adminChatId,
    `✅ *Đã cộng tiền thành công!*\n\n` +
    `👤 User ID: ${targetUserId}\n` +
    `💵 Số tiền: +${amount.toLocaleString('vi-VN')}đ\n` +
    `📊 Số dư mới: ${userBalance.balance.toLocaleString('vi-VN')}đ\n\n` +
    `💡 User đã được thông báo về việc cộng tiền.`
  );
}

/**
 * Handle sub balance command
 */
async function handleSubBalance(bot, adminChatId, adminUserId, args) {
  const parts = args.trim().split(/\s+/).filter(p => p);
  
  if (parts.length < 2) {
    return bot.sendMessage(adminChatId,
      `➖ *Trừ tiền cho user*\n\n` +
      `💡 Cú pháp: .admin sub <id_user> <số_tiền>\n\n` +
      `📋 Ví dụ:\n` +
      `   .admin sub 655e072f987b7125286a 50000\n\n` +
      `💰 Số tiền phải là số dương.`
    );
  }
  
  const targetUserId = parts[0];
  const amount = parseInt(parts[1]);
  
  if (isNaN(amount) || amount <= 0) {
    return bot.sendMessage(adminChatId,
      `❌ *Số tiền không hợp lệ*\n\n` +
      `💰 Số tiền phải là số dương.\n\n` +
      `💡 Ví dụ: .admin sub 655e072f987b7125286a 50000`
    );
  }
  
  // Check current balance
  const currentBalance = db.getUserBalance(targetUserId);
  if (currentBalance.balance < amount) {
    return bot.sendMessage(adminChatId,
      `❌ *Số dư không đủ*\n\n` +
      `👤 User ID: ${targetUserId}\n` +
      `💰 Số dư hiện tại: ${currentBalance.balance.toLocaleString('vi-VN')}đ\n` +
      `💵 Số tiền muốn trừ: ${amount.toLocaleString('vi-VN')}đ\n\n` +
      `💡 Không thể trừ số tiền lớn hơn số dư.`
    );
  }
  
  // Update balance (negative amount)
  const userBalance = db.updateUserBalance(targetUserId, -amount, `Admin trừ tiền - Admin ID: ${adminUserId}`);
  
  // Try to send notification to user
  try {
    // Try to send to user's chatId (usually userId == chatId for private chats)
    await bot.sendMessage(targetUserId,
      `💰 *Bạn đã bị trừ tiền!*\n\n` +
      `💵 Số tiền: -${amount.toLocaleString('vi-VN')}đ\n` +
      `📊 Số dư hiện tại: ${userBalance.balance.toLocaleString('vi-VN')}đ\n\n` +
      `💡 Nếu có thắc mắc, vui lòng liên hệ admin.`
    );
  } catch (error) {
    Logger.warn(`[ADMIN] Không thể gửi thông báo đến user ${targetUserId}: ${error.message}`);
    // Continue anyway, admin will still see success message
  }
  
  Logger.info(`[ADMIN] Admin ${adminUserId} đã trừ ${amount}đ từ user ${targetUserId}`);
  
  return bot.sendMessage(adminChatId,
    `✅ *Đã trừ tiền thành công!*\n\n` +
    `👤 User ID: ${targetUserId}\n` +
    `💵 Số tiền: -${amount.toLocaleString('vi-VN')}đ\n` +
    `📊 Số dư mới: ${userBalance.balance.toLocaleString('vi-VN')}đ\n\n` +
    `💡 User đã được thông báo về việc trừ tiền.`
  );
}