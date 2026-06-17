import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

export class SceneSetup {
  constructor(canvasId) {
    this.canvas = document.getElementById(canvasId);
    if (!this.canvas) {
      throw new Error(`Canvas with id '${canvasId}' not found.`);
    }

    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.controls = null;
    this.dirLight = null;
    this.fillLight = null;
    this.cameraFillLight = null;
    
    this.init();
  }

  init() {
    // 1. Create Scene
    this.scene = new THREE.Scene();
    
    // Set background color
    this.scene.background = new THREE.Color(0x050e18);

    // 2. Create Camera
    const aspect = window.innerWidth / window.innerHeight;
    this.camera = new THREE.PerspectiveCamera(45, aspect, 0.1, 1000);
    // Top-down fixed angle zoomed out further for wide majestic上帝视角
    this.camera.position.set(0, 75, 100);
    this.camera.lookAt(0, 0, 0);

    // Camera-attached fill light (headlight) to prevent pitch blackness on camera facing sides (subtle fill)
    this.cameraFillLight = new THREE.PointLight(0xe6f2ff, 0.30, 150, 0.8);
    this.camera.add(this.cameraFillLight);
    this.scene.add(this.camera); // Camera must be added to the scene graph for child light to execute

    // 3. Create Renderer
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance',
      stencil: false,
      depth: true
    });
    
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = false; // Keep it disabled for high performance
    
    // Tone mapping for better neon glow
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;

    // 4. Create OrbitControls
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.05;
    this.controls.enablePan = false; // Disable panning to keep target locked at center
    
    // Distance limits (expanded to let user view from further away)
    this.controls.minDistance = 60;
    this.controls.maxDistance = 220;
    
    // Polar angle limits (keep viewing from above)
    this.controls.minPolarAngle = 0.2; // Avoid direct top-down gimbal lock
    this.controls.maxPolarAngle = Math.PI / 2.2; // Don't go below the horizontal plane

    // 5. Setup Lighting
    // Use HemisphereLight for sky/ground ambient color gradients so voxels are beautifully shaded from all angles (subtle sky glow)
    const hemiLight = new THREE.HemisphereLight(0x1a3a54, 0x050f1a, 1.4); // sky: ocean blue-green, ground: dark deep-sea navy
    this.scene.add(hemiLight);

    // Main directional light to create form and highlights on cubes (orbits the scene - soft rim light)
    this.dirLight = new THREE.DirectionalLight(0xffffff, 0.85);
    this.dirLight.position.set(35, 45, 30);
    this.dirLight.lookAt(0, 0, 0);
    this.scene.add(this.dirLight);
    
    // Secondary subtle fill light for coloring shadow edges (orbits opposite to main light)
    this.fillLight = new THREE.DirectionalLight(0x00f5ff, 0.30);
    this.fillLight.position.set(-30, 40, -40);
    this.scene.add(this.fillLight);

    // 6. Handle Window Resize
    window.addEventListener('resize', this.onWindowResize.bind(this));
  }

  onWindowResize() {
    const width = window.innerWidth;
    const height = window.innerHeight;
    
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    
    this.renderer.setSize(width, height);
  }

  update(time = 0) {
    this.controls.update();
    
    // Orbit the lights slowly around the scene to create moving highlights and shadows (dynamic scene lighting)
    if (this.dirLight) {
      const angle = time * 0.12; // slow orbit speed
      this.dirLight.position.set(
        Math.cos(angle) * 42,
        35 + Math.sin(angle * 0.5) * 8, // gentle vertical wave
        Math.sin(angle) * 42
      );
    }
    
    if (this.fillLight) {
      const angle = time * 0.12 + Math.PI; // opposite side orbit
      this.fillLight.position.set(
        Math.cos(angle) * 36,
        28,
        Math.sin(angle) * 36
      );
    }
  }

  getRenderer() { return this.renderer; }
  getCamera() { return this.camera; }
  getScene() { return this.scene; }
}
