const Logger = require('../../utils/logger');

/**
 * Message Logger event - Log all user messages
 */
module.exports = {
  name: 'messageLogger',
  eventName: 'message',
  async execute(bot, msg) {
    const chatId = msg.chat?.id;
    const userId = msg.from?.id;
    const senderName = msg.from?.display_name || msg.from?.first_name || 'Unknown';
    const messageText = msg.text || '';
    const messageType = msg.message_type || (msg.photo ? 'CHAT_PHOTO' : msg.sticker ? 'CHAT_STICKER' : msg.video ? 'CHAT_VIDEO' : 'CHAT_TEXT');
    
    // Format log message (multi-line)
    let logMessage = `\n📨 [${senderName}]`;
    if (userId) {
      logMessage += ` (ID: ${userId})`;
    }
    // logMessage += `\n → Chat: ${chatId}`;
    
    // Add message type and content based on Zalo Bot API structure
    if (messageType === 'CHAT_TEXT' || (!messageType && messageText)) {
      if (messageText) {
        logMessage += `\n📄 ${messageText}`;
        if (messageText.startsWith('/')) {
          logMessage += ` [COMMAND]`;
        }
      } else {
        logMessage += `\n📄 (Text message - no content)`;
      }
    } else if (messageType === 'CHAT_PHOTO' || messageType === 'PHOTO') {
      logMessage += `\n🖼️ Photo`;
      if (msg.photo_url) {
        logMessage += `\n   URL: ${msg.photo_url}`;
      }
      if (msg.caption) {
        logMessage += `\n   Caption: ${msg.caption}`;
      }
    } else if (messageType === 'CHAT_STICKER' || messageType === 'STICKER') {
      logMessage += `\n😊 Sticker`;
      if (msg.sticker_url) {
        logMessage += `\n   URL: ${msg.sticker_url}`;
      }
    } else if (messageType === 'CHAT_VIDEO' || messageType === 'VIDEO') {
      logMessage += `\n🎥 Video`;
      if (msg.video_url) {
        logMessage += `\n   URL: ${msg.video_url}`;
      }
    } else {
      logMessage += `\n📦 ${messageType || 'Unknown'}`;
      // Log additional info if available
      if (msg.photo_url) logMessage += ` (Photo URL available)`;
      if (msg.sticker_url) logMessage += ` (Sticker URL available)`;
      if (msg.video_url) logMessage += ` (Video URL available)`;
    }
    
    // Add message ID and date if available
    if (msg.message_id) {
    //   logMessage += `\n   Message ID: ${msg.message_id}`;
    }
    if (msg.date) {
      const date = new Date(msg.date);
      logMessage += `\n📅 Date: ${date.toLocaleString('vi-VN')}`;
    }
    
    // Log to console
    Logger.info(logMessage);
    
    // Log full message object (formatted JSON)
    try {
      const fullMsg = JSON.stringify(msg, null, 2);
    //   Logger.debug(`Full message object:\n${fullMsg}`);
    } catch (error) {
    //   Logger.debug(`Full message object (circular reference): ${Object.keys(msg).join(', ')}`);
    }
  }
};

