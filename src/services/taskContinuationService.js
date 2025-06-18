import logger from '../config/logger.js';

class TaskContinuationService {
  constructor() {
    // Track ongoing tasks and their state
    this.activeTasks = new Map();
    this.taskHistory = new Map();
  }

  // Analyze if a conversation represents an ongoing task
  analyzeTaskContinuation(messages, tools) {
    if (!messages || messages.length < 2) {
      return { shouldContinue: false, taskState: null };
    }

    // Find the last assistant message with tool_calls
    const lastAssistantMessage = this.findLastAssistantToolCall(messages);
    if (!lastAssistantMessage) {
      return { shouldContinue: false, taskState: null };
    }

    // Find the corresponding tool results
    const toolResults = this.findToolResults(messages, lastAssistantMessage);
    if (!toolResults || toolResults.length === 0) {
      return { shouldContinue: false, taskState: null };
    }

    // Analyze if the task appears incomplete
    const taskAnalysis = this.analyzeTaskCompleteness(messages, toolResults, tools);
    
    return {
      shouldContinue: taskAnalysis.needsContinuation,
      taskState: {
        lastToolCall: lastAssistantMessage.tool_calls[0],
        toolResults: toolResults,
        taskType: taskAnalysis.taskType,
        completionLevel: taskAnalysis.completionLevel,
        nextSteps: taskAnalysis.suggestedNextSteps
      }
    };
  }

  // Find the last assistant message that contains tool_calls
  findLastAssistantToolCall(messages) {
    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i];
      if (msg.role === 'assistant' && msg.tool_calls && msg.tool_calls.length > 0) {
        return msg;
      }
    }
    return null;
  }

  // Find tool result messages that correspond to the tool calls
  findToolResults(messages, assistantMessage) {
    const toolCallIds = assistantMessage.tool_calls.map(tc => tc.id);
    const toolResults = [];

    // Look for tool messages after the assistant message
    const assistantIndex = messages.lastIndexOf(assistantMessage);
    for (let i = assistantIndex + 1; i < messages.length; i++) {
      const msg = messages[i];
      if (msg.role === 'tool' && toolCallIds.includes(msg.tool_call_id)) {
        toolResults.push(msg);
      }
    }

    return toolResults;
  }

  // Analyze if the task needs continuation based on tool results
  analyzeTaskCompleteness(messages, toolResults, availableTools) {
    const analysis = {
      needsContinuation: false,
      taskType: 'unknown',
      completionLevel: 0,
      suggestedNextSteps: []
    };

    // Get the original user request
    const userMessages = messages.filter(m => m.role === 'user');
    const originalRequest = userMessages[userMessages.length - 1]?.content || '';
    
    // Analyze tool results for continuation indicators
    for (const toolResult of toolResults) {
      const toolName = this.extractToolNameFromResult(toolResult);
      const toolContent = toolResult.content || '';

      switch (toolName) {
        case 'builtin_read_file':
          analysis.taskType = this.inferTaskTypeFromFileRead(originalRequest, toolContent);
          analysis.needsContinuation = this.shouldContinueAfterRead(originalRequest, toolContent);
          if (analysis.needsContinuation) {
            analysis.suggestedNextSteps = this.suggestNextStepsAfterRead(originalRequest, toolContent, availableTools);
          }
          break;

        case 'builtin_list_directory':
          analysis.needsContinuation = this.shouldContinueAfterList(originalRequest, toolContent);
          if (analysis.needsContinuation) {
            analysis.suggestedNextSteps = this.suggestNextStepsAfterList(originalRequest, toolContent, availableTools);
          }
          break;

        case 'builtin_search_files':
          analysis.needsContinuation = this.shouldContinueAfterSearch(originalRequest, toolContent);
          if (analysis.needsContinuation) {
            analysis.suggestedNextSteps = this.suggestNextStepsAfterSearch(originalRequest, toolContent, availableTools);
          }
          break;

        case 'builtin_run_terminal_command':
          analysis.needsContinuation = this.shouldContinueAfterCommand(originalRequest, toolContent);
          if (analysis.needsContinuation) {
            analysis.suggestedNextSteps = this.suggestNextStepsAfterCommand(originalRequest, toolContent, availableTools);
          }
          break;
      }
    }

    // Calculate completion level
    analysis.completionLevel = this.calculateCompletionLevel(analysis.taskType, toolResults);

    logger.info('Task continuation analysis', {
      taskType: analysis.taskType,
      needsContinuation: analysis.needsContinuation,
      completionLevel: analysis.completionLevel,
      nextSteps: analysis.suggestedNextSteps.length
    });

    return analysis;
  }

  // Extract tool name from tool result
  extractToolNameFromResult(toolResult) {
    // Try to infer from tool_call_id or other metadata
    if (toolResult.tool_call_id) {
      // Tool call IDs often contain the function name
      const parts = toolResult.tool_call_id.split('_');
      for (const part of parts) {
        if (part.startsWith('builtin_')) {
          return part;
        }
      }
    }
    return 'unknown';
  }

  // Infer task type from file reading context
  inferTaskTypeFromFileRead(request, fileContent) {
    const lowerRequest = request.toLowerCase();
    
    if (lowerRequest.includes('fix') || lowerRequest.includes('bug') || lowerRequest.includes('error')) {
      return 'debug_fix';
    }
    if (lowerRequest.includes('add') || lowerRequest.includes('implement') || lowerRequest.includes('create')) {
      return 'feature_add';
    }
    if (lowerRequest.includes('refactor') || lowerRequest.includes('improve') || lowerRequest.includes('optimize')) {
      return 'refactor';
    }
    if (lowerRequest.includes('test') || lowerRequest.includes('spec')) {
      return 'testing';
    }
    
    return 'analysis';
  }

  // Determine if continuation is needed after reading a file
  shouldContinueAfterRead(request, fileContent) {
    const lowerRequest = request.toLowerCase();
    
    // If user asked to fix, edit, modify, or add something, we should continue
    const actionWords = ['fix', 'edit', 'modify', 'add', 'implement', 'create', 'update', 'change', 'improve'];
    return actionWords.some(word => lowerRequest.includes(word));
  }

  // Suggest next steps after reading a file
  suggestNextStepsAfterRead(request, fileContent, availableTools) {
    const steps = [];
    const lowerRequest = request.toLowerCase();

    if (lowerRequest.includes('fix') || lowerRequest.includes('bug')) {
      if (availableTools.some(t => t.function.name === 'builtin_edit_existing_file')) {
        steps.push({
          tool: 'builtin_edit_existing_file',
          reason: 'Fix identified issues in the file'
        });
      }
    }

    if (lowerRequest.includes('add') || lowerRequest.includes('implement')) {
      if (availableTools.some(t => t.function.name === 'builtin_edit_existing_file')) {
        steps.push({
          tool: 'builtin_edit_existing_file',
          reason: 'Add requested functionality to the file'
        });
      }
    }

    if (lowerRequest.includes('test')) {
      if (availableTools.some(t => t.function.name === 'builtin_run_terminal_command')) {
        steps.push({
          tool: 'builtin_run_terminal_command',
          reason: 'Run tests to verify the changes'
        });
      }
    }

    return steps;
  }

  // Similar methods for other tool types
  shouldContinueAfterList(request, listContent) {
    const lowerRequest = request.toLowerCase();
    return lowerRequest.includes('analyze') || lowerRequest.includes('fix') || lowerRequest.includes('modify');
  }

  suggestNextStepsAfterList(request, listContent, availableTools) {
    const steps = [];
    if (availableTools.some(t => t.function.name === 'builtin_read_file')) {
      steps.push({
        tool: 'builtin_read_file',
        reason: 'Read relevant files from the directory listing'
      });
    }
    return steps;
  }

  shouldContinueAfterSearch(request, searchContent) {
    return searchContent && searchContent.length > 0;
  }

  suggestNextStepsAfterSearch(request, searchContent, availableTools) {
    const steps = [];
    if (availableTools.some(t => t.function.name === 'builtin_read_file')) {
      steps.push({
        tool: 'builtin_read_file',
        reason: 'Read files found in search results'
      });
    }
    return steps;
  }

  shouldContinueAfterCommand(request, commandOutput) {
    // Continue if command failed or if it's part of a setup process
    return commandOutput.includes('error') || commandOutput.includes('failed') || 
           request.toLowerCase().includes('setup') || request.toLowerCase().includes('install');
  }

  suggestNextStepsAfterCommand(request, commandOutput, availableTools) {
    const steps = [];
    
    if (commandOutput.includes('error') && availableTools.some(t => t.function.name === 'builtin_read_file')) {
      steps.push({
        tool: 'builtin_read_file',
        reason: 'Read configuration files to fix command errors'
      });
    }
    
    return steps;
  }

  // Calculate how complete the task appears to be
  calculateCompletionLevel(taskType, toolResults) {
    const toolCount = toolResults.length;
    
    switch (taskType) {
      case 'debug_fix':
        // Need: read → identify → fix → verify
        return Math.min(toolCount * 25, 100);
      
      case 'feature_add':
        // Need: read → implement → test → document
        return Math.min(toolCount * 25, 100);
      
      case 'analysis':
        // Usually complete after reading
        return Math.min(toolCount * 50, 100);
      
      default:
        return Math.min(toolCount * 33, 100);
    }
  }

  // Generate continuation prompt based on task state
  generateContinuationPrompt(taskState) {
    const { taskType, nextSteps, toolResults } = taskState;
    
    let prompt = `AUTONOMOUS TASK CONTINUATION: You have executed tools and received results. `;
    
    switch (taskType) {
      case 'debug_fix':
        prompt += `You are working on debugging/fixing an issue. `;
        break;
      case 'feature_add':
        prompt += `You are implementing a new feature. `;
        break;
      case 'refactor':
        prompt += `You are refactoring code. `;
        break;
      default:
        prompt += `You are working on a coding task. `;
    }

    prompt += `Based on the tool results you received, CONTINUE working to complete the task:\n\n`;

    if (nextSteps && nextSteps.length > 0) {
      prompt += `SUGGESTED NEXT STEPS:\n`;
      nextSteps.forEach((step, index) => {
        prompt += `${index + 1}. Use ${step.tool}: ${step.reason}\n`;
      });
    }

    prompt += `\nDon't ask for permission - execute the necessary tools immediately to complete the task. Continue until the entire task is finished.`;

    return prompt;
  }
}

export default new TaskContinuationService(); 