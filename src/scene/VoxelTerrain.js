import * as THREE from 'three';
import { SimplexNoise2D } from '../utils/Noise.js';
import { VoxelShaderMaterial } from './VoxelShaderMaterial.js';

export class VoxelTerrain {
  constructor(scene, gridSize = 144) {
    this.scene = scene;
    this.gridSize = gridSize;
    
    this.group = new THREE.Group();
    this.scene.add(this.group);
    
    this.instancedMesh = null;
    this.material = null;
    this.noiseGen = new SimplexNoise2D();

    // Voxel sizing configurations
    this.boxSize = 0.99; // geometry is nearly continuous; visible grid is shader-controlled
    this.stepSize = 1.0;

    // Persistent voxel properties mapping (used for CPU-side active cells reference)
    this.voxelProps = [];
    
    this.init();
  }

  init() {
    const geometry = new THREE.BoxGeometry(this.boxSize, 1.0, this.boxSize);

    // 2. Instantiate material. Use ?basicVoxel=1 for geometry/gap A/B diagnostics.
    const useBasicMaterial = new URLSearchParams(window.location.search).has('basicVoxel');
    this.material = useBasicMaterial
      ? new THREE.MeshBasicMaterial({ color: 0x18b9c7 })
      : new VoxelShaderMaterial();
    if (this.material.uniforms?.uGridSize) {
      this.material.uniforms.uGridSize.value = this.gridSize;
    }

    // 3. Create InstancedMesh
    const count = this.gridSize * this.gridSize;
    const aInstancePosArray = new Float32Array(count * 2);

    // 4. Statically position instances once on the CPU
    const halfGrid = this.gridSize / 2;
    const tempMatrix = new THREE.Matrix4();
    const tempPosition = new THREE.Vector3();
    const tempRotation = new THREE.Quaternion();
    const tempScale = new THREE.Vector3(1.0, 1.0, 1.0);

    let index = 0;
    for (let x = 0; x < this.gridSize; x++) {
      for (let z = 0; z < this.gridSize; z++) {
        const gx = x - halfGrid + 0.5;
        const gz = z - halfGrid + 0.5;

        // Position the voxel. We set Y = 0.5 so that the bottom face (local Y = -0.5) 
        // aligns exactly at world Y = 0.0.
        tempPosition.set(gx * this.stepSize, 0.5, gz * this.stepSize);
        tempMatrix.compose(tempPosition, tempRotation, tempScale);
        
        aInstancePosArray[index * 2] = gx * this.stepSize;
        aInstancePosArray[index * 2 + 1] = gz * this.stepSize;

        // Pre-compute continentWeight on CPU to allow PulseSystem to find valid spawn origins on landmass (cohesive continents)
        // Add coordinate offset 1000.123 to avoid origin-aligned seams
        const px = gx * this.stepSize + 1000.123;
        const pz = gz * this.stepSize + 1000.123;
        const maskVal = this.noiseGen.noise(px * 0.015, pz * 0.015) +
                        this.noiseGen.noise(px * 0.03, pz * 0.03) * 0.35;
        
        // JS equivalent of GLSL smoothstep(-0.25, 0.15, maskVal)
        const t = Math.max(0.0, Math.min(1.0, (maskVal - (-0.25)) / (0.15 - (-0.25))));
        const continentWeight = t * t * (3.0 - 2.0 * t);

        this.voxelProps.push({
          continentWeight
        });

        index++;
      }
    }

    geometry.setAttribute('aInstancePos', new THREE.InstancedBufferAttribute(aInstancePosArray, 2));

    this.instancedMesh = new THREE.InstancedMesh(geometry, this.material, count);
    this.instancedMesh.visible = true;
    this.instancedMesh.frustumCulled = false;
    this.group.add(this.instancedMesh);

    // Apply the computed matrices to the instancedMesh
    index = 0;
    for (let x = 0; x < this.gridSize; x++) {
      for (let z = 0; z < this.gridSize; z++) {
        const gx = x - halfGrid + 0.5;
        const gz = z - halfGrid + 0.5;
        tempPosition.set(gx * this.stepSize, 0.5, gz * this.stepSize);
        tempMatrix.compose(tempPosition, tempRotation, tempScale);
        this.instancedMesh.setMatrixAt(index, tempMatrix);
        index++;
      }
    }

    // Upload static matrices to the GPU once
    this.instancedMesh.instanceMatrix.needsUpdate = true;
  }

  update(features, pulseSystem, time, deltaTime) {
    if (!this.instancedMesh || !this.material) return;

    // Slow self-rotation of the entire voxel group
    this.group.rotation.y += 0.0006;

    if (!this.material.uniforms) return;

    // 1. Pass time uniform
    this.material.uniforms.uTime.value = time;
    
    // 1.5 Pass theme mix uniform
    if (this.material.uniforms.uThemeMix && features.themeMix !== undefined) {
      this.material.uniforms.uThemeMix.value = features.themeMix;
    }
    
    // 2. Pass 8-band audio energies
    if (features.bandEnergies) {
      for (let i = 0; i < 8; i++) {
        this.material.uniforms.uBandEnergies.value[i] = features.bandEnergies[i];
      }
    } else {
      this.material.uniforms.uBandEnergies.value.fill(features.energy || 0.0);
    }
    
    // 3. Pass global energy
    this.material.uniforms.uEnergy.value = features.energy || 0.0;

    // 3.5 Calculate and smooth-lerp warmth and brightness ratios
    let targetWarmth = 0.5;
    let targetBrightness = 0.5;
    if (features.bandEnergies) {
      const sub = features.bandEnergies[0] || 0;
      const bass = features.bandEnergies[1] || 0;
      const lowMid = features.bandEnergies[2] || 0;
      const highMid = features.bandEnergies[5] || 0;
      const treble = features.bandEnergies[6] || 0;
      const air = features.bandEnergies[7] || 0;
      
      const totalSum = features.bandEnergies.reduce((sum, val) => sum + val, 0);
      if (totalSum > 0.05) {
        targetWarmth = (sub + bass + lowMid) / totalSum;
        targetBrightness = (highMid + treble + air) / totalSum;
      }
    }

    // Very slow atmospheric temperature breathing interpolation
    this.material.uniforms.uWarmth.value = THREE.MathUtils.lerp(
      this.material.uniforms.uWarmth.value,
      targetWarmth,
      0.02
    );
    this.material.uniforms.uBrightness.value = THREE.MathUtils.lerp(
      this.material.uniforms.uBrightness.value,
      targetBrightness,
      0.03
    );

    // 4. Map active ripples from PulseSystem into the uRipples shader array
    const ripplesUniform = this.material.uniforms.uRipples.value;
    for (let i = 0; i < 10; i++) {
      if (i < pulseSystem.pulses.length) {
        const pulse = pulseSystem.pulses[i];
        
        // Scale grid coordinates to world coordinates
         ripplesUniform[i].pos.set(pulse.x * this.stepSize, pulse.z * this.stepSize);
        // birthTime = time - age
        ripplesUniform[i].time = time - pulse.age;
        ripplesUniform[i].strength = pulse.strength;
        ripplesUniform[i].isActive = 1.0;
        ripplesUniform[i].rippleType = pulse.rippleType || 0.0;
      } else {
        ripplesUniform[i].pos.set(0.0, 0.0);
        ripplesUniform[i].time = -100.0;
        ripplesUniform[i].strength = 0.0;
        ripplesUniform[i].isActive = 0.0;
        ripplesUniform[i].rippleType = 0.0;
      }
    }
  }

  getActiveTerrainCells() {
    const origins = [];
    const halfGrid = this.gridSize / 2;
    let index = 0;
    for (let x = 0; x < this.gridSize; x++) {
      for (let z = 0; z < this.gridSize; z++) {
        const p = this.voxelProps[index];
        // Filter out cells that are strongly part of the continent (weight > 0.4) for spawn origins
        if (p && p.continentWeight > 0.4) {
          origins.push({
            x: x - halfGrid + 0.5,
            z: z - halfGrid + 0.5,
            weight: p.continentWeight
          });
        }
        index++;
      }
    }
    return origins;
  }

  setRipplePreset(preset) {
    if (!this.material?.uniforms) return;
    this.material.uniforms.uRippleNormalLift.value = preset.normalLift;
    this.material.uniforms.uRippleStrongLift.value = preset.strongLift;
    this.material.uniforms.uRippleImpactLift.value = preset.impactLift;
    this.material.uniforms.uRippleMaxLift.value = preset.maxLift;
    this.material.uniforms.uSeabedRippleLift.value = preset.seabedRippleLift;
    this.material.uniforms.uSeabedRippleGlow.value = preset.seabedRippleGlow;
    this.material.uniforms.uContinentLiftScale.value = preset.continentLiftScale;
    this.material.uniforms.uSeabedBaseHeight.value = preset.seabedBaseHeight;
    this.material.uniforms.uRippleWidthNormal.value = preset.rippleWidthNormal;
    this.material.uniforms.uRippleWidthWhite.value = preset.rippleWidthWhite;
    this.material.uniforms.uWarmthLimit.value = preset.warmthLimit !== undefined ? preset.warmthLimit : 0.50;
    this.material.uniforms.uCausticsIntensity.value = preset.causticsIntensity !== undefined ? preset.causticsIntensity : 0.035;
    this.material.uniforms.uBathymetricGlow.value = preset.bathymetricGlow !== undefined ? preset.bathymetricGlow : 0.25;
  }
}
