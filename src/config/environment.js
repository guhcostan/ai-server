import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

export const config = {
  // Server configuration
  port: process.env.PORT || 5001,
  host: process.env.HOST || 'localhost',
  logLevel: process.env.LOG_LEVEL || 'info',
  allowedOrigins: process.env.ALLOWED_ORIGINS?.split(',') || ['*'],

  // Google Cloud configuration
  googleCloud: {
    projectId: process.env.GOOGLE_CLOUD_PROJECT_ID,
    location: process.env.VERTEX_AI_LOCATION || 'us-central1'
  },

  // API Keys for different providers
  apiKeys: {
    anthropic: process.env.ANTHROPIC_API_KEY,
    openai: process.env.OPENAI_API_KEY,
    xai: process.env.XAI_API_KEY
  }
};

export default config; 