import authService from './auth.js';
import logger from '../config/logger.js';
import { getActualModelName, getModelProvider, supportsStreaming } from '../config/models.js';
import { processMessagesForVertexAI, processMessagesForThirdParty } from '../utils/messageUtils.js';

class VertexService {
  async generateChatCompletion(params) {
    const { 
      model, 
      messages, 
      temperature = 0.7,
      max_tokens = 2048,
      top_p = 1,
      top_k = 40,
      stream = false
    } = params;

    const provider = getModelProvider(model);
    const vertexAI = authService.getVertexAI();
    const actualModel = getActualModelName(model, provider);

    logger.info('Processing chat completion via Vertex AI', {
      model: actualModel,
      provider,
      messageCount: messages.length,
      temperature,
      maxTokens: max_tokens,
      stream,
      projectId: authService.getProjectId()
    });

    // Different processing based on provider
    if (provider === 'google') {
      return await this.generateGoogleModelCompletion({
        vertexAI, actualModel, messages, temperature, max_tokens, top_p, top_k, stream, model
      });
    } else {
      return await this.generateThirdPartyModelCompletion({
        vertexAI, actualModel, provider, messages, temperature, max_tokens, stream, model
      });
    }
  }

  async generateGoogleModelCompletion({ vertexAI, actualModel, messages, temperature, max_tokens, top_p, top_k, stream, model }) {
    // Configure the generative model for Google models
    const generativeModel = vertexAI.preview.getGenerativeModel({
      model: actualModel,
      generationConfig: {
        temperature: Math.max(0, Math.min(2, temperature)),
        maxOutputTokens: Math.max(1, Math.min(8192, max_tokens)),
        topP: Math.max(0, Math.min(1, top_p)),
        topK: Math.max(1, Math.min(40, top_k))
      }
    });

    // Process messages for Vertex AI format (handles system messages)
    const contents = processMessagesForVertexAI(messages);

    logger.info('Processed contents for Google model', {
      originalMessageCount: messages.length,
      processedContentCount: contents.length,
      firstContent: contents[0] ? JSON.stringify(contents[0]).substring(0, 200) : 'none'
    });

    if (stream && supportsStreaming(model)) {
      return await this.generateStreamingResponse(generativeModel, contents, model, 'google');
    } else {
      return await this.generateNonStreamingResponse(generativeModel, contents, model, 'google');
    }
  }

  async generateThirdPartyModelCompletion({ vertexAI, actualModel, provider, messages, temperature, max_tokens, stream, model }) {
    try {
      // For third-party models via Model Garden, we use the prediction service
      const endpoint = `projects/${authService.getProjectId()}/locations/us-central1/publishers/${provider}/models/${actualModel}`;
      
      // Process messages for third-party format (different from Google format)
      const processedMessages = processMessagesForThirdParty(messages, provider);
      
      const requestPayload = this.buildThirdPartyRequest({
        provider,
        messages: processedMessages,
        temperature,
        max_tokens,
        stream
      });

      logger.info('Third-party model request', {
        provider,
        model: actualModel,
        endpoint,
        requestPayload: JSON.stringify(requestPayload).substring(0, 300)
      });

      if (stream && supportsStreaming(model)) {
        return await this.generateThirdPartyStreamingResponse(vertexAI, endpoint, requestPayload, model, provider);
      } else {
        return await this.generateThirdPartyNonStreamingResponse(vertexAI, endpoint, requestPayload, model, provider);
      }
    } catch (error) {
      logger.error('Third-party model error', {
        provider,
        model: actualModel,
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }

  buildThirdPartyRequest({ provider, messages, temperature, max_tokens, stream }) {
    const baseRequest = {
      temperature: Math.max(0, Math.min(1, temperature)),
      max_tokens: Math.max(1, Math.min(4096, max_tokens))
    };

    switch (provider) {
      case 'anthropic':
        return {
          anthropic_version: "bedrock-2023-05-31",
          messages: messages,
          ...baseRequest,
          stream
        };
        
      case 'meta':
        return {
          inputs: messages.map(msg => msg.content).join('\n'),
          parameters: {
            temperature: baseRequest.temperature,
            max_new_tokens: baseRequest.max_tokens,
            do_sample: true,
            top_p: 0.9
          }
        };
        
      case 'mistral':
        return {
          messages: messages,
          temperature: baseRequest.temperature,
          max_tokens: baseRequest.max_tokens,
          stream
        };
        
      case 'cohere':
        return {
          message: messages[messages.length - 1]?.content || '',
          chat_history: messages.slice(0, -1).map(msg => ({
            role: msg.role === 'assistant' ? 'CHATBOT' : 'USER',
            message: msg.content
          })),
          temperature: baseRequest.temperature,
          max_tokens: baseRequest.max_tokens,
          stream
        };
        
      default:
        return {
          messages: messages,
          ...baseRequest,
          stream
        };
    }
  }

  async generateStreamingResponse(generativeModel, contents, model, provider) {
    try {
      const streamingResult = await generativeModel.generateContentStream({
        contents: contents
      });

      return {
        isStream: true,
        stream: streamingResult.stream,
        provider
      };
    } catch (error) {
      logger.error('Google model streaming error', {
        error: error.message,
        stack: error.stack,
        model
      });
      throw error;
    }
  }

  async generateNonStreamingResponse(generativeModel, contents, model, provider) {
    try {
      const result = await generativeModel.generateContent({
        contents: contents
      });

      const response = result.response;
      
      // Get the text from the response - different methods depending on the response structure
      let text;
      if (typeof response.text === 'function') {
        text = response.text();
      } else if (response.candidates && response.candidates[0] && response.candidates[0].content) {
        // Handle the case where response has candidates array
        const candidate = response.candidates[0];
        if (candidate.content.parts && candidate.content.parts[0]) {
          text = candidate.content.parts[0].text;
        } else {
          text = candidate.content.text || '';
        }
      } else if (response.text) {
        text = response.text;
      } else {
        // Fallback: try to extract text from the response object
        text = JSON.stringify(response);
      }

      logger.info('Google model response generated', {
        responseLength: text.length,
        hasResponse: !!response,
        model,
        responseStructure: Object.keys(response)
      });

      return {
        id: `chatcmpl-${Date.now()}`,
        object: 'chat.completion',
        created: Math.floor(Date.now() / 1000),
        model: model,
        choices: [{
          index: 0,
          message: {
            role: 'assistant',
            content: text
          },
          finish_reason: 'stop'
        }],
        usage: {
          prompt_tokens: 0, // Vertex AI doesn't provide token counts
          completion_tokens: 0,
          total_tokens: 0
        }
      };
    } catch (error) {
      logger.error('Google model generation error', {
        error: error.message,
        stack: error.stack,
        model
      });
      throw error;
    }
  }

  async generateThirdPartyStreamingResponse(vertexAI, endpoint, requestPayload, model, provider) {
    try {
      // For third-party streaming, we'll need to use the prediction service
      // This is a simplified implementation - actual implementation may vary by provider
      const response = await this.generateThirdPartyNonStreamingResponse(vertexAI, endpoint, requestPayload, model, provider);
      
      // Convert to streaming format
      return {
        isStream: true,
        stream: this.createMockStream(response.choices[0].message.content),
        provider
      };
    } catch (error) {
      logger.error('Third-party streaming error', {
        error: error.message,
        stack: error.stack,
        model,
        provider
      });
      throw error;
    }
  }

  async generateThirdPartyNonStreamingResponse(vertexAI, endpoint, requestPayload, model, provider) {
    try {
      // This is a placeholder for third-party model calls via Vertex AI Model Garden
      // The actual implementation would use the Vertex AI prediction service
      
      logger.warn('Third-party model call attempted', {
        provider,
        model,
        message: 'Third-party models via Vertex AI Model Garden require specific setup and may not be available in all regions'
      });

      // For now, return a helpful message
      const helpMessage = this.getThirdPartyHelpMessage(provider, model);

      return {
        id: `chatcmpl-${Date.now()}`,
        object: 'chat.completion',
        created: Math.floor(Date.now() / 1000),
        model: model,
        choices: [{
          index: 0,
          message: {
            role: 'assistant',
            content: helpMessage
          },
          finish_reason: 'stop'
        }],
        usage: {
          prompt_tokens: 0,
          completion_tokens: 0,
          total_tokens: 0
        }
      };
    } catch (error) {
      logger.error('Third-party model generation error', {
        error: error.message,
        stack: error.stack,
        model,
        provider
      });
      throw error;
    }
  }

  getThirdPartyHelpMessage(provider, model) {
    const messages = {
      anthropic: `Claude models (${model}) are available through Vertex AI Model Garden. To enable:\n\n1. Go to Vertex AI Model Garden in Google Cloud Console\n2. Find and enable Claude models\n3. Accept the terms and conditions\n4. The model will be available for use\n\nNote: Availability may vary by region.`,
      
      meta: `Llama models (${model}) are available through Vertex AI Model Garden. To enable:\n\n1. Go to Vertex AI Model Garden in Google Cloud Console\n2. Find and enable Llama models\n3. Accept Meta's terms and conditions\n4. The model will be available for use`,
      
      mistral: `Mistral models (${model}) are available through Vertex AI Model Garden. To enable:\n\n1. Go to Vertex AI Model Garden in Google Cloud Console\n2. Find and enable Mistral models\n3. Accept the terms and conditions\n4. The model will be available for use`,
      
      cohere: `Cohere models (${model}) are available through Vertex AI Model Garden. To enable:\n\n1. Go to Vertex AI Model Garden in Google Cloud Console\n2. Find and enable Cohere models\n3. Accept the terms and conditions\n4. The model will be available for use`
    };

    return messages[provider] || `${provider} models are available through Vertex AI Model Garden. Please enable them in the Google Cloud Console.`;
  }

  // Helper method to create a mock stream for non-streaming third-party responses
  async* createMockStream(text) {
    const words = text.split(' ');
    for (const word of words) {
      yield { text: () => word + ' ' };
      await new Promise(resolve => setTimeout(resolve, 50));
    }
  }
}

export const vertexService = new VertexService();
export default vertexService; 