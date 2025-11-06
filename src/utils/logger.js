/**
 * Logging System
 * Centralized logging with levels and formatting
 */

import { LOG_LEVELS, DEFAULT_LOG_LEVEL } from '../config/constants.js';

/**
 * Logger Class
 */
export class Logger {
  constructor(name = 'App', level = DEFAULT_LOG_LEVEL) {
    this.name = name;
    this.level = level;
    this.logs = [];
    this.maxLogs = 1000; // Keep last 1000 logs
  }

  /**
   * Log message
   */
  log(level, message, data = {}) {
    if (level < this.level) return;

    const logEntry = {
      timestamp: new Date().toISOString(),
      level: this.getLevelName(level),
      name: this.name,
      message,
      data
    };

    // Format log message
    const formatted = this.formatLog(logEntry);

    // Console output
    this.consoleLog(level, formatted, data);

    // Store log
    this.logs.push(logEntry);
    if (this.logs.length > this.maxLogs) {
      this.logs.shift();
    }
  }

  /**
   * Format log entry
   */
  formatLog(entry) {
    const time = new Date(entry.timestamp).toLocaleTimeString();
    const level = entry.level.padEnd(5);
    const name = entry.name.padEnd(15);
    return `[${time}] ${level} ${name} ${entry.message}`;
  }

  /**
   * Console log with appropriate method
   */
  consoleLog(level, message, data) {
    if (level === LOG_LEVELS.ERROR) {
      console.error(message, data);
    } else if (level === LOG_LEVELS.WARN) {
      console.warn(message, data);
    } else if (level === LOG_LEVELS.DEBUG) {
      console.debug(message, data);
    } else {
      console.log(message, data);
    }
  }

  /**
   * Get level name
   */
  getLevelName(level) {
    const names = ['DEBUG', 'INFO', 'WARN', 'ERROR', 'NONE'];
    return names[level] || 'UNKNOWN';
  }

  /**
   * Set log level
   */
  setLevel(level) {
    this.level = level;
  }

  /**
   * Debug log
   */
  debug(message, data = {}) {
    this.log(LOG_LEVELS.DEBUG, message, data);
  }

  /**
   * Info log
   */
  info(message, data = {}) {
    this.log(LOG_LEVELS.INFO, message, data);
  }

  /**
   * Warn log
   */
  warn(message, data = {}) {
    this.log(LOG_LEVELS.WARN, message, data);
  }

  /**
   * Error log
   */
  error(message, data = {}) {
    this.log(LOG_LEVELS.ERROR, message, data);
  }

  /**
   * Get logs
   */
  getLogs(level = null, limit = null) {
    let logs = this.logs;
    
    if (level !== null) {
      logs = logs.filter(log => this.getLevelName(log.level) === level);
    }
    
    if (limit !== null) {
      logs = logs.slice(-limit);
    }
    
    return logs;
  }

  /**
   * Clear logs
   */
  clear() {
    this.logs = [];
  }

  /**
   * Export logs
   */
  export() {
    return JSON.stringify(this.logs, null, 2);
  }
}

/**
 * Logger Manager
 */
export class LoggerManager {
  constructor() {
    this.loggers = new Map();
    this.defaultLevel = DEFAULT_LOG_LEVEL;
  }

  /**
   * Get or create logger
   */
  getLogger(name, level = null) {
    if (!this.loggers.has(name)) {
      this.loggers.set(name, new Logger(name, level || this.defaultLevel));
    }
    return this.loggers.get(name);
  }

  /**
   * Set default log level
   */
  setDefaultLevel(level) {
    this.defaultLevel = level;
    this.loggers.forEach(logger => logger.setLevel(level));
  }

  /**
   * Get all loggers
   */
  getAllLoggers() {
    return Array.from(this.loggers.values());
  }

  /**
   * Clear all logs
   */
  clearAll() {
    this.loggers.forEach(logger => logger.clear());
  }
}

// Global logger manager instance
export const loggerManager = new LoggerManager();

// Default logger
export const logger = loggerManager.getLogger('App');

export default Logger;

