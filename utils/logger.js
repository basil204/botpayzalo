/**
 * Logger utility
 */
class Logger {
  static log(message, type = 'info') {
    const timestamp = new Date().toLocaleString('vi-VN');
    const prefix = {
      info: '📝',
      success: '✅',
      warning: '⚠️',
      error: '❌',
      debug: '🔍'
    }[type] || '📝';

    console.log(`[${timestamp}] ${prefix} ${message}`);
  }

  static info(message) {
    this.log(message, 'info');
  }

  static success(message) {
    this.log(message, 'success');
  }

  static warn(message) {
    this.log(message, 'warning');
  }

  static error(message) {
    this.log(message, 'error');
  }

  static debug(message) {
    this.log(message, 'debug');
  }
}

module.exports = Logger;

