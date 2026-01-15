const Logger = require('../../utils/logger');

/**
 * Daily check event - Schedule daily checks
 */
module.exports = {
  name: 'dailyCheck',
  eventName: 'ready',
  async execute(bot) {
    // Import phatnguoi command to get runDailyChecks function
    const phatnguoiCommand = require('../commands/phatnguoi');
    
    if (!phatnguoiCommand.runDailyChecks) {
      Logger.warn('runDailyChecks function not found in phatnguoi command');
      return;
    }

    // Schedule daily checks at 8:00 AM
    function scheduleDailyChecks() {
      const now = new Date();
      const tomorrow = new Date(now);
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(8, 0, 0, 0); // 8:00 AM

      const msUntilTomorrow = tomorrow.getTime() - now.getTime();
      
      Logger.info(`Đã lên lịch check hằng ngày vào 8:00 sáng ngày mai (${tomorrow.toLocaleString('vi-VN')})`);

      setTimeout(() => {
        // Run check first time
        phatnguoiCommand.runDailyChecks(bot);
        
        // Then run every 24 hours
        setInterval(() => {
          phatnguoiCommand.runDailyChecks(bot);
        }, 24 * 60 * 60 * 1000); // 24 hours
      }, msUntilTomorrow);
    }

    // Start scheduler
    scheduleDailyChecks();
  }
};

