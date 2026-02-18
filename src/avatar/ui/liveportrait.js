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
    this.statusElement = document.getElementById("status-liveportrait");
    this.videoElement = document.getElementById("avatar-video");
    this.canvasElement = document.getElementById("avatar-canvas");
    this.placeholder = document.getElementById("video-placeholder");

    // Emotion buttons
    document.querySelectorAll(".emotion-btn").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        const emotion = e.currentTarget.dataset.emotion;
        this.setEmotion(emotion);
      });
    });

    // Intensity slider
    const intensitySlider = document.getElementById("intensity-slider");
    const intensityValue = document.getElementById("intensity-value");

    intensitySlider.addEventListener("input", (e) => {
      this.intensity = parseFloat(e.target.value);
      intensityValue.textContent = this.intensity.toFixed(1);
    });

    // Check service health
    this.checkHealth();
  }

  async checkHealth() {
    try {
      logger.info("Checking LivePortrait service...");
      this.updateStatus("pending", "Connecting...");

      const response = await fetch(`${CONFIG.LIVEPORTRAIT_API_URL}/health`, {
        signal: AbortSignal.timeout(5000),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const health = await response.json();

      logger.success("LivePortrait service healthy", health);
      this.updateStatus("connected", "Connected");

      if (health.gpu_available) {
        logger.info(`GPU: ${health.gpu_name || "Available"}`);
      } else {
        logger.warning("GPU not available, using CPU");
      }
    } catch (error) {
      logger.error("LivePortrait service unavailable", error.message);
      this.updateStatus("error", "Offline");
    }
  }

  async setEmotion(emotion) {
    // Update UI
    document.querySelectorAll(".emotion-btn").forEach((btn) => {
      btn.classList.remove("active");
    });

    document.querySelector(`[data-emotion="${emotion}"]`)?.classList.add("active");

    this.currentEmotion = emotion;
    logger.info(`Emotion changed: ${emotion}`);

    // Render avatar with new emotion
    await this.renderEmotion();
  }

  // Map UI emotions to LivePortrait expressions (supports: neutral, happy, sad, surprised)
  _mapEmotion(emotion) {
    const map = {
      neutral: "neutral",
      happy: "happy",
      sad: "sad",
      surprised: "surprised",
      angry: "surprised", // closest available
      disgusted: "sad", // closest available
      fearful: "surprised", // closest available
    };
    return map[emotion] || "neutral";
  }

  async renderEmotion() {
    const character = characterManager.getActiveCharacter();
    // Use character's avatar or fall back to bundled test image
    const avatarUrl = character?.avatarImagePath || "/default-avatar.jpg";

    if (!character) {
      logger.info("No character selected — using default avatar");
    }

    if (this.isRendering) {
      logger.debug("Render already in progress, skipping");
      return;
    }

    try {
      this.isRendering = true;
      const expression = this._mapEmotion(this.currentEmotion);
      logger.info(`Rendering expression: ${expression} (from ${this.currentEmotion})`);

      // 1. Fetch avatar image (character-specific or default)
      const imgResponse = await fetch(avatarUrl, {
        signal: AbortSignal.timeout(5000),
      });
      if (!imgResponse.ok) {
        throw new Error(`Failed to load avatar image: ${imgResponse.status}`);
      }
      const imgBlob = await imgResponse.blob();

      // 2. Send to LivePortrait service (POST /api/render)
      const formData = new FormData();
      formData.append("source_image", imgBlob, "avatar.jpg");
      formData.append("expression", expression);

      const renderResponse = await fetch(`${CONFIG.LIVEPORTRAIT_API_URL}/api/render`, {
        method: "POST",
        body: formData,
        signal: AbortSignal.timeout(CONFIG.RENDER_TIMEOUT),
      });

      if (!renderResponse.ok) {
        throw new Error(`Render failed: ${renderResponse.status}`);
      }

      // 3. Display result JPEG on canvas
      const resultBlob = await renderResponse.blob();
      const imgUrl = URL.createObjectURL(resultBlob);
      const img = new Image();

      img.onload = () => {
        const ctx = this.canvasElement.getContext("2d");
        this.canvasElement.width = img.naturalWidth || CONFIG.VIDEO_WIDTH;
        this.canvasElement.height = img.naturalHeight || CONFIG.VIDEO_HEIGHT;
        ctx.drawImage(img, 0, 0);
        URL.revokeObjectURL(imgUrl);

        this.placeholder.classList.add("hidden");
        this.canvasElement.classList.remove("hidden");

        logger.success(`Rendered: ${expression}`);
      };

      img.src = imgUrl;

      // Notify other components (e.g., WebRTC)
      window.dispatchEvent(
        new CustomEvent("emotion-changed", {
          detail: { emotion: this.currentEmotion, expression, intensity: this.intensity },
        }),
      );
    } catch (error) {
      logger.error("Render failed", error.message);
    } finally {
      this.isRendering = false;
    }
  }

  showVideo() {
    this.placeholder.classList.add("hidden");
    this.videoElement.classList.remove("hidden");
  }

  hideVideo() {
    this.placeholder.classList.remove("hidden");
    this.videoElement.classList.add("hidden");
  }

  updateStatus(status, text) {
    this.statusElement.className = `status-badge status-${status}`;
    this.statusElement.textContent = text;
  }
}

// Create global LivePortrait manager instance
window.livePortraitManager = new LivePortraitManager();
