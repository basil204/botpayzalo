const fs = require('fs');
const path = require('path');

/**
 * Helper functions
 */
class Helpers {
  /**
   * Load JSON file safely
   */
  static loadJSON(filePath, defaultValue = {}) {
    try {
      if (!fs.existsSync(filePath)) {
        return defaultValue;
      }
      
      const data = fs.readFileSync(filePath, 'utf8').trim();
      
      if (!data || data.length === 0) {
        return defaultValue;
      }
      
      return JSON.parse(data);
    } catch (error) {
      console.error(`Lỗi khi đọc file ${filePath}:`, error.message);
      return defaultValue;
    }
  }

  /**
   * Save JSON file safely
   */
  static saveJSON(filePath, data) {
    try {
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
      return true;
    } catch (error) {
      console.error(`Lỗi khi lưu file ${filePath}:`, error);
      return false;
    }
  }

  /**
   * Load config
   */
  static loadConfig() {
    const configPath = path.join(__dirname, '..', 'config.json');
    return this.loadJSON(configPath, {
      admins: ['655e072f987b7125286a'],
      phatnguoi: {
        cooldown: 15,
        chunk_size: 5
      }
    });
  }

  /**
   * Check if user is admin
   */
  static isAdmin(userId, config = null) {
    if (!config) {
      config = this.loadConfig();
    }
    return userId && config.admins && config.admins.includes(userId);
  }

  /**
   * Normalize string
   */
  static normalize(str) {
    return (str || '').toLowerCase().trim();
  }

  /**
   * Strip spaces
   */
  static stripSpaces(str) {
    return (str || '').replace(/\s+/g, ' ').trim();
  }

  /**
   * Delay
   */
  static delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = Helpers;

