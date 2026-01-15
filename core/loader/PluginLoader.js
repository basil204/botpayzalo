const fs = require('fs');
const path = require('path');
const Logger = require('../../utils/logger');

/**
 * Plugin Loader
 */
class PluginLoader {
  constructor(bot) {
    this.bot = bot;
    this.commands = new Map();
    this.events = new Map();
  }

  /**
   * Load all commands
   */
  loadCommands() {
    const commandsDir = path.join(__dirname, '..', '..', 'plugins', 'commands');
    
    if (!fs.existsSync(commandsDir)) {
      Logger.warn(`Commands directory not found: ${commandsDir}`);
      return;
    }

    const files = fs.readdirSync(commandsDir).filter(file => 
      file.endsWith('.js') && !file.startsWith('_')
    );

    for (const file of files) {
      try {
        const commandPath = path.join(commandsDir, file);
        const command = require(commandPath);
        
        if (command.name && command.execute) {
          this.commands.set(command.name, command);
          Logger.success(`Loaded command: ${command.name}`);
        } else {
          Logger.warn(`Invalid command file: ${file}`);
        }
      } catch (error) {
        Logger.error(`Error loading command ${file}: ${error.message}`);
      }
    }
  }

  /**
   * Load all events
   */
  loadEvents() {
    const eventsDir = path.join(__dirname, '..', '..', 'plugins', 'events');
    
    if (!fs.existsSync(eventsDir)) {
      Logger.warn(`Events directory not found: ${eventsDir}`);
      return;
    }

    const files = fs.readdirSync(eventsDir).filter(file => 
      file.endsWith('.js') && !file.startsWith('_')
    );

    for (const file of files) {
      try {
        const eventPath = path.join(eventsDir, file);
        const event = require(eventPath);
        
        if (event.name && event.execute) {
          this.events.set(event.name, event);
          Logger.success(`Loaded event: ${event.name}`);
        } else {
          Logger.warn(`Invalid event file: ${file}`);
        }
      } catch (error) {
        Logger.error(`Error loading event ${file}: ${error.message}`);
      }
    }
  }

  /**
   * Register commands with bot
   */
  registerCommands() {
    for (const [name, command] of this.commands) {
      if (command.pattern) {
        this.bot.onText(command.pattern, async (msg, match) => {
          try {
            await command.execute(this.bot, msg, match);
          } catch (error) {
            Logger.error(`Error executing command ${name}: ${error.message}`);
          }
        });
      }
    }
  }

  /**
   * Register events with bot
   */
  registerEvents() {
    for (const [name, event] of this.events) {
      if (event.eventName) {
        this.bot.on(event.eventName, async (...args) => {
          try {
            await event.execute(this.bot, ...args);
          } catch (error) {
            Logger.error(`Error executing event ${name}: ${error.message}`);
          }
        });
      }
    }
  }

  /**
   * Load all plugins
   */
  loadAll() {
    Logger.info('Loading plugins...');
    this.loadCommands();
    this.loadEvents();
    this.registerCommands();
    this.registerEvents();
    Logger.success(`Loaded ${this.commands.size} commands and ${this.events.size} events`);
  }
}

module.exports = PluginLoader;

