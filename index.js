import express from "express";
import bodyParser from "body-parser";
import cors from "cors";
import helmet from "helmet";

// Import our modular components
import config from './src/config/environment.js';
import logger from './src/config/logger.js';
import authService from './src/services/auth.js';
import requestLogger from './src/middleware/requestLogger.js';
import chatRoutes from './src/routes/chatRoutes.js';

const app = express();

// Security and CORS middlewares
app.use(helmet());
app.use(cors({
  origin: config.allowedOrigins,
  credentials: true
}));
app.use(bodyParser.json({ limit: '10mb' }));
app.use(bodyParser.urlencoded({ extended: true }));

// Request logging middleware
app.use(requestLogger);

// API Routes
app.use('/v1', chatRoutes);

// Root health endpoint (for backwards compatibility)
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    service: 'AI Server - Unified Vertex AI Gateway',
    version: '2.0.0',
    projectId: authService.getProjectId(),
    location: authService.getLocation()
  });
});

// Global error handler
app.use((error, req, res, next) => {
  logger.error('Unhandled error', {
    error: error.message,
    stack: error.stack,
    url: req.url,
    method: req.method
  });

  res.status(500).json({
    error: {
      message: 'Internal server error',
      type: 'internal_server_error'
    }
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    error: {
      message: `Route ${req.method} ${req.originalUrl} not found`,
      type: 'not_found_error'
    }
  });
});

// Initialize server
async function startServer() {
  try {
    // Initialize authentication
    await authService.initialize();
    
    // Start server
    const server = app.listen(config.port, config.host, () => {
      logger.info('Server started successfully', {
        port: config.port,
        host: config.host,
        environment: process.env.NODE_ENV || 'development'
      });
      
      console.log(`🚀 AI Server running on http://${config.host}:${config.port}`);
      console.log(`📋 Health check: http://${config.host}:${config.port}/v1/health`);
      console.log(`🤖 Models list: http://${config.host}:${config.port}/v1/models`);
      console.log(`💬 Chat endpoint: http://${config.host}:${config.port}/v1/chat/completions`);
    });

    // Graceful shutdown
    process.on('SIGTERM', () => {
      logger.info('SIGTERM received, shutting down gracefully');
      server.close(() => {
        logger.info('Server closed');
        process.exit(0);
      });
    });

    process.on('SIGINT', () => {
      logger.info('SIGINT received, shutting down gracefully');
      server.close(() => {
        logger.info('Server closed');
        process.exit(0);
      });
    });

  } catch (error) {
    logger.error('Failed to start server', {
      error: error.message,
      stack: error.stack
    });
    
    console.error('❌ Failed to start server:', error.message);
    process.exit(1);
  }
}

// Start the server
startServer();
