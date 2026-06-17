import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';

export class PostProcessing {
  constructor(renderer, scene, camera) {
    this.renderer = renderer;
    this.scene = scene;
    this.camera = camera;

    // Use deep ocean background color for fog
    this.scene.fog = new THREE.FogExp2(0x050e18, 0.0090);

    // Setup EffectComposer
    this.composer = new EffectComposer(this.renderer);
    
    // Add RenderPass
    const renderPass = new RenderPass(this.scene, this.camera);
    this.composer.addPass(renderPass);

    // Setup UnrealBloomPass with conservative parameters
    // threshold = 0.85, strength = 0.6, radius = 0.4
    const size = new THREE.Vector2(window.innerWidth, window.innerHeight);
    this.bloomPass = new UnrealBloomPass(size, 0.6, 0.4, 0.85);
    this.composer.addPass(this.bloomPass);

    window.addEventListener('resize', this.onWindowResize.bind(this));
  }

  onWindowResize() {
    const width = window.innerWidth;
    const height = window.innerHeight;
    this.composer.setSize(width, height);
    this.bloomPass.setSize(width, height);
  }

  update(energy = 0.0) {
    // Dynamic bloom scaling based on audio energy
    // Ordinary ripple edge: strength 0.6. Treble peaks: boost strength up to 1.15.
    this.bloomPass.strength = 0.6 + THREE.MathUtils.clamp(energy * 0.55, 0.0, 0.55);
  }

  render() {
    this.composer.render();
  }
}
