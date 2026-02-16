/**
 * WebRTC client for Avatar Test UI
 */

class WebRTCManager {
  constructor() {
    this.peerConnection = null;
    this.dataChannel = null;
    this.isConnected = false;
    this.statusElement = null;
    this.videoElement = null;
  }

  init() {
    this.statusElement = document.getElementById('status-webrtc');
    this.videoElement = document.getElementById('avatar-video');

    // Video controls
    document.getElementById('start-video').addEventListener('click', () => this.connect());
    document.getElementById('stop-video').addEventListener('click', () => this.disconnect());

    // Listen for character and emotion changes
    window.addEventListener('character-activated', (e) => {
      this.onCharacterChanged(e.detail.character);
    });

    window.addEventListener('emotion-changed', (e) => {
      this.onEmotionChanged(e.detail);
    });
  }

  async connect() {
    if (this.isConnected) {
      logger.warning('Already connected');
      return;
    }

    try {
      logger.info('Connecting to WebRTC stream...');
      this.updateStatus('pending', 'Connecting...');

      // Create peer connection
      this.peerConnection = new RTCPeerConnection({
        iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
      });

      // Handle incoming track
      this.peerConnection.ontrack = (event) => {
        logger.info('Received video track');
        this.videoElement.srcObject = event.streams[0];
        livePortraitManager.showVideo();
      });

      // Handle ICE candidates
      this.peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
          logger.debug('ICE candidate', event.candidate);
          // Send candidate to server
          this.sendSignaling({ type: 'ice-candidate', candidate: event.candidate });
        }
      };

      // Handle connection state
      this.peerConnection.onconnectionstatechange = () => {
        logger.info(`Connection state: ${this.peerConnection.connectionState}`);

        if (this.peerConnection.connectionState === 'connected') {
          this.isConnected = true;
          this.updateStatus('connected', 'Connected');
          logger.success('WebRTC connected');

          document.getElementById('start-video').disabled = true;
          document.getElementById('stop-video').disabled = false;
        } else if (
          this.peerConnection.connectionState === 'disconnected' ||
          this.peerConnection.connectionState === 'failed'
        ) {
          this.disconnect();
        }
      };

      // Create data channel for sending commands
      this.dataChannel = this.peerConnection.createDataChannel('avatar-control');

      this.dataChannel.onopen = () => {
        logger.info('Data channel opened');
      };

      this.dataChannel.onmessage = (event) => {
        logger.debug('Data channel message', event.data);
      };

      // Create offer
      const offer = await this.peerConnection.createOffer();
      await this.peerConnection.setLocalDescription(offer);

      // Send offer to server
      await this.sendSignaling({ type: 'offer', sdp: offer.sdp });

      // For now, we'll simulate the connection since WebRTC server may not be ready
      logger.warning('WebRTC not fully implemented - showing placeholder');
      this.updateStatus('pending', 'Simulated');
    } catch (error) {
      logger.error('WebRTC connection failed', error.message);
      this.updateStatus('error', 'Failed');
      this.disconnect();
    }
  }

  disconnect() {
    if (this.peerConnection) {
      this.peerConnection.close();
      this.peerConnection = null;
    }

    if (this.dataChannel) {
      this.dataChannel.close();
      this.dataChannel = null;
    }

    this.isConnected = false;
    this.videoElement.srcObject = null;
    livePortraitManager.hideVideo();

    this.updateStatus('pending', 'Not connected');

    document.getElementById('start-video').disabled = false;
    document.getElementById('stop-video').disabled = true;

    logger.info('WebRTC disconnected');
  }

  async sendSignaling(message) {
    try {
      // In a real implementation, this would send signaling messages
      // to the WebRTC server for connection establishment

      logger.debug('Signaling message', message.type);

      // For now, just log it
      // In production:
      // const response = await fetch(`${CONFIG.WEBRTC_SIGNALING_URL}/api/webrtc/signal`, {
      //   method: 'POST',
      //   headers: { 'Content-Type': 'application/json' },
      //   body: JSON.stringify(message)
      // });
    } catch (error) {
      logger.error('Signaling failed', error.message);
      throw error;
    }
  }

  sendCommand(command, data) {
    if (this.dataChannel && this.dataChannel.readyState === 'open') {
      const message = JSON.stringify({ command, data });
      this.dataChannel.send(message);
      logger.debug(`Sent command: ${command}`, data);
    } else {
      logger.warning('Data channel not ready');
    }
  }

  onCharacterChanged(character) {
    logger.info(`Character changed: ${character.displayName}`);

    // Send character change command
    this.sendCommand('change-character', {
      characterId: character.id,
      avatarPath: character.avatarImagePath,
      voiceId: character.voiceId,
    });
  }

  onEmotionChanged({ emotion, intensity }) {
    logger.info(`Emotion changed: ${emotion} (${intensity})`);

    // Send emotion command
    this.sendCommand('change-emotion', {
      emotion,
      intensity,
    });
  }

  updateStatus(status, text) {
    this.statusElement.className = `status-badge status-${status}`;
    this.statusElement.textContent = text;
  }
}

// Create global WebRTC manager instance
window.webrtcManager = new WebRTCManager();
