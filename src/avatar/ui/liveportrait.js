/**
 * LivePortrait integration for Avatar Test UI
 */

class LivePortraitManager {
  constructor() {
    this.currentEmotion = CONFIG.DEFAULT_EMOTION;
    this.intensity = CONFIG.DEFAULT_INTENSITY;
    this.isRendering = false;
    this.statusElement = null;
    this.videoElement = null;
    this.canvasElement = null;
    this.placeholder = null;
  }

  init() {
    this.statusElement = document.getElementById('status-liveportrait');
    this.videoElement = document.getElementById('avatar-video');
    this.canvasElement = document.getElementById('avatar-canvas');
    this.placeholder = document.getElementById('video-placeholder');

    // Emotion buttons
    document.querySelectorAll('.emotion-btn').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const emotion = e.currentTarget.dataset.emotion;
        this.setEmotion(emotion);
      });
    });

    // Intensity slider
    const intensitySlider = document.getElementById('intensity-slider');
    const intensityValue = document.getElementById('intensity-value');

    intensitySlider.addEventListener('input', (e) => {
      this.intensity = parseFloat(e.target.value);
      intensityValue.textContent = this.intensity.toFixed(1);
    });

    // Check service health
    this.checkHealth();
  }

  async checkHealth() {
    try {
      logger.info('Checking LivePortrait service...');
      this.updateStatus('pending', 'Connecting...');

      const response = await fetch(`${CONFIG.LIVEPORTRAIT_API_URL}/health`, {
        signal: AbortSignal.timeout(5000),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const health = await response.json();

      logger.success('LivePortrait service healthy', health);
      this.updateStatus('connected', 'Connected');

      if (health.gpu_available) {
        logger.info(`GPU: ${health.gpu_name || 'Available'}`);
      } else {
        logger.warning('GPU not available, using CPU');
      }
    } catch (error) {
      logger.error('LivePortrait service unavailable', error.message);
      this.updateStatus('error', 'Offline');
    }
  }

  async setEmotion(emotion) {
    // Update UI
    document.querySelectorAll('.emotion-btn').forEach((btn) => {
      btn.classList.remove('active');
    });

    document.querySelector(`[data-emotion="${emotion}"]`)?.classList.add('active');

    this.currentEmotion = emotion;
    logger.info(`Emotion changed: ${emotion}`);

    // Render avatar with new emotion
    await this.renderEmotion();
  }

  async renderEmotion() {
    const character = characterManager.getActiveCharacter();

    if (!character || !character.avatarImagePath) {
      logger.warning('No character or avatar image available');
      return;
    }

    if (this.isRendering) {
      logger.debug('Render already in progress, skipping');
      return;
    }

    try {
      this.isRendering = true;
      logger.info(`Rendering ${this.currentEmotion} emotion...`);

      // In a real implementation, we would:
      // 1. Load the character's avatar image
      // 2. Send to LivePortrait service
      // 3. Display the result

      // For now, we'll simulate the API call
      const formData = new FormData();
      // formData.append('source_image', avatarImageBlob);
      formData.append('emotion', this.currentEmotion);
      formData.append('intensity', this.intensity.toString());
      formData.append('output_format', 'png');

      // Simulated API call (would be real in production)
      logger.debug('Would call: POST /render with emotion and intensity');

      // For testing, just show a message
      logger.success(`Emotion render queued: ${this.currentEmotion} @ ${this.intensity}`);

      // Notify other components (e.g., WebRTC)
      window.dispatchEvent(
        new CustomEvent('emotion-changed', {
          detail: {
            emotion: this.currentEmotion,
            intensity: this.intensity,
          },
        })
      );
    } catch (error) {
      logger.error('Render failed', error.message);
    } finally {
      this.isRendering = false;
    }
  }

  showVideo() {
    this.placeholder.classList.add('hidden');
    this.videoElement.classList.remove('hidden');
  }

  hideVideo() {
    this.placeholder.classList.remove('hidden');
    this.videoElement.classList.add('hidden');
  }

  updateStatus(status, text) {
    this.statusElement.className = `status-badge status-${status}`;
    this.statusElement.textContent = text;
  }
}

// Create global LivePortrait manager instance
window.livePortraitManager = new LivePortraitManager();
