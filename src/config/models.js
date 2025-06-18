/**
 * Model Configuration
 * 
 * Defines available models through Google Vertex AI.
 * All models use gcloud CLI authentication.
 * 
 * @module config/models
 */

// Model mappings for Vertex AI native models
export const modelMappings = {
  // === GOOGLE MODELS (Native Vertex AI) ===
  google: {
    "gemini-1.5-pro": "gemini-1.5-pro",
    "gemini-1.5-flash": "gemini-1.5-flash", 
    "gemini-1.0-pro": "gemini-1.0-pro",
    "text-bison": "text-bison",
    "code-bison": "code-bison",
    "chat-bison": "chat-bison"
  }
};

/**
 * Get all available models in OpenAI API format
 * @returns {Array} Array of model objects
 */
export function getAvailableModels() {
  const models = [];
  
  // Add Google models
  Object.keys(modelMappings.google).forEach(id => {
    models.push({
      id: id,
      object: 'model',
      created: Date.now(),
      owned_by: 'google',
      permission: [],
      root: id,
      parent: null
    });
  });

  return models;
}

/**
 * Model context length limits
 */
export const modelContextLimits = {
  // Google models
  "gemini-1.5-pro": 2097152,     // 2M tokens
  "gemini-1.5-flash": 1048576,   // 1M tokens
  "gemini-1.0-pro": 32768,       // 32K tokens
  "text-bison": 8192,            // 8K tokens
  "code-bison": 8192,            // 8K tokens
  "chat-bison": 8192             // 8K tokens
};

/**
 * Get the provider for a given model
 * @param {string} modelId - The model identifier
 * @returns {string} The provider name
 */
export function getModelProvider(modelId) {
  if (modelMappings.google[modelId]) return 'google';
  
  // Default to google for unknown models
  return 'google';
}

/**
 * Get the actual model name for API calls
 * @param {string} modelId - The model identifier
 * @param {string} provider - The provider name
 * @returns {string} The actual model name
 */
export function getActualModelName(modelId, provider) {
  const mapping = modelMappings[provider];
  return mapping ? mapping[modelId] || modelId : modelId;
}

/**
 * Check if a model supports streaming
 * @param {string} modelId - The model identifier
 * @returns {boolean} Whether the model supports streaming
 */
export function supportsStreaming(modelId) {
  // All Google models support streaming
  const streamingModels = [
    "gemini-1.5-pro", "gemini-1.5-flash", "gemini-1.0-pro",
    "text-bison", "code-bison", "chat-bison"
  ];
  
  return streamingModels.includes(modelId);
}

/**
 * Get the context limit for a model
 * @param {string} modelId - The model identifier
 * @returns {number} The context limit in tokens
 */
export function getModelContextLimit(modelId) {
  return modelContextLimits[modelId] || 8192; // Default to 8K tokens
}

export default modelMappings; 