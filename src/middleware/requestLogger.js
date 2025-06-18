import logger from '../config/logger.js';

// Detailed logging middleware
export function requestLogger(req, res, next) {
  logger.info('Request received', {
    method: req.method,
    url: req.url,
    userAgent: req.get('User-Agent'),
    ip: req.ip,
    headers: req.headers
  });
  
  console.log(`🔍 ${req.method} ${req.url} - IP: ${req.ip} - UA: ${req.get('User-Agent')}`);
  next();
}

export default requestLogger; 