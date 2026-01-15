const Logger = require('../../utils/logger');
const naptienCommand = require('../commands/naptien');

/**
 * Event to start naptien polling when bot is ready
 */
module.exports = {
  name: 'naptienPolling',
  eventName: 'ready',
  async execute(bot) {
    // Start polling for pending transactions
    naptienCommand.startPolling(bot);
    Logger.info('[NAPTIEN] Đã khởi động polling system cho nạp tiền');
  }
};