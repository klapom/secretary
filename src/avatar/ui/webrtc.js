/**
 * Live video stream manager for Avatar Test UI
 *
 * Uses MJPEG streaming from LivePortrait service for live avatar video.
 * The server renders frames at ~10fps and streams them as multipart JPEG.
 *
 * Flow:
 * 1. Upload source image via POST /api/stream/set-source
 * 2. Open MJPEG stream via GET /api/stream (displayed in <img>)
 * 3. Change expressions via POST /api/stream/set-expression
 */

class WebRTCManager {
  constructor() {
    this.isConnected = false;
    this.statusElement = null;
    this.videoElement = null;
    this.streamImg = null;
  }

  init() {
    this.statusElement = document.getElementById("status-webrtc");
    this.videoElement = document.getElementById("avatar-video");

    // Create an <img> element for MJPEG stream (hidden by default)
    this.streamImg = document.getElementById("avatar-stream");

    // Video controls
    document.getElementById("start-video").addEventListener("click", () => this.connect());
    document.getElementById("stop-video").addEventListener("click", () => this.disconnect());

    // Listen for emotion changes to update the stream expression
    window.addEventListener("emotion-changed", (e) => {
      this.onEmotionChanged(e.detail);
    });

    // Listen for character changes to update the stream source
    window.addEventListener("character-activated", (e) => {
      this.onCharacterChanged(e.detail.character);
    });
  }

  async connect() {
    if (this.isConnected) {
      logger.warning("Already streaming");
      return;
    }

    try {
      logger.info("Starting MJPEG stream...");
      this.updateStatus("pending", "Starting...");

      // Upload source image first
      const character = characterManager.getActiveCharacter();
      const avatarUrl = character?.avatarImagePath || "/default-avatar.jpg";

      const imgResponse = await fetch(avatarUrl, { signal: AbortSignal.timeout(5000) });
      if (!imgResponse.ok) {
        throw new Error(`Failed to load avatar: ${imgResponse.status}`);
      }
      const imgBlob = await imgResponse.blob();

      const formData = new FormData();
      formData.append("source_image", imgBlob, "avatar.jpg");

      const setSourceResp = await fetch(`${CONFIG.LIVEPORTRAIT_API_URL}/api/stream/set-source`, {
        method: "POST",
        body: formData,
        signal: AbortSignal.timeout(10000),
      });
      if (!setSourceResp.ok) {
        throw new Error(`Set source failed: ${setSourceResp.status}`);
      }
      logger.info("Source image uploaded to stream");

      // Start MJPEG stream
      this.streamImg.src = `${CONFIG.LIVEPORTRAIT_API_URL}/api/stream?t=${Date.now()}`;
      this.streamImg.classList.remove("hidden");
      document.getElementById("video-placeholder").classList.add("hidden");
      document.getElementById("avatar-canvas").classList.add("hidden");
      this.videoElement.classList.add("hidden");

      this.isConnected = true;
      this.updateStatus("connected", "Streaming (MJPEG)");
      logger.success("MJPEG stream started");

      document.getElementById("start-video").disabled = true;
      document.getElementById("stop-video").disabled = false;
    } catch (error) {
      logger.error("Stream start failed", error.message);
      this.updateStatus("error", "Failed");
      this.disconnect();
    }
  }

  disconnect() {
    if (this.streamImg) {
      this.streamImg.src = "";
      this.streamImg.classList.add("hidden");
    }

    this.isConnected = false;
    document.getElementById("video-placeholder").classList.remove("hidden");
    this.updateStatus("pending", "Not connected");

    document.getElementById("start-video").disabled = false;
    document.getElementById("stop-video").disabled = true;

    logger.info("Stream disconnected");
  }

  async onEmotionChanged({ emotion, expression, intensity }) {
    if (!this.isConnected) {
      return;
    }

    try {
      const formData = new FormData();
      formData.append("expression", expression || emotion);
      formData.append("intensity", String(intensity || 1.0));

      const resp = await fetch(`${CONFIG.LIVEPORTRAIT_API_URL}/api/stream/set-expression`, {
        method: "POST",
        body: formData,
        signal: AbortSignal.timeout(5000),
      });
      if (!resp.ok) {
        logger.warning(`Set expression failed: ${resp.status}`);
      } else {
        logger.info(`Stream expression updated: ${expression || emotion}`);
      }
    } catch (error) {
      logger.error("Failed to update stream expression", error.message);
    }
  }

  async onCharacterChanged(character) {
    if (!this.isConnected) {
      return;
    }

    logger.info(`Character changed: ${character.displayName}`);

    try {
      const avatarUrl = character?.avatarImagePath || "/default-avatar.jpg";
      const imgResponse = await fetch(avatarUrl, { signal: AbortSignal.timeout(5000) });
      if (!imgResponse.ok) {
        throw new Error(`Failed to load avatar: ${imgResponse.status}`);
      }
      const imgBlob = await imgResponse.blob();

      const formData = new FormData();
      formData.append("source_image", imgBlob, "avatar.jpg");

      const resp = await fetch(`${CONFIG.LIVEPORTRAIT_API_URL}/api/stream/set-source`, {
        method: "POST",
        body: formData,
        signal: AbortSignal.timeout(10000),
      });
      if (!resp.ok) {
        logger.warning(`Set source failed: ${resp.status}`);
      } else {
        logger.info("Stream source updated for new character");
      }
    } catch (error) {
      logger.error("Failed to update stream source", error.message);
    }
  }

  updateStatus(status, text) {
    this.statusElement.className = `status-badge status-${status}`;
    this.statusElement.textContent = text;
  }
}

// Create global WebRTC manager instance
window.webrtcManager = new WebRTCManager();
