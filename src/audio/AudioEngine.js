export class AudioEngine {
  constructor() {
    this.audioContext = null;
    this.analyser = null;
    this.audioSource = null;
    
    // Live Capture properties
    this.captureStream = null;
    this.captureSource = null;
    this.activeInputMode = 'ambient'; // 'ambient' | 'file' | 'capture'
    this.onCaptureEndedCallback = null;
    this.lastFileTrackName = "";
    this.lastFileArtistName = "";

    // Create HTML5 Audio element
    this.audio = new Audio();
    this.audio.crossOrigin = "anonymous";
    this.audio.loop = true;
    
    // File metadata
    this.trackName = "AMBIE. (AMBIENT MODE)";
    this.artistName = "Synthesized Waveform Generator";
    
    // Ambient simulation parameters
    this.isAmbientMode = true;
    this.simulatedFrequencyData = new Uint8Array(256);
    this.simulatedTimeData = new Uint8Array(256);
    this.lastSimulatedBeatTime = 0;
    this.simulatedBeatInterval = 1200; // ms (approx 50 BPM)
    
    // Playback state tracker for Web Audio interaction policies
    this.isInitialized = false;
  }

  init() {
    if (this.isInitialized) return;
    
    try {
      // Create AudioContext (must be triggered by user gesture)
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      this.audioContext = new AudioContextClass();
      
      // Create AnalyserNode
      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = 512; // 256 frequency bins
      this.analyser.smoothingTimeConstant = 0.12; // Reduced to 0.12 for snappy responsive beat sync and low jitter
      
      // Create HTML5 Audio Source
      this.audioSource = this.audioContext.createMediaElementSource(this.audio);
      
      // Note: We do NOT connect analyser to destination, nor audioSource to analyser here.
      // This will be managed dynamically in setInputMode().
      
      this.isInitialized = true;
      console.log("AudioEngine initialized successfully.");
    } catch (e) {
      console.error("Failed to initialize Web Audio API:", e);
    }
  }

  loadTrack(file) {
    this.init();
    
    // Resume audio context if suspended (browser security)
    if (this.audioContext && this.audioContext.state === "suspended") {
      this.audioContext.resume();
    }
    
    // Release previous object URL if any to prevent memory leaks
    if (this.audio.src.startsWith("blob:")) {
      URL.revokeObjectURL(this.audio.src);
    }
    
    const objectURL = URL.createObjectURL(file);
    this.audio.src = objectURL;
    
    // Extract name from file
    let name = file.name;
    const lastDotIndex = name.lastIndexOf(".");
    if (lastDotIndex > 0) {
      name = name.substring(0, lastDotIndex);
    }
    
    // Split by "-" if artist is included, e.g. "imase - Night Dancer"
    const splitIndex = name.indexOf("-");
    if (splitIndex > 0) {
      this.lastFileTrackName = name.substring(splitIndex + 1).trim().toUpperCase();
      this.lastFileArtistName = name.substring(0, splitIndex).trim();
    } else {
      this.lastFileTrackName = name.toUpperCase();
      this.lastFileArtistName = "Local Audio File";
    }
    
    // Switch input mode to file
    this.setInputMode('file');
  }

  play() {
    this.init();
    if (this.audioContext && this.audioContext.state === "suspended") {
      this.audioContext.resume();
    }
    
    if (this.activeInputMode === 'file') {
      this.audio.play().catch(err => {
        console.warn("Autoplay prevented or playback error:", err);
      });
    } else {
      this.audio.pause();
    }
  }

  pause() {
    this.audio.pause();
  }

  togglePlayPause() {
    if (this.activeInputMode !== 'file') {
      return false; // Handled by caller
    }
    
    if (this.audio.paused) {
      this.play();
      return true;
    } else {
      this.pause();
      return false;
    }
  }

  isPlaying() {
    if (this.activeInputMode !== 'file') return true; // Ambient & Capture modes are always running
    return !this.audio.paused;
  }

  setVolume(value) {
    this.audio.volume = Math.max(0, Math.min(1, value));
  }

  seek(percent) {
    if (this.isAmbientMode || isNaN(this.audio.duration)) return;
    this.audio.currentTime = percent * this.audio.duration;
  }

  getProgress() {
    if (this.isAmbientMode || this.activeInputMode === 'capture' || !this.audio.duration) return 0;
    return this.audio.currentTime / this.audio.duration;
  }

  getCurrentTimeFormatted() {
    if (this.isAmbientMode || this.activeInputMode === 'capture') return "00:00";
    return this.formatTime(this.audio.currentTime);
  }

  getTotalTimeFormatted() {
    if (this.isAmbientMode || this.activeInputMode === 'capture' || isNaN(this.audio.duration)) return "00:00";
    return this.formatTime(this.audio.duration);
  }

  formatTime(seconds) {
    if (isNaN(seconds)) return "00:00";
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }

  setAmbientMode(active) {
    if (active) {
      this.setInputMode('ambient');
    } else {
      if (this.audio.src && this.audio.src !== "") {
        this.setInputMode('file');
      } else {
        this.setInputMode('ambient'); // Fallback
      }
    }
  }

  async setInputMode(mode, stream = null) {
    this.init();
    
    if (this.audioContext && this.audioContext.state === "suspended") {
      await this.audioContext.resume();
    }

    // 1. Clean up capture if leaving capture mode
    if (mode !== 'capture' && this.captureStream) {
      this.stopLiveCapture();
    }

    // 2. Pause audio if leaving file mode
    if (mode !== 'file') {
      this.audio.pause();
    }

    // 3. Disconnect source nodes
    if (this.audioSource) {
      try { this.audioSource.disconnect(); } catch (e) {}
    }
    if (this.captureSource) {
      try { this.captureSource.disconnect(); } catch (e) {}
      this.captureSource = null;
    }

    this.activeInputMode = mode;
    this.isAmbientMode = (mode === 'ambient');

    if (mode === 'file') {
      this.trackName = this.lastFileTrackName || "LOCAL AUDIO FILE";
      this.artistName = this.lastFileArtistName || "Local Playback";
      // Connect to analyser for visualizer, and to destination for speaker
      this.audioSource.connect(this.analyser);
      this.audioSource.connect(this.audioContext.destination);
      this.play();
    } else if (mode === 'ambient') {
      this.trackName = "AMBIE. (AMBIENT MODE)";
      this.artistName = "Synthesized Waveform Generator";
    } else if (mode === 'capture') {
      this.trackName = "LIVE CAPTURE";
      this.artistName = "System Audio Input";
      if (stream) {
        this.captureStream = stream;
        this.captureSource = this.audioContext.createMediaStreamSource(stream);
        // Connect ONLY to analyser so we don't output captured sound back to speakers!
        this.captureSource.connect(this.analyser);
        
        // Listen for user clicking "Stop sharing" in browser banner
        stream.getTracks().forEach(track => {
          track.onended = () => {
            this.onCaptureEnded();
          };
        });
      }
    }
    
    console.log(`Input mode switched to: ${mode}`);
  }

  async startLiveCapture() {
    this.init();
    if (this.audioContext && this.audioContext.state === "suspended") {
      await this.audioContext.resume();
    }

    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
          systemAudio: "include"
        }
      });

      const audioTracks = stream.getAudioTracks();
      if (!audioTracks.length) {
        stream.getTracks().forEach(track => track.stop());
        throw new Error("No audio track captured. Please enable 'Share audio' in the browser picker.");
      }

      await this.setInputMode('capture', stream);
      return stream;
    } catch (err) {
      console.error("Failed to start live audio capture:", err);
      throw err;
    }
  }

  stopLiveCapture() {
    if (this.captureStream) {
      this.captureStream.getTracks().forEach(track => track.stop());
      this.captureStream = null;
    }
    if (this.captureSource) {
      try { this.captureSource.disconnect(); } catch (e) {}
      this.captureSource = null;
    }
  }

  onCaptureEnded() {
    this.stopLiveCapture();
    this.setInputMode('ambient');
    if (this.onCaptureEndedCallback) {
      this.onCaptureEndedCallback();
    }
  }

  getOutputLatency() {
    return (this.audioContext && typeof this.audioContext.outputLatency === 'number') 
      ? this.audioContext.outputLatency 
      : 0.0;
  }

  getByteFrequencyData(array) {
    if (this.activeInputMode !== 'ambient' && this.analyser) {
      this.analyser.getByteFrequencyData(array);
    } else {
      // Simulate frequency data based on math functions
      this.simulateAudioData();
      array.set(this.simulatedFrequencyData);
    }
  }

  getByteTimeDomainData(array) {
    if (this.activeInputMode !== 'ambient' && this.analyser) {
      this.analyser.getByteTimeDomainData(array);
    } else {
      // Simulate time domain data
      this.simulateAudioData();
      array.set(this.simulatedTimeData);
    }
  }

  simulateAudioData() {
    const time = Date.now();
    
    // Ambient mode: simulated audio data should only represent gentle breathing.
    // We completely remove any sudden beat peaks/onsets to prevent unwanted high-energy jumps.
    
    // Fill frequency data with combinations of sine waves and noise
    for (let i = 0; i < 256; i++) {
      let val = 0;
      
      if (i < 20) {
        // Bass range: driven by time-based slow waves
        const wave = Math.sin(time * 0.0012 + i * 0.1) * 6;
        val = 20 + wave + Math.random() * 3;
      } else if (i < 90) {
        // Mid range: smooth constant undulating waves
        const wave1 = Math.sin(time * 0.0008 + i * 0.05) * 5;
        const wave2 = Math.cos(time * 0.0005 - i * 0.08) * 3;
        val = 15 + wave1 + wave2 + Math.random() * 2;
      } else {
        // Treble range: random spikes representing high frequencies
        const ambientTreble = Math.sin(time * 0.0015 + i * 0.02) * 2;
        const sparkles = Math.random() > 0.99 ? Math.random() * 10 : 0;
        val = 8 + ambientTreble + sparkles + Math.random() * 1.5;
      }
      
      this.simulatedFrequencyData[i] = Math.max(0, Math.min(255, val));
      
      // Simulate simple wave for time domain
      this.simulatedTimeData[i] = 128 + Math.sin(time * 0.008 + i * 0.2) * 3;
    }
  }
}
