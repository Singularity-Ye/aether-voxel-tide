import * as THREE from 'three';
import { ValueNoise2D } from '../utils/Noise.js';

export class PulseSystem {
  constructor() {
    this.pulses = [];
    this.noiseGen = new ValueNoise2D();
  }

  /**
   * Spawns a new expanding ripple pulse.
   * @param {number} x Origin x-coordinate in grid space.
   * @param {number} z Origin z-coordinate in grid space.
   * @param {THREE.Color|number|string} [color] Color of the pulse.
   * @param {number} [strength] Maximum height displacement of this ripple.
   * @param {number} [speed] Expansion speed in grid units per second.
   * @param {number} [width] Thickness of the ripple ring.
   * @param {number} [maxAge] Duration of the ripple in seconds.
   * @param {number} [rippleType] Type of the ripple (0.0: standard cyan, 1.0: high energy impact).
   */
  addPulse(x, z, color = 0x00f5ff, strength = 8.5, speed = 24.0, width = 2.8, maxAge = 2.2, rippleType = 0.0) {
    // Construct THREE.Color if color is a hex number or string
    const pulseColor = color instanceof THREE.Color ? color : new THREE.Color(color);
    
    // Ring buffer limit: keep at most 10 active pulses
    if (this.pulses.length >= 10) {
      this.pulses.shift();
    }
    
    this.pulses.push({
      x: x,
      z: z,
      age: 0,
      speed: speed,
      width: width,
      strength: strength,
      maxAge: maxAge,
      color: pulseColor,
      rippleType: rippleType
    });
  }

  /**
   * Advances the animation state of all active pulses.
   * @param {number} deltaTime Time elapsed since the last frame in seconds.
   */
  update(deltaTime) {
    for (let i = this.pulses.length - 1; i >= 0; i--) {
      const pulse = this.pulses[i];
      pulse.age += deltaTime;
      
      // Remove pulses that exceed their lifespan
      if (pulse.age >= pulse.maxAge) {
        this.pulses.splice(i, 1);
      }
    }
  }

  /**
   * Computes the cumulative impact of active pulses on a voxel's height and color.
   * @param {number} vx Voxel x position in grid.
   * @param {number} vz Voxel z position in grid.
   * @returns {Object} { heightOffset: number, colorBlend: number, pulseColor: THREE.Color }
   */
  getInfluence(vx, vz) {
    let totalHeightOffset = 0;
    let maxBlendFactor = 0;
    const blendedColor = new THREE.Color(0, 0, 0);

    for (let i = 0; i < this.pulses.length; i++) {
      const pulse = this.pulses[i];
      
      // Distance from voxel to pulse origin
      const dx = vx - pulse.x;
      const dz = vz - pulse.z;
      const dist = Math.sqrt(dx * dx + dz * dz);
      
      // Angle relative to pulse origin
      const angle = Math.atan2(dz, dx);
      
      // Add angle-based organic noise distortion to the radius
      // We map the angle (-PI to PI) into noise space
      const noiseFreq = 2.0;
      const noiseAmp = 3.0; // max displacement in grid units
      const noiseVal = this.noiseGen.noise((angle + Math.PI) * noiseFreq, pulse.age * 1.8);
      
      // Active wave radius with noise perturbation
      const currentRadius = pulse.age * pulse.speed + (noiseVal - 0.5) * noiseAmp;
      
      // Calculate gaussian bell-curve ring contribution
      // ring = e^( -(dist - radius)^2 / (2 * width^2) )
      const diff = dist - currentRadius;
      const ring = Math.exp(-(diff * diff) / (2.0 * pulse.width * pulse.width));
      
      // Quadratic decay for faster fade-out of pulse height and color
      const lifeRatio = pulse.age / pulse.maxAge;
      const decay = Math.pow(Math.max(0, 1.0 - lifeRatio), 2.0);
      
      // Height effect: lifts the voxel
      const heightOffset = ring * pulse.strength * decay;
      totalHeightOffset += heightOffset;
      
      // Color blend effect: how much the voxel shifts towards the pulse color
      const blend = ring * decay;
      if (blend > maxBlendFactor) {
        maxBlendFactor = blend;
        blendedColor.copy(pulse.color);
      }
    }

    return {
      heightOffset: totalHeightOffset,
      colorBlend: Math.min(1.0, maxBlendFactor),
      pulseColor: blendedColor
    };
  }

  clear() {
    this.pulses = [];
  }
}
