import { GoogleAuth } from 'google-auth-library';
import { VertexAI } from '@google-cloud/vertexai';
import config from '../config/environment.js';
import logger from '../config/logger.js';

class AuthService {
  constructor() {
    this.projectId = null;
    this.vertexAI = null;
  }

  async initialize() {
    try {
      const auth = new GoogleAuth({
        scopes: ['https://www.googleapis.com/auth/cloud-platform']
      });
      
      // Automatically detect project ID from user credentials
      this.projectId = config.googleCloud.projectId || await auth.getProjectId();
      
      if (!this.projectId) {
        throw new Error('Could not detect Project ID. Make sure you are authenticated with: gcloud auth application-default login');
      }
      
      // Initialize Vertex AI with default credentials
      this.vertexAI = new VertexAI({ 
        project: this.projectId, 
        location: config.googleCloud.location 
      });
      
      logger.info('Google Cloud initialized successfully', {
        projectId: this.projectId,
        location: config.googleCloud.location,
        authSource: config.googleCloud.projectId ? 'environment' : 'gcloud-auth'
      });
      
      console.log(`🔐 Authenticated with Google Cloud (Project: ${this.projectId})`);
      
    } catch (error) {
      logger.error('Failed to initialize Google Cloud authentication', {
        error: error.message,
        stack: error.stack
      });
      
      console.error('❌ Google Cloud authentication error:');
      console.error(`   ${error.message}`);
      console.error('\n💡 To resolve:');
      console.error('   1. Run: gcloud auth application-default login');
      console.error('   2. Make sure you have a default project: gcloud config set project YOUR_PROJECT_ID');
      console.error('   3. Enable required APIs: gcloud services enable aiplatform.googleapis.com');
      
      throw error;
    }
  }

  getVertexAI() {
    if (!this.vertexAI) {
      throw new Error('Vertex AI not initialized. Call initialize() first.');
    }
    return this.vertexAI;
  }

  getProjectId() {
    return this.projectId;
  }
}

export const authService = new AuthService();
export default authService; 