# AI Server - Unified Multi-Provider Gateway via Vertex AI

A production-ready Node.js server that provides a unified OpenAI-compatible API for multiple AI model providers through **Google Cloud Vertex AI**. This server acts as a single gateway to access both Google's native models and third-party models available in the Vertex AI Model Garden.

## 🌟 Key Features

- **Unified Access**: Single API endpoint for all supported AI models
- **Vertex AI Gateway**: Uses Google Cloud Vertex AI as the unified backend for all providers
- **Multi-Provider Support**: Access models from Google, Anthropic, Meta, Mistral, and Cohere
- **OpenAI-Compatible**: Drop-in replacement for OpenAI API clients
- **Streaming Support**: Real-time response streaming for supported models
- **Production Ready**: Comprehensive logging, error handling, and monitoring
- **Modular Architecture**: Clean separation of concerns for easy maintenance

## 🤖 Supported Models

### Google Models (Native Vertex AI)
- **gemini-2.5-flash** - Google's fastest multimodal model (1M context)
- **gemini-2.5-pro** - Most capable model with advanced reasoning (120k context)
- **gemini-1.5-pro** - Production-ready model (2M context)
- **gemini-1.5-flash** - Fast and efficient for most tasks (1M context)
- **gemini-pro** - General purpose model (32k context)
- **text-bison** - Text generation model
- **code-bison** - Code generation model

### Third-Party Models (via Vertex AI Model Garden)
> **Note**: Third-party models require enabling them in the Vertex AI Model Garden console

#### Anthropic Claude Models
- **claude-3-5-sonnet-20241022** - Most capable Claude model (200k context)
- **claude-3-haiku-20240307** - Fast and cost-effective (200k context)
- **claude-3-sonnet-20240229** - Balanced for general use (200k context)
- **claude-3-opus-20240229** - Most powerful for complex tasks (200k context)

#### Meta Llama Models
- **llama-3-1-405b-instruct** - Largest and most capable (128k context)
- **llama-3-1-70b-instruct** - High-performance for complex tasks (128k context)
- **llama-3-1-8b-instruct** - Efficient for general use (128k context)
- **llama-2-70b-chat** - Previous generation large model (4k context)
- **llama-2-13b-chat** - Medium-sized model (4k context)
- **llama-2-7b-chat** - Compact model (4k context)

#### Mistral Models
- **mistral-large-2407** - Most capable for complex reasoning (128k context)
- **mistral-nemo-2407** - Efficient with good performance (128k context)
- **codestral-2405** - Specialized for code generation (32k context)
- **mixtral-8x7b-instruct** - Mixture of experts model (32k context)

#### Cohere Models
- **command-r-plus** - Most advanced for complex tasks (128k context)
- **command-r** - Efficient for general use (128k context)
- **embed-english-v3** - English text embeddings (512 tokens)
- **embed-multilingual-v3** - Multilingual embeddings (512 tokens)

## 🚀 Quick Start

### Prerequisites

1. **Google Cloud Project** with Vertex AI API enabled
2. **Service Account** with Vertex AI permissions
3. **Node.js 18+** and **npm/yarn**

### Installation

1. **Clone the repository**:
```bash
git clone <repository-url>
cd ai-server
```

2. **Install dependencies**:
```bash
npm install
# or
yarn install
```

3. **Configure environment**:
```bash
cp .env.example .env
```

Edit `.env` with your configuration:
```env
# Google Cloud Configuration
GOOGLE_CLOUD_PROJECT_ID=your-project-id
GOOGLE_CLOUD_REGION=us-central1
GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json

# Server Configuration
PORT=3000
NODE_ENV=development
LOG_LEVEL=info
```

4. **Set up Google Cloud Authentication**:
   - Create a service account in Google Cloud Console
   - Download the JSON key file
   - Set `GOOGLE_APPLICATION_CREDENTIALS` to the file path
   - Grant the service account these roles:
     - `Vertex AI User`
     - `AI Platform Developer`

5. **Enable Third-Party Models** (Optional):
   - Go to [Vertex AI Model Garden](https://console.cloud.google.com/vertex-ai/model-garden)
   - Find and enable desired third-party models
   - Accept terms and conditions for each provider

### Running the Server

**Development mode**:
```bash
npm run dev
```

**Production mode**:
```bash
npm start
```

**With PM2**:
```bash
npm run start:pm2
```

## 📡 API Usage

### Base URL
```
http://localhost:3000/v1
```

### Authentication
Currently uses Google Cloud service account authentication. API key authentication can be added if needed.

### Endpoints

#### List Available Models
```bash
curl http://localhost:3000/v1/models
```

#### Chat Completions
```bash
curl -X POST http://localhost:3000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gemini-1.5-pro",
    "messages": [
      {"role": "system", "content": "You are a helpful assistant."},
      {"role": "user", "content": "Hello, how are you?"}
    ],
    "temperature": 0.7,
    "max_tokens": 1000,
    "stream": false
  }'
```

#### Streaming Response
```bash
curl -X POST http://localhost:3000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "claude-3-5-sonnet-20241022",
    "messages": [
      {"role": "user", "content": "Write a short story about AI"}
    ],
    "stream": true
  }'
```

#### Model Information
```bash
curl http://localhost:3000/v1/models/gemini-1.5-pro
```

#### Health Check
```bash
curl http://localhost:3000/v1/health
```

## 🔧 Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `GOOGLE_CLOUD_PROJECT_ID` | Your Google Cloud Project ID | Required |
| `GOOGLE_CLOUD_REGION` | Vertex AI region | `us-central1` |
| `GOOGLE_APPLICATION_CREDENTIALS` | Path to service account JSON | Required |
| `PORT` | Server port | `3000` |
| `NODE_ENV` | Environment (development/production) | `development` |
| `LOG_LEVEL` | Logging level (error/warn/info/debug) | `info` |

### Model Configuration

Models are configured in `src/config/models.js`. You can:
- Add new model mappings
- Modify context lengths
- Update streaming capabilities
- Add model descriptions

## 🏗️ Architecture

### Project Structure
```
ai-server/
├── src/
│   ├── config/          # Configuration files
│   │   ├── environment.js   # Environment variables
│   │   ├── logger.js        # Winston logging setup
│   │   └── models.js        # Model mappings and utilities
│   ├── middleware/      # Express middleware
│   │   └── requestLogger.js # Request logging
│   ├── routes/          # API routes
│   │   └── chatRoutes.js    # Chat completion endpoints
│   ├── services/        # Business logic
│   │   ├── auth.js          # Google Cloud authentication
│   │   └── vertexService.js # Vertex AI operations
│   └── utils/           # Utility functions
│       └── messageUtils.js  # Message processing
├── index.js             # Main application entry
├── package.json         # Dependencies and scripts
└── README.md           # This file
```

### Key Components

1. **Vertex AI Service** (`src/services/vertexService.js`):
   - Unified interface for all model providers
   - Handles both native Google models and third-party models
   - Manages streaming and non-streaming responses

2. **Model Configuration** (`src/config/models.js`):
   - Maps friendly names to actual Vertex AI model IDs
   - Defines capabilities and context lengths
   - Supports easy addition of new models

3. **Message Processing** (`src/utils/messageUtils.js`):
   - Converts OpenAI format to provider-specific formats
   - Handles system messages appropriately for each provider
   - Validates message structure

4. **Authentication Service** (`src/services/auth.js`):
   - Manages Google Cloud authentication
   - Initializes Vertex AI client
   - Handles credential validation

## 🔐 Security Considerations

- Uses Google Cloud IAM for authentication
- Service account keys should be kept secure
- Consider using Workload Identity in production
- Implement rate limiting for production use
- Add API key authentication if exposing publicly

## 📊 Monitoring and Logging

- Comprehensive Winston-based logging
- Request/response logging middleware
- Error tracking with stack traces
- Performance metrics logging
- Health check endpoint for monitoring

## 🚀 Deployment

### Google Cloud Run
```bash
# Build and deploy
gcloud run deploy ai-server \
  --source . \
  --region us-central1 \
  --allow-unauthenticated \
  --set-env-vars GOOGLE_CLOUD_PROJECT_ID=your-project-id
```

### Docker
```bash
# Build image
docker build -t ai-server .

# Run container
docker run -p 3000:3000 \
  -e GOOGLE_CLOUD_PROJECT_ID=your-project-id \
  -v /path/to/service-account.json:/app/credentials.json \
  -e GOOGLE_APPLICATION_CREDENTIALS=/app/credentials.json \
  ai-server
```

### Traditional Server
```bash
# Install PM2 globally
npm install -g pm2

# Start with PM2
npm run start:pm2

# Monitor
pm2 status
pm2 logs ai-server
```

## 🔧 Development

### Adding New Models

1. Update `src/config/models.js`:
```javascript
// Add to appropriate provider section
"new-model-id": "vertex-ai-model-name"
```

2. Update context lengths and capabilities
3. Add model description in `src/routes/chatRoutes.js`
4. Test the new model

### Adding New Providers

1. Add provider section to `modelMappings` in `src/config/models.js`
2. Implement message processing in `src/utils/messageUtils.js`
3. Add provider-specific logic in `src/services/vertexService.js`
4. Update documentation

## 🐛 Troubleshooting

### Common Issues

1. **Authentication Error**:
   - Verify service account has correct permissions
   - Check `GOOGLE_APPLICATION_CREDENTIALS` path
   - Ensure Vertex AI API is enabled

2. **Third-Party Model Not Available**:
   - Enable the model in Vertex AI Model Garden
   - Accept terms and conditions
   - Check regional availability

3. **Rate Limiting**:
   - Implement exponential backoff
   - Check Vertex AI quotas
   - Consider upgrading service tier

### Debug Mode
```bash
LOG_LEVEL=debug npm run dev
```

## 📚 API Reference

### Request Format
```json
{
  "model": "model-id",
  "messages": [
    {"role": "system", "content": "System prompt"},
    {"role": "user", "content": "User message"},
    {"role": "assistant", "content": "Assistant response"}
  ],
  "temperature": 0.7,
  "max_tokens": 1000,
  "top_p": 1.0,
  "top_k": 40,
  "stream": false
}
```

### Response Format
```json
{
  "id": "chatcmpl-123",
  "object": "chat.completion",
  "created": 1677652288,
  "model": "gemini-1.5-pro",
  "choices": [{
    "index": 0,
    "message": {
      "role": "assistant",
      "content": "Hello! I'm doing well, thank you for asking."
    },
    "finish_reason": "stop"
  }],
  "usage": {
    "prompt_tokens": 10,
    "completion_tokens": 12,
    "total_tokens": 22
  }
}
```

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Update documentation
6. Submit a pull request

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 🔗 Links

- [Google Cloud Vertex AI](https://cloud.google.com/vertex-ai)
- [Vertex AI Model Garden](https://console.cloud.google.com/vertex-ai/model-garden)
- [OpenAI API Documentation](https://platform.openai.com/docs/api-reference)
- [Node.js](https://nodejs.org/)

---

**Note**: This server provides access to third-party models through Vertex AI Model Garden. Each provider may have their own terms of service and pricing. Please review the terms for each model you plan to use. 