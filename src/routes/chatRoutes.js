import express from 'express';
import vertexService from '../services/vertexService.js';
import logger from '../config/logger.js';
import { getAvailableModels } from '../config/models.js';

const router = express.Router();

/**
 * Clean orphaned tool messages from chat history
 * Removes tool messages that don't have matching tool calls
 * 
 * @param {Array} messages - Array of chat messages
 * @returns {Array} Cleaned messages array
 */
function cleanOrphanedToolMessages(messages) {
  const toolCallIds = new Set();
  const cleanedMessages = [];
  
  // First pass: collect all tool call IDs
  for (const message of messages) {
    if (message.tool_calls) {
      for (const toolCall of message.tool_calls) {
        if (toolCall.id) {
          toolCallIds.add(toolCall.id);
        }
      }
    }
  }
  
  // Second pass: filter out orphaned tool messages
  for (const message of messages) {
    if (message.role === 'tool') {
      if (message.tool_call_id && toolCallIds.has(message.tool_call_id)) {
        cleanedMessages.push(message);
      } else {
        logger.warn('Removing orphaned tool message', {
          toolCallId: message.tool_call_id,
          messagePreview: message.content?.substring(0, 100)
        });
      }
    } else {
      cleanedMessages.push(message);
    }
  }
  
  return cleanedMessages;
}

// Main endpoint for chat completions (OpenAI API compatible)
router.post('/chat/completions', async (req, res) => {
  try {
    const startTime = Date.now();
    
    // Extract parameters from request
    let { 
      messages, 
      model = 'gemini-1.5-pro', 
      temperature = 0.7, 
      max_tokens = 8192, 
      top_p = 1.0, 
      top_k = 40, 
      stream = false,
      tools,
      tool_choice
    } = req.body;

    // Clean orphaned tool messages before processing
    if (messages && Array.isArray(messages)) {
      messages = cleanOrphanedToolMessages(messages);
    }

    // Validate required parameters
    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({
        error: {
          message: 'Messages array is required and cannot be empty',
          type: 'invalid_request_error'
        }
      });
    }

    // Log request details
    logger.info('Chat completion request received', {
      model,
      messageCount: messages.length,
      temperature,
      max_tokens,
      stream,
      hasTools: !!tools,
      toolChoice: tool_choice,
      requestId: req.id
    });

    // Handle streaming responses
    if (stream) {
      res.setHeader('Content-Type', 'text/plain');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no');
    }

    // Generate completion using vertex service
    const response = await vertexService.generateChatCompletion({
      messages,
      model,
      temperature,
      max_tokens,
      top_p,
      top_k,
      stream,
      tools,
      tool_choice
    });

    // Log completion time
    const completionTime = Date.now() - startTime;
    logger.info('Chat completion generated', {
      model,
      completionTime,
      hasResponse: !!response,
      requestId: req.id
    });

    // Handle streaming response
    if (stream && response && typeof response.pipe === 'function') {
      response.pipe(res);
      return;
    }

    // Return non-streaming response
    res.json(response);

  } catch (error) {
    logger.error('Chat completion error', {
      error: error.message,
      stack: error.stack,
      requestId: req.id
    });

    // Handle specific error types
    if (error.message.includes('quota') || error.message.includes('rate limit')) {
      return res.status(429).json({
        error: {
          message: 'Rate limit exceeded. Please try again later.',
          type: 'rate_limit_error',
          code: 'rate_limit_exceeded'
        }
      });
    }

    if (error.message.includes('authentication') || error.message.includes('unauthorized')) {
      return res.status(401).json({
        error: {
          message: 'Authentication failed. Please check your gcloud CLI authentication.',
          type: 'authentication_error',
          code: 'invalid_api_key'
        }
      });
    }

    if (error.message.includes('not found') || error.message.includes('model')) {
      return res.status(404).json({
        error: {
          message: `Model not found or not available: ${req.body.model}`,
          type: 'invalid_request_error',
          code: 'model_not_found'
        }
      });
    }

    // Generic error response
    res.status(500).json({
      error: {
        message: error.message || 'Internal server error',
        type: 'internal_server_error',
        code: 'internal_error'
      }
    });
  }
});

// List available models endpoint
router.get('/models', async (req, res) => {
  try {
    logger.info('Models list requested', { requestId: req.id });
    
    const models = getAvailableModels();
    
    res.json({
      object: 'list',
      data: models
    });

  } catch (error) {
    logger.error('Error listing models', {
      error: error.message,
      stack: error.stack,
      requestId: req.id
    });

    res.status(500).json({
      error: {
        message: 'Failed to retrieve models list',
        type: 'internal_server_error'
      }
    });
  }
});

// Health check endpoint
router.get('/health', async (req, res) => {
  try {
    const health = await vertexService.healthCheck();
    
    res.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      service: 'ai-server',
      version: '2.0.0',
      vertexAI: health
    });

  } catch (error) {
    logger.error('Health check failed', {
      error: error.message,
      stack: error.stack
    });

    res.status(503).json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      service: 'ai-server',
      error: error.message
    });
  }
});

// Model information endpoint
router.get('/models/:modelId', async (req, res) => {
  try {
    const { modelId } = req.params;
    const models = getAvailableModels();
    const model = models.find(m => m.id === modelId);

    if (!model) {
      return res.status(404).json({
        error: {
          message: `Model ${modelId} not found`,
          type: 'invalid_request_error',
          code: 'model_not_found'
        }
      });
    }

    res.json(model);

  } catch (error) {
    logger.error('Error retrieving model info', {
      error: error.message,
      modelId: req.params.modelId,
      requestId: req.id
    });

    res.status(500).json({
      error: {
        message: 'Failed to retrieve model information',
        type: 'internal_server_error'
      }
    });
  }
});

export default router; 