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
        
        // Force AUTO mode for Continue Agent Mode - make it more aggressive
        modelConfig.toolConfig = { 
          functionCallingConfig: { 
            mode: 'AUTO' 
          } 
        };
        
        console.log('🔧 Added tools to Vertex request:', {
          toolCount: vertexTools.functionDeclarations.length,
          toolNames: vertexTools.functionDeclarations.map(f => f.name),
          mode: 'AUTO (Autonomous)'
        });
      }
      
      // Handle explicit tool_choice (override default AUTO)
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

    // Add autonomous system message for Continue Agent Mode
    let processedMessages = messages;
    if (tools && tools.length > 0) {
      const autonomousSystemMessage = this.createAutonomousSystemMessage(tools);
      processedMessages = [autonomousSystemMessage, ...messages];
    }
    
    // Process messages for Vertex AI format (handles system messages)
    const contents = processMessagesForVertexAI(processedMessages);

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
          // Extract context from the last user message for intelligent tool selection
          const lastUserMessage = messages.filter(m => m.role === 'user').pop();
          const context = lastUserMessage ? lastUserMessage.content : '';
          
          const fallbackTools = this.convertOpenAIToolsToVertexFallback(tools, context);
          if (fallbackTools && fallbackTools.functionDeclarations) {
            modelConfig.tools = [fallbackTools];
            
            console.log('🔄 Fallback: Using single tool strategy:', {
              toolCount: fallbackTools.functionDeclarations.length,
              toolNames: fallbackTools.functionDeclarations.map(f => f.name)
            });
            
            const fallbackModel = vertexAI.preview.getGenerativeModel(modelConfig);
            
            // Use the same processed messages with autonomous system message for fallback
            const fallbackContents = processMessagesForVertexAI(processedMessages);
            
            if (stream && supportsStreaming(model)) {
              return await this.generateStreamingResponse(fallbackModel, fallbackContents, model, 'google');
            } else {
              return await this.generateNonStreamingResponse(fallbackModel, fallbackContents, model, 'google');
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

  createAutonomousSystemMessage(tools) {
    const toolNames = tools.map(tool => tool.function.name).join(', ');
    
    return {
      role: 'system',
      content: `You are an autonomous AI coding assistant with direct access to file system and terminal tools. Available tools: ${toolNames}.

CRITICAL INSTRUCTIONS FOR AUTONOMOUS OPERATION:
1. ALWAYS USE TOOLS IMMEDIATELY when the user requests file operations, code analysis, or terminal commands
2. NEVER ask for permission or confirmation - execute tools directly and show results
3. When user says "read file X", immediately call builtin_read_file with the filepath
4. When user says "edit file X", immediately call builtin_edit_existing_file with changes
5. When user says "run command X", immediately call builtin_run_terminal_command
6. When user asks about project structure, immediately call builtin_list_directory
7. When user asks to find files, immediately call builtin_search_files
8. Be proactive - if you need information to complete a task, get it immediately using tools
9. Chain tool calls when needed - read files to understand context, then make edits
10. NEVER respond with "I need permission", "Should I...", or "Let me know if..." - just execute the tools
11. Execute tools first, then explain what you did
12. If a user asks about code, immediately read the relevant files to provide accurate information
13. If a user wants changes, immediately make them using the appropriate tools

MULTI-TURN TASK COMPLETION:
14. CONTINUE WORKING until the task is COMPLETELY finished
15. If you call a tool and get results, ANALYZE them and continue with next steps automatically
16. For complex tasks, break them down and execute each step sequentially
17. Don't stop after one tool call - keep going until the entire task is done
18. If you read a file and need to edit it, do both operations in sequence
19. If you need to create multiple files, create them all
20. If you need to run multiple commands, run them all
21. Only stop when the ENTIRE task is 100% complete

EXAMPLES OF COMPLETE TASK EXECUTION:
- "Fix the bug in main.js" → Read file → Analyze code → Identify bug → Edit file → Verify fix
- "Add error handling to all API calls" → List files → Read each file → Edit each file with error handling
- "Setup a new React component" → Create component file → Create test file → Update exports → Update documentation
- "Install and configure ESLint" → Run install command → Create config file → Update package.json → Run initial lint

Your goal is to be as autonomous as Cursor IDE - execute tools immediately and CONTINUE until tasks are fully complete.`
    };
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

  convertOpenAIToolsToVertexFallback(tools, context = '') {
    if (!tools || !Array.isArray(tools) || tools.length === 0) {
      return null;
    }

    // Smart tool selection based on context and rotation for Continue Agent Mode
    let selectedTool = tools[0]; // Default to first tool
    
    // Context-aware tool selection
    const contextKeywords = {
      'builtin_read_file': ['read', 'show', 'display', 'view', 'content', 'file', 'open'],
      'builtin_edit_existing_file': ['edit', 'modify', 'change', 'update', 'fix', 'replace'],
      'builtin_create_new_file': ['create', 'new', 'make', 'generate', 'write'],
      'builtin_list_directory': ['list', 'ls', 'directory', 'folder', 'structure', 'files'],
      'builtin_search_files': ['search', 'find', 'locate', 'grep', 'look'],
      'builtin_run_terminal_command': ['run', 'execute', 'command', 'terminal', 'shell', 'npm', 'git']
    };
    
    // Try to match context with appropriate tool
    const lowerContext = context.toLowerCase();
    let contextMatchedTool = null;
    
    for (const [toolName, keywords] of Object.entries(contextKeywords)) {
      if (keywords.some(keyword => lowerContext.includes(keyword))) {
        contextMatchedTool = tools.find(tool => 
          tool.type === 'function' && tool.function.name === toolName
        );
        if (contextMatchedTool) {
          selectedTool = contextMatchedTool;
          console.log('🎯 Context-matched tool:', {
            toolName,
            matchedKeywords: keywords.filter(k => lowerContext.includes(k)),
            context: context.substring(0, 100)
          });
          break;
        }
      }
    }
    
    // If no context match, use intelligent rotation
    if (!contextMatchedTool && tools.length > 1) {
      // Priority list for Continue Agent Mode tools
      const toolPriorities = [
        'builtin_read_file',
        'builtin_edit_existing_file', 
        'builtin_create_new_file',
        'builtin_list_directory',
        'builtin_search_files',
        'builtin_run_terminal_command'
      ];
      
      // Smart rotation: prefer tools that haven't been used recently
      const recentlyUsed = this.toolRotationState.toolUsageHistory
        .slice(-3)
        .map(h => h.toolName);
      
      // Find a tool that hasn't been used recently
      for (const priority of toolPriorities) {
        const foundTool = tools.find(tool => 
          tool.type === 'function' && 
          tool.function.name === priority &&
          !recentlyUsed.includes(priority)
        );
        if (foundTool) {
          selectedTool = foundTool;
          break;
        }
      }
      
      // If all tools were used recently, cycle through them
      if (recentlyUsed.includes(selectedTool.function?.name)) {
        this.toolRotationState.lastUsedToolIndex = 
          (this.toolRotationState.lastUsedToolIndex + 1) % tools.length;
        selectedTool = tools[this.toolRotationState.lastUsedToolIndex];
      }
      
      // Track tool usage
      this.toolRotationState.toolUsageHistory.push({
        toolName: selectedTool.function?.name,
        timestamp: Date.now()
      });
      
      // Keep only last 10 entries
      if (this.toolRotationState.toolUsageHistory.length > 10) {
        this.toolRotationState.toolUsageHistory.shift();
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