/**
 * Environment Configuration
 * 
 * Simplified configuration that uses gcloud CLI authentication.
 * No manual environment setup required - just run `gcloud auth login`.
 * 
 * @module config/environment
 */

import dotenv from 'dotenv';

// Load environment variables from .env file (optional)
dotenv.config();

/**
 * Parse boolean environment variable
 * @param {string} value - String value to parse
 * @param {boolean} defaultValue - Default value if parsing fails
 * @returns {boolean} Parsed boolean value
 */
function parseBoolean(value, defaultValue = false) {
  if (typeof value === 'string') {
    return value.toLowerCase() === 'true' || value === '1';
  }
  return defaultValue;
}

/**
 * Parse integer environment variable
 * @param {string} value - String value to parse
 * @param {number} defaultValue - Default value if parsing fails
 * @returns {number} Parsed integer value
 */
function parseInteger(value, defaultValue) {
  const parsed = parseInt(value, 10);
  return isNaN(parsed) ? defaultValue : parsed;
}

/**
 * Parse comma-separated list
 * @param {string} value - Comma-separated string
 * @param {Array} defaultValue - Default array if parsing fails
 * @returns {Array} Parsed array
 */
function parseList(value, defaultValue = []) {
  if (!value) return defaultValue;
  return value.split(',').map(item => item.trim()).filter(Boolean);
}

// Environment configuration object
export const config = {
  // Application metadata
  app: {
    name: 'AI Server - Unified Vertex AI Gateway',
    version: '2.0.0',
    description: 'Production-ready AI API Gateway for Vertex AI models'
  },

  // Server configuration
  server: {
    port: parseInteger(process.env.PORT, 3000),
    host: process.env.HOST || 'localhost',
    environment: process.env.NODE_ENV || 'development',
    timezone: process.env.TZ || 'UTC'
  },

  // Security configuration
  security: {
    allowedOrigins: parseList(process.env.ALLOWED_ORIGINS, ['*']),
    corsEnabled: parseBoolean(process.env.CORS_ENABLED, true),
    helmetEnabled: parseBoolean(process.env.HELMET_ENABLED, true)
  },

  // Logging configuration
  logging: {
    level: process.env.LOG_LEVEL || 'info',
    format: process.env.LOG_FORMAT || 'combined',
    enableConsole: parseBoolean(process.env.LOG_CONSOLE, true),
    enableFile: parseBoolean(process.env.LOG_FILE, false),
    maxFileSize: process.env.LOG_MAX_SIZE || '20m',
    maxFiles: parseInteger(process.env.LOG_MAX_FILES, 5),
    logDirectory: process.env.LOG_DIR || './logs'
  },

  // Google Cloud configuration (uses gcloud CLI authentication)
  googleCloud: {
    // These will be auto-detected from gcloud CLI
    projectId: process.env.GOOGLE_CLOUD_PROJECT_ID || null,
    location: process.env.VERTEX_AI_LOCATION || 'us-central1',
    timeout: parseInteger(process.env.GOOGLE_CLOUD_TIMEOUT, 300000), // 5 minutes
    retries: parseInteger(process.env.GOOGLE_CLOUD_RETRIES, 3)
  },

  // Model configuration
  models: {
    defaultModel: process.env.DEFAULT_MODEL || 'gemini-1.5-pro',
    maxTokens: parseInteger(process.env.MAX_TOKENS, 8192),
    temperature: parseFloat(process.env.DEFAULT_TEMPERATURE) || 0.7,
    enableStreaming: parseBoolean(process.env.ENABLE_STREAMING, true),
    streamingTimeout: parseInteger(process.env.STREAMING_TIMEOUT, 30000)
  },

  // Performance configuration
  performance: {
    requestTimeout: parseInteger(process.env.REQUEST_TIMEOUT, 300000), // 5 minutes
    keepAliveTimeout: parseInteger(process.env.KEEP_ALIVE_TIMEOUT, 65000), // 65 seconds
    headersTimeout: parseInteger(process.env.HEADERS_TIMEOUT, 66000), // 66 seconds
    maxRequestSize: process.env.MAX_REQUEST_SIZE || '10mb',
    compressionEnabled: parseBoolean(process.env.COMPRESSION_ENABLED, true)
  },

  // Development configuration
  development: {
    enableDebug: parseBoolean(process.env.DEBUG, false),
    enableProfiler: parseBoolean(process.env.ENABLE_PROFILER, false),
    mockResponses: parseBoolean(process.env.MOCK_RESPONSES, false),
    verboseLogging: parseBoolean(process.env.VERBOSE_LOGGING, false)
  }
};

// Legacy compatibility (deprecated)
export const port = config.server.port;
export const host = config.server.host;
export const logLevel = config.logging.level;
export const allowedOrigins = config.security.allowedOrigins;

// Export default configuration
export default config; 