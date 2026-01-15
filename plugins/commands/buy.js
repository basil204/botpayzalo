const Logger = require('../../utils/logger');
const Database = require('../../utils/db');

const db = new Database();

// Store user purchase state
const purchaseStates = new Map(); // userId -> { productId, quantity, step }

/**
 * Buy command - User purchase products
 */
module.exports = {
  name: 'buy',
  pattern: /^\.(buy|mua)(\s+(\d+))?/,
  async execute(bot, msg, match) {
    const chatId = msg.chat.id;
    const userId = msg.from?.id || chatId.toString();
    const productIdArg = match[3];
    
    // Step 1: Show product list
    if (!productIdArg) {
      const products = db.getAllProducts();
      const productList = Object.values(products);
      
      if (productList.length === 0) {
        return bot.sendMessage(chatId,
          `🛒 *Cửa hàng*\n\n` +
          `❌ Hiện tại chưa có sản phẩm nào.\n\n` +
          `Vui lòng quay lại sau!`
        );
      }
      
      let message = `🛒 *Danh sách sản phẩm*\n\n`;
      productList.forEach((product, index) => {
        const availableCount = (product.accounts || []).filter(acc => !acc.sold).length;
        message += `${index + 1}. *${product.name}*\n`;
        message += `   🆔 ID: ${product.id}\n`;
        message += `   💰 Giá: ${product.price.toLocaleString('vi-VN')}đ\n`;
        message += `   📦 Còn lại: ${availableCount} tài khoản\n\n`;
      });
      
      message += `💡 *Cách mua:*\n`;
      message += `   .buy <id_sản_phẩm>\n\n`;
      message += `📋 Ví dụ:\n`;
      message += `   .buy ${productList[0]?.id || '1234567890'}`;
      
      return bot.sendMessage(chatId, message);
    }
    
    // Step 2: User selected product, ask for quantity
    const productId = productIdArg.trim();
    const product = db.getProduct(productId);
    
    if (!product) {
      return bot.sendMessage(chatId,
        `❌ *Không tìm thấy sản phẩm*\n\n` +
        `🆔 ID: ${productId}\n\n` +
        `💡 Sử dụng .buy để xem danh sách sản phẩm.`
      );
    }
    
    const availableCount = (product.accounts || []).filter(acc => !acc.sold).length;
    
    if (availableCount === 0) {
      return bot.sendMessage(chatId,
        `❌ *Sản phẩm đã hết hàng*\n\n` +
        `📝 ${product.name}\n` +
        `💰 Giá: ${product.price.toLocaleString('vi-VN')}đ\n\n` +
        `Vui lòng chọn sản phẩm khác.`
      );
    }
    
    // Store purchase state
    purchaseStates.set(userId, {
      productId: productId,
      product: product,
      step: 'quantity'
    });
    
    return bot.sendMessage(chatId,
      `🛒 *Chọn số lượng*\n\n` +
      `📝 Sản phẩm: ${product.name}\n` +
      `💰 Giá: ${product.price.toLocaleString('vi-VN')}đ/1 tài khoản\n` +
      `📦 Còn lại: ${availableCount} tài khoản\n\n` +
      `💡 Vui lòng nhập số lượng muốn mua (1-${availableCount}):\n` +
      `   Ví dụ: 1, 2, 3...`
    );
  }
};

/**
 * Handle quantity input and process purchase
 */
module.exports.handleQuantity = async function(bot, msg) {
  const chatId = msg.chat.id;
  const userId = msg.from?.id || chatId.toString();
  
  const purchaseState = purchaseStates.get(userId);
  if (!purchaseState || purchaseState.step !== 'quantity') {
    return false; // Not in purchase flow
  }
  
  const quantityText = msg.text?.trim();
  const quantity = parseInt(quantityText);
  
  if (isNaN(quantity) || quantity <= 0) {
    return bot.sendMessage(chatId,
      `❌ *Số lượng không hợp lệ*\n\n` +
      `💡 Vui lòng nhập số lượng là số dương.\n` +
      `Ví dụ: 1, 2, 3...`
    ).then(() => true);
  }
  
  const product = purchaseState.product;
  const availableCount = (product.accounts || []).filter(acc => !acc.sold).length;
  
  if (quantity > availableCount) {
    purchaseStates.delete(userId);
    return bot.sendMessage(chatId,
      `❌ *Không đủ số lượng*\n\n` +
      `📦 Sản phẩm chỉ còn ${availableCount} tài khoản.\n` +
      `Bạn yêu cầu: ${quantity} tài khoản.\n\n` +
      `💡 Vui lòng chọn lại số lượng hoặc sản phẩm khác.`
    ).then(() => true);
  }
  
  const totalPrice = product.price * quantity;
  const userBalance = db.getUserBalance(userId);
  
  if (userBalance.balance < totalPrice) {
    purchaseStates.delete(userId);
    return bot.sendMessage(chatId,
      `❌ *Số dư không đủ*\n\n` +
      `💰 Số dư hiện tại: ${userBalance.balance.toLocaleString('vi-VN')}đ\n` +
      `💵 Tổng tiền cần: ${totalPrice.toLocaleString('vi-VN')}đ\n` +
      `📊 Thiếu: ${(totalPrice - userBalance.balance).toLocaleString('vi-VN')}đ\n\n` +
      `💡 Sử dụng /naptien để nạp thêm tiền.`
    ).then(() => true);
  }
  
  // Get available accounts
  const accounts = db.getAvailableAccounts(product.id, quantity);
  
  if (accounts.length < quantity) {
    purchaseStates.delete(userId);
    return bot.sendMessage(chatId,
      `❌ *Lỗi hệ thống*\n\n` +
      `Không thể lấy đủ số lượng tài khoản.\n` +
      `Vui lòng thử lại sau.`
    ).then(() => true);
  }
  
  // Mark accounts as sold
  db.markAccountsAsSold(product.id, accounts, userId);
  
  // Deduct balance
  db.updateUserBalance(userId, -totalPrice, `Mua ${quantity}x ${product.name}`);
  
  // Clear purchase state
  purchaseStates.delete(userId);
  
  // Send accounts to user
  let accountsMessage = `✅ *Mua hàng thành công!*\n\n`;
  accountsMessage += `📝 Sản phẩm: ${product.name}\n`;
  accountsMessage += `📊 Số lượng: ${quantity} tài khoản\n`;
  accountsMessage += `💵 Tổng tiền: ${totalPrice.toLocaleString('vi-VN')}đ\n`;
  accountsMessage += `💰 Số dư còn lại: ${(userBalance.balance - totalPrice).toLocaleString('vi-VN')}đ\n\n`;
  accountsMessage += `📋 *Thông tin tài khoản:*\n\n`;
  
  accounts.forEach((account, index) => {
    accountsMessage += `${index + 1}. Tài khoản ${index + 1}:\n`;
    accountsMessage += `   👤 Username: ${account.username}\n`;
    accountsMessage += `   🔑 Password: ${account.password}\n\n`;
  });
  
  accountsMessage += `💡 Vui lòng lưu lại thông tin tài khoản!`;
  
  Logger.info(`[BUY] User ${userId} đã mua ${quantity}x ${product.name} với giá ${totalPrice}đ`);
  
  return bot.sendMessage(chatId, accountsMessage).then(() => true);
};