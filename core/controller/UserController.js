const Database = require('../../utils/db');
const Helpers = require('../../utils/helpers');

/**
 * User Controller
 */
class UserController {
  constructor() {
    this.db = new Database();
    this.config = Helpers.loadConfig();
  }

  /**
   * Check if user is admin
   */
  isAdmin(userId) {
    return Helpers.isAdmin(userId, this.config);
  }

  /**
   * Get user info
   */
  getUserInfo(msg) {
    return {
      id: msg.from?.id || 'Không có',
      display_name: msg.from?.display_name || msg.from?.first_name || 'Không có',
      is_bot: msg.from?.is_bot || false,
      username: msg.from?.username || 'Không có',
      chat_id: msg.chat?.id || 'Không có',
      chat_type: msg.chat?.type || 'Không có'
    };
  }

  /**
   * Check if chat is welcomed
   */
  isChatWelcomed(chatId) {
    const data = this.db.getWelcomeData();
    return data.welcomedChats && data.welcomedChats.includes(chatId);
  }

  /**
   * Mark chat as welcomed
   */
  markChatAsWelcomed(chatId) {
    const data = this.db.getWelcomeData();
    
    if (!data.welcomedChats) {
      data.welcomedChats = [];
    }

    if (!data.welcomedChats.includes(chatId)) {
      data.welcomedChats.push(chatId);
      this.db.saveWelcomeData(data);
      return true;
    }

    return false;
  }

  /**
   * Get all chat IDs
   */
  getAllChatIds() {
    const data = this.db.getWelcomeData();
    return data.welcomedChats || [];
  }
}

module.exports = UserController;

