// Mapping between "friendly" model names and actual Vertex AI Model Garden models
export const modelMappings = {
  // === GOOGLE NATIVE MODELS ===
  google: {
    "gemini-2.5-flash": "gemini-2.0-flash-exp", // Fallback to 2.0 until 2.5 is available
    "gemini-2.5-pro": "gemini-1.5-pro", // Fallback to 1.5 until 2.5 is available
    "gemini-2.0-flash": "gemini-2.0-flash-exp",
    "gemini-2.0-pro": "gemini-1.5-pro", // 2.0-pro may not be available yet
    "gemini-1.5-flash": "gemini-1.5-flash",
    "gemini-1.5-pro": "gemini-1.5-pro",
    "gemini-pro": "gemini-1.5-pro",
    "text-bison": "text-bison",
    "code-bison": "code-bison"
  },
  
  // === ANTHROPIC MODELS (via Vertex AI Model Garden) ===
  anthropic: {
    "claude-3-5-sonnet-20241022": "claude-3-5-sonnet@20241022",
    "claude-3-haiku-20240307": "claude-3-haiku@20240307",
    "claude-3-sonnet-20240229": "claude-3-sonnet@20240229",
    "claude-3-opus-20240229": "claude-3-opus@20240229"
  },
  
  // === META MODELS (via Vertex AI Model Garden) ===
  meta: {
    "llama-3-1-405b-instruct": "llama3-405b-instruct-maas",
    "llama-3-1-70b-instruct": "llama3-70b-instruct-maas", 
    "llama-3-1-8b-instruct": "llama3-8b-instruct-maas",
    "llama-2-70b-chat": "llama2-70b-chat-maas",
    "llama-2-13b-chat": "llama2-13b-chat-maas",
    "llama-2-7b-chat": "llama2-7b-chat-maas"
  },
  
  // === MISTRAL MODELS (via Vertex AI Model Garden) ===
  mistral: {
    "mistral-large-2407": "mistral-large@2407",
    "mistral-nemo-2407": "mistral-nemo@2407", 
    "codestral-2405": "codestral@2405",
    "mixtral-8x7b-instruct": "mixtral-8x7b-instruct-v01"
  },
  
  // === COHERE MODELS (via Vertex AI Model Garden) ===
  cohere: {
    "command-r-plus": "command-r-plus@20240515",
    "command-r": "command-r@20240515",
    "embed-english-v3": "embed-english-v3.0",
    "embed-multilingual-v3": "embed-multilingual-v3.0"
  }
};

// Get all available models for the /v1/models endpoint
export function getAllModels() {
  const allModels = [];
  
  // Add Google models
  Object.keys(modelMappings.google).forEach(id => {
    allModels.push({
      id,
      object: 'model',
      created: Date.now(),
      owned_by: 'google',
      permission: [],
      root: id,
      parent: null,
      context_length: getContextLength(id)
    });
  });
  
  // Add Anthropic models
  Object.keys(modelMappings.anthropic).forEach(id => {
    allModels.push({
      id,
      object: 'model',
      created: Date.now(),
      owned_by: 'anthropic',
      permission: [],
      root: id,
      parent: null,
      context_length: getContextLength(id)
    });
  });
  
  // Add Meta models
  Object.keys(modelMappings.meta).forEach(id => {
    allModels.push({
      id,
      object: 'model',
      created: Date.now(),
      owned_by: 'meta',
      permission: [],
      root: id,
      parent: null,
      context_length: getContextLength(id)
    });
  });
  
  // Add Mistral models
  Object.keys(modelMappings.mistral).forEach(id => {
    allModels.push({
      id,
      object: 'model',
      created: Date.now(),
      owned_by: 'mistral',
      permission: [],
      root: id,
      parent: null,
      context_length: getContextLength(id)
    });
  });
  
  // Add Cohere models
  Object.keys(modelMappings.cohere).forEach(id => {
    allModels.push({
      id,
      object: 'model',
      created: Date.now(),
      owned_by: 'cohere',
      permission: [],
      root: id,
      parent: null,
      context_length: getContextLength(id)
    });
  });
  
  return allModels;
}

// Get context length for different models
function getContextLength(modelId) {
  const contextLengths = {
    // Google models
    "gemini-2.5-flash": 1000000,
    "gemini-2.5-pro": 120000,
    "gemini-2.0-flash": 1000000,
    "gemini-2.0-pro": 120000,
    "gemini-1.5-flash": 1000000,
    "gemini-1.5-pro": 2000000,
    "gemini-pro": 32000,
    "text-bison": 8192,
    "code-bison": 8192,
    
    // Anthropic models
    "claude-3-5-sonnet-20241022": 200000,
    "claude-3-haiku-20240307": 200000,
    "claude-3-sonnet-20240229": 200000,
    "claude-3-opus-20240229": 200000,
    
    // Meta models
    "llama-3-1-405b-instruct": 128000,
    "llama-3-1-70b-instruct": 128000,
    "llama-3-1-8b-instruct": 128000,
    "llama-2-70b-chat": 4096,
    "llama-2-13b-chat": 4096,
    "llama-2-7b-chat": 4096,
    
    // Mistral models
    "mistral-large-2407": 128000,
    "mistral-nemo-2407": 128000,
    "codestral-2405": 32000,
    "mixtral-8x7b-instruct": 32000,
    
    // Cohere models
    "command-r-plus": 128000,
    "command-r": 128000,
    "embed-english-v3": 512,
    "embed-multilingual-v3": 512
  };
  
  return contextLengths[modelId] || 8192;
}

// Determine which provider a model belongs to
export function getModelProvider(modelId) {
  if (modelMappings.google[modelId]) return 'google';
  if (modelMappings.anthropic[modelId]) return 'anthropic';
  if (modelMappings.meta[modelId]) return 'meta';
  if (modelMappings.mistral[modelId]) return 'mistral';
  if (modelMappings.cohere[modelId]) return 'cohere';
  return null;
}

// Get the actual model name for Vertex AI
export function getActualModelName(modelId, provider) {
  return modelMappings[provider]?.[modelId] || modelId;
}

// Check if model supports streaming
export function supportsStreaming(modelId) {
  const streamingModels = [
    // Google models support streaming
    "gemini-2.5-flash", "gemini-2.5-pro", "gemini-2.0-flash", "gemini-2.0-pro",
    "gemini-1.5-flash", "gemini-1.5-pro", "gemini-pro",
    
    // Anthropic models support streaming
    "claude-3-5-sonnet-20241022", "claude-3-haiku-20240307", 
    "claude-3-sonnet-20240229", "claude-3-opus-20240229",
    
    // Meta models support streaming
    "llama-3-1-405b-instruct", "llama-3-1-70b-instruct", "llama-3-1-8b-instruct",
    
    // Mistral models support streaming
    "mistral-large-2407", "mistral-nemo-2407", "codestral-2405"
  ];
  
  return streamingModels.includes(modelId);
}

export default modelMappings; 