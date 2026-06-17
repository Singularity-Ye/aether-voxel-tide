export class FeatureExtractor {
  constructor() {
    // HUD compatible outputs (aggregated)
    this.bass = 0;
    this.mid = 0;
    this.treble = 0;
    this.energy = 0;

    this.historyLength = 30; // ~0.5s at 60fps, responsive rolling average window

    // Define 8 sub-bands for localized events
    this.bands = [
      { name: 'sub', binRange: [0, 5], color: 0x00f5ff, threshold: 1.30, cooldownTime: 0.25, cooldown: 0, energy: 0, smoothed: 0, history: [] },
      { name: 'bass', binRange: [6, 15], color: 0x00aaff, threshold: 1.32, cooldownTime: 0.25, cooldown: 0, energy: 0, smoothed: 0, history: [] },
      { name: 'lowMid', binRange: [16, 35], color: 0x5e7cff, threshold: 1.40, cooldownTime: 0.25, cooldown: 0, energy: 0, smoothed: 0, history: [] },
      { name: 'mid', binRange: [36, 65], color: 0x8a2be2, threshold: 1.42, cooldownTime: 0.25, cooldown: 0, energy: 0, smoothed: 0, history: [] },
      { name: 'vocal', binRange: [66, 95], color: 0xf2e8ff, threshold: 1.45, cooldownTime: 0.25, cooldown: 0, energy: 0, smoothed: 0, history: [] },
      { name: 'highMid', binRange: [96, 130], color: 0xe02bff, threshold: 1.45, cooldownTime: 0.20, cooldown: 0, energy: 0, smoothed: 0, history: [] },
      { name: 'treble', binRange: [131, 180], color: 0xa7ffce, threshold: 1.50, cooldownTime: 0.30, cooldown: 0, energy: 0, smoothed: 0, history: [] },
      { name: 'air', binRange: [181, 250], color: 0xffffff, threshold: 1.55, cooldownTime: 0.35, cooldown: 0, energy: 0, smoothed: 0, history: [] }
    ];
  }

  update(frequencyData, deltaTime) {
    if (!frequencyData || frequencyData.length === 0) {
      this.bass = 0;
      this.mid = 0;
      this.treble = 0;
      this.energy = 0;
      return [];
    }

    const triggeredBands = [];

    // 1. Process each of the 8 bands
    for (let i = 0; i < this.bands.length; i++) {
      const band = this.bands[i];
      const startBin = band.binRange[0];
      const endBin = band.binRange[1];
      const count = endBin - startBin + 1;

      // Calculate average energy in bin range (normalized 0-1)
      let sum = 0;
      for (let bin = startBin; bin <= endBin; bin++) {
        sum += frequencyData[bin] / 255.0;
      }
      band.energy = sum / count;

      // Update smoothed value (decoupled display smoothing factor 0.14 for stable terrain/HUD render)
      band.smoothed = band.smoothed + (band.energy - band.smoothed) * 0.14;

      // Decrement cooldown
      if (band.cooldown > 0) {
        band.cooldown -= deltaTime;
      }

      band.triggered = false;

      // Peak detection compared to rolling average history
      if (band.history.length > 0) {
        let historySum = 0;
        for (let h = 0; h < band.history.length; h++) {
          historySum += band.history[h];
        }
        const average = historySum / band.history.length;

        // Onset check: must exceed minimum threshold and exceed history average
        if (band.energy > 0.12 && band.energy > average * band.threshold && band.cooldown <= 0) {
          band.triggered = true;
          band.cooldown = band.cooldownTime;
          triggeredBands.push(band);
        }
      }

      // Maintain rolling history
      band.history.push(band.energy);
      if (band.history.length > this.historyLength) {
        band.history.shift();
      }
    }

    // 2. Aggregate 8 sub-bands into 4 classic HUD properties
    // Bass: sub & bass bands
    this.bass = (this.bands[0].energy + this.bands[1].energy) / 2;
    // Mid: lowMid, mid & vocal bands
    this.mid = (this.bands[2].energy + this.bands[3].energy + this.bands[4].energy) / 3;
    // Treble: highMid, treble & air bands
    this.treble = (this.bands[5].energy + this.bands[6].energy + this.bands[7].energy) / 3;
    // Overall energy: average of all sub-bands
    let totalEnergy = 0;
    for (let i = 0; i < this.bands.length; i++) {
      totalEnergy += this.bands[i].energy;
    }
    this.energy = totalEnergy / this.bands.length;

    return triggeredBands;
  }

  getFeatures() {
    return {
      bass: this.bass,
      mid: this.mid,
      treble: this.treble,
      energy: this.energy,
      // Array of all sub-band smoothed energies for voxel height offsets
      bandEnergies: this.bands.map(b => b.smoothed)
    };
  }
}
