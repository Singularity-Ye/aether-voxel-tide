import * as THREE from 'three';

export class PlanktonField {
  constructor(scene, gridSize = 144) {
    this.scene = scene;
    this.gridSize = gridSize;
    this.planktonCount = 650; // Restrained to keep the visual clean and less crowded
    this.points = null;
    this.material = null;
    this.geometry = null;
    
    this.init();
  }
  
  init() {
    const texture = this.createGlowTexture();
    this.geometry = new THREE.BufferGeometry();
    
    const positions = new Float32Array(this.planktonCount * 3);
    const phases = new Float32Array(this.planktonCount);
    const colorTypes = new Float32Array(this.planktonCount); // 0: Cyan, 1: Blue-green, 2: Violet
    const scales = new Float32Array(this.planktonCount);
    
    // Cluster planktons around 8 random centers on the grid to create swarms/clouds
    const clusterCenters = [];
    for (let c = 0; c < 8; c++) {
      clusterCenters.push({
        x: (Math.random() - 0.5) * this.gridSize * 0.75,
        z: (Math.random() - 0.5) * this.gridSize * 0.75
      });
    }
    
    for (let i = 0; i < this.planktonCount; i++) {
      const center = clusterCenters[Math.floor(Math.random() * clusterCenters.length)];
      
      // Distribute in a small radial swarm around the picked cluster center
      const r = Math.random() * 14.0;
      const theta = Math.random() * Math.PI * 2.0;
      
      positions[i * 3] = center.x + Math.cos(theta) * r;
      
      // Plankton height distribution (70% low layer Y: 1.8 to 5.2, 30% medium layer Y: 5.2 to 10.0)
      if (Math.random() > 0.3) {
        positions[i * 3 + 1] = Math.random() * 3.4 + 1.8; // Low layer
      } else {
        positions[i * 3 + 1] = Math.random() * 4.8 + 5.2; // Medium layer
      }
      
      positions[i * 3 + 2] = center.z + Math.sin(theta) * r;
      
      phases[i] = Math.random() * Math.PI * 2.0;
      
      const randType = Math.random();
      if (randType < 0.65) {
        colorTypes[i] = 0.0; // Cyan
      } else if (randType < 0.95) {
        colorTypes[i] = 1.0; // Blue-green
      } else {
        colorTypes[i] = 2.0; // Violet (5% rare bioluminescent accent)
      }
      
      scales[i] = Math.random() * 0.55 + 0.15;
    }
    
    this.geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    this.geometry.setAttribute('aPhase', new THREE.BufferAttribute(phases, 1));
    this.geometry.setAttribute('aColorType', new THREE.BufferAttribute(colorTypes, 1));
    this.geometry.setAttribute('aScale', new THREE.BufferAttribute(scales, 1));
    
    this.material = new THREE.ShaderMaterial({
      uniforms: {
        uTexture: { value: texture },
        uTime: { value: 0 },
        uTreble: { value: 0 },
        uEnergy: { value: 0 },
        uPulses: { value: [] },
        uPulseCount: { value: 0 },
        uEcologyMode: { value: 1.0 }, // 0: OFF, 1: NORMAL, 2: BOOST
        uPixelRatio: { value: 1.0 }
      },
      vertexShader: `
        uniform float uTime;
        uniform float uTreble;
        uniform float uEnergy;
        uniform float uEcologyMode;
        uniform float uPixelRatio;
        
        attribute float aPhase;
        attribute float aColorType;
        attribute float aScale;
        
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
          
          // Gentle vertical and horizontal drifting motion
          pos.y += sin(uTime * 0.12 + aPhase) * 0.3;
          pos.x += sin(uTime * 0.25 + aPhase) * 0.5;
          pos.z += cos(uTime * 0.25 - aPhase) * 0.5;
          
          // Wrap low planktons inside height boundary
          pos.y = mod(pos.y, 14.0) + 1.2;
          
          // Marine Bioluminescent Palettes: 0=cyan, 1=blue-green, 2=violet
          vec3 cyan = vec3(0.02, 0.94, 0.95);
          vec3 blueGreen = vec3(0.0, 0.88, 0.58);
          vec3 violet = vec3(0.55, 0.32, 0.95);
          
          vec3 baseColor = cyan;
          if (aColorType > 1.5) {
            baseColor = violet;
          } else if (aColorType > 0.5) {
            baseColor = blueGreen;
          }
          
          // Micro shimmer twinkle
          float shimmer = sin(uTime * 1.35 + aPhase * 3.5) * 0.35 + 0.65;
          
          // Micro flash trigger on high-frequency music spikes
          float trebleFlash = uTreble * 1.6 * (0.15 + 0.85 * sin(aPhase + uTime * 4.0));
          
          // Wavefront wake up intensity
          float pulseGlow = 0.0;
          vec3 pulseColorSum = vec3(0.0);
          float totalWeight = 0.0;
          
          for (int i = 0; i < 4; i++) {
            if (i >= uPulseCount) break;
            Pulse p = uPulses[i];
            
            float dist = distance(pos.xz, p.origin);
            float currentRadius = p.age * p.speed;
            float delta = abs(dist - currentRadius);
            
            if (delta < p.width * 2.0 && p.age < p.maxAge) {
              float factor = 1.0 - (delta / (p.width * 2.0));
              factor *= (1.0 - (p.age / p.maxAge));
              
              pulseGlow += factor * p.strength * 0.7;
              pulseColorSum += p.color * factor * p.strength;
              totalWeight += factor;
            }
          }
          
          if (totalWeight > 0.0) {
            vColor = mix(baseColor, pulseColorSum / totalWeight, 0.45) * (1.0 + pulseGlow * 1.4);
          } else {
            vColor = baseColor * (1.0 + trebleFlash * 1.1);
          }
          
          // Ecology Mode opacity multipliers
          float opacityMultiplier = 1.0;
          if (uEcologyMode > 1.5) {
            opacityMultiplier = 5.0; // Boost mode 5x opacity
          } else if (uEcologyMode < 0.5) {
            opacityMultiplier = 0.0; // Off mode
          }
          
          // Default opacity: very dim (0.04 - 0.15). Ripple sweep wakes them up (up to 0.8)
          float baseOpacity = mix(0.04, 0.15, aScale);
          vAlpha = aScale * (baseOpacity * shimmer + uEnergy * 0.12 + trebleFlash * 0.5 + min(pulseGlow * 0.85, 0.75)) * opacityMultiplier;
          
          vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
          gl_Position = projectionMatrix * mvPosition;
          
          // Dynamic size clamps: normal max 6px, boost max 12px
          float sizeLimitMax = uEcologyMode > 1.5 ? 12.0 : 6.0;
          float sizeLimitMin = uEcologyMode > 1.5 ? 2.5 : 1.0;
          
          float rawSize = (2000.0 * aScale * (1.0 + trebleFlash * 0.7) * uPixelRatio) / -mvPosition.z;
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
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });
    
    this.points = new THREE.Points(this.geometry, this.material);
    this.points.frustumCulled = false;
    this.scene.add(this.points);
  }
  
  createGlowTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 32;
    canvas.height = 32;
    const ctx = canvas.getContext('2d');
    
    ctx.clearRect(0, 0, 32, 32);
    
    const grad = ctx.createRadialGradient(16, 16, 0, 16, 16, 15);
    grad.addColorStop(0, 'rgba(255, 255, 255, 1.0)');
    grad.addColorStop(0.2, 'rgba(255, 255, 255, 0.7)');
    grad.addColorStop(0.55, 'rgba(255, 255, 255, 0.15)');
    grad.addColorStop(1, 'rgba(255, 255, 255, 0.0)');
    
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(16, 16, 15, 0, Math.PI * 2);
    ctx.fill();
    
    return new THREE.CanvasTexture(canvas);
  }
  
  update(features, pulseSystem, time, deltaTime) {
    if (this.material) {
      this.material.uniforms.uTime.value = time;
      this.material.uniforms.uTreble.value = features.treble;
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
