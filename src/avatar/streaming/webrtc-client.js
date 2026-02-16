/**
 * Browser WebRTC Client
 *
 * Connects to WebRTC signaling server and establishes peer connection
 * for avatar video/audio streaming.
 */

class AvatarWebRTCClient {
  constructor() {
    this.ws = null;
    this.pc = null;
    this.peerId = null;
    this.config = null;
    this.localStream = null;
    this.remoteStream = null;
    this.isMuted = false;
    this.isConnected = false;

    // Performance metrics
    this.metrics = {
      latency: 0,
      fps: 0,
      bitrate: 0,
      packetLoss: 0,
    };

    // Bind UI elements
    this.videoElement = document.getElementById('remoteVideo');
    this.statusElement = document.getElementById('status');
    this.connectBtn = document.getElementById('connectBtn');
    this.disconnectBtn = document.getElementById('disconnectBtn');
    this.muteBtn = document.getElementById('muteBtn');
    this.logsElement = document.getElementById('logs');

    // Metrics display
    this.latencyElement = document.getElementById('latency');
    this.fpsElement = document.getElementById('fps');
    this.bitrateElement = document.getElementById('bitrate');
    this.packetLossElement = document.getElementById('packetLoss');

    // Bind event handlers
    this.connectBtn.addEventListener('click', () => this.connect());
    this.disconnectBtn.addEventListener('click', () => this.disconnect());
    this.muteBtn.addEventListener('click', () => this.toggleMute());

    // Start metrics updates
    setInterval(() => this.updateMetrics(), 1000);
  }

  /**
   * Connect to WebRTC signaling server
   */
  async connect() {
    this.log('Connecting to signaling server...');
    this.updateStatus('connecting', '🟡 Connecting...');
    this.connectBtn.disabled = true;

    try {
      // Get WebSocket URL from current location or default
      const wsUrl = `ws://${window.location.hostname}:8081`;
      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        this.log('WebSocket connected');
      };

      this.ws.onmessage = (event) => {
        this.handleSignalingMessage(JSON.parse(event.data));
      };

      this.ws.onerror = (error) => {
        this.log(`WebSocket error: ${error.message}`, 'error');
        this.updateStatus('disconnected', '🔴 Connection Error');
        this.connectBtn.disabled = false;
      };

      this.ws.onclose = () => {
        this.log('WebSocket disconnected');
        this.updateStatus('disconnected', '⚫ Disconnected');
        this.cleanup();
      };
    } catch (error) {
      this.log(`Connection failed: ${error.message}`, 'error');
      this.updateStatus('disconnected', '🔴 Connection Failed');
      this.connectBtn.disabled = false;
    }
  }

  /**
   * Disconnect from server
   */
  disconnect() {
    this.log('Disconnecting...');
    if (this.ws) {
      this.ws.close();
    }
    this.cleanup();
  }

  /**
   * Handle signaling messages
   */
  async handleSignalingMessage(message) {
    this.log(`Received: ${message.type}`);

    switch (message.type) {
      case 'config':
        await this.handleConfig(message);
        break;
      case 'answer':
        await this.handleAnswer(message.data);
        break;
      case 'ice-candidate':
        await this.handleIceCandidate(message.data);
        break;
      case 'error':
        this.log(`Server error: ${message.error}`, 'error');
        this.updateStatus('disconnected', `🔴 Error: ${message.error}`);
        break;
      case 'ping':
        this.send({ type: 'pong' });
        break;
    }
  }

  /**
   * Handle initial config from server
   */
  async handleConfig(message) {
    this.peerId = message.peerId;
    this.config = message.data;
    this.log(`Peer ID: ${this.peerId}`);
    this.log(`ICE Servers: ${JSON.stringify(this.config.iceServers)}`);

    // Get user media (microphone for bidirectional audio)
    try {
      this.localStream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: false,
      });
      this.log('Got user media (microphone)');
    } catch (error) {
      this.log(`Failed to get user media: ${error.message}`, 'warn');
      // Continue without microphone
    }

    // Create peer connection
    await this.createPeerConnection();

    // Create and send offer
    const offer = await this.pc.createOffer();
    await this.pc.setLocalDescription(offer);
    this.send({ type: 'offer', data: offer });
    this.log('Sent offer to server');
  }

  /**
   * Create WebRTC peer connection
   */
  async createPeerConnection() {
    this.pc = new RTCPeerConnection({
      iceServers: this.config.iceServers,
    });

    // Add local audio track (microphone)
    if (this.localStream) {
      this.localStream.getAudioTracks().forEach(track => {
        this.pc.addTrack(track, this.localStream);
      });
    }

    // Handle ICE candidates
    this.pc.onicecandidate = (event) => {
      if (event.candidate) {
        this.send({ type: 'ice-candidate', data: event.candidate });
      }
    };

    // Handle connection state
    this.pc.onconnectionstatechange = () => {
      this.log(`Connection state: ${this.pc.connectionState}`);
      if (this.pc.connectionState === 'connected') {
        this.isConnected = true;
        this.updateStatus('connected', '🟢 Connected');
        this.connectBtn.disabled = true;
        this.disconnectBtn.disabled = false;
        this.muteBtn.disabled = false;
      } else if (this.pc.connectionState === 'disconnected' || this.pc.connectionState === 'failed') {
        this.updateStatus('disconnected', '🔴 Disconnected');
        this.cleanup();
      }
    };

    // Handle remote tracks (video/audio from server)
    this.pc.ontrack = (event) => {
      this.log(`Received remote track: ${event.track.kind}`);
      if (!this.remoteStream) {
        this.remoteStream = new MediaStream();
        this.videoElement.srcObject = this.remoteStream;
      }
      this.remoteStream.addTrack(event.track);
    };
  }

  /**
   * Handle answer from server
   */
  async handleAnswer(answer) {
    if (!this.pc) {
      this.log('No peer connection', 'error');
      return;
    }
    await this.pc.setRemoteDescription(answer);
    this.log('Set remote description (answer)');
  }

  /**
   * Handle ICE candidate
   */
  async handleIceCandidate(candidate) {
    if (!this.pc) {
      this.log('No peer connection', 'error');
      return;
    }
    await this.pc.addIceCandidate(candidate);
  }

  /**
   * Toggle microphone mute
   */
  toggleMute() {
    if (!this.localStream) {
      return;
    }

    this.isMuted = !this.isMuted;
    this.localStream.getAudioTracks().forEach(track => {
      track.enabled = !this.isMuted;
    });

    this.muteBtn.textContent = this.isMuted ? '🔊 Unmute Mic' : '🔇 Mute Mic';
    this.log(`Microphone ${this.isMuted ? 'muted' : 'unmuted'}`);
  }

  /**
   * Send message to signaling server
   */
  send(message) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    }
  }

  /**
   * Update connection status
   */
  updateStatus(state, text) {
    this.statusElement.className = `status ${state}`;
    this.statusElement.textContent = text;
  }

  /**
   * Update performance metrics
   */
  async updateMetrics() {
    if (!this.pc || !this.isConnected) {
      return;
    }

    try {
      const stats = await this.pc.getStats();
      let inboundVideoStats = null;
      let inboundAudioStats = null;

      stats.forEach(report => {
        if (report.type === 'inbound-rtp') {
          if (report.kind === 'video') {
            inboundVideoStats = report;
          } else if (report.kind === 'audio') {
            inboundAudioStats = report;
          }
        }
      });

      if (inboundVideoStats) {
        // Calculate FPS
        const fps = inboundVideoStats.framesPerSecond || 0;
        this.metrics.fps = fps;
        this.fpsElement.textContent = `${fps}`;

        // Calculate bitrate (kbps)
        if (this.lastBytesReceived !== undefined) {
          const bytesReceived = inboundVideoStats.bytesReceived || 0;
          const bitrate = Math.round((bytesReceived - this.lastBytesReceived) * 8 / 1024);
          this.metrics.bitrate = bitrate;
          this.bitrateElement.textContent = `${bitrate} kbps`;
        }
        this.lastBytesReceived = inboundVideoStats.bytesReceived || 0;

        // Calculate packet loss
        const packetsLost = inboundVideoStats.packetsLost || 0;
        const packetsReceived = inboundVideoStats.packetsReceived || 0;
        const packetLoss = packetsReceived > 0
          ? ((packetsLost / (packetsReceived + packetsLost)) * 100).toFixed(1)
          : 0;
        this.metrics.packetLoss = packetLoss;
        this.packetLossElement.textContent = `${packetLoss}%`;

        // Calculate latency (RTT)
        const rtt = inboundVideoStats.roundTripTime || 0;
        this.metrics.latency = Math.round(rtt * 1000);
        this.latencyElement.textContent = `${this.metrics.latency}ms`;
      }
    } catch (error) {
      // Stats not available yet
    }
  }

  /**
   * Cleanup resources
   */
  cleanup() {
    this.isConnected = false;

    if (this.pc) {
      this.pc.close();
      this.pc = null;
    }

    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }

    if (this.localStream) {
      this.localStream.getTracks().forEach(track => track.stop());
      this.localStream = null;
    }

    if (this.remoteStream) {
      this.remoteStream = null;
    }

    this.videoElement.srcObject = null;
    this.connectBtn.disabled = false;
    this.disconnectBtn.disabled = true;
    this.muteBtn.disabled = true;
    this.peerId = null;
    this.config = null;

    // Reset metrics
    this.latencyElement.textContent = '--';
    this.fpsElement.textContent = '--';
    this.bitrateElement.textContent = '--';
    this.packetLossElement.textContent = '--';
  }

  /**
   * Log message to console and UI
   */
  log(message, level = 'info') {
    const timestamp = new Date().toLocaleTimeString();
    console[level === 'error' ? 'error' : 'log'](`[${timestamp}] ${message}`);

    const logEntry = document.createElement('div');
    logEntry.className = 'log-entry';
    logEntry.innerHTML = `<span class="log-time">[${timestamp}]</span>${message}`;
    this.logsElement.appendChild(logEntry);
    this.logsElement.scrollTop = this.logsElement.scrollHeight;

    // Keep only last 50 log entries
    while (this.logsElement.children.length > 50) {
      this.logsElement.removeChild(this.logsElement.firstChild);
    }
  }
}

// Initialize client when page loads
window.addEventListener('DOMContentLoaded', () => {
  window.avatarClient = new AvatarWebRTCClient();
});
