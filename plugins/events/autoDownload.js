const { downloadMedia, detectPlatform } = require('../../utils/mediaDownloader');
const Logger = require('../../utils/logger');

/**
 * Auto Download event - Auto detect URLs in messages and download
 */
module.exports = {
  name: 'autoDownload',
  eventName: 'message',
  async execute(bot, msg) {
    // Only process text messages
    if (!msg.text || msg.text.startsWith('/')) {
      return; // Skip commands
    }
    
    const chatId = msg.chat?.id;
    const messageText = msg.text || '';
    
    // Extract URLs from message
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    const urls = messageText.match(urlRegex);
    
    if (!urls || urls.length === 0) {
      return; // No URLs found
    }
    
    // Check if any URL is from supported platforms
    let supportedUrl = null;
    let platform = null;
    
    for (const url of urls) {
      const detectedPlatform = detectPlatform(url);
      if (detectedPlatform !== 'unknown') {
        supportedUrl = url;
        platform = detectedPlatform;
        break;
      }
    }
    
    if (!supportedUrl) {
      return; // No supported URLs
    }
    
    Logger.info(`[AUTO DOWNLOAD] Detected ${platform} URL: ${supportedUrl}`);
    
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
    
    try {
      await bot.sendMessage(chatId,
        `${icon} *Đã phát hiện link ${platform.toUpperCase()}!*\n\n` +
        `🔗 ${supportedUrl}\n\n` +
        `⏳ Đang xử lý download...`
      );
      
      // Download media
      const mediaData = await downloadMedia(supportedUrl);
      
      if (!mediaData || !mediaData.medias || mediaData.medias.length === 0) {
        return bot.sendMessage(chatId,
          `❌ Không thể tải media từ URL này!\n\n` +
          `💡 Vui lòng thử lại sau hoặc sử dụng lệnh /download <url>`
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
      
      // List all media files (limit to 5 to avoid message too long)
      const mediasToShow = mediaData.medias.slice(0, 5);
      mediasToShow.forEach((media, index) => {
        responseMsg += `${index + 1}. ${media.qualityLabel || media.quality}\n`;
        if (media.size) {
          responseMsg += `   📦 ${media.size}\n`;
        }
        if (media.resolution) {
          responseMsg += `   📐 ${media.resolution}\n`;
        }
        responseMsg += `   🔗 ${media.url}\n\n`;
      });
      
      if (mediaData.medias.length > 5) {
        responseMsg += `\n... và ${mediaData.medias.length - 5} file khác.\n`;
        responseMsg += `💡 Sử dụng /download <url> để xem tất cả.`;
      }
      
      // Send response
      await bot.sendMessage(chatId, responseMsg);
      
    } catch (error) {
      Logger.error(`[AUTO DOWNLOAD] Error: ${error.message}`);
      await bot.sendMessage(chatId,
        `❌ *Lỗi khi download!*\n\n` +
        `🔗 ${supportedUrl}\n` +
        `❌ ${error.message}\n\n` +
        `💡 Vui lòng thử lại sau hoặc sử dụng lệnh /download <url>`
      );
    }
  }
};

