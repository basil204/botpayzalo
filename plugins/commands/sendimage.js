const Logger = require('../../utils/logger');
const path = require('path');
const fs = require('fs');

/**
 * Send Media command - Send image, video, or file from URL or local file
 */
module.exports = {
  name: 'sendimage',
  pattern: /^\.send(image|video|file)(.*)/,
  async execute(bot, msg, match) {
    const chatId = msg.chat.id;
    const mediaType = match[1] || 'image'; // image, video, file
    const args = match[2] ? match[2].trim() : '';
    
    // Default paths/URLs
    const defaultPaths = {
      image: 'https://photo.salekit.com/uploads/fchat_5b4872d13803896dd77125af/cach-lay-link-bai-viet-facebook1.jpg',
      video: path.join(__dirname, '..', '..', 'data', 'tải xuống.mp4'),
      file: path.join(__dirname, '..', '..', 'data', 'dailycheck.json')
    };
    
    // Get path/URL from args or use default
    let mediaPath = args || defaultPaths[mediaType];
    
    if (!mediaPath) {
      return bot.sendMessage(chatId,
        `❌ *Thiếu đường dẫn*\n\n` +
        `💡 Cú pháp: .send${mediaType} <url_hoặc_filepath>\n\n` +
        `📋 Ví dụ:\n` +
        `   .sendimage <url_ảnh>\n` +
        `   .sendvideo <url_video>\n` +
        `   .sendfile <url_file>\n\n` +
        `💡 Hoặc dùng mặc định:\n` +
        `   .sendimage - Gửi ảnh mặc định\n` +
        `   .sendvideo - Gửi video mặc định\n` +
        `   .sendfile - Gửi file mặc định`
      );
    }
    
    // Check if it's a local file path or URL
    const isUrl = mediaPath.startsWith('http://') || mediaPath.startsWith('https://');
    let filePath = null;
    
    if (!isUrl) {
      // It's a local file path
      // Resolve relative paths from project root
      if (!path.isAbsolute(mediaPath)) {
        filePath = path.join(__dirname, '..', '..', mediaPath);
      } else {
        filePath = mediaPath;
      }
      
      // Check if file exists
      if (!fs.existsSync(filePath)) {
        return bot.sendMessage(chatId,
          `❌ *File không tồn tại*\n\n` +
          `📁 Đường dẫn: ${filePath}\n\n` +
          `💡 Vui lòng kiểm tra lại đường dẫn file.`
        );
      }
    }
    
    try {
      // Determine the source (URL or filepath)
      const source = isUrl ? mediaPath : filePath;
      
      // Send Photo
      if (mediaType === 'image') {
        // Try method 1: Use sendPhoto if it exists
        if (typeof bot.sendPhoto === 'function') {
          await bot.sendPhoto(chatId, source);
          Logger.info(`[SENDIMAGE] Đã gửi ảnh đến ${chatId} bằng sendPhoto`);
          return;
        }
        
        // Try method 2: Use _request method with sendPhoto endpoint
        if (bot._request && typeof bot._request === 'function') {
          await bot._request('sendPhoto', {
            form: {
              chat_id: chatId,
              photo: isUrl ? source : fs.createReadStream(source)
            }
          });
          Logger.info(`[SENDIMAGE] Đã gửi ảnh đến ${chatId} bằng _request`);
          return;
        }
      }
      
      // Send Video
      if (mediaType === 'video') {
        // Try method 1: Use sendVideo if it exists
        if (typeof bot.sendVideo === 'function') {
          await bot.sendVideo(chatId, source);
          Logger.info(`[SENDVIDEO] Đã gửi video đến ${chatId} bằng sendVideo`);
          return;
        }
        
        // Try method 2: Use _request method with sendVideo endpoint
        if (bot._request && typeof bot._request === 'function') {
          await bot._request('sendVideo', {
            form: {
              chat_id: chatId,
              video: isUrl ? source : fs.createReadStream(source)
            }
          });
          Logger.info(`[SENDVIDEO] Đã gửi video đến ${chatId} bằng _request`);
          return;
        }
      }
      
      // Send Document/File
      if (mediaType === 'file') {
        // Try method 1: Use sendDocument if it exists
        if (typeof bot.sendDocument === 'function') {
          await bot.sendDocument(chatId, source);
          Logger.info(`[SENDFILE] Đã gửi file đến ${chatId} bằng sendDocument`);
          return;
        }
        
        // Try method 2: Use _request method with sendDocument endpoint
        if (bot._request && typeof bot._request === 'function') {
          await bot._request('sendDocument', {
            form: {
              chat_id: chatId,
              document: isUrl ? source : fs.createReadStream(source)
            }
          });
          Logger.info(`[SENDFILE] Đã gửi file đến ${chatId} bằng _request`);
          return;
        }
      }
      
      // Fallback: Send path/URL as message
      const mediaIcons = {
        image: '🖼️',
        video: '🎥',
        file: '📎'
      };
      
      const mediaNames = {
        image: 'Hình ảnh',
        video: 'Video',
        file: 'File'
      };
      
      const icon = mediaIcons[mediaType] || '📎';
      const name = mediaNames[mediaType] || 'File';
      
      await bot.sendMessage(chatId, 
        `${icon} *${name}*\n\n` +
        `${isUrl ? '🔗' : '📁'} ${isUrl ? source : path.basename(source)}`
      );
      Logger.info(`[SEND${mediaType.toUpperCase()}] Đã gửi link ${mediaType} đến ${chatId}`);
      
    } catch (error) {
      Logger.error(`[SEND${mediaType.toUpperCase()}] Lỗi: ${error.message}`);
      
      // Final fallback: Send path/URL as message with error notice
      try {
        const mediaIcons = {
          image: '🖼️',
          video: '🎥',
          file: '📎'
        };
        
        const mediaNames = {
          image: 'Hình ảnh',
          video: 'Video',
          file: 'File'
        };
        
        const icon = mediaIcons[mediaType] || '📎';
        const name = mediaNames[mediaType] || 'File';
        const source = isUrl ? mediaPath : filePath;
        
        await bot.sendMessage(chatId, 
          `${icon} *${name}*\n\n` +
          `${isUrl ? '🔗' : '📁'} ${isUrl ? source : path.basename(source)}\n\n` +
          `❌ Không thể gửi ${name.toLowerCase()} trực tiếp.\n` +
          `${isUrl ? 'Vui lòng mở link trên.' : 'Vui lòng kiểm tra lại file.'}`
        );
      } catch (err) {
        Logger.error(`[SEND${mediaType.toUpperCase()}] Lỗi khi gửi tin nhắn: ${err.message}`);
      }
    }
  }
};

