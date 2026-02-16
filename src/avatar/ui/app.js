/**
 * Main application entry point for Avatar Test UI
 */

class App {
  constructor() {
    this.initialized = false;
  }

  async init() {
    if (this.initialized) {
      return;
    }

    try {
      console.log('Initializing Avatar Test UI...');
      console.log('Configuration:', CONFIG);

      // Check for authentication
      this.checkAuthentication();

      // Initialize logger
      logger.init();
      logger.info('Avatar Test UI v1.0.0');
      logger.info('Initializing modules...');

      // Initialize all managers
      characterManager.init();
      livePortraitManager.init();
      voiceManager.init();

      if (CONFIG.ENABLE_WEBRTC) {
        webrtcManager.init();
      } else {
        logger.warning('WebRTC disabled');
      }

      // Setup global error handling
      this.setupErrorHandling();

      // Setup keyboard shortcuts
      this.setupKeyboardShortcuts();

      this.initialized = true;
      logger.success('Initialization complete');

      // Show welcome message
      this.showWelcomeMessage();
    } catch (error) {
      console.error('Initialization failed:', error);
      logger.error('Initialization failed', error.message);
      alert(`Failed to initialize application: ${error.message}`);
    }
  }

  checkAuthentication() {
    if (!CONFIG.AUTH_TOKEN) {
      logger.warning('No authentication token set');

      const token = prompt(
        'Enter authentication token (or leave empty for localhost testing):'
      );

      if (token) {
        CONFIG.AUTH_TOKEN = token;
        localStorage.setItem('auth_token', token);
        logger.info('Authentication token saved');
      }
    }
  }

  setupErrorHandling() {
    window.addEventListener('error', (event) => {
      logger.error('Uncaught error', event.message);
    });

    window.addEventListener('unhandledrejection', (event) => {
      logger.error('Unhandled promise rejection', event.reason);
    });
  }

  setupKeyboardShortcuts() {
    document.addEventListener('keydown', (event) => {
      // Ctrl/Cmd + R: Reload characters
      if ((event.ctrlKey || event.metaKey) && event.key === 'r') {
        event.preventDefault();
        characterManager.loadCharacters();
      }

      // Ctrl/Cmd + E: Toggle emotions panel
      if ((event.ctrlKey || event.metaKey) && event.key === 'e') {
        event.preventDefault();
        document.querySelector('.emotion-grid').parentElement.classList.toggle('hidden');
      }

      // Ctrl/Cmd + L: Clear log
      if ((event.ctrlKey || event.metaKey) && event.key === 'l') {
        event.preventDefault();
        logger.clear();
      }

      // Number keys 1-7: Quick emotion selection
      if (!event.ctrlKey && !event.metaKey && event.key >= '1' && event.key <= '7') {
        const emotions = ['neutral', 'happy', 'sad', 'surprised', 'angry', 'disgusted', 'fearful'];
        const index = parseInt(event.key) - 1;

        if (emotions[index]) {
          livePortraitManager.setEmotion(emotions[index]);
        }
      }

      // Space: Toggle microphone
      if (event.code === 'Space' && event.target.tagName !== 'TEXTAREA' && event.target.tagName !== 'INPUT') {
        event.preventDefault();
        document.getElementById('mic-btn').click();
      }
    });

    logger.info('Keyboard shortcuts enabled');
  }

  showWelcomeMessage() {
    const welcomeMessages = [
      'Welcome to Avatar System Test UI!',
      'Keyboard shortcuts:',
      '  1-7: Quick emotion selection',
      '  Space: Toggle microphone',
      '  Ctrl+R: Reload characters',
      '  Ctrl+L: Clear log',
      '',
      'Ready to test avatar system!',
    ];

    welcomeMessages.forEach((msg) => logger.info(msg));
  }
}

// Initialize application when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  const app = new App();
  app.init().catch((error) => {
    console.error('Application initialization failed:', error);
  });
});

// Export for debugging
window.app = new App();
