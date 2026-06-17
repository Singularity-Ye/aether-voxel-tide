import * as THREE from 'three';

export class BubbleField {
  constructor(scene, gridSize = 144) {
    this.scene = scene;
    this.gridSize = gridSize;
    this.bubbleCount = 250; // Moderately restrained count to maintain performance and focus
    this.points = null;
    this.material = null;
    this.geometry = null;
    
    this.init();
  }
  
  init() {
    // 1. Generate canvas texture dynamically to avoid loading image assets
    const texture = this.createBubbleTexture();
    
    // 2. Setup Geometry
    this.geometry = new THREE.BufferGeometry();
    
    const positions = new Float32Array(this.bubbleCount * 3);
    const speeds = new Float32Array(this.bubbleCount);
    const scales = new Float32Array(this.bubbleCount);
    const randoms = new Float32Array(this.bubbleCount * 2); // randomX, randomZ
    
    for (let i = 0; i < this.bubbleCount; i++) {
      // Spread X and Z positions across the terrain grid
      positions[i * 3] = (Math.random() - 0.5) * this.gridSize;
      positions[i * 3 + 2] = (Math.random() - 0.5) * this.gridSize;
      
      // Segregate height layers (80% middle layer, 20% high layer with larger bubbles)
      if (Math.random() > 0.2) {
        // Middle layer, smaller bubbles (Y: 5.0 to 18.0)
        positions[i * 3 + 1] = Math.random() * 13.0 + 5.0;
        scales[i] = Math.random() * 0.3 + 0.12; 
        speeds[i] = Math.random() * 0.7 + 0.35; // slower rising
      } else {
        // High layer, larger bubbles (Y: 18.0 to 32.0)
        positions[i * 3 + 1] = Math.random() * 14.0 + 18.0;
        scales[i] = Math.random() * 0.45 + 0.45; 
        speeds[i] = Math.random() * 1.3 + 0.7; // faster rising
      }
      
      speeds[i] = Math.random() * 1.2 + 0.4;
      
      randoms[i * 2] = Math.random() * 100.0;     // random phase offset X
      randoms[i * 2 + 1] = Math.random() * 100.0; // random phase offset Z
    }
    
    this.geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    this.geometry.setAttribute('aSpeedY', new THREE.BufferAttribute(speeds, 1));
    this.geometry.setAttribute('aScale', new THREE.BufferAttribute(scales, 1));
    this.geometry.setAttribute('aRandom', new THREE.BufferAttribute(randoms, 2));
    
    // 3. Custom Shader Material for GPU-based animation
    this.material = new THREE.ShaderMaterial({
      uniforms: {
        uTexture: { value: texture },
        uTime: { value: 0 },
        uLowFreq: { value: 0 },
        uEnergy: { value: 0 },
        uPulses: { value: [] },
        uPulseCount: { value: 0 },
        uEcologyMode: { value: 1.0 }, // 0: OFF, 1: NORMAL, 2: BOOST
        uPixelRatio: { value: 1.0 }
      },
      vertexShader: `
        uniform float uTime;
        uniform float uLowFreq;
        uniform float uEnergy;
        uniform float uEcologyMode;
        uniform float uPixelRatio;
        
        attribute float aSpeedY;
        attribute float aScale;
        attribute vec2 aRandom;
        
        varying float vAlpha;
        varying vec3 vColor;
        
        struct Pulse {
          vec2 origin;
          vec3 color;
          float strength;
          float speed;
          float width;
          float age;
          float maxAge;
          float rippleType;
        };
        
        uniform Pulse uPulses[4];
        uniform int uPulseCount;
        
        void main() {
          vec3 pos = position;
          
          // Rising movement
          pos.y += uTime * aSpeedY;
          pos.y = mod(pos.y, 35.0); // Wrap around height bounds
          
          // Swaying horizontal drift
          pos.x += sin(uTime * 0.35 + aRandom.x) * 1.6;
          pos.z += cos(uTime * 0.35 + aRandom.y) * 1.6;
          
          // Boundary fade near the top and bottom floor plane
          float boundaryFade = 1.0;
          if (pos.y > 28.0) {
            boundaryFade = clamp(1.0 - (pos.y - 28.0) / 7.0, 0.0, 1.0);
          } else if (pos.y < 4.0) {
            boundaryFade = clamp(pos.y / 4.0, 0.0, 1.0);
          }
          
          // Low frequency (bass) scales the sizes slightly
          float sizeMultiplier = 1.0 + uLowFreq * 0.55;
          
          // Dynamic wavefront interactions
          float pulseGlow = 0.0;
          vec3 pulseColorSum = vec3(0.0);
          float totalWeight = 0.0;
          
          for (int i = 0; i < 4; i++) {
            if (i >= uPulseCount) break;
            Pulse p = uPulses[i];
            
            float dist = distance(pos.xz, p.origin);
            float currentRadius = p.age * p.speed;
            float delta = abs(dist - currentRadius);
            
            if (delta < p.width * 2.2 && p.age < p.maxAge) {
              float factor = 1.0 - (delta / (p.width * 2.2));
              factor *= (1.0 - (p.age / p.maxAge)); // age attenuation
              
              pulseGlow += factor * p.strength * 0.5;
              pulseColorSum += p.color * factor * p.strength;
              totalWeight += factor;
            }
          }
          
          vec3 baseColor = vec3(0.05, 0.85, 1.0); // Pale Cyan
          if (totalWeight > 0.0) {
            vec3 pulseColor = pulseColorSum / totalWeight;
            // De-purple the pulse color by dampening the red channel if red and blue are both strong
            if (pulseColor.r > 0.4 && pulseColor.b > 0.5) {
              pulseColor.r *= 0.25; // shift purple/pink towards blue-cyan
            }
            vColor = mix(baseColor, pulseColor, 0.4) * (1.0 + pulseGlow * 0.7);
          } else {
            vColor = baseColor * (1.0 + uEnergy * 0.3);
          }
          
          // Ecology Mode opacity multipliers
          float opacityMultiplier = 1.0;
          if (uEcologyMode > 1.5) {
            opacityMultiplier = 4.0; // Boost mode 4x opacity
          } else if (uEcologyMode < 0.5) {
            opacityMultiplier = 0.0; // Off mode
          }
          
          // Default opacity: very dim (0.12 - 0.28). Wave sweeps boost opacity (0.45 - 0.7)
          float baseOpacity = mix(0.12, 0.28, aScale);
          vAlpha = boundaryFade * (baseOpacity + min(pulseGlow * 0.45, 0.42)) * opacityMultiplier;
          
          vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
          gl_Position = projectionMatrix * mvPosition;
          
          // Dynamic pixel size clamps: normal max 42px, boost max 80px
          float sizeLimitMax = uEcologyMode > 1.5 ? 80.0 : 42.0;
          float sizeLimitMin = uEcologyMode > 1.5 ? 8.0 : 3.0;
          
          float rawSize = (3500.0 * aScale * sizeMultiplier * uPixelRatio) / -mvPosition.z;
          gl_PointSize = clamp(rawSize, sizeLimitMin, sizeLimitMax);
        }
      `,
      fragmentShader: `
        uniform sampler2D uTexture;
        varying float vAlpha;
        varying vec3 vColor;
        
        void main() {
          vec4 texColor = texture2D(uTexture, gl_PointCoord);
          gl_FragColor = vec4(texColor.rgb * vColor, texColor.a * vAlpha);
        }
      `,
      transparent: true,
      depthWrite: false, // Prevents black outline overlap sorting bugs
      blending: THREE.AdditiveBlending
    });
    
    this.points = new THREE.Points(this.geometry, this.material);
    this.points.frustumCulled = false;
    this.scene.add(this.points);
  }
  
  createBubbleTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');
    
    ctx.clearRect(0, 0, 64, 64);
    
    // Smooth circle ring representation of underwater bubble
    const grad = ctx.createRadialGradient(32, 32, 20, 32, 32, 30);
    grad.addColorStop(0, 'rgba(255, 255, 255, 0.0)');
    grad.addColorStop(0.3, 'rgba(255, 255, 255, 0.15)');
    grad.addColorStop(0.85, 'rgba(255, 255, 255, 0.9)');
    grad.addColorStop(1, 'rgba(255, 255, 255, 0.0)');
    
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(32, 32, 30, 0, Math.PI * 2);
    ctx.fill();
    
    // Specular bubble reflection dot
    ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
    ctx.beginPath();
    ctx.arc(22, 22, 3.5, 0, Math.PI * 2);
    ctx.fill();
    
    return new THREE.CanvasTexture(canvas);
  }
  
  update(features, pulseSystem, time, deltaTime) {
    if (this.material) {
      this.material.uniforms.uTime.value = time;
      this.material.uniforms.uLowFreq.value = features.bass;
      this.material.uniforms.uEnergy.value = features.energy;
      
      const pulses = pulseSystem ? pulseSystem.pulses : [];
      const pulseUniforms = [];
      
      for (let i = 0; i < 4; i++) {
        if (i < pulses.length) {
          const p = pulses[i];
          pulseUniforms.push({
            origin: new THREE.Vector2(p.x, p.z),
            color: new THREE.Color(p.color),
            strength: p.strength,
            speed: p.speed,
            width: p.width,
            age: p.age,
            maxAge: p.maxAge,
            rippleType: p.rippleType
          });
        } else {
          pulseUniforms.push({
            origin: new THREE.Vector2(0, 0),
            color: new THREE.Color(0, 0, 0),
            strength: 0,
            speed: 0,
            width: 0,
            age: 0,
            maxAge: 0,
            rippleType: 0
          });
        }
      }
      
      this.material.uniforms.uPulses.value = pulseUniforms;
      this.material.uniforms.uPulseCount.value = pulses.length;
    }
  }
  
  destroy() {
    if (this.points) {
      this.scene.remove(this.points);
      this.geometry.dispose();
      this.material.dispose();
    }
  }
}
