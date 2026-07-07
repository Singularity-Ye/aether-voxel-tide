# Aether Voxel Tide (音律体素海)

A stunning, high-performance deep-sea audio-reactive voxel ocean visualizer built with **Three.js (WebGL)**, **GLSL (Custom ShaderMaterial)**, and the **Web Audio API**.

---

## 🌟 Visual Preview

* **Cyberpunk Neon Sea**: Saturated deep electric-blue voxels representing a digital ocean.
* **Concentric Sonar Ripples**: High-fidelity soundwaves propagating outward as concentric wave packets with physical crests and troughs.
* **Biomimetic Particle Field**: Floating bioluminescent bubbles and plankton responding dynamically to higher treble ranges.

---

## 🚀 Key Features

* **GPU Hardware Accelerated Rendering**: Leverages `THREE.InstancedMesh` to render 20,000+ interactive columns in a single draw call. All position displacements (wave heights and ripples) are computed in the GPU vertex shader for flawless 60 FPS performance.
* **Concentric Wave Packet Sonar**: Ripple physics computed in GLSL using a sinusoidal carrier wave combined with a Gaussian decay envelope:
  $$z_{ripple} = \cos(\Delta d \cdot 1.5) \cdot e^{-\frac{\Delta d^2}{w}}$$
* **Web Audio Frequency Extraction**: Dynamically binds 8 separate frequency sub-bands (from heavy sub-bass to air frequencies) to physical terrain elevations, local color transformations, and particles.
* **Dual Live Audio Input modes**: Supports uploading local `.mp3` / `.wav` audio tracks or capturing system audio in real-time via the browser's live media sharing context (Live Capture).

---

## 🛠️ Technology Stack

* **Core**: Javascript (ES6+), HTML5, CSS3
* **Rendering**: Three.js (WebGL), custom GLSL Shaders (Vertex & Fragment)
* **Audio**: HTML5 Web Audio API (`AudioContext`, `AnalyserNode`)
* **Build System**: Vite, PostCSS

---

## 📦 Getting Started

### Prerequisites

Make sure you have [Node.js](https://nodejs.org/) installed.

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/Singularity-Ye/aether-voxel-tide.git
   cd aether-voxel-tide
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

### Running Locally

To start the local development server:
```bash
npm run dev
```
Open [http://localhost:5173/](http://localhost:5173/) in your browser.

### Building for Production

To bundle the application for production:
```bash
npm run build
```
The output files will be located in the `dist/` directory.

---

## ⚙️ Shading & Shader Configuration

The visualizer's voxel materials are written using a custom GLSL shader inside `VoxelShaderMaterial.js`. You can toggle features by commenting/uncommenting the macros at the top of the fragment shader:

```glsl
#define ENABLE_STATIC_HEIGHT    // Enables noise-based islands
#define ENABLE_IDLE_WAVE        // Gentle ambient sea breathing
#define ENABLE_AUDIO_HEIGHT     // Music-responsive height scaling
#define ENABLE_RIPPLE_GEOMETRY  // Sonar wave displacement
#define ENABLE_RIPPLE_HIGHLIGHT // Concentric glowing wave rings
//#define ENABLE_CAUSTICS       // Organic water caustics (disabled for clean digital look)
```

---

## 📄 License

This project is open-source under the MIT License.
