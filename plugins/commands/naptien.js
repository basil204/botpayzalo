const Logger = require('../../utils/logger');
const Database = require('../../utils/db');
const axios = require('axios');
const path = require('path');
const fs = require('fs');

const db = new Database();

// Bank config
const BANK_ACCOUNT = '334218';
const BANK_CODE = 'MB';
const API_URL = 'http://160.191.245.27:6868/';

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
  // VietQR API format: https://img.vietqr.io/image/{bankCode}-{accountNumber}-{template}.jpg?amount={amount}&addInfo={content}
  const template = 'compact2'; // compact2 is a common template
  const url = `https://img.vietqr.io/image/${BANK_CODE}-${BANK_ACCOUNT}-${template}.jpg?amount=${amount}&addInfo=${content}`;
  return url;
}

/**
 * Check transaction history from API
 */
async function checkTransactionHistory() {
  try {
    // Generate refNo for request (format: accountNo-YYYYMMDDHHmmss)
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');
    const timestamp = `${year}${month}${day}${hours}${minutes}${seconds}00`;
    const refNo = `${BANK_ACCOUNT}-${timestamp}`;
    
    // List of possible endpoints to try
    const endpoints = [
      { method: 'POST', url: API_URL, data: { refNo: refNo } },
      { method: 'GET', url: API_URL, params: { refNo: refNo } },
      { method: 'POST', url: `${API_URL}transaction`, data: { refNo: refNo } },
      { method: 'POST', url: `${API_URL}api/transaction`, data: { refNo: refNo } },
      { method: 'POST', url: `${API_URL}history`, data: { refNo: refNo } },
      { method: 'GET', url: `${API_URL}transaction`, params: { refNo: refNo } }
    ];

    let lastError = null;
    
    for (const endpoint of endpoints) {
      try {
        let response;
        const config = {
          timeout: 10000,
          headers: {
            'Content-Type': 'application/json'
          }
        };

        if (endpoint.method === 'POST') {
          response = await axios.post(endpoint.url, endpoint.data, config);
        } else {
          config.params = endpoint.params;
          response = await axios.get(endpoint.url, config);
        }

        // Check if response is valid
        if (response && response.data) {
          // Check if response has the expected structure
          if (response.data.result && response.data.result.ok) {
            Logger.info(`[NAPTIEN] API call thành công với endpoint: ${endpoint.method} ${endpoint.url}`);
            return response.data.transactionHistoryList || [];
          }
          // Sometimes API might return data directly
          if (Array.isArray(response.data.transactionHistoryList)) {
            Logger.info(`[NAPTIEN] API call thành công với endpoint: ${endpoint.method} ${endpoint.url}`);
            return response.data.transactionHistoryList;
          }
          // Check if data is array directly
          if (Array.isArray(response.data)) {
            Logger.info(`[NAPTIEN] API call thành công với endpoint: ${endpoint.method} ${endpoint.url}`);
            return response.data;
          }
        }
      } catch (error) {
        lastError = error;
        // Continue to next endpoint if 404
        if (error.response && error.response.status === 404) {
          continue;
        }
        // For other errors, log and continue
        if (error.response) {
          Logger.warn(`[NAPTIEN] Endpoint ${endpoint.method} ${endpoint.url} failed: ${error.response.status}`);
        }
      }
    }

    // If all endpoints failed, log the last error
    if (lastError) {
      if (lastError.response) {
        Logger.error(`[NAPTIEN] Tất cả endpoints đều thất bại. Lỗi cuối: ${lastError.response.status} - ${lastError.response.statusText}`);
        if (lastError.response.data) {
          Logger.error(`[NAPTIEN] Response data: ${JSON.stringify(lastError.response.data)}`);
        }
      } else {
        Logger.error(`[NAPTIEN] Lỗi khi check transaction history: ${lastError.message}`);
      }
    }
    
    return [];
  } catch (error) {
    Logger.error(`[NAPTIEN] Lỗi không mong đợi: ${error.message}`);
    return [];
  }
}

/**
 * Find transaction by code in history
 */
function findTransactionByCode(transactions, code, amount) {
  if (!transactions || !Array.isArray(transactions)) {
    return null;
  }

  for (const transaction of transactions) {
    // Check if addDescription contains the code
    const addDesc = (transaction.addDescription || '').toUpperCase();
    const description = (transaction.description || '').toUpperCase();
    const codeUpper = code.toUpperCase();
    
    if ((addDesc.includes(codeUpper) || description.includes(codeUpper)) && 
        transaction.creditAmount && 
        parseInt(transaction.creditAmount) === parseInt(amount)) {
      return transaction;
    }
  }
  return null;
}

/**
 * Process purchase transaction and deliver accounts
 */
async function processPurchaseTransaction(bot, transaction, transactionId) {
  try {
    const Database = require('../../utils/db');
    const db = new Database();
    const Logger = require('../../utils/logger');
    
    const productId = transaction.productId;
    const quantity = transaction.quantity || 1;
    const productName = transaction.productName || 'Sản phẩm';
    
    // Get product
    const product = db.getProduct(productId);
    if (!product) {
      Logger.error(`[NAPTIEN] Không tìm thấy sản phẩm ${productId} cho purchase transaction ${transactionId}`);
      await bot.sendMessage(transaction.chatId,
        `❌ *Lỗi hệ thống*\n\n` +
        `Không tìm thấy sản phẩm. Vui lòng liên hệ admin.`
      );
      return;
    }
    
    // Check available accounts
    const availableCount = (product.accounts || []).filter(acc => !acc.sold).length;
    if (availableCount < quantity) {
      Logger.error(`[NAPTIEN] Không đủ tài khoản cho purchase transaction ${transactionId}`);
      // Refund to balance
      db.updateUserBalance(
        transaction.userId,
        parseInt(transaction.amount),
        `Hoàn tiền - Không đủ hàng - Mã: ${transaction.code}`
      );
      await bot.sendMessage(transaction.chatId,
        `❌ *Sản phẩm đã hết hàng*\n\n` +
        `💰 Số tiền đã được hoàn lại vào tài khoản.\n` +
        `Vui lòng thử lại sau.`
      );
      return;
    }
    
    // Get available accounts
    const accounts = db.getAvailableAccounts(productId, quantity);
    if (accounts.length < quantity) {
      Logger.error(`[NAPTIEN] Không thể lấy đủ tài khoản cho purchase transaction ${transactionId}`);
      // Refund to balance
      db.updateUserBalance(
        transaction.userId,
        parseInt(transaction.amount),
        `Hoàn tiền - Lỗi hệ thống - Mã: ${transaction.code}`
      );
      await bot.sendMessage(transaction.chatId,
        `❌ *Lỗi hệ thống*\n\n` +
        `💰 Số tiền đã được hoàn lại vào tài khoản.\n` +
        `Vui lòng thử lại sau.`
      );
      return;
    }
    
    // Mark accounts as sold
    db.markAccountsAsSold(productId, accounts, transaction.userId);
    
    // Record transaction (payment was direct, no balance change needed)
    // Just log for tracking purposes
    Logger.info(`[NAPTIEN] Purchase transaction recorded: ${transaction.code}, amount: ${transaction.amount}, product: ${productName}, quantity: ${quantity}`);
    
    // Send accounts to user
    let accountsMessage = `✅ *Thanh toán thành công - Tài khoản đã được giao!*\n\n`;
    accountsMessage += `📝 Sản phẩm: ${productName}\n`;
    accountsMessage += `📊 Số lượng: ${quantity} tài khoản\n`;
    accountsMessage += `💵 Tổng tiền: ${parseInt(transaction.amount).toLocaleString('vi-VN')}đ\n`;
    accountsMessage += `🔑 Mã giao dịch: ${transaction.code}\n\n`;
    accountsMessage += `📋 *Thông tin tài khoản:*\n\n`;
    
    accounts.forEach((account, index) => {
      accountsMessage += `${index + 1}. Tài khoản ${index + 1}:\n`;
      accountsMessage += `   👤 Username: ${account.username}\n`;
      accountsMessage += `   🔑 Password: ${account.password}\n\n`;
    });
    
    accountsMessage += `💡 Vui lòng lưu lại thông tin tài khoản!`;
    
    await bot.sendMessage(transaction.chatId, accountsMessage);
    
    Logger.info(`[NAPTIEN] Đã giao ${quantity}x ${productName} cho user ${transaction.userId} qua purchase transaction ${transactionId}`);
  } catch (error) {
    Logger.error(`[NAPTIEN] Lỗi khi xử lý purchase transaction ${transactionId}: ${error.message}`);
    try {
      await bot.sendMessage(transaction.chatId,
        `❌ *Lỗi khi giao hàng*\n\n` +
        `Vui lòng liên hệ admin để được hỗ trợ.`
      );
    } catch (err) {
      Logger.error(`[NAPTIEN] Lỗi khi gửi thông báo lỗi: ${err.message}`);
    }
  }
}

/**
 * Process pending transactions
 */
async function processPendingTransactions(bot) {
  const pending = db.getPendingTransactions();
  const now = new Date();
  const transactions = await checkTransactionHistory();

  for (const [transactionId, transaction] of Object.entries(pending.transactions)) {
    try {
      // Check if expired (5 minutes)
      const expiresAt = new Date(transaction.expiresAt);
      if (now > expiresAt) {
        // Send cancellation message
        try {
          await bot.sendMessage(transaction.chatId,
            `⏰ *QR Code đã hết hạn*\n\n` +
            `💰 Số tiền: ${parseInt(transaction.amount).toLocaleString('vi-VN')}đ\n` +
            `🔑 Mã giao dịch: ${transaction.code}\n\n` +
            `QR code đã bị hủy sau 5 phút không có giao dịch.`
          );
        } catch (err) {
          Logger.error(`[NAPTIEN] Lỗi khi gửi thông báo hủy: ${err.message}`);
        }
        
        // Remove from pending
        db.removePendingTransaction(transactionId);
        Logger.info(`[NAPTIEN] Đã hủy transaction ${transactionId} (hết hạn)`);
        continue;
      }

      // Check if transaction found
      const foundTransaction = findTransactionByCode(transactions, transaction.code, transaction.amount);
      
      if (foundTransaction) {
        // Check if refNo already processed
        if (db.refNoExists(foundTransaction.refNo)) {
          Logger.info(`[NAPTIEN] RefNo ${foundTransaction.refNo} đã được xử lý trước đó`);
          continue;
        }

        // Add refNo to history
        db.addRefNoToHistory(foundTransaction.refNo, transactionId);

        // Check transaction type
        if (transaction.type === 'purchase') {
          // Handle purchase transaction
          await processPurchaseTransaction(bot, transaction, transactionId);
        } else {
          // Handle top-up transaction
          const userBalance = db.updateUserBalance(
            transaction.userId,
            parseInt(transaction.amount),
            `Nạp tiền - Mã: ${transaction.code}`
          );

          // Send success message
          try {
            await bot.sendMessage(transaction.chatId,
              `✅ *Nạp tiền thành công!*\n\n` +
              `💰 Số tiền: ${parseInt(transaction.amount).toLocaleString('vi-VN')}đ\n` +
              `🔑 Mã giao dịch: ${transaction.code}\n` +
              `📊 Số dư hiện tại: ${userBalance.balance.toLocaleString('vi-VN')}đ\n\n` +
              `Cảm ơn bạn đã sử dụng dịch vụ!`
            );
          } catch (err) {
            Logger.error(`[NAPTIEN] Lỗi khi gửi thông báo thành công: ${err.message}`);
          }
        }

        // Remove from pending
        db.removePendingTransaction(transactionId);
        Logger.info(`[NAPTIEN] Đã xử lý thành công transaction ${transactionId}`);
      }
    } catch (error) {
      Logger.error(`[NAPTIEN] Lỗi khi xử lý transaction ${transactionId}: ${error.message}`);
    }
  }
}

/**
 * Cleanup old refNos (older than 5 days)
 */
function cleanupOldRefNos() {
  const history = db.getTransactionHistory();
  const now = new Date();
  let cleaned = 0;

  for (const [refNo, data] of Object.entries(history.refNos)) {
    const expiresAt = new Date(data.expiresAt);
    if (now > expiresAt) {
      delete history.refNos[refNo];
      cleaned++;
    }
  }

  if (cleaned > 0) {
    db.saveTransactionHistory(history);
    Logger.info(`[NAPTIEN] Đã xóa ${cleaned} refNo cũ`);
  }
}

/**
 * Start polling for pending transactions
 */
let pollingInterval = null;

function startPolling(bot) {
  if (pollingInterval) {
    return; // Already started
  }

  // Process every 30 seconds
  pollingInterval = setInterval(async () => {
    await processPendingTransactions(bot);
    cleanupOldRefNos();
  }, 30000); // 30 seconds

  Logger.info('[NAPTIEN] Đã bắt đầu polling transactions');
}

function stopPolling() {
  if (pollingInterval) {
    clearInterval(pollingInterval);
    pollingInterval = null;
    Logger.info('[NAPTIEN] Đã dừng polling transactions');
  }
}

/**
 * Nap tien command
 */
module.exports = {
  name: 'naptien',
  pattern: /^\.naptien(?:\s+(\d+))?/,
  async execute(bot, msg, match) {
    const chatId = msg.chat.id;
    const userId = msg.from?.id || chatId.toString();
    const amountStr = match[1] ? match[1].trim() : '';

    // Start polling if not started
    if (!pollingInterval) {
      startPolling(bot);
    }

    // Check if amount provided
    if (!amountStr) {
      return bot.sendMessage(chatId,
        `💳 *Nạp tiền vào tài khoản*\n\n` +
        `💡 Cú pháp: .naptien <số_tiền>\n\n` +
        `📋 Ví dụ:\n` +
        `   .naptien 100000\n` +
        `   .naptien 50000\n\n` +
        `💰 Số tiền tối thiểu: 10,000đ\n` +
        `💰 Số tiền tối đa: 10,000,000đ`
      );
    }

    // Parse amount
    const amount = parseInt(amountStr);
    if (isNaN(amount) || amount < 10000 || amount > 10000000) {
      return bot.sendMessage(chatId,
        `❌ *Số tiền không hợp lệ*\n\n` +
        `💰 Số tiền phải từ 10,000đ đến 10,000,000đ\n\n` +
        `💡 Ví dụ: .naptien 100000`
      );
    }

    // Check if user already has a pending transaction
    const existingTransaction = db.getPendingTransactionByUserId(userId);
    if (existingTransaction) {
      const expiresAt = new Date(existingTransaction.expiresAt);
      const now = new Date();
      const minutesLeft = Math.ceil((expiresAt - now) / (1000 * 60));
      
      const transactionType = existingTransaction.type === 'purchase' ? 'mua hàng' : 'nạp tiền';
      
      return bot.sendMessage(chatId,
        `⏸️ *Bạn đã có giao dịch đang chờ xử lý*\n\n` +
        `🔑 Mã giao dịch: *${existingTransaction.code}*\n` +
        `💰 Số tiền: ${parseInt(existingTransaction.amount).toLocaleString('vi-VN')}đ\n` +
        `📋 Loại: ${transactionType}\n` +
        `⏰ Còn lại: ${minutesLeft} phút\n\n` +
        `💡 Vui lòng đợi giao dịch này hoàn thành hoặc hết hạn trước khi tạo giao dịch mới.`
      );
    }

    // Generate random code
    const code = generateRandomCode();
    const transactionId = `${userId}-${Date.now()}-${code}`;

    // Create pending transaction
    db.addPendingTransaction(transactionId, {
      userId: userId,
      chatId: chatId,
      amount: amount,
      code: code,
      status: 'pending'
    });

    // Generate QR code URL
    const qrUrl = generateVietQRUrl(amount, code);

    // Send QR code image
    try {
      // Try to send photo using sendimage logic
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
        // Fallback: send URL
        await bot.sendMessage(chatId, `🖼️ QR Code: ${qrUrl}`);
      }

      Logger.info(`[NAPTIEN] Đã tạo QR code cho user ${userId}, amount: ${amount}, code: ${code}`);
    } catch (error) {
      Logger.error(`[NAPTIEN] Lỗi khi gửi QR code: ${error.message}`);
      
      // Remove pending transaction on error
      db.removePendingTransaction(transactionId);
      
      await bot.sendMessage(chatId,
        `❌ *Lỗi khi tạo QR code*\n\n` +
        `Vui lòng thử lại sau.`
      );
    }
  },

  // Export functions for external use
  startPolling,
  stopPolling,
  processPendingTransactions,
  cleanupOldRefNos
};