/**
 * AI Server - Unified Vertex AI Gateway
 * 
 * A production-ready Node.js server that provides a unified API
 * for Google Vertex AI models using gcloud CLI authentication.
 * 
 * @version 2.0.0
 * @author Your Name
 */

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { config } from './src/config/environment.js';
import logger from './src/config/logger.js';
import requestLogger from './src/middleware/requestLogger.js';
import chatRoutes from './src/routes/chatRoutes.js';
import vertexService from './src/services/vertexService.js';

// Initialize Express app
const app = express();

/**
 * Security Middleware Configuration
 * Comprehensive security headers and protections
 */
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'"],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"],
    },
  },
  crossOriginEmbedderPolicy: false,
  crossOriginResourcePolicy: { policy: "cross-origin" }
}));

/**
 * CORS Configuration
 * Configurable cross-origin resource sharing
 */
if (config.security.corsEnabled) {
  app.use(cors({
    origin: config.security.allowedOrigins,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
    credentials: true,
    maxAge: 86400 // 24 hours
  }));
}

/**
 * Body Parsing Middleware
 * Parse JSON with raw body storage for webhooks
 */
app.use(express.json({ 
  limit: config.performance.maxRequestSize,
  verify: (req, res, buf) => {
    req.rawBody = buf; // Store raw body for webhook verification
  }
}));
app.use(express.urlencoded({ extended: true, limit: config.performance.maxRequestSize }));

/**
 * Logging Middleware
 * Request/response logging with custom format
 */
app.use(requestLogger);
if (config.logging.format && config.server.environment !== 'test') {
  app.use(morgan(config.logging.format, {
    stream: {
      write: (message) => logger.info(message.trim(), { source: 'morgan' })
    }
  }));
}

/**
 * Root Endpoint
 * Provides API information and health status
 */
app.get('/', async (req, res) => {
  try {
    const health = await vertexService.healthCheck();
    
    res.json({
      name: config.app.name,
      version: config.app.version,
      description: config.app.description,
      status: 'operational',
      timestamp: new Date().toISOString(),
      environment: config.server.environment,
      vertexAI: health,
      endpoints: {
        chat: '/v1/chat/completions',
        models: '/v1/models',
        health: '/health'
      },
      documentation: 'https://github.com/yourusername/ai-server#readme'
    });
  } catch (error) {
    logger.error('Root endpoint error', { error: error.message });
    res.status(500).json({
      name: config.app.name,
      version: config.app.version,
      status: 'error',
      error: 'Service initialization failed'
    });
  }
});

/**
 * API Routes
 * Mount all API endpoints under /v1 prefix
 */
app.use('/v1', chatRoutes);

/**
 * Health Check Endpoint
 * Simple health check for load balancers
 */
app.get('/health', async (req, res) => {
  try {
    const health = await vertexService.healthCheck();
    res.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      service: 'ai-server',
      version: config.app.version,
      vertexAI: health
    });
  } catch (error) {
    logger.error('Health check failed', { error: error.message });
    res.status(503).json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      error: error.message
    });
  }
});

/**
 * Error Handling Middleware
 * Comprehensive error handling with environment-aware responses
 */
app.use((err, req, res, next) => {
  logger.error('Unhandled error', {
    error: err.message,
    stack: err.stack,
    url: req.url,
    method: req.method,
    ip: req.ip,
    userAgent: req.get('User-Agent')
  });

  const isDevelopment = config.server.environment === 'development';
  
  res.status(err.status || 500).json({
    error: {
      message: err.message || 'Internal Server Error',
      type: 'internal_server_error',
      ...(isDevelopment && { stack: err.stack })
    }
  });
});

/**
 * 404 Handler
 * Handle undefined routes
 */
app.use('*', (req, res) => {
  res.status(404).json({
    error: {
      message: `Route ${req.method} ${req.originalUrl} not found`,
      type: 'not_found_error',
      available_endpoints: [
        'GET /',
        'GET /health',
        'GET /v1/models',
        'GET /v1/models/:modelId',
        'POST /v1/chat/completions'
      ]
    }
  });
});

/**
 * Server Configuration
 * Configure timeouts and start server
 */
const server = app.listen(config.server.port, config.server.host, () => {
  const address = server.address();
  const host = address.address === '::' ? 'localhost' : address.address;
  
  console.log('\n🚀 AI Server Started Successfully!');
  console.log('┌─────────────────────────────────────────────┐');
  console.log(`│  Server: http://${host}:${address.port}                │`);
  console.log(`│  Environment: ${config.server.environment.padEnd(25)} │`);
  console.log(`│  Version: ${config.app.version.padEnd(29)} │`);
  console.log('└─────────────────────────────────────────────┘');
  console.log('\n📋 Available Endpoints:');
  console.log(`   GET  /                     - API Information`);
  console.log(`   GET  /health               - Health Check`);
  console.log(`   GET  /v1/models            - List Models`);
  console.log(`   POST /v1/chat/completions  - Chat Completions`);
  console.log('\n🔐 Authentication: gcloud CLI (automatic)');
  console.log('💡 Ready to process requests!\n');
});

// Configure server timeouts
server.keepAliveTimeout = config.performance.keepAliveTimeout;
server.headersTimeout = config.performance.headersTimeout;

/**
 * Graceful Shutdown Handler
 * Handle SIGTERM and SIGINT signals for clean shutdown
 */
const gracefulShutdown = (signal) => {
  logger.info(`Received ${signal}, starting graceful shutdown...`);
  
  server.close((err) => {
    if (err) {
      logger.error('Error during server shutdown', { error: err.message });
      process.exit(1);
    }
    
    logger.info('Server closed successfully');
    process.exit(0);
  });
  
  // Force shutdown after timeout
  setTimeout(() => {
    logger.error('Forced shutdown due to timeout');
    process.exit(1);
  }, 10000); // 10 seconds timeout
};

// Register shutdown handlers
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

/**
 * Global Error Handlers
 * Handle uncaught exceptions and unhandled rejections
 */
process.on('uncaughtException', (err) => {
  logger.error('Uncaught Exception', {
    error: err.message,
    stack: err.stack
  });
  
  // Graceful shutdown on uncaught exception
  gracefulShutdown('uncaughtException');
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection', {
    reason: reason instanceof Error ? reason.message : reason,
    stack: reason instanceof Error ? reason.stack : undefined,
    promise: promise
  });
  
  // Continue running for unhandled rejections, but log them
});

export default app;
