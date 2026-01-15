const buyCommand = require('../commands/buy');
const adminProduct = require('../commands/admin_product');

/**
 * Event to handle quantity input for buy command and account input for admin
 */
module.exports = {
  name: 'buyHandler',
  eventName: 'message',
  async execute(bot, msg) {
    // Skip if it's a command
    if (msg.text && (msg.text.startsWith('/') || msg.text.startsWith('.'))) {
      return;
    }
    
    // Check if admin is adding accounts
    if (adminProduct.handleAccountInput) {
      try {
        const handled = await adminProduct.handleAccountInput(bot, msg);
        if (handled) {
          return; // Already handled
        }
      } catch (error) {
        // Silently ignore errors
      }
    }
  }
};