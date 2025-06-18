import authService from './auth.js';
import logger from '../config/logger.js';
import { getActualModelName, getModelProvider, supportsStreaming } from '../config/models.js';
import { processMessagesForVertexAI, processMessagesForThirdParty } from '../utils/messageUtils.js';

class VertexService {
  constructor() {
    // Tool rotation state for Continue Agent Mode
    this.toolRotationState = {
      lastUsedToolIndex: -1,
      conversationId: null,
      toolUsageHistory: []
    };
  }

  async generateChatCompletion(params) {
    const { 
      model, 
      messages, 
      temperature = 0.7,
      max_tokens = 2048,
      top_p = 1,
      top_k = 40,
      stream = false,
      tools = null,
      tool_choice = null
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
      hasTools: tools && tools.length > 0,
      toolChoice: tool_choice,
      toolsDebug: tools ? JSON.stringify(tools).substring(0, 500) : 'none',
      projectId: authService.getProjectId()
    });

    // Different processing based on provider
    if (provider === 'google') {
      return await this.generateGoogleModelCompletion({
        vertexAI, actualModel, messages, temperature, max_tokens, top_p, top_k, stream, model, tools, tool_choice
      });
    } else {
      return await this.generateThirdPartyModelCompletion({
        vertexAI, actualModel, provider, messages, temperature, max_tokens, stream, model, tools, tool_choice
      });
    }
  }

  async generateGoogleModelCompletion({ vertexAI, actualModel, messages, temperature, max_tokens, top_p, top_k, stream, model, tools, tool_choice }) {
    // Configure the generative model for Google models
    const modelConfig = {
      model: actualModel,
      generationConfig: {
        temperature: Math.max(0, Math.min(2, temperature)),
        maxOutputTokens: Math.max(1, Math.min(8192, max_tokens)),
        topP: Math.max(0, Math.min(1, top_p)),
        topK: Math.max(1, Math.min(40, top_k))
      }
    };

    // Add tools if provided
    if (tools && tools.length > 0) {
      const vertexTools = this.convertOpenAIToolsToVertex(tools);
      if (vertexTools && vertexTools.functionDeclarations) {
        modelConfig.tools = [vertexTools];
        
        console.log('🔧 Added tools to Vertex request:', {
          toolCount: vertexTools.functionDeclarations.length,
          toolNames: vertexTools.functionDeclarations.map(f => f.name)
        });
      }
      
      // Handle tool_choice
      if (tool_choice) {
        if (tool_choice === 'auto') {
          modelConfig.toolConfig = { functionCallingConfig: { mode: 'AUTO' } };
        } else if (tool_choice === 'none') {
          modelConfig.toolConfig = { functionCallingConfig: { mode: 'NONE' } };
        } else if (typeof tool_choice === 'object' && tool_choice.type === 'function') {
          modelConfig.toolConfig = { 
            functionCallingConfig: { 
              mode: 'ANY',
              allowedFunctionNames: [tool_choice.function.name]
            } 
          };
        }
      }
    }

    const generativeModel = vertexAI.preview.getGenerativeModel(modelConfig);

    // Process messages for Vertex AI format (handles system messages)
    const contents = processMessagesForVertexAI(messages);

    logger.info('Processed contents for Google model', {
      originalMessageCount: messages.length,
      processedContentCount: contents.length,
      hasTools: tools && tools.length > 0,
      toolCount: tools ? tools.length : 0,
      firstContent: contents[0] ? JSON.stringify(contents[0]).substring(0, 200) : 'none'
    });

    try {
      if (stream && supportsStreaming(model)) {
        return await this.generateStreamingResponse(generativeModel, contents, model, 'google');
      } else {
        return await this.generateNonStreamingResponse(generativeModel, contents, model, 'google');
      }
    } catch (error) {
      // Check if error is related to multiple tools and implement fallback
      if (error.message && error.message.includes('Multiple tools are supported only when they are all search tools')) {
        logger.warn('Multiple tools error detected, falling back to single tool strategy', {
          originalToolCount: tools ? tools.length : 0,
          error: error.message
        });
        
        // Fallback: Use only the first tool
        if (tools && tools.length > 0) {
          const fallbackTools = this.convertOpenAIToolsToVertexFallback(tools);
          if (fallbackTools && fallbackTools.functionDeclarations) {
            modelConfig.tools = [fallbackTools];
            
            console.log('🔄 Fallback: Using single tool strategy:', {
              toolCount: fallbackTools.functionDeclarations.length,
              toolNames: fallbackTools.functionDeclarations.map(f => f.name)
            });
            
            const fallbackModel = vertexAI.preview.getGenerativeModel(modelConfig);
            
            if (stream && supportsStreaming(model)) {
              return await this.generateStreamingResponse(fallbackModel, contents, model, 'google');
            } else {
              return await this.generateNonStreamingResponse(fallbackModel, contents, model, 'google');
            }
          }
        }
      }
      
      // Re-throw the error if fallback doesn't apply
      throw error;
    }
  }

  async generateThirdPartyModelCompletion({ vertexAI, actualModel, provider, messages, temperature, max_tokens, stream, model, tools, tool_choice }) {
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
        stream,
        tools,
        tool_choice
      });

      logger.info('Third-party model request', {
        provider,
        model: actualModel,
        endpoint,
        hasTools: tools && tools.length > 0,
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

  convertOpenAIToolsToVertex(tools) {
    if (!tools || !Array.isArray(tools) || tools.length === 0) {
      return null;
    }

    // Extract all function declarations from the tools array
    const functionDeclarations = [];
    
    for (const tool of tools) {
      if (tool.type === 'function') {
        const func = tool.function;
        
        functionDeclarations.push({
          name: func.name,
          description: func.description || '',
          parameters: func.parameters || {}
        });
      }
    }
    
    if (functionDeclarations.length === 0) {
      return null;
    }
    
    console.log('🔧 Converting OpenAI tools to Vertex format:', {
      totalTools: tools.length,
      functionDeclarations: functionDeclarations.length,
      functionNames: functionDeclarations.map(f => f.name)
    });
    
    // Return all function declarations - Vertex AI should handle multiple functions
    return {
      functionDeclarations: functionDeclarations
    };
  }

  convertOpenAIToolsToVertexFallback(tools) {
    if (!tools || !Array.isArray(tools) || tools.length === 0) {
      return null;
    }

    // Smart tool selection with rotation for Continue Agent Mode
    let selectedTool = tools[0]; // Default to first tool
    
    // Priority list for Continue Agent Mode tools
    const toolPriorities = [
      'builtin_read_file',
      'builtin_edit_existing_file', 
      'builtin_create_new_file',
      'builtin_list_directory',
      'builtin_search_files',
      'builtin_run_terminal_command'
    ];
    
    // Tool rotation logic: cycle through available tools
    if (tools.length > 1) {
      this.toolRotationState.lastUsedToolIndex = 
        (this.toolRotationState.lastUsedToolIndex + 1) % tools.length;
      selectedTool = tools[this.toolRotationState.lastUsedToolIndex];
      
      // Track tool usage
      this.toolRotationState.toolUsageHistory.push({
        toolName: selectedTool.function?.name,
        timestamp: Date.now()
      });
      
      // Keep only last 10 entries
      if (this.toolRotationState.toolUsageHistory.length > 10) {
        this.toolRotationState.toolUsageHistory.shift();
      }
    } else {
      // Single tool or priority-based selection
      for (const priority of toolPriorities) {
        const foundTool = tools.find(tool => 
          tool.type === 'function' && tool.function.name === priority
        );
        if (foundTool) {
          selectedTool = foundTool;
          break;
        }
      }
    }
    
    if (selectedTool.type === 'function') {
      const func = selectedTool.function;
      
      console.log('🔄 Smart Tool Rotation:', {
        selectedTool: func.name,
        rotationIndex: this.toolRotationState.lastUsedToolIndex,
        totalTools: tools.length,
        availableTools: tools.map(t => t.function?.name).filter(Boolean),
        recentUsage: this.toolRotationState.toolUsageHistory.slice(-3).map(h => h.toolName)
      });
      
      return {
        functionDeclarations: [{
          name: func.name,
          description: func.description || '',
          parameters: func.parameters || {}
        }]
      };
    }
    
    return null;
  }

  buildThirdPartyRequest({ provider, messages, temperature, max_tokens, stream, tools, tool_choice }) {
    const baseRequest = {
      temperature: Math.max(0, Math.min(1, temperature)),
      max_tokens: Math.max(1, Math.min(4096, max_tokens))
    };

    // Add tools if supported by provider
    if (tools && tools.length > 0) {
      const vertexTools = this.convertOpenAIToolsToVertex(tools);
      if (vertexTools && vertexTools.functionDeclarations) {
        baseRequest.tools = [vertexTools];
        
        console.log('🔧 Added tools to Vertex request:', {
          toolCount: vertexTools.functionDeclarations.length,
          toolNames: vertexTools.functionDeclarations.map(f => f.name)
        });
      }
    }

    switch (provider) {
      case 'anthropic':
        baseRequest.tool_choice = tool_choice;
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
      
      // Initialize response structure
      let text = '';
      let toolCalls = [];
      let finishReason = 'stop';
      
      // Process response based on structure
      if (response.candidates && response.candidates[0]) {
        const candidate = response.candidates[0];
        
        if (candidate.content && candidate.content.parts) {
          for (const part of candidate.content.parts) {
            // Handle text parts
            if (part.text) {
              text += part.text;
            }
            
            // Handle function calls (tools)
            if (part.functionCall) {
              toolCalls.push({
                id: `call_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                type: 'function',
                function: {
                  name: part.functionCall.name,
                  arguments: JSON.stringify(part.functionCall.args || {})
                }
              });
              finishReason = 'tool_calls';
            }
          }
        }
        
        // Check finish reason from candidate
        if (candidate.finishReason) {
          switch (candidate.finishReason) {
            case 'STOP':
              finishReason = toolCalls.length > 0 ? 'tool_calls' : 'stop';
              break;
            case 'MAX_TOKENS':
              finishReason = 'length';
              break;
            case 'SAFETY':
              finishReason = 'content_filter';
              break;
            default:
              finishReason = 'stop';
          }
        }
      } else {
        // Fallback for different response formats
        if (typeof response.text === 'function') {
          text = response.text();
        } else if (response.text) {
          text = response.text;
        } else {
          text = JSON.stringify(response);
        }
      }

      logger.info('Google model response generated', {
        responseLength: text.length,
        hasResponse: !!response,
        model,
        toolCallCount: toolCalls.length,
        finishReason,
        responseStructure: Object.keys(response)
      });

      // Build OpenAI-compatible response
      const choice = {
        index: 0,
        message: {
          role: 'assistant',
          content: text || null
        },
        finish_reason: finishReason
      };

      // Add tool calls if present
      if (toolCalls.length > 0) {
        choice.message.tool_calls = toolCalls;
      }

      return {
        id: `chatcmpl-${Date.now()}`,
        object: 'chat.completion',
        created: Math.floor(Date.now() / 1000),
        model: model,
        choices: [choice],
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