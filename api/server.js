const express = require('express');
const bodyParser = require('body-parser');
const Logger = require('../utils/logger');

/**
 * API Server for sending messages
 */
class ApiServer {
  constructor(bot) {
    this.bot = bot;
    this.app = express();
    this.port = process.env.API_PORT || 7855;
    
    // Middleware
    this.app.use(bodyParser.json());
    this.app.use(bodyParser.urlencoded({ extended: true }));
    
    // Routes
    this.setupRoutes();
  }

  setupRoutes() {
    // Health check
    this.app.get('/health', (req, res) => {
      res.json({ status: 'ok', message: 'API server is running' });
    });

    // Send message to specific user
    this.app.post('/send-message', async (req, res) => {
      try {
        const { message, chatId } = req.body;
        const targetChatId = chatId || '655e072f987b7125286a';

        if (!message) {
          return res.status(400).json({
            success: false,
            error: 'Message is required'
          });
        }

        // Send message using bot
        await this.bot.sendMessage(targetChatId, message);
        
        Logger.success(`API: Đã gửi tin nhắn đến ${targetChatId}`);
        
        res.json({
          success: true,
          message: 'Message sent successfully',
          chatId: targetChatId
        });
      } catch (error) {
        Logger.error(`API: Lỗi khi gửi tin nhắn: ${error.message}`);
        res.status(500).json({
          success: false,
          error: error.message
        });
      }
    });

    // Send message to specific user (GET method for easy testing)
    this.app.get('/send-message', async (req, res) => {
      try {
        const { message, chatId } = req.query;
        const targetChatId = chatId || '655e072f987b7125286a';

        if (!message) {
          return res.status(400).json({
            success: false,
            error: 'Message is required. Use ?message=your_message'
          });
        }

        // Send message using bot
        await this.bot.sendMessage(targetChatId, message);
        
        Logger.success(`API: Đã gửi tin nhắn đến ${targetChatId}`);
        
        res.json({
          success: true,
          message: 'Message sent successfully',
          chatId: targetChatId
        });
      } catch (error) {
        Logger.error(`API: Lỗi khi gửi tin nhắn: ${error.message}`);
        res.status(500).json({
          success: false,
          error: error.message
        });
      }
    });
  }

  start() {
    this.app.listen(this.port, () => {
      Logger.success(`🌐 API Server đang chạy tại http://localhost:${this.port}`);
      Logger.info(`📡 Endpoints:`);
      Logger.info(`   GET/POST /send-message - Gửi tin nhắn đến 655e072f987b7125286a`);
      Logger.info(`   GET /health - Kiểm tra trạng thái server`);
    });
  }
}

module.exports = ApiServer;

