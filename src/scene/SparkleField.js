import * as THREE from 'three';

export class SparkleField {
  constructor(scene, gridSize = 76) {
    this.scene = scene;
    this.gridSize = gridSize;
    this.particles = [];
    
    this.solidCount = 180;
    this.wireframeCount = 45;
    
    this.solidMesh = null;
    this.wireframeMesh = null;
    
    this.init();
  }

  init() {
    // 1. Solid glowing particle system setup
    const solidGeo = new THREE.BoxGeometry(0.18, 0.18, 0.18);
    const solidMat = new THREE.MeshBasicMaterial({
      color: 0x00f5ff,
      toneMapped: false // lets colors > 1.0 glow via bloom
    });
    this.solidMesh = new THREE.InstancedMesh(solidGeo, solidMat, this.solidCount);
    
    const solidColors = new Float32Array(this.solidCount * 3);
    this.solidMesh.instanceColor = new THREE.InstancedBufferAttribute(solidColors, 3);
    this.scene.add(this.solidMesh);

    // 2. Wireframe glowing cube system setup (instanced wireframe box)
    const wireframeGeo = new THREE.BoxGeometry(0.7, 0.7, 0.7);
    const wireframeMat = new THREE.MeshBasicMaterial({
      color: 0x8a2be2,
      wireframe: true,
      transparent: true,
      opacity: 0.6,
      toneMapped: false
    });
    this.wireframeMesh = new THREE.InstancedMesh(wireframeGeo, wireframeMat, this.wireframeCount);
    
    const wireframeColors = new Float32Array(this.wireframeCount * 3);
    this.wireframeMesh.instanceColor = new THREE.InstancedBufferAttribute(wireframeColors, 3);
    this.scene.add(this.wireframeMesh);

    // 3. Generate randomized initial particle metadata
    // Solid particles
    for (let i = 0; i < this.solidCount; i++) {
      this.particles.push({
        x: (Math.random() - 0.5) * this.gridSize,
        y: Math.random() * 30.0 + 3.0,
        z: (Math.random() - 0.5) * this.gridSize,
        speedY: Math.random() * 2.0 + 0.8,
        scale: Math.random() * 0.8 + 0.4,
        colorType: Math.random() > 0.4 ? 'cyan' : 'purple',
        type: 'solid'
      });
    }

    // Wireframe particles
    for (let i = 0; i < this.wireframeCount; i++) {
      this.particles.push({
        x: (Math.random() - 0.5) * (this.gridSize - 8.0),
        y: Math.random() * 28.0 + 4.0,
        z: (Math.random() - 0.5) * (this.gridSize - 8.0),
        speedY: Math.random() * 1.5 + 0.5,
        rotX: Math.random() * Math.PI,
        rotY: Math.random() * Math.PI,
        rotSpeedX: (Math.random() - 0.5) * 0.6,
        rotSpeedY: (Math.random() - 0.5) * 0.6,
        scale: Math.random() * 0.9 + 0.55,
        type: 'wireframe'
      });
    }
  }

  update(features, time, deltaTime) {
    let solidIndex = 0;
    let wireframeIndex = 0;

    const tempMatrix = new THREE.Matrix4();
    const tempPosition = new THREE.Vector3();
    const tempRotation = new THREE.Quaternion();
    const tempScale = new THREE.Vector3();
    
    const colorCyan = new THREE.Color(0x00f5ff);
    const colorPurple = new THREE.Color(0xa12bff);
    const colorPink = new THREE.Color(0xe02bff);
    const tempColor = new THREE.Color();

    const trebleIntensity = Math.max(0, features.treble);

    for (let i = 0; i < this.particles.length; i++) {
      const p = this.particles[i];
      
      // Update drift position (drift upwards)
      p.y += p.speedY * deltaTime;
      
      // Wrap particles that drift out of bounds back to the floor plane
      if (p.y > 36.0) {
        p.y = Math.random() * 3.0 + 2.0;
        p.x = (Math.random() - 0.5) * this.gridSize;
        p.z = (Math.random() - 0.5) * this.gridSize;
      }

      if (p.type === 'solid') {
        // Set transform
        tempPosition.set(p.x, p.y, p.z);
        tempRotation.set(0, 0, 0, 1);
        
        // Solid scale pulses slightly with overall energy
        const sizePulse = p.scale * (1.0 + features.energy * 0.3);
        tempScale.set(sizePulse, sizePulse, sizePulse);
        tempMatrix.compose(tempPosition, tempRotation, tempScale);
        
        this.solidMesh.setMatrixAt(solidIndex, tempMatrix);

        // Color & Bloom Glow: Solid particles flash bright white/cyan on treble spikes
        const baseColor = p.colorType === 'cyan' ? colorCyan : colorPurple;
        tempColor.copy(baseColor);
        
        // Treble spike flash effect
        if (trebleIntensity > 0.45) {
          const flash = (trebleIntensity - 0.45) * 3.0;
          tempColor.lerp(new THREE.Color(0xffffff), flash);
          tempColor.multiplyScalar(1.0 + flash * 4.0); // massive bloom glow
        } else {
          // Normal soft glow
          tempColor.multiplyScalar(0.7 + features.energy * 1.5);
        }
        
        this.solidMesh.setColorAt(solidIndex, tempColor);
        solidIndex++;
      } else {
        // Update rotations for wireframe cubes
        p.rotX += p.rotSpeedX * deltaTime;
        p.rotY += p.rotSpeedY * deltaTime;
        
        const euler = new THREE.Euler(p.rotX, p.rotY, 0);
        tempRotation.setFromEuler(euler);
        
        tempPosition.set(p.x, p.y, p.z);
        
        // Wireframe size scales in sync with treble
        const sizePulse = p.scale * (1.0 + trebleIntensity * 0.85);
        tempScale.set(sizePulse, sizePulse, sizePulse);
        
        tempMatrix.compose(tempPosition, tempRotation, tempScale);
        this.wireframeMesh.setMatrixAt(wireframeIndex, tempMatrix);

        // Wireframe Color: Lerps from electric purple to neon pink on energy peaks
        tempColor.copy(colorPurple);
        const colorShift = Math.max(0, Math.min(1.0, features.energy * 1.4 - 0.3));
        tempColor.lerp(colorPink, colorShift);
        
        // Glow scale
        const glowFactor = 0.8 + trebleIntensity * 2.0;
        tempColor.multiplyScalar(glowFactor);
        
        this.wireframeMesh.setColorAt(wireframeIndex, tempColor);
        wireframeIndex++;
      }
    }

    // Flag transforms for rendering updates
    this.solidMesh.instanceMatrix.needsUpdate = true;
    if (this.solidMesh.instanceColor) {
      this.solidMesh.instanceColor.needsUpdate = true;
    }
    
    this.wireframeMesh.instanceMatrix.needsUpdate = true;
    if (this.wireframeMesh.instanceColor) {
      this.wireframeMesh.instanceColor.needsUpdate = true;
    }
  }
}
