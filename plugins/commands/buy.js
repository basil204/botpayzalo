const Logger = require('../../utils/logger');
const Database = require('../../utils/db');
const naptienCommand = require('./naptien');

const db = new Database();

// Ensure polling is started
if (naptienCommand.startPolling) {
  // Will be started when bot is ready via naptienPolling event
}

// Constants
const MAX_QUANTITY_PER_PURCHASE = 20;

// Store user purchase state
const purchaseStates = new Map(); // userId -> { productId, product, step }

/**
 * Generate random 8 character code (letters and numbers)
 */
function generateRandomCode() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < 8; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

/**
 * Generate VietQR image URL
 */
function generateVietQRUrl(amount, content) {
  const BANK_ACCOUNT = '334218';
  const BANK_CODE = 'MB';
  const template = 'compact2';
  const url = `https://img.vietqr.io/image/${BANK_CODE}-${BANK_ACCOUNT}-${template}.jpg?amount=${amount}&addInfo=${content}`;
  return url;
}

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
      message += `   .buy ${productList[0]?.id || '1'}\n\n`;
      message += `📌 Mỗi lần mua tối đa ${MAX_QUANTITY_PER_PURCHASE} tài khoản`;
      
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
    
    const maxQuantity = Math.min(MAX_QUANTITY_PER_PURCHASE, availableCount);
    
    return bot.sendMessage(chatId,
      `🛒 *Chọn số lượng*\n\n` +
      `📝 Sản phẩm: ${product.name}\n` +
      `💰 Giá: ${product.price.toLocaleString('vi-VN')}đ/1 tài khoản\n` +
      `📦 Còn lại: ${availableCount} tài khoản\n\n` +
      `💡 Vui lòng nhập số lượng muốn mua (1-${maxQuantity}):\n` +
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
  const maxQuantity = Math.min(MAX_QUANTITY_PER_PURCHASE, availableCount);
  
  if (quantity > maxQuantity) {
    purchaseStates.delete(userId);
    return bot.sendMessage(chatId,
      `❌ *Số lượng vượt quá giới hạn*\n\n` +
      `📦 Số lượng tối đa: ${maxQuantity} tài khoản\n` +
      `Bạn yêu cầu: ${quantity} tài khoản.\n\n` +
      `💡 Vui lòng chọn lại số lượng hoặc sản phẩm khác.`
    ).then(() => true);
  }
  
  const totalPrice = product.price * quantity;
  const userBalance = db.getUserBalance(userId);
  
  // Clear purchase state
  purchaseStates.delete(userId);
  
  // Check if user has enough balance
  if (userBalance.balance >= totalPrice) {
    // User has enough balance, process purchase immediately
    return await processPurchase(bot, chatId, userId, product, quantity, totalPrice).then(() => true);
  } else {
    // Not enough balance, create QR code for payment
    return await createPurchaseQR(bot, chatId, userId, product, quantity, totalPrice).then(() => true);
  }
};

/**
 * Process purchase with balance
 */
async function processPurchase(bot, chatId, userId, product, quantity, totalPrice) {
  try {
    // Get available accounts
    const accounts = db.getAvailableAccounts(product.id, quantity);
    
    if (accounts.length < quantity) {
      return bot.sendMessage(chatId,
        `❌ *Lỗi hệ thống*\n\n` +
        `Không thể lấy đủ số lượng tài khoản.\n` +
        `Vui lòng thử lại sau.`
      );
    }
    
    // Mark accounts as sold
    db.markAccountsAsSold(product.id, accounts, userId);
    
    // Deduct balance
    db.updateUserBalance(userId, -totalPrice, `Mua ${quantity}x ${product.name}`);
    
    // Send accounts to user
    let accountsMessage = `✅ *Mua hàng thành công!*\n\n`;
    accountsMessage += `📝 Sản phẩm: ${product.name}\n`;
    accountsMessage += `📊 Số lượng: ${quantity} tài khoản\n`;
    accountsMessage += `💵 Tổng tiền: ${totalPrice.toLocaleString('vi-VN')}đ\n`;
    
    const userBalance = db.getUserBalance(userId);
    accountsMessage += `💰 Số dư còn lại: ${userBalance.balance.toLocaleString('vi-VN')}đ\n\n`;
    accountsMessage += `📋 *Thông tin tài khoản:*\n\n`;
    
    accounts.forEach((account, index) => {
      accountsMessage += `${index + 1}. Tài khoản ${index + 1}:\n`;
      accountsMessage += `   👤 Username: ${account.username}\n`;
      accountsMessage += `   🔑 Password: ${account.password}\n\n`;
    });
    
    accountsMessage += `💡 Vui lòng lưu lại thông tin tài khoản!`;
    
    Logger.info(`[BUY] User ${userId} đã mua ${quantity}x ${product.name} với giá ${totalPrice}đ`);
    
    return bot.sendMessage(chatId, accountsMessage);
  } catch (error) {
    Logger.error(`[BUY] Lỗi khi xử lý mua hàng: ${error.message}`);
    return bot.sendMessage(chatId,
      `❌ *Lỗi khi xử lý mua hàng*\n\n` +
      `Vui lòng thử lại sau.`
    );
  }
}

/**
 * Create QR code for purchase payment
 */
async function createPurchaseQR(bot, chatId, userId, product, quantity, totalPrice) {
  try {
    // Generate random code
    const code = generateRandomCode();
    const transactionId = `purchase-${userId}-${Date.now()}-${code}`;
    
    // Create pending purchase transaction
    db.addPendingTransaction(transactionId, {
      type: 'purchase',
      userId: userId,
      chatId: chatId,
      amount: totalPrice,
      code: code,
      status: 'pending',
      productId: product.id,
      productName: product.name,
      quantity: quantity
    });
    
    // Generate QR code URL
    const qrUrl = generateVietQRUrl(totalPrice, code);
    
    // Send QR code image
    try {
      if (typeof bot.sendPhoto === 'function') {
        await bot.sendPhoto(chatId, qrUrl);
      } else if (bot._request && typeof bot._request === 'function') {
        await bot._request('sendPhoto', {
          form: {
            chat_id: chatId,
            photo: qrUrl
          }
        });
      } else {
        await bot.sendMessage(chatId, `🖼️ QR Code: ${qrUrl}`);
      }
      
      // Send instruction message
      await bot.sendMessage(chatId,
        `💳 *QR Code thanh toán mua hàng*\n\n` +
        `📝 Sản phẩm: ${product.name}\n` +
        `📊 Số lượng: ${quantity} tài khoản\n` +
        `💰 Số tiền: ${totalPrice.toLocaleString('vi-VN')}đ\n` +
        `🔑 Mã giao dịch: *${code}*\n\n` +
        `📱 *Hướng dẫn:*\n` +
        `1. Mở ứng dụng ngân hàng MB\n` +
        `2. Quét QR code trên\n` +
        `3. Kiểm tra số tiền và mã giao dịch\n` +
        `4. Nhập nội dung chuyển khoản: *${code}*\n` +
        `5. Xác nhận chuyển khoản\n\n` +
        `⏰ QR code có hiệu lực trong 5 phút\n` +
        `💡 Sau khi thanh toán thành công, tài khoản sẽ được giao tự động`
      );
      
      Logger.info(`[BUY] Đã tạo QR code cho purchase user ${userId}, product: ${product.name}, quantity: ${quantity}, amount: ${totalPrice}, code: ${code}`);
    } catch (error) {
      Logger.error(`[BUY] Lỗi khi gửi QR code: ${error.message}`);
      
      // Remove pending transaction on error
      db.removePendingTransaction(transactionId);
      
      await bot.sendMessage(chatId,
        `❌ *Lỗi khi tạo QR code*\n\n` +
        `Vui lòng thử lại sau.`
      );
    }
  } catch (error) {
    Logger.error(`[BUY] Lỗi khi tạo QR code: ${error.message}`);
    return bot.sendMessage(chatId,
      `❌ *Lỗi khi tạo QR code*\n\n` +
      `Vui lòng thử lại sau.`
    );
  }
}
