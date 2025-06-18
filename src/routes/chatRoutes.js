import express from 'express';
import logger from '../config/logger.js';
import { getModelProvider, getAllModels } from '../config/models.js';
import vertexService from '../services/vertexService.js';
import authService from '../services/auth.js';
import { validateMessages } from '../utils/messageUtils.js';

const router = express.Router();

// Health check endpoint
router.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version || '1.0.0',
    projectId: authService.getProjectId(),
    location: process.env.VERTEX_AI_LOCATION || 'us-central1'
  });
});

// List of available models
router.get('/models', (req, res) => {
  const models = getAllModels();
  res.json({
    object: 'list',
    data: models
  });
});

// Main endpoint for chat completions (OpenAI API compatible)
router.post("/chat/completions", async (req, res) => {
  const startTime = Date.now();
  
  console.log("🔍 DEBUG: Endpoint called with tools:", req.body.tools ? "YES" : "NO");
  
  try {
    // Log the entire request body for debugging
    logger.info('Raw request body received', {
      bodyKeys: Object.keys(req.body),
      hasTools: 'tools' in req.body,
      toolsType: typeof req.body.tools,
      toolsValue: req.body.tools ? JSON.stringify(req.body.tools).substring(0, 200) : 'none'
    });
    
    const { 
      messages, 
      model, 
      temperature = 0.7,
      max_tokens = 2048,
      top_p = 1,
      top_k = 40,
      stream = false,
      tools = null,
      tool_choice = null
    } = req.body;

    // Basic validation
    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ 
        error: { 
          message: "Messages array is required and cannot be empty",
          type: "invalid_request_error"
        }
      });
    }

    if (!model) {
      return res.status(400).json({ 
        error: { 
          message: "Model parameter is required",
          type: "invalid_request_error"
        }
      });
    }

    // Validate tools if provided
    if (tools && !Array.isArray(tools)) {
      return res.status(400).json({ 
        error: { 
          message: "Tools must be an array",
          type: "invalid_request_error"
        }
      });
    }

    // Validate tool_choice if provided
    if (tool_choice && tools && tools.length === 0) {
      return res.status(400).json({ 
        error: { 
          message: "tool_choice requires tools to be provided",
          type: "invalid_request_error"
        }
      });
    }

    // Determine which provider to use
    const provider = getModelProvider(model);
    if (!provider) {
      return res.status(400).json({ 
        error: { 
          message: `Model '${model}' not supported. Check /v1/models for available models.`,
          type: "invalid_request_error"
        }
      });
    }

    logger.info('Chat completion request', {
      model,
      provider,
      messageCount: messages.length,
      temperature,
      maxTokens: max_tokens,
      stream,
      hasTools: tools && tools.length > 0,
      toolChoice: tool_choice,
      toolsDebug: tools ? JSON.stringify(tools).substring(0, 500) : 'none'
    });

    let result;

    // Route to appropriate service - all models use Vertex AI as unified gateway
    result = await vertexService.generateChatCompletion({
      model, messages, temperature, max_tokens, top_p, top_k, stream, tools, tool_choice
    });

    // Handle streaming response
    if (result.isStream) {
      res.writeHead(200, {
        'Content-Type': 'text/plain; charset=utf-8',
        'Transfer-Encoding': 'chunked',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type'
      });

      try {
        let fullText = '';
        let toolCalls = [];
        let currentToolCall = null;
        
        for await (const chunk of result.stream) {
          // Get text from chunk - handle different response formats
          let text = '';
          let chunkToolCalls = null;
          
          if (typeof chunk.text === 'function') {
            text = chunk.text();
          } else if (chunk.candidates && chunk.candidates[0] && chunk.candidates[0].content) {
            const candidate = chunk.candidates[0];
            if (candidate.content.parts && candidate.content.parts[0]) {
              const part = candidate.content.parts[0];
              text = part.text || '';
              
              // Check for function calls
              if (part.functionCall) {
                chunkToolCalls = [{
                  id: `call_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                  type: 'function',
                  function: {
                    name: part.functionCall.name,
                    arguments: JSON.stringify(part.functionCall.args || {})
                  }
                }];
              }
            }
          } else if (chunk.text) {
            text = chunk.text;
          }
          
          // Handle tool calls in streaming
          if (chunkToolCalls) {
            toolCalls = chunkToolCalls;
            
            const streamResponse = {
              id: `chatcmpl-${Date.now()}`,
              object: 'chat.completion.chunk',
              created: Math.floor(Date.now() / 1000),
              model: model,
              choices: [{
                index: 0,
                delta: {
                  tool_calls: chunkToolCalls
                },
                finish_reason: null
              }]
            };
            
            res.write(`data: ${JSON.stringify(streamResponse)}\n\n`);
          }
          
          if (text) {
            fullText += text;
            
            // Split into words for more natural streaming
            const words = text.split(' ');
            for (let i = 0; i < words.length; i++) {
              const word = words[i] + (i < words.length - 1 ? ' ' : '');
              
              const streamResponse = {
                id: `chatcmpl-${Date.now()}`,
                object: 'chat.completion.chunk',
                created: Math.floor(Date.now() / 1000),
                model: model,
                choices: [{
                  index: 0,
                  delta: {
                    content: word
                  },
                  finish_reason: null
                }]
              };
              
              res.write(`data: ${JSON.stringify(streamResponse)}\n\n`);
              await new Promise(resolve => setTimeout(resolve, 50));
            }
          }
        }

        // Send final chunk
        const finalResponse = {
          id: `chatcmpl-${Date.now()}`,
          object: 'chat.completion.chunk',
          created: Math.floor(Date.now() / 1000),
          model: model,
          choices: [{
            index: 0,
            delta: {},
            finish_reason: toolCalls.length > 0 ? 'tool_calls' : 'stop'
          }]
        };
        
        res.write(`data: ${JSON.stringify(finalResponse)}\n\n`);
        res.write('data: [DONE]\n\n');
        res.end();

        const duration = Date.now() - startTime;
        logger.info('Streaming response completed', {
          model,
          provider,
          duration,
          responseLength: fullText.length
        });

      } catch (streamError) {
        logger.error('Streaming error', {
          error: streamError.message,
          stack: streamError.stack
        });
        res.end();
      }
    } else {
      // Non-streaming response
      const duration = Date.now() - startTime;
      logger.info('Chat completion completed', {
        model,
        provider,
        duration,
        responseLength: result.choices?.[0]?.message?.content?.length || 0
      });

      res.json(result);
    }

  } catch (error) {
    const duration = Date.now() - startTime;
    logger.error('Chat completion error', {
      error: error.message,
      stack: error.stack,
      duration,
      requestBody: JSON.stringify(req.body).substring(0, 500)
    });

    // Determine appropriate HTTP status code
    let statusCode = 500;
    let errorType = "internal_server_error";
    
    if (error.message.includes('authentication') || error.message.includes('API key')) {
      statusCode = 401;
      errorType = "authentication_error";
    } else if (error.message.includes('quota') || error.message.includes('rate limit')) {
      statusCode = 429;
      errorType = "rate_limit_error";
    } else if (error.message.includes('not found') || error.message.includes('model')) {
      statusCode = 404;
      errorType = "model_not_found_error";
    }

    res.status(statusCode).json({
      error: {
        message: error.message,
        type: errorType,
        code: statusCode
      }
    });
  }
});

// Legacy completions endpoint (for compatibility)
router.post("/completions", async (req, res) => {
  // Convert to chat format and redirect
  const { prompt, ...otherParams } = req.body;
  
  const chatRequest = {
    ...otherParams,
    messages: [{ role: 'user', content: prompt }]
  };
  
  req.body = chatRequest;
  return router.handle(req, res);
});

// Get available models
router.get('/models', async (req, res) => {
  try {
    const models = getAllModels();
    
    logger.info('Models endpoint accessed', {
      modelCount: models.length,
      providers: [...new Set(models.map(m => m.owned_by))]
    });

    res.json({
      object: 'list',
      data: models
    });
  } catch (error) {
    logger.error('Error fetching models', {
      error: error.message,
      stack: error.stack
    });

    res.status(500).json({
      error: {
        message: 'Failed to fetch available models',
        type: 'internal_error'
      }
    });
  }
});

// DISABLED: Chat completions endpoint - using /v1/chat/completions instead
/*
router.post('/chat/completions', async (req, res) => {
  try {
    const {
      model,
      messages,
      temperature = 0.7,
      max_tokens = 2048,
      top_p = 1,
      top_k = 40,
      stream = false,
      ...otherParams
    } = req.body;

    // Validate required parameters
    if (!model) {
      return res.status(400).json({
        error: {
          message: 'Model parameter is required',
          type: 'invalid_request_error'
        }
      });
    }

    if (!messages) {
      return res.status(400).json({
        error: {
          message: 'Messages parameter is required',
          type: 'invalid_request_error'
        }
      });
    }

    // Validate messages format
    try {
      validateMessages(messages);
    } catch (validationError) {
      return res.status(400).json({
        error: {
          message: validationError.message,
          type: 'invalid_request_error'
        }
      });
    }

    // Check if model is supported
    const provider = getModelProvider(model);
    if (!provider) {
      return res.status(400).json({
        error: {
          message: `Model '${model}' is not supported. Use /v1/models to see available models.`,
          type: 'invalid_request_error'
        }
      });
    }

    logger.info('Chat completion request', {
      model,
      provider,
      messageCount: messages.length,
      temperature,
      maxTokens: max_tokens,
      stream,
      hasOtherParams: Object.keys(otherParams).length > 0
    });

    // Use unified Vertex AI service for all models
    const result = await vertexService.generateChatCompletion({
      model,
      messages,
      temperature,
      max_tokens,
      top_p,
      top_k,
      stream
    });

    if (result.isStream) {
      // Handle streaming response
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('Access-Control-Allow-Origin', '*');

      if (provider === 'google') {
        // Handle Google/Vertex AI streaming
        for await (const chunk of result.stream) {
          // Get text from chunk - handle different response formats
          let text = '';
          if (typeof chunk.text === 'function') {
            text = chunk.text();
          } else if (chunk.candidates && chunk.candidates[0] && chunk.candidates[0].content) {
            const candidate = chunk.candidates[0];
            if (candidate.content.parts && candidate.content.parts[0]) {
              text = candidate.content.parts[0].text || '';
            }
          } else if (chunk.text) {
            text = chunk.text;
          }
          
          if (text) {
            const streamChunk = {
              id: `chatcmpl-${Date.now()}`,
              object: 'chat.completion.chunk',
              created: Math.floor(Date.now() / 1000),
              model: model,
              choices: [{
                index: 0,
                delta: {
                  content: text
                },
                finish_reason: null
              }]
            };
            res.write(`data: ${JSON.stringify(streamChunk)}\n\n`);
          }
        }
      } else {
        // Handle third-party streaming (mock implementation)
        for await (const chunk of result.stream) {
          // Get text from chunk
          let text = '';
          if (typeof chunk.text === 'function') {
            text = chunk.text();
          } else if (chunk.text) {
            text = chunk.text;
          }
          
          if (text) {
            const streamChunk = {
              id: `chatcmpl-${Date.now()}`,
              object: 'chat.completion.chunk',
              created: Math.floor(Date.now() / 1000),
              model: model,
              choices: [{
                index: 0,
                delta: {
                  content: text
                },
                finish_reason: null
              }]
            };
            res.write(`data: ${JSON.stringify(streamChunk)}\n\n`);
          }
        }
      }

      // Send final chunk
      const finalChunk = {
        id: `chatcmpl-${Date.now()}`,
        object: 'chat.completion.chunk',
        created: Math.floor(Date.now() / 1000),
        model: model,
        choices: [{
          index: 0,
          delta: {},
          finish_reason: 'stop'
        }]
      };
      res.write(`data: ${JSON.stringify(finalChunk)}\n\n`);
      res.write('data: [DONE]\n\n');
      res.end();

      logger.info('Streaming response completed', {
        model,
        provider
      });
    } else {
      // Handle non-streaming response
      res.json(result);
      
      logger.info('Non-streaming response sent', {
        model,
        provider,
        responseLength: result.choices?.[0]?.message?.content?.length || 0
      });
    }

  } catch (error) {
    logger.error('Chat completion error', {
      error: error.message,
      stack: error.stack,
      model: req.body?.model,
      provider: req.body?.model ? getModelProvider(req.body.model) : 'unknown'
    });

    // Handle specific error types
    if (error.message.includes('quota') || error.message.includes('rate limit')) {
      res.status(429).json({
        error: {
          message: 'Rate limit exceeded. Please try again later.',
          type: 'rate_limit_error'
        }
      });
    } else if (error.message.includes('authentication') || error.message.includes('unauthorized')) {
      res.status(401).json({
        error: {
          message: 'Authentication failed. Please check your credentials.',
          type: 'authentication_error'
        }
      });
    } else if (error.message.includes('not found') || error.message.includes('model not available')) {
      res.status(404).json({
        error: {
          message: 'The requested model is not available.',
          type: 'model_not_found_error'
        }
      });
    } else {
      res.status(500).json({
        error: {
          message: 'Internal server error occurred while processing your request.',
          type: 'internal_error'
        }
      });
    }
  }
});
*/

// Model information endpoint
router.get('/models/:modelId', async (req, res) => {
  try {
    const { modelId } = req.params;
    const models = getAllModels();
    const model = models.find(m => m.id === modelId);

    if (!model) {
      return res.status(404).json({
        error: {
          message: `Model '${modelId}' not found`,
          type: 'model_not_found_error'
        }
      });
    }

    const provider = getModelProvider(modelId);
    
    res.json({
      ...model,
      provider,
      description: getModelDescription(modelId, provider),
      capabilities: getModelCapabilities(modelId, provider)
    });

  } catch (error) {
    logger.error('Error fetching model info', {
      error: error.message,
      modelId: req.params.modelId
    });

    res.status(500).json({
      error: {
        message: 'Failed to fetch model information',
        type: 'internal_error'
      }
    });
  }
});

// Helper function to get model description
function getModelDescription(modelId, provider) {
  const descriptions = {
    // Google models
    'gemini-2.5-flash': 'Google\'s fastest multimodal model with 1M context window',
    'gemini-2.5-pro': 'Google\'s most capable model with advanced reasoning',
    'gemini-1.5-pro': 'Google\'s production-ready model with 2M context window',
    'gemini-1.5-flash': 'Fast and efficient model for most tasks',
    
    // Anthropic models
    'claude-3-5-sonnet-20241022': 'Anthropic\'s most capable model with excellent reasoning',
    'claude-3-haiku-20240307': 'Fast and cost-effective Claude model',
    'claude-3-sonnet-20240229': 'Balanced Claude model for general use',
    'claude-3-opus-20240229': 'Most powerful Claude model for complex tasks',
    
    // Meta models
    'llama-3-1-405b-instruct': 'Meta\'s largest and most capable Llama model',
    'llama-3-1-70b-instruct': 'High-performance Llama model for complex tasks',
    'llama-3-1-8b-instruct': 'Efficient Llama model for general use',
    
    // Mistral models
    'mistral-large-2407': 'Mistral\'s most capable model for complex reasoning',
    'mistral-nemo-2407': 'Efficient Mistral model with good performance',
    'codestral-2405': 'Specialized Mistral model for code generation',
    
    // Cohere models
    'command-r-plus': 'Cohere\'s most advanced model for complex tasks',
    'command-r': 'Cohere\'s efficient model for general use'
  };

  return descriptions[modelId] || `${provider} model: ${modelId}`;
}

// Helper function to get model capabilities
function getModelCapabilities(modelId, provider) {
  const capabilities = {
    text_generation: true,
    streaming: ['google', 'anthropic', 'meta', 'mistral'].includes(provider),
    system_messages: true,
    function_calling: provider === 'google' || provider === 'anthropic',
    multimodal: provider === 'google' && modelId.includes('gemini'),
    code_generation: true,
    reasoning: true
  };

  return capabilities;
}

export default router; 