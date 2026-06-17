export class Hud {
  constructor(audioEngine, app) {
    this.audioEngine = audioEngine;
    this.app = app;
    this.spectrumBars = [];
    this.spectrumBarsCount = 24;
    this.isConnectingCapture = false;

    this.initElements();
    this.bindEvents();
    this.createMiniSpectrum();
  }

  initElements() {
    // Buttons
    this.btnPlayPause = document.getElementById('btn-play-pause');
    this.svgPlay = document.getElementById('svg-play');
    this.svgPause = document.getElementById('svg-pause');
    this.btnEnterHero = document.getElementById('btn-enter-hero');
    this.btnEnterHud = document.getElementById('btn-enter-hud');
    this.btnFullscreen = document.getElementById('btn-fullscreen');

    // Panels & Section
    this.hudContainer = document.getElementById('hud-container');
    this.heroSection = document.getElementById('hero-section');
    this.uploadTrigger = document.getElementById('upload-trigger');
    this.audioUploadInput = document.getElementById('audio-upload');
    this.ambientToggle = document.getElementById('ambient-toggle');
    this.captureTrigger = document.getElementById('capture-trigger');
    this.captureMainLabel = document.getElementById('capture-main-label');
    this.captureSubLabel = document.getElementById('capture-sub-label');

    // Player details
    this.trackName = document.getElementById('track-name');
    this.artistName = document.getElementById('artist-name');
    this.albumArt = document.querySelector('.album-art');
    this.progressContainer = document.getElementById('progress-container');
    this.progressBar = document.getElementById('progress-bar');
    this.currentTimeLabel = document.getElementById('current-time');
    this.totalTimeLabel = document.getElementById('total-time');
    this.playerSpectrum = document.getElementById('player-spectrum');

    // Diagnostic Metrics
    this.valBass = document.getElementById('val-bass');
    this.barBass = document.getElementById('bar-bass');
    this.valMid = document.getElementById('val-mid');
    this.barMid = document.getElementById('bar-mid');
    this.valTreble = document.getElementById('val-treble');
    this.barTreble = document.getElementById('bar-treble');
    this.valEnergy = document.getElementById('val-energy');
    this.barEnergy = document.getElementById('bar-energy');

    // Sidebar items
    this.sidebarItems = document.querySelectorAll('.sidebar-item');

    // AV Sync controls
    this.syncDelayRange = document.getElementById('sync-delay-range');
    this.syncDelayVal = document.getElementById('sync-delay-val');

    // Preset controls
    this.presetCycleTrigger = document.getElementById('preset-cycle-trigger');
    this.presetModeVal = document.getElementById('preset-mode-val');

    // Theme controls
    this.themeCycleTrigger = document.getElementById('theme-cycle-trigger');
    this.themeModeVal = document.getElementById('theme-mode-val');
  }

  bindEvents() {
    // 1. Play / Pause Action
    this.btnPlayPause.addEventListener('click', () => {
      if (this.audioEngine.isAmbientMode) {
        // Toggle off ambient mode if we have a track
        if (this.audioEngine.audio.src) {
          this.audioEngine.setAmbientMode(false);
          this.ambientToggle.checked = false;
        }
      } else {
        const isPlaying = this.audioEngine.togglePlayPause();
        this.updatePlayPauseIcon(isPlaying);
      }
    });

    // 2. Local File Upload Action
    this.uploadTrigger.addEventListener('click', () => {
      this.audioUploadInput.click();
    });

    this.audioUploadInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) {
        this.audioEngine.loadTrack(file);
        this.ambientToggle.checked = false;
        this.updatePlayPauseIcon(true);
      }
    });

    // Drag and drop audio files onto the upload card
    this.uploadTrigger.addEventListener('dragover', (e) => {
      e.preventDefault();
      this.uploadTrigger.style.borderColor = 'var(--primary-cyan)';
      this.uploadTrigger.style.background = 'rgba(0, 245, 255, 0.08)';
    });

    const resetDragStyles = () => {
      this.uploadTrigger.style.borderColor = 'rgba(255, 255, 255, 0.04)';
      this.uploadTrigger.style.background = 'rgba(255, 255, 255, 0.02)';
    };

    this.uploadTrigger.addEventListener('dragleave', resetDragStyles);
    this.uploadTrigger.addEventListener('drop', (e) => {
      e.preventDefault();
      resetDragStyles();
      const file = e.dataTransfer.files[0];
      if (file && file.type.startsWith('audio/')) {
        this.audioEngine.loadTrack(file);
        this.ambientToggle.checked = false;
        this.updatePlayPauseIcon(true);
      }
    });

    // 3. Ambient Mode Toggle Action
    this.ambientToggle.addEventListener('change', (e) => {
      const checked = e.target.checked;
      this.audioEngine.setAmbientMode(checked);
      this.updatePlayPauseIcon(!checked);
    });

    // 3b. Live Capture Action
    if (this.captureTrigger) {
      this.captureTrigger.addEventListener('click', async () => {
        if (this.audioEngine.activeInputMode === 'capture') {
          this.audioEngine.stopLiveCapture();
          this.audioEngine.setInputMode('ambient');
        } else {
          try {
            this.isConnectingCapture = true;
            this.captureMainLabel.textContent = "Connecting...";
            this.captureSubLabel.textContent = "Select source";
            
            await this.audioEngine.startLiveCapture();
          } catch (err) {
            // Display clean, user-friendly toast messages
            let errMsg = err.message || "Failed to capture audio.";
            if (errMsg.includes("No audio track captured")) {
              this.showNotification(
                "没有捕获到音频轨道。请重新点击 Live Capture 并勾选 'Share audio / 共享音频'。",
                "error"
              );
            } else if (err.name === "NotAllowedError") {
              this.showNotification(
                "捕获被取消。如果想要使用实时音乐，请重新点击并授权。",
                "warning"
              );
            } else {
              this.showNotification(
                `捕获失败: ${errMsg}. Windows用户共享整个屏幕/Mac用户共享特定标签页时请确保勾选共享音频。`,
                "error"
              );
            }
          } finally {
            this.isConnectingCapture = false;
          }
        }
      });

      this.audioEngine.onCaptureEndedCallback = () => {
        this.showNotification("Live audio capture sharing ended.", "info");
      };
    }

    // 4. Progress Bar Scrubbing Action
    this.progressContainer.addEventListener('click', (e) => {
      const rect = this.progressContainer.getBoundingClientRect();
      const clickX = e.clientX - rect.left;
      const percent = Math.max(0, Math.min(1, clickX / rect.width));
      this.audioEngine.seek(percent);
    });

    // 5. Immersive Mode Transition (Enter Demo)
    const enterImmersiveMode = () => {
      this.heroSection.classList.add('hidden');
      this.hudContainer.classList.add('hud-minimized');
    };
    this.btnEnterHero.addEventListener('click', enterImmersiveMode);
    this.btnEnterHud.addEventListener('click', enterImmersiveMode);

    // Escape key exits immersive mode
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' || e.key === 'Esc') {
        this.hudContainer.classList.remove('hud-minimized');
      }
    });

    // 6. Fullscreen toggle
    this.btnFullscreen.addEventListener('click', () => {
      if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch((err) => {
          console.error(`Error attempting to enable fullscreen: ${err.message}`);
        });
      } else {
        document.exitFullscreen();
      }
    });

    // 7. Sidebar menu tabs switching (visual feedback)
    this.sidebarItems.forEach(item => {
      item.addEventListener('click', () => {
        this.sidebarItems.forEach(i => i.classList.remove('active'));
        item.classList.add('active');

        // Toggle hero landing page display when Overview is clicked
        const tab = item.getAttribute('data-tab');
        if (tab === 'overview') {
          this.heroSection.classList.remove('hidden');
        } else {
          this.heroSection.classList.add('hidden');
        }
      });
    });

    // 8. AV Sync Slider Input Action
    if (this.syncDelayRange) {
      this.syncDelayRange.addEventListener('input', (e) => {
        const val = parseInt(e.target.value);
        if (this.app) {
          this.app.manualSyncOffset = val;
        }
        this.updateSyncDelayLabel();
      });
      // Initial label update
      this.updateSyncDelayLabel();
    }

    // 9. Ripple Preset Cycle Action
    if (this.presetCycleTrigger) {
      this.presetCycleTrigger.addEventListener('click', () => {
        if (this.app) {
          const newMode = this.app.cycleRipplePreset();
          this.updatePresetLabel(newMode);
        }
      });
    }

    // 10. Theme Cycle Action
    if (this.themeCycleTrigger) {
      this.themeCycleTrigger.addEventListener('click', () => {
        if (this.app) {
          const newTheme = this.app.cycleTheme();
          this.updateThemeLabel(newTheme);
        }
      });
    }
  }

  createMiniSpectrum() {
    this.playerSpectrum.innerHTML = '';
    for (let i = 0; i < this.spectrumBarsCount; i++) {
      const bar = document.createElement('div');
      bar.classList.add('spectrum-bar');
      this.playerSpectrum.appendChild(bar);
      this.spectrumBars.push(bar);
    }
  }

  updatePlayPauseIcon(isPlaying) {
    if (isPlaying) {
      this.svgPlay.style.display = 'none';
      this.svgPause.style.display = 'block';
      this.albumArt.classList.add('playing');
    } else {
      this.svgPlay.style.display = 'block';
      this.svgPause.style.display = 'none';
      this.albumArt.classList.remove('playing');
    }
  }

  updateSyncDelayLabel() {
    if (!this.syncDelayVal) return;
    const manual = this.app ? this.app.manualSyncOffset : 0;
    const latency = this.audioEngine.getOutputLatency();
    const latencyMs = Math.round(latency * 1000);
    
    if (latencyMs > 0) {
      this.syncDelayVal.textContent = `Auto (${latencyMs}ms) ${manual >= 0 ? '+' : ''}${manual}ms`;
    } else {
      this.syncDelayVal.textContent = `Manual (${manual >= 0 ? '+' : ''}${manual}ms)`;
    }
  }

  updatePresetLabel(mode) {
    if (!this.presetModeVal) return;
    const displayNames = {
      calm: 'Deep Calm',
      cinematic: 'Tidal',
      impact: 'Abyssal Surge',
      overdrive: 'Leviathan'
    };
    this.presetModeVal.textContent = displayNames[mode] || (mode.charAt(0).toUpperCase() + mode.slice(1));
  }

  updateThemeLabel(mode) {
    if (!this.themeModeVal) return;
    const displayNames = {
      AUTO: 'Auto',
      COOL: 'Cool',
      SOFT: 'Soft'
    };
    this.themeModeVal.textContent = displayNames[mode] || mode;
  }

  update(features, rawFrequencyData) {
    // Dynamically update labels
    this.updateSyncDelayLabel();
    if (this.app && this.themeModeVal) {
      this.updateThemeLabel(this.app.themeMode);
    }

    // 1. Sync metadata
    this.trackName.textContent = this.audioEngine.trackName;
    this.artistName.textContent = this.audioEngine.artistName;

    // 2. Play/Pause disc rotation sync
    const isPlaying = this.audioEngine.isPlaying();
    this.updatePlayPauseIcon(isPlaying);

    // 3. Progress bar updates
    if (this.audioEngine.activeInputMode === 'capture') {
      this.progressBar.style.width = '100%';
      this.currentTimeLabel.textContent = 'LIVE';
      this.totalTimeLabel.textContent = 'LIVE';
    } else if (!this.audioEngine.isAmbientMode) {
      const progress = this.audioEngine.getProgress();
      this.progressBar.style.width = `${progress * 100}%`;
      this.currentTimeLabel.textContent = this.audioEngine.getCurrentTimeFormatted();
      this.totalTimeLabel.textContent = this.audioEngine.getTotalTimeFormatted();
    } else {
      // Ambient mode fake progress pulsing
      this.progressBar.style.width = '0%';
      this.currentTimeLabel.textContent = '00:00';
      this.totalTimeLabel.textContent = '--:--';
    }

    // 3b. Sync Ambient Mode Switch Checkbox state
    if (this.ambientToggle) {
      this.ambientToggle.checked = this.audioEngine.isAmbientMode;
    }

    // 3c. Update live capture button visual states
    if (this.captureTrigger) {
      if (this.audioEngine.activeInputMode === 'capture') {
        this.captureTrigger.classList.add('active');
        this.captureMainLabel.textContent = "Capture Active";
        this.captureSubLabel.textContent = "Click to Stop";
      } else if (this.isConnectingCapture) {
        this.captureTrigger.classList.remove('active');
        this.captureMainLabel.textContent = "Connecting...";
        this.captureSubLabel.textContent = "Select source";
      } else {
        this.captureTrigger.classList.remove('active');
        this.captureMainLabel.textContent = "Live Capture";
        this.captureSubLabel.textContent = "System / Tab Input";
      }
    }

    // 4. Update real-time stats metrics
    this.valBass.textContent = (features.bass * 100).toFixed(1);
    this.barBass.style.width = `${Math.min(100, features.bass * 100)}%`;

    this.valMid.textContent = (features.mid * 100).toFixed(1);
    this.barMid.style.width = `${Math.min(100, features.mid * 100)}%`;

    this.valTreble.textContent = (features.treble * 100).toFixed(1);
    this.barTreble.style.width = `${Math.min(100, features.treble * 100)}%`;

    const energyPercent = Math.round(features.energy * 100);
    this.valEnergy.textContent = `${energyPercent}%`;
    this.barEnergy.style.width = `${Math.min(100, energyPercent)}%`;

    // 5. Render mini spectrum in player card
    if (rawFrequencyData && rawFrequencyData.length > 0) {
      // Map 256 frequency bins into 24 display bars
      const binsPerBar = Math.floor(rawFrequencyData.length / 2 / this.spectrumBarsCount); 
      for (let i = 0; i < this.spectrumBarsCount; i++) {
        let sum = 0;
        const startBin = i * binsPerBar;
        for (let j = 0; j < binsPerBar; j++) {
          sum += rawFrequencyData[startBin + j];
        }
        const avg = sum / binsPerBar;
        // Map average (0 - 255) to height (2px - 28px)
        const heightVal = Math.max(2, (avg / 255) * 26);
        this.spectrumBars[i].style.height = `${heightVal}px`;
        
        // Dynamic colors: shift colors dynamically based on amplitude
        if (isPlaying) {
          const intensity = avg / 255;
          this.spectrumBars[i].style.background = `rgba(0, 245, 255, ${0.15 + intensity * 0.85})`;
        } else {
          this.spectrumBars[i].style.background = 'rgba(255, 255, 255, 0.08)';
        }
      }
    }
  }

  showNotification(message, type = 'info') {
    const existing = document.querySelector('.notification-toast');
    if (existing) {
      existing.remove();
    }

    const toast = document.createElement('div');
    toast.className = `notification-toast ${type}`;
    
    const title = document.createElement('div');
    title.className = 'notification-toast-title';
    title.textContent = type === 'error' ? 'Capture Error' : type === 'warning' ? 'Permission Denied' : 'Capture Info';
    
    const body = document.createElement('div');
    body.textContent = message;
    
    toast.appendChild(title);
    toast.appendChild(body);
    document.body.appendChild(toast);
    
    setTimeout(() => {
      toast.classList.add('show');
    }, 10);
    
    setTimeout(() => {
      toast.classList.remove('show');
      setTimeout(() => {
        toast.remove();
      }, 400);
    }, 5000);
  }
}
