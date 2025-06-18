import logger from '../config/logger.js';

// Function to extract content from message (can be string or array)
export function extractMessageContent(msg) {
  logger.info('Extracting message content', {
    role: msg.role,
    contentType: typeof msg.content,
    isArray: Array.isArray(msg.content),
    contentSample: JSON.stringify(msg.content).substring(0, 100)
  });

  if (typeof msg.content === 'string') {
    return msg.content;
  } else if (Array.isArray(msg.content)) {
    // Continue sometimes sends content as array of objects
    const extracted = msg.content
      .map(item => {
        if (typeof item === 'string') return item;
        if (item.type === 'text' && item.text) return item.text;
        if (item.text) return item.text;
        return '';
      })
      .join(' ')
      .trim();
    
    logger.info('Array content extracted', { 
      original: msg.content, 
      extracted: extracted.substring(0, 100) 
    });
    return extracted;
  } else if (typeof msg.content === 'object' && msg.content !== null) {
    // If it's an object, try to extract text
    if (msg.content.text) return msg.content.text;
    if (msg.content.content) return msg.content.content;
    
    logger.warn('Object content could not be extracted, using JSON', {
      content: msg.content
    });
    return JSON.stringify(msg.content);
  }
  return String(msg.content || '');
}

/**
 * Process messages for Vertex AI Gemini models
 * Handles system messages by converting them to user messages with instructions
 */
export function processMessagesForVertexAI(messages) {
  const contents = [];
  let systemMessage = '';

  // Extract system message if present
  const systemMsg = messages.find(msg => msg.role === 'system');
  if (systemMsg) {
    systemMessage = systemMsg.content;
  }

  // Process remaining messages
  const nonSystemMessages = messages.filter(msg => msg.role !== 'system');
  
  for (let i = 0; i < nonSystemMessages.length; i++) {
    const message = nonSystemMessages[i];
    
    // For the first user message, prepend system instructions if available
    if (i === 0 && message.role === 'user' && systemMessage) {
      contents.push({
        role: 'user',
        parts: [{
          text: `${systemMessage}\n\nUser: ${message.content}`
        }]
      });
    } else {
      contents.push({
        role: message.role === 'assistant' ? 'model' : 'user',
        parts: [{
          text: message.content
        }]
      });
    }
  }

  logger.debug('Processed messages for Vertex AI', {
    originalCount: messages.length,
    processedCount: contents.length,
    hasSystemMessage: !!systemMessage
  });

  return contents;
}

/**
 * Process messages for third-party models via Vertex AI Model Garden
 * Different providers may have different message formats
 */
export function processMessagesForThirdParty(messages, provider) {
  switch (provider) {
    case 'anthropic':
      return processMessagesForAnthropic(messages);
    case 'meta':
      return processMessagesForMeta(messages);
    case 'mistral':
      return processMessagesForMistral(messages);
    case 'cohere':
      return processMessagesForCohere(messages);
    default:
      return processMessagesGeneric(messages);
  }
}

/**
 * Process messages for Anthropic Claude models
 * Claude supports system messages and has specific formatting requirements
 */
function processMessagesForAnthropic(messages) {
  const processedMessages = [];
  
  // Handle system message separately for Claude
  const systemMsg = messages.find(msg => msg.role === 'system');
  const nonSystemMessages = messages.filter(msg => msg.role !== 'system');
  
  // Claude expects alternating user/assistant messages
  for (const message of nonSystemMessages) {
    processedMessages.push({
      role: message.role,
      content: message.content
    });
  }

  logger.debug('Processed messages for Anthropic Claude', {
    originalCount: messages.length,
    processedCount: processedMessages.length,
    hasSystemMessage: !!systemMsg
  });

  return processedMessages;
}

/**
 * Process messages for Meta Llama models
 * Llama models typically use a conversation format
 */
function processMessagesForMeta(messages) {
  const processedMessages = [];
  let systemMessage = '';

  // Extract system message
  const systemMsg = messages.find(msg => msg.role === 'system');
  if (systemMsg) {
    systemMessage = systemMsg.content;
  }

  const nonSystemMessages = messages.filter(msg => msg.role !== 'system');

  // Format for Llama chat template
  for (const message of nonSystemMessages) {
    const role = message.role === 'assistant' ? 'assistant' : 'user';
    processedMessages.push({
      role: role,
      content: message.content
    });
  }

  // If there's a system message, prepend it to the first user message
  if (systemMessage && processedMessages.length > 0 && processedMessages[0].role === 'user') {
    processedMessages[0].content = `${systemMessage}\n\n${processedMessages[0].content}`;
  }

  logger.debug('Processed messages for Meta Llama', {
    originalCount: messages.length,
    processedCount: processedMessages.length,
    hasSystemMessage: !!systemMessage
  });

  return processedMessages;
}

/**
 * Process messages for Mistral models
 * Mistral models support standard OpenAI-like message format
 */
function processMessagesForMistral(messages) {
  const processedMessages = [];

  for (const message of messages) {
    processedMessages.push({
      role: message.role,
      content: message.content
    });
  }

  logger.debug('Processed messages for Mistral', {
    originalCount: messages.length,
    processedCount: processedMessages.length
  });

  return processedMessages;
}

/**
 * Process messages for Cohere models
 * Cohere uses a different conversation format
 */
function processMessagesForCohere(messages) {
  const processedMessages = [];
  
  // Cohere expects the last message to be separate from chat history
  const chatHistory = messages.slice(0, -1);
  const currentMessage = messages[messages.length - 1];

  for (const message of chatHistory) {
    processedMessages.push({
      role: message.role === 'assistant' ? 'CHATBOT' : 'USER',
      message: message.content
    });
  }

  logger.debug('Processed messages for Cohere', {
    originalCount: messages.length,
    chatHistoryCount: processedMessages.length,
    currentMessage: currentMessage?.content?.substring(0, 100)
  });

  return {
    chatHistory: processedMessages,
    currentMessage: currentMessage?.content || ''
  };
}

/**
 * Generic message processing for unknown providers
 */
function processMessagesGeneric(messages) {
  const processedMessages = [];

  for (const message of messages) {
    processedMessages.push({
      role: message.role,
      content: message.content
    });
  }

  logger.debug('Processed messages generically', {
    originalCount: messages.length,
    processedCount: processedMessages.length
  });

  return processedMessages;
}

/**
 * Validate message format
 */
export function validateMessages(messages) {
  if (!Array.isArray(messages)) {
    throw new Error('Messages must be an array');
  }

  if (messages.length === 0) {
    throw new Error('Messages array cannot be empty');
  }

  for (const message of messages) {
    if (!message.role || !message.content) {
      throw new Error('Each message must have role and content properties');
    }

    if (!['system', 'user', 'assistant'].includes(message.role)) {
      throw new Error('Message role must be system, user, or assistant');
    }

    if (typeof message.content !== 'string') {
      throw new Error('Message content must be a string');
    }
  }

  return true;
}

/**
 * Extract the last user message from a conversation
 */
export function getLastUserMessage(messages) {
  const userMessages = messages.filter(msg => msg.role === 'user');
  return userMessages[userMessages.length - 1];
}

/**
 * Count tokens in messages (rough estimation)
 */
export function estimateTokenCount(messages) {
  let totalTokens = 0;
  
  for (const message of messages) {
    // Rough estimation: 1 token ≈ 4 characters
    totalTokens += Math.ceil(message.content.length / 4);
  }
  
  return totalTokens;
}

export default {
  extractMessageContent,
  processMessagesForVertexAI,
  processMessagesForThirdParty,
  validateMessages,
  getLastUserMessage,
  estimateTokenCount
}; 