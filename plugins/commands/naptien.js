const Logger = require('../../utils/logger');
const Database = require('../../utils/db');
const axios = require('axios');
const path = require('path');
const fs = require('fs');
const Helpers = require('../../utils/helpers');

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
            const transactions = response.data.transactionHistoryList || [];
            Logger.info(`[NAPTIEN] ✅ API call thành công với endpoint: ${endpoint.method} ${endpoint.url}, nhận được ${transactions.length} giao dịch`);
            return transactions;
          }
          // Sometimes API might return data directly
          if (Array.isArray(response.data.transactionHistoryList)) {
            Logger.info(`[NAPTIEN] ✅ API call thành công với endpoint: ${endpoint.method} ${endpoint.url}, nhận được ${response.data.transactionHistoryList.length} giao dịch`);
            return response.data.transactionHistoryList;
          }
          // Check if data is array directly
          if (Array.isArray(response.data)) {
            Logger.info(`[NAPTIEN] ✅ API call thành công với endpoint: ${endpoint.method} ${endpoint.url}, nhận được ${response.data.length} giao dịch`);
            return response.data;
          }
          
          // Log unexpected structure
          Logger.warn(`[NAPTIEN] ⚠️ API trả về structure không mong đợi từ ${endpoint.method} ${endpoint.url}: ${JSON.stringify(Object.keys(response.data))}`);
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
    Logger.warn(`[NAPTIEN] findTransactionByCode: transactions không phải array hoặc null`);
    return null;
  }

  if (!code || !amount) {
    Logger.warn(`[NAPTIEN] findTransactionByCode: code hoặc amount không hợp lệ - code: ${code}, amount: ${amount}`);
    return null;
  }

  const codeUpper = code.toUpperCase().trim();
  const targetAmount = parseInt(amount);
  
  if (isNaN(targetAmount) || targetAmount <= 0) {
    Logger.warn(`[NAPTIEN] findTransactionByCode: amount không hợp lệ - ${amount}`);
    return null;
  }
  
  Logger.info(`[NAPTIEN] Đang tìm transaction với code: "${code}", amount: ${targetAmount}, trong ${transactions.length} giao dịch`);

  // Tìm tất cả transactions có cùng amount để log chi tiết
  const matchingAmountTransactions = [];
  
  for (let i = 0; i < transactions.length; i++) {
    const transaction = transactions[i];
    try {
      // Check if addDescription contains the code
      const addDesc = (transaction.addDescription || '').toUpperCase().trim();
      const description = (transaction.description || '').toUpperCase().trim();
      
      // Parse creditAmount - handle both string and number
      let creditAmount = 0;
      if (transaction.creditAmount !== undefined && transaction.creditAmount !== null) {
        creditAmount = parseInt(transaction.creditAmount);
        if (isNaN(creditAmount)) {
          creditAmount = 0;
        }
      }
      
      // Check code match - tìm code trong cả addDescription và description
      // Code có thể xuất hiện ở bất kỳ đâu trong chuỗi
      // Sử dụng includes() để tìm substring
      const hasCodeInAddDesc = addDesc.includes(codeUpper);
      const hasCodeInDesc = description.includes(codeUpper);
      const hasCode = hasCodeInAddDesc || hasCodeInDesc;
      
      // Amount match - so sánh chính xác
      const amountMatch = creditAmount === targetAmount;
      
      // Lưu lại các transaction có cùng amount để log sau
      if (amountMatch) {
        matchingAmountTransactions.push({
          index: i + 1,
          refNo: transaction.refNo || 'N/A',
          addDesc: addDesc,
          description: description,
          hasCode: hasCode
        });
      }
      
      // Log chi tiết cho transactions có cùng amount HOẶC có code
      if (amountMatch || hasCode) {
        Logger.info(`[NAPTIEN] Checking transaction ${i + 1}/${transactions.length} - RefNo: ${transaction.refNo || 'N/A'}: addDesc="${addDesc.substring(0, 200)}", desc="${description.substring(0, 200)}", amount=${creditAmount}, hasCode=${hasCode}, amountMatch=${amountMatch}, codeSearch="${codeUpper}"`);
      }
      
      if (hasCode && amountMatch) {
        Logger.info(`[NAPTIEN] ✅ Tìm thấy matching transaction! RefNo: ${transaction.refNo}, addDesc: "${addDesc}", description: "${description}", amount: ${creditAmount}, code: ${codeUpper}`);
        return transaction;
      }
      
      // Log for debugging if code matches but amount doesn't
      if (hasCode && !amountMatch) {
        Logger.warn(`[NAPTIEN] ⚠️ Code "${code}" tìm thấy nhưng amount không khớp: expected ${targetAmount}, got ${creditAmount} (RefNo: ${transaction.refNo || 'N/A'})`);
      }
      
      // Log for debugging if amount matches but code doesn't
      if (!hasCode && amountMatch) {
        Logger.warn(`[NAPTIEN] ⚠️ Amount ${targetAmount} khớp nhưng code "${code}" không tìm thấy trong: addDesc="${addDesc.substring(0, 200)}", desc="${description.substring(0, 200)}" (RefNo: ${transaction.refNo || 'N/A'})`);
      }
    } catch (error) {
      Logger.error(`[NAPTIEN] Lỗi khi xử lý transaction ${i + 1} trong findTransactionByCode: ${error.message}`);
    }
  }
  
  // Log summary của các transactions có cùng amount
  if (matchingAmountTransactions.length > 0) {
    Logger.warn(`[NAPTIEN] Tìm thấy ${matchingAmountTransactions.length} transactions có amount ${targetAmount} nhưng không có code "${code}":`);
    matchingAmountTransactions.forEach(t => {
      Logger.warn(`[NAPTIEN]   - Transaction ${t.index}: RefNo=${t.refNo}, hasCode=${t.hasCode}, addDesc="${t.addDesc.substring(0, 150)}"`);
    });
  }
  
  Logger.info(`[NAPTIEN] ❌ Không tìm thấy transaction matching code "${code}" và amount ${targetAmount} trong ${transactions.length} giao dịch`);
  return null;
}

/**
 * Notify admins about successful purchase
 */
async function notifyAdminsPurchase(bot, userId, product, quantity, totalPrice, paymentMethod) {
  try {
    const config = Helpers.loadConfig();
    const admins = config.admins || [];
    
    if (admins.length === 0) {
      return;
    }
    
    const paymentMethodText = paymentMethod === 'balance' ? 'Số dư' : 'QR Code';
    
    const adminMessage = `🛒 *Thông báo: Có người mua hàng thành công!*\n\n` +
      `👤 User ID: ${userId}\n` +
      `📝 Sản phẩm: ${product.name}\n` +
      `📊 Số lượng: ${quantity} tài khoản\n` +
      `💵 Tổng tiền: ${totalPrice.toLocaleString('vi-VN')}đ\n` +
      `💳 Phương thức: ${paymentMethodText}\n\n` +
      `✅ Đã giao hàng thành công!`;
    
    // Send to all admins
    for (const adminId of admins) {
      try {
        await bot.sendMessage(adminId, adminMessage);
      } catch (error) {
        Logger.warn(`[NAPTIEN] Không thể gửi thông báo đến admin ${adminId}: ${error.message}`);
      }
    }
    
    Logger.info(`[NAPTIEN] Đã thông báo cho ${admins.length} admin về giao dịch mua hàng của user ${userId}`);
  } catch (error) {
    Logger.error(`[NAPTIEN] Lỗi khi thông báo admin: ${error.message}`);
  }
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
    
    // Notify admins
    await notifyAdminsPurchase(bot, transaction.userId, product, quantity, parseInt(transaction.amount), 'QR Code');
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
  try {
    const pending = db.getPendingTransactions();
    const now = new Date();
    
    const pendingCount = Object.keys(pending.transactions || {}).length;
    if (pendingCount === 0) {
      return; // No pending transactions
    }
    
    Logger.info(`[NAPTIEN] Đang kiểm tra ${pendingCount} giao dịch pending...`);
    
    const transactions = await checkTransactionHistory();
    Logger.info(`[NAPTIEN] Đã lấy ${transactions.length} giao dịch từ API`);

    for (const [transactionId, transaction] of Object.entries(pending.transactions)) {
      try {
        Logger.info(`[NAPTIEN] Đang xử lý transaction ${transactionId}, code: ${transaction.code}, amount: ${transaction.amount}, type: ${transaction.type || 'top-up'}`);
        
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
          Logger.info(`[NAPTIEN] Tìm thấy giao dịch matching! RefNo: ${foundTransaction.refNo}, Code: ${transaction.code}, Amount: ${transaction.amount}`);
          
          // Check if refNo already processed
          if (db.refNoExists(foundTransaction.refNo)) {
            Logger.info(`[NAPTIEN] RefNo ${foundTransaction.refNo} đã được xử lý trước đó`);
            // Remove from pending if already processed
            db.removePendingTransaction(transactionId);
            continue;
          }

          // Add refNo to history
          db.addRefNoToHistory(foundTransaction.refNo, transactionId);

          // Check transaction type
          if (transaction.type === 'purchase') {
            Logger.info(`[NAPTIEN] Xử lý purchase transaction ${transactionId}`);
            // Handle purchase transaction
            await processPurchaseTransaction(bot, transaction, transactionId);
          } else {
            Logger.info(`[NAPTIEN] Xử lý top-up transaction ${transactionId}`);
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
        } else {
          Logger.info(`[NAPTIEN] Chưa tìm thấy giao dịch matching cho code ${transaction.code}, amount ${transaction.amount}`);
        }
      } catch (error) {
        Logger.error(`[NAPTIEN] Lỗi khi xử lý transaction ${transactionId}: ${error.message}`);
        Logger.error(`[NAPTIEN] Stack: ${error.stack}`);
      }
    }
  } catch (error) {
    Logger.error(`[NAPTIEN] Lỗi không mong đợi trong processPendingTransactions: ${error.message}`);
    Logger.error(`[NAPTIEN] Stack: ${error.stack}`);
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
    Logger.info('[NAPTIEN] Polling đã được khởi động trước đó');
    return; // Already started
  }

  // Process immediately on start
  processPendingTransactions(bot).catch(err => {
    Logger.error(`[NAPTIEN] Lỗi trong lần check đầu tiên: ${err.message}`);
  });

  // Process every 15 seconds (giảm từ 30s để check nhanh hơn)
  pollingInterval = setInterval(async () => {
    try {
      await processPendingTransactions(bot);
      cleanupOldRefNos();
    } catch (error) {
      Logger.error(`[NAPTIEN] Lỗi trong polling interval: ${error.message}`);
    }
  }, 15000); // 15 seconds

  Logger.info('[NAPTIEN] Đã bắt đầu polling transactions (interval: 15 giây)');
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
        `💡 Sử dụng .cancel hoặc .huy để hủy giao dịch này trước khi tạo giao dịch mới.`
      );
    }

    // Generate random code
    const code = generateRandomCode();
    const transactionId = `${userId}-${Date.now()}-${code}`;

    // Create pending transaction
    const transactionData = {
      userId: userId,
      chatId: chatId,
      amount: amount,
      code: code,
      status: 'pending'
    };
    
    db.addPendingTransaction(transactionId, transactionData);
    Logger.info(`[NAPTIEN] Đã tạo pending transaction: ${transactionId}, code: ${code}, amount: ${amount}, userId: ${userId}`);

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
      
      // Auto check transaction after delay (đợi một chút để API có thời gian cập nhật)
      // Check nhiều lần với delay tăng dần để tăng khả năng phát hiện
      const checkDelays = [5000, 10000, 15000, 20000]; // 5s, 10s, 15s, 20s
      checkDelays.forEach((delay, index) => {
        setTimeout(async () => {
          Logger.info(`[NAPTIEN] Auto-check transaction lần ${index + 1} cho code: ${code}`);
          const pending = db.getPendingTransactions();
          // Chỉ check nếu transaction vẫn còn pending
          if (pending.transactions && pending.transactions[transactionId]) {
            await processPendingTransactions(bot);
          } else {
            Logger.info(`[NAPTIEN] Transaction ${transactionId} đã được xử lý, dừng auto-check`);
          }
        }, delay);
      });
      
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