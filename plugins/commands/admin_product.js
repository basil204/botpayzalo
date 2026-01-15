const Logger = require('../../utils/logger');
const Database = require('../../utils/db');
const UserController = require('../../core/controller/UserController');

const db = new Database();
const userController = new UserController();

// Store admin state for adding accounts
const addAccountStates = new Map(); // userId -> productId

/**
 * Admin Product Management Commands
 */
module.exports = {
  name: 'admin_product',
  pattern: /^\.(product|sp)(?:\s+(addacc|themacc|danhsach|add|them|edit|sua|del|xoa|list|cancel))?(.*)/,
  async execute(bot, msg, match) {
    const chatId = msg.chat.id;
    const userId = msg.from?.id;
    
    // Check admin permission
    if (!userController.isAdmin(userId)) {
      return bot.sendMessage(chatId, 
        `❌ Bạn không có quyền sử dụng lệnh này!\n\n` +
        `💡 Chỉ admin mới có thể quản lý sản phẩm.`
      );
    }
    
    // match[1] = product|sp
    // match[2] = action (add|them|edit|etc) - không có space
    // match[3] = args (phần còn lại sau action)
    const action = match[2] ? match[2].trim() : 'list';
    const args = match[3] ? match[3].trim() : '';
    
    Logger.info(`[ADMIN_PRODUCT] Action: ${action}, Args: "${args}"`);
    
    // List products
    if (action === 'list' || action === 'danhsach' || !action) {
      const products = db.getAllProducts();
      const productList = Object.values(products);
      
      if (productList.length === 0) {
        return bot.sendMessage(chatId,
          `📦 *Danh sách sản phẩm*\n\n` +
          `❌ Chưa có sản phẩm nào.\n\n` +
          `💡 Sử dụng .product add <tên> | <giá> để thêm sản phẩm.`
        );
      }
      
      let message = `📦 *Danh sách sản phẩm*\n\n`;
      productList.forEach((product, index) => {
        const availableCount = (product.accounts || []).filter(acc => !acc.sold).length;
        const totalCount = (product.accounts || []).length;
        message += `${index + 1}. *ID: ${product.id}*\n`;
        message += `   📝 Tên: ${product.name}\n`;
        message += `   💰 Giá: ${product.price.toLocaleString('vi-VN')}đ\n`;
        message += `   📊 Tài khoản: ${availableCount}/${totalCount} (còn lại/tổng)\n\n`;
      });
      
      message += `💡 *Lệnh quản lý:*\n`;
      message += `   .product add <tên> | <giá> - Thêm sản phẩm\n`;
      message += `   .product edit <id> <tên> | <giá> - Sửa sản phẩm\n`;
      message += `   .product del <id> - Xóa sản phẩm\n`;
      message += `   .product addacc <id> - Thêm tài khoản\n`;
      
      return bot.sendMessage(chatId, message);
    }
    
    // Add product
    if (action === 'add' || action === 'them') {
      try {
        Logger.info(`[ADMIN_PRODUCT] Parsing add product, args: "${args}"`);
        
        // Parse: format: <tên> | <giá>
        const parts = args.split('|').map(p => p.trim());
        Logger.info(`[ADMIN_PRODUCT] Parts after split:`, parts);
        
        if (parts.length < 2) {
          Logger.warn(`[ADMIN_PRODUCT] Không đủ phần, parts.length: ${parts.length}`);
          return bot.sendMessage(chatId,
            `➕ *Thêm sản phẩm*\n\n` +
            `💡 Cú pháp: .product add <tên_sản_phẩm> | <giá>\n\n` +
            `📋 Ví dụ:\n` +
            `   .product add Netflix Premium | 50000\n` +
            `   .product add Spotify Premium | 30000\n` +
            `   .product add adobe 4th(14/1) | 20000`
          );
        }
        
        const name = parts[0].trim();
        const price = parseInt(parts[1].trim());
        
        Logger.info(`[ADMIN_PRODUCT] Parsed - name: "${name}", price: ${price}`);
        
        if (!name || name.length === 0) {
          return bot.sendMessage(chatId,
            `❌ *Thiếu tên sản phẩm*\n\n` +
            `💡 Cú pháp: .product add <tên_sản_phẩm> | <giá>`
          );
        }
        
        if (isNaN(price) || price <= 0) {
          return bot.sendMessage(chatId,
            `❌ *Giá không hợp lệ*\n\n` +
            `💰 Giá phải là số dương.\n\n` +
            `💡 Ví dụ: .product add Netflix Premium | 50000`
          );
        }
        
        const product = db.addProduct(name, price);
        Logger.info(`[ADMIN_PRODUCT] Admin ${userId} đã thêm sản phẩm: ${product.id} - ${product.name}`);
        
        return bot.sendMessage(chatId,
          `✅ *Đã thêm sản phẩm thành công!*\n\n` +
          `🆔 ID: ${product.id}\n` +
          `📝 Tên: ${product.name}\n` +
          `💰 Giá: ${product.price.toLocaleString('vi-VN')}đ\n\n` +
          `💡 Sử dụng .product addacc ${product.id} để thêm tài khoản.`
        );
      } catch (error) {
        Logger.error(`[ADMIN_PRODUCT] Lỗi khi thêm sản phẩm: ${error.message}`);
        Logger.error(`[ADMIN_PRODUCT] Stack: ${error.stack}`);
        return bot.sendMessage(chatId,
          `❌ *Lỗi khi thêm sản phẩm*\n\n` +
          `❌ Lỗi: ${error.message}\n\n` +
          `💡 Vui lòng thử lại hoặc kiểm tra lại cú pháp.`
        );
      }
    }
    
    // Edit product
    if (action === 'edit' || action === 'sua') {
      // Parse: format: <id> <tên> | <giá>
      const pipeIndex = args.indexOf('|');
      if (pipeIndex === -1) {
        return bot.sendMessage(chatId,
          `✏️ *Sửa sản phẩm*\n\n` +
          `💡 Cú pháp: .product edit <id> <tên_mới> | <giá_mới>\n\n` +
          `📋 Ví dụ:\n` +
          `   .product edit 1234567890 Netflix Premium | 60000`
        );
      }
      
      const beforePipe = args.substring(0, pipeIndex).trim();
      const afterPipe = args.substring(pipeIndex + 1).trim();
      
      const parts = beforePipe.split(/\s+/).filter(p => p);
      if (parts.length < 2) {
        return bot.sendMessage(chatId,
          `✏️ *Sửa sản phẩm*\n\n` +
          `💡 Cú pháp: .product edit <id> <tên_mới> | <giá_mới>\n\n` +
          `📋 Ví dụ:\n` +
          `   .product edit 1234567890 Netflix Premium | 60000`
        );
      }
      
      const productId = parts[0];
      const name = parts.slice(1).join(' ');
      const price = parseInt(afterPipe);
      
      if (isNaN(price) || price <= 0) {
        return bot.sendMessage(chatId,
          `❌ *Giá không hợp lệ*\n\n` +
          `💰 Giá phải là số dương.`
        );
      }
      
      const product = db.updateProduct(productId, name, price);
      if (!product) {
        return bot.sendMessage(chatId,
          `❌ *Không tìm thấy sản phẩm*\n\n` +
          `🆔 ID: ${productId}\n\n` +
          `💡 Sử dụng .product để xem danh sách sản phẩm.`
        );
      }
      
      Logger.info(`[ADMIN_PRODUCT] Admin ${userId} đã sửa sản phẩm: ${product.id}`);
      
      return bot.sendMessage(chatId,
        `✅ *Đã cập nhật sản phẩm thành công!*\n\n` +
        `🆔 ID: ${product.id}\n` +
        `📝 Tên: ${product.name}\n` +
        `💰 Giá: ${product.price.toLocaleString('vi-VN')}đ`
      );
    }
    
    // Delete product
    if (action === 'del' || action === 'xoa') {
      const productId = args.trim();
      if (!productId) {
        return bot.sendMessage(chatId,
          `🗑️ *Xóa sản phẩm*\n\n` +
          `💡 Cú pháp: .product del <id>\n\n` +
          `📋 Ví dụ:\n` +
          `   .product del 1234567890\n\n` +
          `⚠️ Cảnh báo: Sẽ xóa tất cả tài khoản của sản phẩm này!`
        );
      }
      
      const product = db.getProduct(productId);
      if (!product) {
        return bot.sendMessage(chatId,
          `❌ *Không tìm thấy sản phẩm*\n\n` +
          `🆔 ID: ${productId}`
        );
      }
      
      const deleted = db.deleteProduct(productId);
      if (deleted) {
        Logger.info(`[ADMIN_PRODUCT] Admin ${userId} đã xóa sản phẩm: ${productId}`);
        return bot.sendMessage(chatId,
          `✅ *Đã xóa sản phẩm thành công!*\n\n` +
          `🆔 ID: ${productId}\n` +
          `📝 Tên: ${product.name}`
        );
      }
      
      return bot.sendMessage(chatId,
        `❌ *Lỗi khi xóa sản phẩm*`
      );
    }
    
    // Add accounts to product
    if (action === 'addacc' || action === 'themacc') {
      const productId = args.trim();
      if (!productId) {
        return bot.sendMessage(chatId,
          `➕ *Thêm tài khoản cho sản phẩm*\n\n` +
          `💡 Cú pháp: .product addacc <id>\n\n` +
          `📋 Ví dụ:\n` +
          `   .product addacc 1234567890\n\n` +
          `Sau đó gửi danh sách tài khoản theo format:\n` +
          `   tk1|mk1\n` +
          `   tk2|mk2\n` +
          `   tk3|mk3\n\n` +
          `Mỗi dòng một tài khoản, format: username|password`
        );
      }
      
      const product = db.getProduct(productId);
      if (!product) {
        return bot.sendMessage(chatId,
          `❌ *Không tìm thấy sản phẩm*\n\n` +
          `🆔 ID: ${productId}\n\n` +
          `💡 Sử dụng .product để xem danh sách sản phẩm.`
        );
      }
      
      // Store state for this admin
      addAccountStates.set(userId, productId);
      
      return bot.sendMessage(chatId,
        `➕ *Thêm tài khoản cho sản phẩm*\n\n` +
        `🆔 ID: ${productId}\n` +
        `📝 Tên: ${product.name}\n\n` +
        `📋 Vui lòng gửi danh sách tài khoản theo format:\n` +
        `   tk1|mk1\n` +
        `   tk2|mk2\n` +
        `   tk3|mk3\n\n` +
        `💡 Mỗi dòng một tài khoản, format: username|password\n` +
        `💡 Gửi .product cancel để hủy.`
      );
    }
    
    // Cancel adding accounts
    if (action === 'cancel') {
      addAccountStates.delete(userId);
      return bot.sendMessage(chatId,
        `✅ Đã hủy thao tác thêm tài khoản.`
      );
    }
  }
};

/**
 * Handle account list input (called from event)
 */
module.exports.handleAccountInput = async function(bot, msg) {
  const chatId = msg.chat.id;
  const userId = msg.from?.id;
  
  if (!userId || !addAccountStates.has(userId)) {
    return false; // Not in add account flow
  }
  
  // Check admin permission
  if (!userController.isAdmin(userId)) {
    addAccountStates.delete(userId);
    return false;
  }
  
  const productId = addAccountStates.get(userId);
  const accountsText = msg.text?.trim();
  
  if (!accountsText) {
    return bot.sendMessage(chatId,
      `❌ *Thiếu danh sách tài khoản*\n\n` +
      `💡 Gửi danh sách tài khoản theo format:\n` +
      `   tk1|mk1\n` +
      `   tk2|mk2\n` +
      `   tk3|mk3`
    ).then(() => true);
  }
  
  const product = db.getProduct(productId);
  if (!product) {
    addAccountStates.delete(userId);
    return bot.sendMessage(chatId,
      `❌ *Không tìm thấy sản phẩm*\n\n` +
      `🆔 ID: ${productId}`
    ).then(() => true);
  }
  
  const result = db.addAccountsToProduct(productId, accountsText);
  
  // Clear state
  addAccountStates.delete(userId);
  
  if (result && result.added > 0) {
    const availableCount = result.product.accounts.filter(acc => !acc.sold).length;
    Logger.info(`[ADMIN_PRODUCT] Admin ${userId} đã thêm ${result.added} tài khoản cho sản phẩm ${productId}`);
    
    return bot.sendMessage(chatId,
      `✅ *Đã thêm tài khoản thành công!*\n\n` +
      `🆔 Sản phẩm: ${result.product.name}\n` +
      `📊 Đã thêm: ${result.added} tài khoản\n` +
      `📦 Tổng còn lại: ${availableCount} tài khoản`
    ).then(() => true);
  } else {
    return bot.sendMessage(chatId,
      `❌ *Không thể thêm tài khoản*\n\n` +
      `💡 Kiểm tra lại format: username|password\n` +
      `Mỗi dòng một tài khoản.`
    ).then(() => true);
  }
};