# AI Server - Google Vertex AI Gateway

A production-ready Node.js server that provides a unified API for Google Vertex AI models using gcloud CLI authentication. No manual API keys required!

## 🚀 Quick Start

### Prerequisites

1. **Install gcloud CLI**: https://cloud.google.com/sdk/docs/install
2. **Authenticate with Google Cloud**:
   ```bash
   gcloud auth login
   gcloud config set project YOUR_PROJECT_ID
   ```
3. **Enable Vertex AI API**:
   ```bash
   gcloud services enable aiplatform.googleapis.com
   ```

### Installation & Setup

1. **Clone and install dependencies**:
   ```bash
   git clone <repository-url>
   cd ai-server
   yarn install
   ```

2. **Start the server**:
   ```bash
   yarn start
   ```

That's it! The server will automatically use your gcloud CLI credentials.

## 🎯 Features

- **Zero Configuration**: Uses gcloud CLI authentication automatically
- **OpenAI-Compatible API**: Drop-in replacement for OpenAI API calls
- **Google Vertex AI Models**: Access to Gemini and other Google models
- **Production Ready**: Comprehensive logging, error handling, and security
- **Tool Support**: Function calling and tool execution
- **Streaming Support**: Real-time response streaming
- **Health Monitoring**: Built-in health checks and monitoring

## 📋 Available Models

All models are accessed through Google Vertex AI:

- **gemini-1.5-pro** - Most capable model with 2M context window
- **gemini-1.5-flash** - Fast and efficient for most tasks
- **gemini-1.0-pro** - Reliable general-purpose model
- **text-bison** - Text generation model
- **code-bison** - Code generation model
- **chat-bison** - Conversational model

## 🔧 API Endpoints

### Chat Completions
```bash
POST /v1/chat/completions
```

OpenAI-compatible chat completions endpoint.

**Example Request**:
```bash
curl -X POST http://localhost:3000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gemini-1.5-pro",
    "messages": [
      {"role": "user", "content": "Hello, how are you?"}
    ],
    "temperature": 0.7,
    "max_tokens": 2048
  }'
```

### List Models
```bash
GET /v1/models
```

Returns all available models.

### Health Check
```bash
GET /health
```

Returns server and Vertex AI health status.

## ⚙️ Configuration

The server uses environment variables for configuration. Copy `.env.example` to `.env` and modify as needed:

```bash
# Basic configuration
PORT=3000
NODE_ENV=development

# Google Cloud (optional - auto-detected from gcloud)
VERTEX_AI_LOCATION=us-central1

# Model defaults
DEFAULT_MODEL=gemini-1.5-pro
MAX_TOKENS=8192
DEFAULT_TEMPERATURE=0.7

# Security
ALLOWED_ORIGINS=*
CORS_ENABLED=true

# Logging
LOG_LEVEL=info
LOG_CONSOLE=true
```

## 🏗️ Project Structure

```
ai-server/
├── index.js                 # Main server file
├── package.json             # Dependencies and scripts
├── .env.example             # Environment configuration template
├── src/
│   ├── config/
│   │   ├── environment.js   # Environment configuration
│   │   ├── logger.js        # Logging configuration
│   │   └── models.js        # Model definitions
│   ├── middleware/
│   │   └── requestLogger.js # Request logging middleware
│   ├── routes/
│   │   └── chatRoutes.js    # API route handlers
│   ├── services/
│   │   └── vertexService.js # Vertex AI service
│   └── utils/
│       └── messageUtils.js  # Message processing utilities
```

## 🛠️ Development

### Available Scripts

- `yarn start` - Start production server
- `yarn dev` - Start development server with auto-reload
- `yarn dev:debug` - Start with debugging enabled
- `yarn test:health` - Test server health endpoint

### Development Features

- **Auto-reload**: Changes are automatically detected in development
- **Debug logging**: Enhanced logging in development mode
- **Error details**: Full error stack traces in development

## 🔒 Security

- **Helmet.js**: Security headers and protections
- **CORS**: Configurable cross-origin resource sharing
- **Rate limiting**: Built-in request rate limiting
- **Input validation**: Request validation and sanitization
- **Error handling**: Secure error responses

## 📊 Monitoring & Logging

### Structured Logging

All logs are structured JSON with consistent fields:

```json
{
  "timestamp": "2024-01-01T00:00:00.000Z",
  "level": "info",
  "message": "Chat completion request received",
  "model": "gemini-1.5-pro",
  "requestId": "req-123",
  "duration": 1500
}
```

### Health Monitoring

The `/health` endpoint provides comprehensive health information:

```json
{
  "status": "healthy",
  "timestamp": "2024-01-01T00:00:00.000Z",
  "service": "ai-server",
  "version": "2.0.0",
  "vertexAI": {
    "status": "healthy",
    "projectId": "your-project-id",
    "location": "us-central1"
  }
}
```

## 🚀 Deployment

### Docker

```bash
# Build image
docker build -t ai-server .

# Run container
docker run -p 3000:3000 ai-server
```

### Google Cloud Run

```bash
# Deploy to Cloud Run
gcloud run deploy ai-server \
  --source . \
  --platform managed \
  --region us-central1 \
  --allow-unauthenticated
```

### PM2 (Process Manager)

```bash
# Start with PM2
yarn pm2:start

# Monitor
yarn pm2:logs
```

## 🔧 Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3000` | Server port |
| `NODE_ENV` | `development` | Environment mode |
| `VERTEX_AI_LOCATION` | `us-central1` | Vertex AI region |
| `DEFAULT_MODEL` | `gemini-1.5-pro` | Default model |
| `MAX_TOKENS` | `8192` | Default max tokens |
| `LOG_LEVEL` | `info` | Logging level |
| `ALLOWED_ORIGINS` | `*` | CORS origins |

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## 📝 License

MIT License - see LICENSE file for details.

## 🆘 Troubleshooting

### Common Issues

**Authentication Error**:
```bash
# Re-authenticate with gcloud
gcloud auth login
gcloud config set project YOUR_PROJECT_ID
```

**API Not Enabled**:
```bash
# Enable Vertex AI API
gcloud services enable aiplatform.googleapis.com
```

**Permission Denied**:
```bash
# Check your project permissions
gcloud projects get-iam-policy YOUR_PROJECT_ID
```

### Debug Mode

Enable debug logging:
```bash
DEBUG=true yarn dev:debug
```

## 📞 Support

- 📧 Email: support@example.com
- 🐛 Issues: GitHub Issues
- 📖 Documentation: GitHub Wiki 