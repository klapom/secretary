/**
 * Configuration for Avatar Test UI
 */

const CONFIG = {
  // API Endpoints
  CHARACTER_API_URL: window.location.protocol + '//' + window.location.hostname + ':3000',
  LIVEPORTRAIT_API_URL: 'http://localhost:8001',
  VOICE_API_URL: 'http://localhost:8765',
  WEBRTC_SIGNALING_URL: window.location.protocol + '//' + window.location.hostname + ':3000',

  // Authentication
  // For testing, you can set this via localStorage or a prompt
  AUTH_TOKEN: localStorage.getItem('auth_token') || null,

  // Feature flags
  ENABLE_WEBRTC: true,
  ENABLE_TTS: true,
  ENABLE_STT: true,
  ENABLE_EMOTIONS: true,

  // Defaults
  DEFAULT_EMOTION: 'neutral',
  DEFAULT_INTENSITY: 0.7,
  DEFAULT_LANGUAGE: 'en',

  // Audio settings
  AUDIO_SAMPLE_RATE: 16000,
  AUDIO_CHUNK_SIZE: 4096,

  // Video settings
  VIDEO_WIDTH: 512,
  VIDEO_HEIGHT: 512,

  // Request timeouts (ms)
  API_TIMEOUT: 30000,
  RENDER_TIMEOUT: 10000,

  // Retry settings
  MAX_RETRIES: 3,
  RETRY_DELAY: 1000,

  // Logging
  LOG_LEVEL: 'info', // 'debug', 'info', 'warning', 'error'
  MAX_LOG_ENTRIES: 100,
};

// Allow configuration via URL parameters
const urlParams = new URLSearchParams(window.location.search);

if (urlParams.has('character_api')) {
  CONFIG.CHARACTER_API_URL = urlParams.get('character_api');
}

if (urlParams.has('liveportrait_api')) {
  CONFIG.LIVEPORTRAIT_API_URL = urlParams.get('liveportrait_api');
}

if (urlParams.has('voice_api')) {
  CONFIG.VOICE_API_URL = urlParams.get('voice_api');
}

if (urlParams.has('token')) {
  CONFIG.AUTH_TOKEN = urlParams.get('token');
  localStorage.setItem('auth_token', CONFIG.AUTH_TOKEN);
}

if (urlParams.has('debug')) {
  CONFIG.LOG_LEVEL = 'debug';
}

// Export configuration
window.CONFIG = CONFIG;
