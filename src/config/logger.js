/**
 * Logger Configuration
 * 
 * Centralized logging configuration using Winston.
 * Provides structured logging with multiple transports and formats.
 * 
 * @module config/logger
 */

import winston from 'winston';
import path from 'path';
import fs from 'fs';
import config from './environment.js';

// Ensure log directory exists
if (config.logging.enableFile && !fs.existsSync(config.logging.logDirectory)) {
  fs.mkdirSync(config.logging.logDirectory, { recursive: true });
}

/**
 * Custom log format for production
 */
const productionFormat = winston.format.combine(
  winston.format.timestamp({
    format: 'YYYY-MM-DD HH:mm:ss'
  }),
  winston.format.errors({ stack: true }),
  winston.format.json(),
  winston.format.printf(({ timestamp, level, message, ...meta }) => {
    return JSON.stringify({
      timestamp,
      level,
      message,
      service: 'ai-server',
      environment: config.server.environment,
      ...meta
    });
  })
);

/**
 * Custom log format for development
 */
const developmentFormat = winston.format.combine(
  winston.format.timestamp({
    format: 'HH:mm:ss'
  }),
  winston.format.errors({ stack: true }),
  winston.format.colorize(),
  winston.format.printf(({ timestamp, level, message, ...meta }) => {
    const metaStr = Object.keys(meta).length ? JSON.stringify(meta, null, 2) : '';
    return `${timestamp} [${level}]: ${message} ${metaStr}`;
  })
);

/**
 * Create console transport
 */
function createConsoleTransport() {
  const format = config.server.environment === 'production' 
    ? productionFormat 
    : developmentFormat;

  return new winston.transports.Console({
    level: config.logging.level,
    format: format,
    handleExceptions: true,
    handleRejections: true
  });
}

/**
 * Create file transport
 */
function createFileTransport(filename, level = 'info') {
  return new winston.transports.File({
    filename: path.join(config.logging.logDirectory, filename),
    level: level,
    format: productionFormat,
    maxsize: config.logging.maxFileSize,
    maxFiles: config.logging.maxFiles,
    tailable: true,
    handleExceptions: level === 'error',
    handleRejections: level === 'error'
  });
}

/**
 * Create transports array based on configuration
 */
function createTransports() {
  const transports = [];

  // Console transport
  if (config.logging.enableConsole) {
    transports.push(createConsoleTransport());
  }

  // File transports
  if (config.logging.enableFile) {
    // Combined log file
    transports.push(createFileTransport('combined.log'));
    
    // Error log file
    transports.push(createFileTransport('error.log', 'error'));
    
    // Warn log file  
    transports.push(createFileTransport('warn.log', 'warn'));
  }

  return transports;
}

/**
 * Configure and create the logger instance
 */
export const logger = winston.createLogger({
  level: config.logging.level,
  format: productionFormat,
  defaultMeta: {
    service: 'ai-server',
    version: config.app.version,
    environment: config.server.environment,
    pid: process.pid
  },
  transports: createTransports(),
  exitOnError: false,
  silent: config.server.environment === 'test'
});

/**
 * Add request ID to logger context
 * @param {string} requestId - Unique request identifier
 * @returns {Object} Logger with request context
 */
logger.withRequestId = function(requestId) {
  return logger.child({ requestId });
};

/**
 * Add user context to logger
 * @param {string} userId - User identifier
 * @returns {Object} Logger with user context
 */
logger.withUser = function(userId) {
  return logger.child({ userId });
};

/**
 * Log performance metrics
 * @param {string} operation - Operation name
 * @param {number} duration - Duration in milliseconds
 * @param {Object} metadata - Additional metadata
 */
logger.performance = function(operation, duration, metadata = {}) {
  logger.info('Performance metric', {
    type: 'performance',
    operation,
    duration,
    ...metadata
  });
};

/**
 * Log API request/response
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {number} duration - Request duration in milliseconds
 */
logger.request = function(req, res, duration) {
  const logData = {
    type: 'request',
    method: req.method,
    url: req.originalUrl,
    statusCode: res.statusCode,
    duration,
    userAgent: req.get('User-Agent'),
    ip: req.ip,
    requestId: req.id
  };

  if (res.statusCode >= 400) {
    logger.warn('HTTP request completed with error', logData);
  } else {
    logger.info('HTTP request completed', logData);
  }
};

// Handle uncaught exceptions and unhandled rejections
if (config.server.environment !== 'test') {
  process.on('uncaughtException', (error) => {
    logger.error('Uncaught Exception', {
      error: error.message,
      stack: error.stack,
      type: 'uncaughtException'
    });
  });

  process.on('unhandledRejection', (reason, promise) => {
    logger.error('Unhandled Rejection', {
      reason: reason,
      promise: promise,
      type: 'unhandledRejection'
    });
  });
}

// Export logger as default
export default logger; 