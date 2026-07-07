import * as THREE from 'three';
import './styles/style.css';

import { AudioEngine } from './audio/AudioEngine.js';
import { FeatureExtractor } from './audio/FeatureExtractor.js';
import { SceneSetup } from './scene/SceneSetup.js';
import { PostProcessing } from './scene/PostProcessing.js';
import { PulseSystem } from './scene/PulseSystem.js';
import { VoxelTerrain } from './scene/VoxelTerrain.js';
// Deprecated SparkleField in favor of micro-ecology particle systems
// import { SparkleField } from './scene/SparkleField.js';
import { BubbleField } from './scene/BubbleField.js';
import { PlanktonField } from './scene/PlanktonField.js';
import { Hud } from './ui/Hud.js';

// Preset configurations for A/B testing ripple heights and ocean dimensions
const RIPPLE_PRESETS = {
  calm: {
    seabedBaseHeight: 0.55,
    continentLiftScale: 2.4,
    normalLift: 0.8,
    strongLift: 1.8,
    impactLift: 2.8,
    maxLift: 3.5,
    seabedRippleLift: 0.70,
    seabedRippleGlow: 0.40,
    rippleWidthNormal: 3.2,
    rippleWidthWhite: 1.8,
    warmthLimit: 0.35,
    causticsIntensity: 0.06,
    bathymetricGlow: 0.32
  },
  cinematic: {
    seabedBaseHeight: 0.55,
    continentLiftScale: 2.8,
    normalLift: 1.6,
    strongLift: 3.2,
    impactLift: 4.5,
    maxLift: 5.0,
    seabedRippleLift: 0.75,
    seabedRippleGlow: 0.45,
    rippleWidthNormal: 4.2,
    rippleWidthWhite: 2.2,
    warmthLimit: 0.50,
    causticsIntensity: 0.08,
    bathymetricGlow: 0.16
  },
  impact: {
    seabedBaseHeight: 0.55,
    continentLiftScale: 3.2,
    normalLift: 2.2,
    strongLift: 4.2,
    impactLift: 5.5,
    maxLift: 6.0,
    seabedRippleLift: 0.80,
    seabedRippleGlow: 0.50,
    rippleWidthNormal: 4.8,
    rippleWidthWhite: 2.6,
    warmthLimit: 0.65,
    causticsIntensity: 0.10,
    bathymetricGlow: 0.05
  },
  overdrive: {
    seabedBaseHeight: 0.55,
    continentLiftScale: 4.5,
    normalLift: 3.0,
    strongLift: 6.0,
    impactLift: 9.0,
    maxLift: 12.0,
    seabedRippleLift: 0.85,
    seabedRippleGlow: 0.60,
    rippleWidthNormal: 5.5,
    rippleWidthWhite: 3.0,
    warmthLimit: 0.70,
    causticsIntensity: 0.12,
    bathymetricGlow: 0.0
  }
};

class App {
  constructor() {
    this.audioEngine = null;
    this.featureExtractor = null;
    this.sceneSetup = null;
    this.postProcessing = null;
    this.pulseSystem = null;
    this.voxelTerrain = null;
    // this.sparkleField = null;
    this.bubbleField = null;
    this.planktonField = null;
    this.hud = null;

    this.clock = new THREE.Clock();
    this.freqData = new Uint8Array(256);

    this.init();
  }

  init() {
    // 1. Core Audio Engines
    this.audioEngine = new AudioEngine();
    this.featureExtractor = new FeatureExtractor();

    // 2. WebGL 3D Layer
    this.sceneSetup = new SceneSetup('webgl-canvas');
    this.postProcessing = new PostProcessing(
      this.sceneSetup.getRenderer(),
      this.sceneSetup.getScene(),
      this.sceneSetup.getCamera()
    );

    // 3. Voxel, Sparkle, and Ripple Logic
    this.pulseSystem = new PulseSystem();
    this.voxelTerrain = new VoxelTerrain(this.sceneSetup.getScene(), 145); // Odd grid keeps x=0/z=0 covered by voxels
    this.currentPreset = 'cinematic';
    this.voxelTerrain.setRipplePreset(RIPPLE_PRESETS['cinematic']);
    
    // Instantiate micro-ecology layers
    this.bubbleField = new BubbleField(this.sceneSetup.getScene(), 144);
    this.planktonField = new PlanktonField(this.sceneSetup.getScene(), 144);
    this.bubbleField.points.visible = true;
    this.planktonField.points.visible = true;

    // Cache list of active terrain cells for distributed pulse spawning
    this.activeCells = this.voxelTerrain.getActiveTerrainCells();
    this.pulseHistory = []; // Tracks recent pulse origins to avoid duplicate clusters
    
    // Ambient mode independent pulse timers
    this.ambientPulseTimer = 0;
    this.nextAmbientPulseInterval = Math.random() * 3.0 + 5.0; // 5 to 8 seconds

    // Visual synchronization and debug settings
    this.pendingPulses = [];
    this.manualSyncOffset = 0;
    this.lastTriggeredBand = 'none';
    this.showDebug = false;
    this.ecologyMode = 'NORMAL'; // 'NORMAL' | 'BOOST' | 'OFF'

    // Theme transition settings
    this.themeMode = 'AUTO'; // 'AUTO' | 'COOL' | 'SOFT'
    this.themeMix = 0.0;
    this.smoothedEnergy = 0.0;

    // Toggle debug display using 'D' key and ecology modes using 'E' key
    window.addEventListener('keydown', (e) => {
      if (e.key === 'd' || e.key === 'D') {
        const debugReadout = document.getElementById('debug-readout');
        if (debugReadout) {
          this.showDebug = !this.showDebug;
          debugReadout.style.display = this.showDebug ? 'block' : 'none';
        }
      }
      if (e.key === 'e' || e.key === 'E') {
        const modes = ['NORMAL', 'BOOST', 'OFF'];
        const nextIndex = (modes.indexOf(this.ecologyMode) + 1) % modes.length;
        this.ecologyMode = modes[nextIndex];
        
        // Output a clean toast notification
        if (this.hud) {
          this.hud.showNotification(`Ecology Mode: ${this.ecologyMode}`, this.ecologyMode === 'BOOST' ? 'warning' : 'info');
        }
      }
    });

    // 4. HTML DOM Overlays HUD
    this.hud = new Hud(this.audioEngine, this);

    // 5. Global user interaction listener to wake up AudioContext safely
    const wakeAudioContext = () => {
      this.audioEngine.init();
      window.removeEventListener('click', wakeAudioContext);
      window.removeEventListener('touchstart', wakeAudioContext);
    };
    window.addEventListener('click', wakeAudioContext);
    window.addEventListener('touchstart', wakeAudioContext);

    // 6. Start the frame rendering loop
    this.animate();
  }

  animate() {
    requestAnimationFrame(this.animate.bind(this));

    // Calculate time variables
    let deltaTime = this.clock.getDelta();
    // Cap deltaTime to avoid massive rendering skips when screen is minimized/suspended
    if (deltaTime > 0.1) deltaTime = 0.1;
    
    const elapsedTime = this.clock.getElapsedTime();

    // 1. Fetch current audio frequencies (real or simulated)
    this.audioEngine.getByteFrequencyData(this.freqData);

    // 2. Process frequency data into 8 sub-bands, returning triggered peak bands
    const triggeredBands = this.featureExtractor.update(this.freqData, deltaTime);
    const features = this.featureExtractor.getFeatures();
    features.isAmbientMode = this.audioEngine.isAmbientMode;

    // Calculate 6-second moving average of energy
    const timeConstant = 6.0;
    const lerpFactor = 1.0 - Math.exp(-deltaTime / timeConstant);
    this.smoothedEnergy = THREE.MathUtils.lerp(this.smoothedEnergy, features.energy || 0.0, lerpFactor);

    // Determine target theme mix
    let targetThemeMix = 0.0;
    if (this.themeMode === 'COOL') {
      targetThemeMix = 0.0;
    } else if (this.themeMode === 'SOFT') {
      targetThemeMix = 1.0;
    } else {
      // AUTO mode: Map energy 0.12 - 0.45 to 0.0 - 1.0
      const minEnergy = 0.12;
      const maxEnergy = 0.45;
      let ratio = (this.smoothedEnergy - minEnergy) / (maxEnergy - minEnergy);
      ratio = THREE.MathUtils.clamp(ratio, 0.0, 1.0);

      // Apply preset-specific max themeMix limits to Leviathan/Overdrive mode
      let maxThemeMixLimit = 0.75; // Default for Calm/Tidal (0.6 ~ 0.8)
      if (this.currentPreset === 'impact') {
        maxThemeMixLimit = 0.60; // Abyssal Surge limit (0.5 ~ 0.7)
      } else if (this.currentPreset === 'overdrive') {
        maxThemeMixLimit = 0.40; // Leviathan limit (0.35 ~ 0.5) (keep base closer to Cool Deep)
      }
      targetThemeMix = ratio * maxThemeMixLimit;
    }

    // Smooth transition: 3 to 6 seconds transition rate
    this.themeMix = THREE.MathUtils.lerp(this.themeMix, targetThemeMix, 0.025);
    features.themeMix = this.themeMix;

    // 3. Spawns pulse events based on mode
    if (this.audioEngine.isAmbientMode) {
      // Ambient mode: trigger soft cyan ripples strictly via a 5-8s independent timer
      this.ambientPulseTimer += deltaTime;
      if (this.ambientPulseTimer >= this.nextAmbientPulseInterval) {
        this.ambientPulseTimer = 0;
        this.nextAmbientPulseInterval = Math.random() * 3.0 + 5.0; // reset to 5-8s
        
        // Select a random active cell biased near center (radius 0 - 20) for soft ambient ripples
        const origin = this.selectPulseOrigin('bass');
        if (origin) {
          // soft cyan ripple, spawn immediately
          this.pulseSystem.addPulse(origin.x, origin.z, 0x00aaff, 3.5, 12.0, 3.2, 3.5); 
        }
      }
    } else {
      // Audio mode: queue visual pulses based on manualSyncOffset and hardware outputLatency
      const hardwareLatency = this.audioEngine.getOutputLatency();
      const visualDelay = Math.max(0.0, hardwareLatency + this.manualSyncOffset / 1000.0);
      
      for (let i = 0; i < triggeredBands.length; i++) {
        const band = triggeredBands[i];
        
        // Track last triggered band for diagnostics
        this.lastTriggeredBand = band.name;
        
        const origin = this.selectPulseOrigin(band.name);
        
        if (origin) {
          let strength = 5.5;
          let speed = 20.0;
          let width = 2.6;
          let maxAge = 1.6;
          let rippleType = 0.0; // Standard cyan ripple

          if (band.name === 'sub' || band.name === 'bass') {
            strength = 7.5;
            speed = 15.0;
            width = 3.2;
            maxAge = 2.2;
          } else if (band.name === 'treble' || band.name === 'air') {
            strength = 3.5;
            speed = 26.0;
            width = 1.6;
            maxAge = 1.0;
            rippleType = 1.0; // High energy white impact flash
          }

          // Push into visual latency queue
          this.pendingPulses.push({
            spawnTime: elapsedTime + visualDelay,
            x: origin.x,
            z: origin.z,
            color: band.color,
            strength: strength,
            speed: speed,
            width: width,
            maxAge: maxAge,
            rippleType: rippleType
          });
        }
      }
    }

    // Process visual delay queue and spawn ready pulses
    let activePulsesCount = this.pulseSystem.pulses.length;
    for (let i = this.pendingPulses.length - 1; i >= 0; i--) {
      const p = this.pendingPulses[i];
      if (elapsedTime >= p.spawnTime) {
        if (activePulsesCount < 4) {
          this.pulseSystem.addPulse(p.x, p.z, p.color, p.strength, p.speed, p.width, p.maxAge, p.rippleType);
          activePulsesCount++;
        }
        this.pendingPulses.splice(i, 1);
      }
    }

    // 4. Update components state
    this.pulseSystem.update(deltaTime);
    this.voxelTerrain.update(features, this.pulseSystem, elapsedTime, deltaTime);
    
    // Update micro-ecology layers with active pulse propagation references
    this.bubbleField.update(features, this.pulseSystem, elapsedTime, deltaTime);
    this.planktonField.update(features, this.pulseSystem, elapsedTime, deltaTime);
    
    // Update micro-ecology layer uniforms (intensity multipliers, pixelRatio, depthTest settings)
    let dMode = 1.0; // 0: OFF, 1: NORMAL, 2: BOOST
    
    if (this.ecologyMode === 'OFF') {
      dMode = 0.0;
    } else if (this.ecologyMode === 'BOOST') {
      dMode = 2.0;
    } else {
      dMode = 1.0;
    }
    
    const dpr = window.devicePixelRatio || 1.0;
    
    if (this.bubbleField && this.bubbleField.material) {
      this.bubbleField.points.visible = this.ecologyMode !== 'OFF';
      this.bubbleField.material.uniforms.uEcologyMode.value = dMode;
      this.bubbleField.material.uniforms.uPixelRatio.value = dpr;
      // Disable depthTest in BOOST mode for easy verification
      this.bubbleField.points.material.depthTest = (this.ecologyMode !== 'BOOST');
      this.bubbleField.points.material.needsUpdate = true;
    }
    
    if (this.planktonField && this.planktonField.material) {
      this.planktonField.points.visible = this.ecologyMode !== 'OFF';
      this.planktonField.material.uniforms.uEcologyMode.value = dMode;
      this.planktonField.material.uniforms.uPixelRatio.value = dpr;
      // Disable depthTest in BOOST mode
      this.planktonField.points.material.depthTest = (this.ecologyMode !== 'BOOST');
      this.planktonField.points.material.needsUpdate = true;
    }
    
    this.postProcessing.update(features.energy);
    this.hud.update(features, this.freqData);

    // Update real-time debug overlay
    if (this.showDebug) {
      const debugReadout = document.getElementById('debug-readout');
      if (debugReadout) {
        const hardwareLatency = this.audioEngine.getOutputLatency();
        const visualDelay = Math.max(0.0, hardwareLatency + this.manualSyncOffset / 1000.0);
        
        const displayNames = {
          calm: 'Deep Calm',
          cinematic: 'Tidal',
          impact: 'Abyssal Surge',
          overdrive: 'Leviathan'
        };
        const currentModeName = displayNames[this.currentPreset] || this.currentPreset;
        
        const bIntensity = this.bubbleField.material.uniforms.uEcologyMode.value === 0.0 ? 0.0 : (this.bubbleField.material.uniforms.uEcologyMode.value === 2.0 ? 4.0 : 1.0);
        const pIntensity = this.planktonField.material.uniforms.uEcologyMode.value === 0.0 ? 0.0 : (this.planktonField.material.uniforms.uEcologyMode.value === 2.0 ? 5.0 : 1.0);
        const cIntensity = this.voxelTerrain.material.uniforms.uCausticsIntensity.value;
        const warmthVal = this.voxelTerrain.material.uniforms.uWarmth.value;
        const warmthLim = this.voxelTerrain.material.uniforms.uWarmthLimit.value;
        
        debugReadout.innerHTML = `
          <div>TIDE MODE: <span style="color: var(--primary-cyan); font-weight: bold;">${currentModeName.toUpperCase()}</span></div>
          <div>RIPPLE PRESET: <span style="color: #fff;">${this.currentPreset}</span></div>
          <div>LAST TRIGGER: <span style="color: var(--primary-cyan); font-weight: bold;">${this.lastTriggeredBand.toUpperCase()}</span></div>
          
          <div style="margin-top: 5px; border-top: 1px solid rgba(255,255,255,0.08); padding-top: 5px; color: var(--primary-cyan); font-weight: bold;">ECOLOGY MIXER (PRESS 'E')</div>
          <div>ECOLOGY MODE: <span style="color: #fff;">${this.ecologyMode}</span></div>
          <div>BUBBLE COUNT: <span style="color: #fff;">${this.bubbleField.bubbleCount}</span> (INTENSITY: <span style="color: #fff;">${bIntensity.toFixed(1)}</span>)</div>
          <div>PLANKTON COUNT: <span style="color: #fff;">${this.planktonField.planktonCount}</span> (INTENSITY: <span style="color: #fff;">${pIntensity.toFixed(1)}</span>)</div>
          <div>CAUSTICS INTENSITY: <span style="color: #fff;">${cIntensity.toFixed(4)}</span></div>
          <div>WARMTH RATIO: <span style="color: #fff;">${warmthVal.toFixed(2)} / ${warmthLim.toFixed(2)}</span></div>
          
          <div style="margin-top: 5px; border-top: 1px solid rgba(255,255,255,0.08); padding-top: 5px;">AUTO LATENCY: <span style="color: #fff;">${Math.round(hardwareLatency * 1000)}ms</span></div>
          <div>MANUAL OFFSET: <span style="color: #fff;">${this.manualSyncOffset >= 0 ? '+' : ''}${this.manualSyncOffset}ms</span></div>
          <div>FINAL VISUAL DELAY: <span style="color: var(--primary-cyan); font-weight: bold;">${Math.round(visualDelay * 1000)}ms</span></div>
          <div>PENDING PULSES: <span style="color: #fff;">${this.pendingPulses.length}</span></div>
          <div style="font-size: 8px; color: var(--text-muted); margin-top: 5px;">PRESS 'D' TO HIDE</div>
        `;
      }
    }

    // 5. Update OrbitControls and dynamic lighting orbit
    this.sceneSetup.update(elapsedTime);

    // 6. Render with bloom composer passes
    this.postProcessing.render();
  }

  /**
   * Selects a random active terrain cell coordinate biased by frequency range.
   * @param {string} bandName Name of the sub-frequency band.
   * @returns {Object} { x: number, z: number }
   */
  selectPulseOrigin(bandName) {
    if (!this.activeCells || this.activeCells.length === 0) return { x: 0, z: 0 };

    let minRadius = 0;
    let maxRadius = 38;

    // Classify radii bias (fixed bounds to keep spawn origins strictly inside the core visible terrain)
    if (bandName === 'sub' || bandName === 'bass') {
      minRadius = 0;
      maxRadius = 15; // Lows: center region
    } else if (bandName === 'lowMid' || bandName === 'mid' || bandName === 'vocal') {
      minRadius = 12;
      maxRadius = 28; // Mids: mid-ground
    } else {
      minRadius = 20;
      maxRadius = 38; // Highs: outer visible limits
    }

    // Filter candidate active cells within radial band boundaries
    const candidates = this.activeCells.filter(c => {
      const dist = Math.sqrt(c.x * c.x + c.z * c.z);
      return dist >= minRadius && dist <= maxRadius;
    });

    if (candidates.length === 0) {
      // Fallback
      return this.activeCells[Math.floor(Math.random() * this.activeCells.length)];
    }

    let selected = null;
    let attempts = 0;

    // Select candidate that is not too close to recent pulse coordinates
    while (attempts < 15) {
      const cell = candidates[Math.floor(Math.random() * candidates.length)];
      let tooClose = false;

      for (let j = 0; j < this.pulseHistory.length; j++) {
        const prev = this.pulseHistory[j];
        const dx = cell.x - prev.x;
        const dz = cell.z - prev.z;
        if (Math.sqrt(dx * dx + dz * dz) < 8.0) {
          tooClose = true;
          break;
        }
      }

      if (!tooClose) {
        selected = cell;
        break;
      }
      attempts++;
    }

    if (!selected) {
      selected = candidates[Math.floor(Math.random() * candidates.length)];
    }

    // Update history queue
    this.pulseHistory.push(selected);
    if (this.pulseHistory.length > 5) {
      this.pulseHistory.shift();
    }

    return selected;
  }

  cycleRipplePreset() {
    const modes = ['cinematic', 'impact', 'overdrive', 'calm'];
    const currentIndex = modes.indexOf(this.currentPreset);
    const nextIndex = (currentIndex + 1) % modes.length;
    this.currentPreset = modes[nextIndex];
    
    // Apply preset uniforms to shader
    this.voxelTerrain.setRipplePreset(RIPPLE_PRESETS[this.currentPreset]);
    
    return this.currentPreset;
  }

  cycleTheme() {
    const modes = ['AUTO', 'COOL', 'SOFT'];
    const currentIndex = modes.indexOf(this.themeMode);
    const nextIndex = (currentIndex + 1) % modes.length;
    this.themeMode = modes[nextIndex];
    
    // Show a clean toast notification
    if (this.hud) {
      const displayNames = {
        AUTO: 'Auto Shift',
        COOL: 'Cool Deep',
        SOFT: 'Soft Aqua'
      };
      this.hud.showNotification(`Theme Mode: ${displayNames[this.themeMode]}`, 'info');
    }
    
    return this.themeMode;
  }
}

// Instantiate the application once DOM content is fully loaded
window.addEventListener('DOMContentLoaded', () => {
  new App();
});
