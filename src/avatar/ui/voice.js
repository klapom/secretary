/**
 * Voice Pipeline (TTS/STT) integration for Avatar Test UI
 */

class VoiceManager {
  constructor() {
    this.isRecording = false;
    this.mediaRecorder = null;
    this.audioChunks = [];
    this.audioContext = null;
    this.analyser = null;
    this.animationFrame = null;
    this.statusElement = null;
  }

  init() {
    this.statusElement = document.getElementById('status-voice');

    // TTS controls
    const speakBtn = document.getElementById('speak-btn');
    const ttsText = document.getElementById('tts-text');
    const ttsLanguage = document.getElementById('tts-language');

    speakBtn.addEventListener('click', () => {
      const text = ttsText.value.trim();
      const language = ttsLanguage.value;

      if (text) {
        this.speak(text, language);
      }
    });

    // Enable speak button when text is entered
    ttsText.addEventListener('input', () => {
      speakBtn.disabled = !ttsText.value.trim();
    });

    // STT controls
    const micBtn = document.getElementById('mic-btn');
    const sttLanguage = document.getElementById('stt-language');

    micBtn.addEventListener('click', () => {
      if (this.isRecording) {
        this.stopRecording();
      } else {
        this.startRecording(sttLanguage.value);
      }
    });

    // Check service health
    this.checkHealth();
  }

  async checkHealth() {
    try {
      logger.info('Checking Voice Pipeline service...');
      this.updateStatus('pending', 'Connecting...');

      const response = await fetch(`${CONFIG.VOICE_API_URL}/health`, {
        signal: AbortSignal.timeout(5000),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const health = await response.json();

      logger.success('Voice Pipeline service healthy', health);
      this.updateStatus('connected', 'Connected');
    } catch (error) {
      logger.error('Voice Pipeline service unavailable', error.message);
      this.updateStatus('error', 'Offline');
    }
  }

  async speak(text, language = 'en') {
    const statusDiv = document.getElementById('tts-status');

    try {
      logger.info(`TTS: "${text}" (${language})`);

      statusDiv.textContent = 'Synthesizing speech...';
      statusDiv.className = 'status-message';
      statusDiv.classList.remove('hidden', 'success', 'error');

      // Call TTS API
      const response = await fetch(`${CONFIG.VOICE_API_URL}/tts/synthesize`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text,
          language,
          voice_id: 'default',
        }),
        signal: AbortSignal.timeout(CONFIG.API_TIMEOUT),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      // Get audio blob
      const audioBlob = await response.blob();

      // Play audio
      const audioUrl = URL.createObjectURL(audioBlob);
      const audio = new Audio(audioUrl);

      audio.onplay = () => {
        logger.success('Playing synthesized speech');
        statusDiv.textContent = 'Playing...';
        statusDiv.classList.add('success');
      };

      audio.onended = () => {
        logger.info('Playback finished');
        statusDiv.textContent = 'Speech completed';
        setTimeout(() => statusDiv.classList.add('hidden'), 2000);
        URL.revokeObjectURL(audioUrl);
      };

      audio.onerror = () => {
        throw new Error('Audio playback failed');
      };

      await audio.play();
    } catch (error) {
      logger.error('TTS failed', error.message);
      statusDiv.textContent = `Error: ${error.message}`;
      statusDiv.classList.add('error');

      setTimeout(() => statusDiv.classList.add('hidden'), 5000);
    }
  }

  async startRecording(language = 'en') {
    try {
      logger.info('Starting microphone recording...');

      // Request microphone access
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate: CONFIG.AUDIO_SAMPLE_RATE,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
        },
      });

      // Setup audio visualizer
      this.setupVisualizer(stream);

      // Setup media recorder
      this.mediaRecorder = new MediaRecorder(stream, {
        mimeType: 'audio/webm',
      });

      this.audioChunks = [];

      this.mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          this.audioChunks.push(event.data);
        }
      };

      this.mediaRecorder.onstop = () => {
        this.transcribeAudio(language);
      };

      this.mediaRecorder.start();
      this.isRecording = true;

      // Update UI
      const micBtn = document.getElementById('mic-btn');
      micBtn.classList.add('recording');
      micBtn.querySelector('.mic-text').textContent = 'Stop Recording';

      document.getElementById('audio-visualizer').classList.remove('hidden');
      document.getElementById('transcription').classList.add('hidden');

      logger.success('Recording started');
    } catch (error) {
      logger.error('Microphone access failed', error.message);
      alert('Microphone access denied. Please allow microphone access and try again.');
    }
  }

  stopRecording() {
    if (this.mediaRecorder && this.isRecording) {
      this.mediaRecorder.stop();
      this.mediaRecorder.stream.getTracks().forEach((track) => track.stop());
      this.isRecording = false;

      // Update UI
      const micBtn = document.getElementById('mic-btn');
      micBtn.classList.remove('recording');
      micBtn.querySelector('.mic-text').textContent = 'Start Microphone';

      document.getElementById('audio-visualizer').classList.add('hidden');

      // Stop visualizer
      if (this.animationFrame) {
        cancelAnimationFrame(this.animationFrame);
      }

      logger.info('Recording stopped');
    }
  }

  setupVisualizer(stream) {
    this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
    this.analyser = this.audioContext.createAnalyser();

    const source = this.audioContext.createMediaStreamSource(stream);
    source.connect(this.analyser);

    this.analyser.fftSize = 256;

    const canvas = document.getElementById('visualizer-canvas');
    const canvasCtx = canvas.getContext('2d');

    const bufferLength = this.analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    const draw = () => {
      this.animationFrame = requestAnimationFrame(draw);

      this.analyser.getByteFrequencyData(dataArray);

      canvasCtx.fillStyle = '#f9fafb';
      canvasCtx.fillRect(0, 0, canvas.width, canvas.height);

      const barWidth = (canvas.width / bufferLength) * 2.5;
      let x = 0;

      for (let i = 0; i < bufferLength; i++) {
        const barHeight = (dataArray[i] / 255) * canvas.height;

        canvasCtx.fillStyle = `hsl(${240 + (dataArray[i] / 255) * 60}, 70%, 60%)`;
        canvasCtx.fillRect(x, canvas.height - barHeight, barWidth, barHeight);

        x += barWidth + 1;
      }
    };

    draw();
  }

  async transcribeAudio(language) {
    try {
      logger.info('Transcribing audio...');

      const audioBlob = new Blob(this.audioChunks, { type: 'audio/webm' });

      const formData = new FormData();
      formData.append('file', audioBlob, 'recording.webm');
      formData.append('language', language);
      formData.append('include_segments', 'false');

      const response = await fetch(`${CONFIG.VOICE_API_URL}/stt/transcribe`, {
        method: 'POST',
        body: formData,
        signal: AbortSignal.timeout(CONFIG.API_TIMEOUT),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const result = await response.json();

      // Display transcription
      document.getElementById('transcription-text').textContent = result.text || '(No speech detected)';
      document.getElementById('transcription-confidence').textContent = result.confidence
        ? `Confidence: ${(result.confidence * 100).toFixed(1)}%`
        : '';

      document.getElementById('transcription').classList.remove('hidden');

      logger.success(`Transcribed: "${result.text}"`);
    } catch (error) {
      logger.error('Transcription failed', error.message);
      document.getElementById('transcription-text').textContent = `Error: ${error.message}`;
      document.getElementById('transcription').classList.remove('hidden');
    }
  }

  updateStatus(status, text) {
    this.statusElement.className = `status-badge status-${status}`;
    this.statusElement.textContent = text;
  }
}

// Create global voice manager instance
window.voiceManager = new VoiceManager();
