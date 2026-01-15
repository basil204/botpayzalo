const fs = require('fs');
const path = require('path');
const Helpers = require('./helpers');

/**
 * Database utility for JSON files
 */
class Database {
  constructor(dataDir = path.join(__dirname, '..', 'data')) {
    this.dataDir = dataDir;
    this.ensureDataDir();
  }

  ensureDataDir() {
    if (!fs.existsSync(this.dataDir)) {
      fs.mkdirSync(this.dataDir, { recursive: true });
    }
  }

  /**
   * Get file path
   */
  getFilePath(filename) {
    return path.join(this.dataDir, filename);
  }

  /**
   * Load data from file
   */
  load(filename, defaultValue = {}) {
    const filePath = this.getFilePath(filename);
    return Helpers.loadJSON(filePath, defaultValue);
  }

  /**
   * Save data to file
   */
  save(filename, data) {
    const filePath = this.getFilePath(filename);
    return Helpers.saveJSON(filePath, data);
  }

  /**
   * Welcome data
   */
  getWelcomeData() {
    return this.load('welcome.json', { welcomedChats: [] });
  }

  saveWelcomeData(data) {
    return this.save('welcome.json', data);
  }

  /**
   * Daily check data
   */
  getDailyCheckData() {
    return this.load('dailycheck.json', { registrations: {} });
  }

  saveDailyCheckData(data) {
    return this.save('dailycheck.json', data);
  }

  /**
   * Checklive data
   */
  getCheckliveData() {
    return this.load('checklive.json', { users: {} });
  }

  saveCheckliveData(data) {
    return this.save('checklive.json', data);
  }

  /**
   * User balance data
   */
  getBalanceData() {
    return this.load('balance.json', { users: {} });
  }

  saveBalanceData(data) {
    return this.save('balance.json', data);
  }

  /**
   * Get user balance
   */
  getUserBalance(userId) {
    const data = this.getBalanceData();
    return data.users[userId] || { balance: 0, transactions: [] };
  }

  /**
   * Update user balance
   */
  updateUserBalance(userId, amount, description = '') {
    const data = this.getBalanceData();
    if (!data.users[userId]) {
      data.users[userId] = { balance: 0, transactions: [] };
    }
    
    data.users[userId].balance = (data.users[userId].balance || 0) + amount;
    data.users[userId].transactions = data.users[userId].transactions || [];
    
    data.users[userId].transactions.push({
      amount: amount,
      description: description,
      timestamp: new Date().toISOString(),
      type: amount > 0 ? 'deposit' : 'withdraw'
    });
    
    // Keep only last 100 transactions
    if (data.users[userId].transactions.length > 100) {
      data.users[userId].transactions = data.users[userId].transactions.slice(-100);
    }
    
    this.saveBalanceData(data);
    return data.users[userId];
  }

  /**
   * Pending transactions (QR codes waiting for payment)
   */
  getPendingTransactions() {
    return this.load('pending_transactions.json', { transactions: {} });
  }

  savePendingTransactions(data) {
    return this.save('pending_transactions.json', data);
  }

  /**
   * Add pending transaction
   */
  addPendingTransaction(transactionId, data) {
    const pending = this.getPendingTransactions();
    pending.transactions[transactionId] = {
      ...data,
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 5 * 60 * 1000).toISOString() // 5 minutes
    };
    this.savePendingTransactions(pending);
    return pending.transactions[transactionId];
  }

  /**
   * Remove pending transaction
   */
  removePendingTransaction(transactionId) {
    const pending = this.getPendingTransactions();
    if (pending.transactions[transactionId]) {
      delete pending.transactions[transactionId];
      this.savePendingTransactions(pending);
      return true;
    }
    return false;
  }

  /**
   * Get pending transaction by code
   */
  getPendingTransactionByCode(code) {
    const pending = this.getPendingTransactions();
    for (const [id, transaction] of Object.entries(pending.transactions)) {
      if (transaction.code === code) {
        return { id, ...transaction };
      }
    }
    return null;
  }

  /**
   * Transaction history (refNo tracking)
   */
  getTransactionHistory() {
    return this.load('transaction_history.json', { refNos: {} });
  }

  saveTransactionHistory(data) {
    return this.save('transaction_history.json', data);
  }

  /**
   * Add refNo to history
   */
  addRefNoToHistory(refNo, transactionId) {
    const history = this.getTransactionHistory();
    history.refNos[refNo] = {
      transactionId: transactionId,
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString() // 5 days
    };
    this.saveTransactionHistory(history);
    return history.refNos[refNo];
  }

  /**
   * Check if refNo exists
   */
  refNoExists(refNo) {
    const history = this.getTransactionHistory();
    return !!history.refNos[refNo];
  }

  /**
   * Products data
   */
  getProductsData() {
    return this.load('products.json', { products: {}, nextId: 1 });
  }

  saveProductsData(data) {
    return this.save('products.json', data);
  }

  /**
   * Get all products
   */
  getAllProducts() {
    const data = this.getProductsData();
    return data.products || {};
  }

  /**
   * Get product by ID
   */
  getProduct(productId) {
    const data = this.getProductsData();
    return data.products[productId] || null;
  }

  /**
   * Add product
   */
  addProduct(name, price) {
    const data = this.getProductsData();
    if (!data.products) {
      data.products = {};
    }
    if (typeof data.nextId !== 'number') {
      // Migrate: tìm ID lớn nhất và set nextId
      const existingIds = Object.keys(data.products).map(id => {
        // Nếu là timestamp, bỏ qua
        if (/^\d{13}$/.test(id)) {
          return 0;
        }
        const numId = parseInt(id);
        return isNaN(numId) ? 0 : numId;
      });
      data.nextId = existingIds.length > 0 ? Math.max(...existingIds, 0) + 1 : 1;
    }
    
    const productId = data.nextId.toString();
    data.products[productId] = {
      id: productId,
      name: name,
      price: parseInt(price),
      createdAt: new Date().toISOString(),
      accounts: [] // List of accounts (tk|mk)
    };
    
    // Tăng nextId cho lần sau
    data.nextId++;
    
    this.saveProductsData(data);
    return data.products[productId];
  }

  /**
   * Update product
   */
  updateProduct(productId, name, price) {
    const data = this.getProductsData();
    if (!data.products[productId]) {
      return null;
    }
    
    if (name) {
      data.products[productId].name = name;
    }
    if (price !== undefined) {
      data.products[productId].price = parseInt(price);
    }
    
    this.saveProductsData(data);
    return data.products[productId];
  }

  /**
   * Delete product
   */
  deleteProduct(productId) {
    const data = this.getProductsData();
    if (data.products[productId]) {
      delete data.products[productId];
      this.saveProductsData(data);
      return true;
    }
    return false;
  }

  /**
   * Add accounts to product
   */
  addAccountsToProduct(productId, accountsText) {
    const data = this.getProductsData();
    if (!data.products[productId]) {
      return null;
    }
    
    if (!data.products[productId].accounts) {
      data.products[productId].accounts = [];
    }
    
    // Parse accounts (format: tk|mk, mỗi dòng 1 tk)
    const lines = accountsText.split('\n').map(line => line.trim()).filter(line => line);
    const newAccounts = [];
    
    for (const line of lines) {
      const parts = line.split('|').map(p => p.trim());
      if (parts.length >= 2) {
        newAccounts.push({
          username: parts[0],
          password: parts[1],
          sold: false,
          soldAt: null,
          soldTo: null
        });
      }
    }
    
    data.products[productId].accounts = data.products[productId].accounts.concat(newAccounts);
    this.saveProductsData(data);
    
    return {
      product: data.products[productId],
      added: newAccounts.length
    };
  }

  /**
   * Get available accounts for product
   */
  getAvailableAccounts(productId, quantity) {
    const product = this.getProduct(productId);
    if (!product || !product.accounts) {
      return [];
    }
    
    const available = product.accounts.filter(acc => !acc.sold);
    return available.slice(0, quantity);
  }

  /**
   * Mark accounts as sold
   */
  markAccountsAsSold(productId, accounts, userId) {
    const data = this.getProductsData();
    if (!data.products[productId]) {
      return false;
    }
    
    const accountIds = accounts.map(acc => {
      if (typeof acc === 'object' && acc.username) {
        return acc.username;
      }
      return acc;
    });
    
    let soldCount = 0;
    for (const account of data.products[productId].accounts) {
      if (!account.sold && accountIds.includes(account.username)) {
        account.sold = true;
        account.soldAt = new Date().toISOString();
        account.soldTo = userId;
        soldCount++;
      }
    }
    
    if (soldCount > 0) {
      this.saveProductsData(data);
    }
    
    return soldCount;
  }
}

module.exports = Database;

