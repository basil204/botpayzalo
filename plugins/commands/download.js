const { downloadMedia, detectPlatform } = require('../../utils/mediaDownloader');
const Logger = require('../../utils/logger');

/**
 * Download command - Auto detect and download media from URLs
 */
module.exports = {
  name: 'download',
  pattern: /^\.download(.*)/,
  async execute(bot, msg, match) {
    const chatId = msg.chat.id;
    const args = match[1] ? match[1].trim() : '';
    
    // Extract URL from args or message text
    let url = args;
    
    // If no URL in args, try to extract from message text
    if (!url && msg.text) {
      const urlRegex = /(https?:\/\/[^\s]+)/g;
      const matches = msg.text.match(urlRegex);
      if (matches && matches.length > 0) {
        url = matches[0];
      }
    }
    
    if (!url) {
      return bot.sendMessage(chatId,
        `📥 *Download Media*\n\n` +
        `💡 Cú pháp: /download <url>\n\n` +
        `📋 Hỗ trợ:\n` +
        `   • TikTok\n` +
        `   • YouTube\n` +
        `   • Instagram\n` +
        `   • Facebook\n` +
        `   • Twitter/X\n` +
        `   • Threads\n` +
        `   • Douyin\n` +
        `   • Spotify\n\n` +
        `💡 Hoặc gửi trực tiếp URL trong tin nhắn để bot tự động nhận diện.`
      );
    }
    
    // Detect platform
    const platform = detectPlatform(url);
    
    if (platform === 'unknown') {
      return bot.sendMessage(chatId,
        `❌ Không hỗ trợ URL này!\n\n` +
        `💡 Bot chỉ hỗ trợ:\n` +
        `   TikTok, YouTube, Instagram, Facebook, Twitter, Threads, Douyin, Spotify`
      );
    }
    
    // Send processing message
    const platformIcons = {
      tiktok: '🎵',
      youtube: '📺',
      instagram: '📷',
      facebook: '👥',
      twitter: '🐦',
      threads: '🧵',
      douyin: '🎬',
      spotify: '🎵'
    };
    
    const icon = platformIcons[platform] || '📥';
    
    await bot.sendMessage(chatId,
      `${icon} *Đang xử lý...*\n\n` +
      `🔗 URL: ${url}\n` +
      `📱 Platform: ${platform.toUpperCase()}\n\n` +
      `⏳ Vui lòng đợi...`
    );
    
    try {
      // Download media
      const mediaData = await downloadMedia(url);
      
      if (!mediaData || !mediaData.medias || mediaData.medias.length === 0) {
        return bot.sendMessage(chatId,
          `❌ Không thể tải media từ URL này!\n\n` +
          `💡 Vui lòng kiểm tra lại URL hoặc thử lại sau.`
        );
      }
      
      // Format response message
      let responseMsg = `✅ *Download thành công!*\n\n`;
      responseMsg += `📱 Platform: ${platform.toUpperCase()}\n`;
      if (mediaData.title) {
        responseMsg += `📝 Title: ${mediaData.title}\n`;
      }
      if (mediaData.author && mediaData.author !== 'Unknown') {
        responseMsg += `👤 Author: ${mediaData.author}\n`;
      }
      if (mediaData.duration) {
        responseMsg += `⏱️ Duration: ${mediaData.duration}\n`;
      }
      responseMsg += `\n📥 *Download links:*\n\n`;
      
      // List all media files
      mediaData.medias.forEach((media, index) => {
        responseMsg += `${index + 1}. ${media.qualityLabel || media.quality}\n`;
        if (media.size) {
          responseMsg += `   📦 Size: ${media.size}\n`;
        }
        if (media.resolution) {
          responseMsg += `   📐 Resolution: ${media.resolution}\n`;
        }
        responseMsg += `   🔗 ${media.url}\n\n`;
      });
      
      // Send response
      await bot.sendMessage(chatId, responseMsg);
      
    } catch (error) {
      Logger.error(`[DOWNLOAD] Error: ${error.message}`);
      return bot.sendMessage(chatId,
        `❌ *Lỗi khi download!*\n\n` +
        `🔗 URL: ${url}\n` +
        `❌ Lỗi: ${error.message}\n\n` +
        `💡 Vui lòng thử lại sau hoặc kiểm tra URL.`
      );
    }
  }
};

