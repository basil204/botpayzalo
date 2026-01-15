const ZaloBot = require("node-zalo-bot");
const PluginLoader = require('./core/loader/PluginLoader');
const Logger = require('./utils/logger');
const Helpers = require('./utils/helpers');
const ApiServer = require('./api/server');

// Load config
const config = Helpers.loadConfig();
const BOT_TOKEN = process.env.BOT_TOKEN || "3201372705688922504:JeEFJZCBVOmtAJdIxSLstDrcIpshYXNuKLdrTVenffQumzzYKWwDWbJQehNpoirX";

// Initialize bot with polling
const bot = new ZaloBot(BOT_TOKEN, {
  polling: true
});

// Handle polling errors
bot.on('polling_error', (error) => {
  // Timeout errors (408) are normal when no new updates
  if (error.code === 'EZALO' && (error.message.includes('408') || error.message.includes('timeout'))) {
    return; // Ignore timeout errors
  }
  
  Logger.error(`Polling error: ${error.code} ${error.message}`);
});

// Handle general bot errors
bot.on('error', (error) => {
  Logger.error(`Bot error: ${error.message}`);
});

// Initialize plugin loader
const pluginLoader = new PluginLoader(bot);

// Load all plugins
pluginLoader.loadAll();

// Handle bot ready event
bot.on('ready', () => {
  Logger.success('Bot đã sẵn sàng và đang lắng nghe tin nhắn...');
});

// Log startup
Logger.info('🤖 Zalo Bot đang chạy...');
Logger.info('🔄 Polling mode: ON - Bot đang lắng nghe tin nhắn...');

// Check polling status after a moment
setTimeout(() => {
  if (bot.isPolling && typeof bot.isPolling === 'function') {
    const isPolling = bot.isPolling();
    Logger.info(`📡 Polling status: ${isPolling ? 'Đang chạy' : 'Đã dừng'}`);
  }
}, 2000);

// Initialize API Server
const apiServer = new ApiServer(bot);
apiServer.start();

module.exports = bot;

