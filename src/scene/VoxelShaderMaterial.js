import * as THREE from 'three';

export class VoxelShaderMaterial extends THREE.ShaderMaterial {
  constructor() {
    super({
      uniforms: {
        uTime: { value: 0 },
        uBandEnergies: { value: new Float32Array(8) },
        uEnergy: { value: 0 },
        uRipples: {
          value: Array.from({ length: 10 }, () => ({
            pos: new THREE.Vector2(),
            time: -100.0,
            strength: 0.0,
            isActive: 0.0,
            rippleType: 0.0
          }))
        },
        uBaseColor1: { value: new THREE.Color(0x050e18) },
        uBaseColor2: { value: new THREE.Color(0x0b2230) },
        uCoolCore: { value: new THREE.Color(0x38cfe3) },
        uCoolEdge: { value: new THREE.Color(0x74efff) },
        uRippleColor: { value: new THREE.Color(0x00f5ff) },
        uGlowIntensity: { value: 1.0 },
        uGridSize: { value: 120.0 },
        uWarmth: { value: 0.0 },
        uBrightness: { value: 0.0 },
        uWarmthLimit: { value: 0.50 },
        uCausticsIntensity: { value: 0.0 },
        uBathymetricGlow: { value: 0.16 },
        uRippleNormalLift: { value: 0.0 },
        uRippleStrongLift: { value: 0.0 },
        uRippleImpactLift: { value: 0.0 },
        uRippleMaxLift: { value: 0.0 },
        uSeabedRippleLift: { value: 0.0 },
        uSeabedRippleGlow: { value: 0.0 },
        uContinentLiftScale: { value: 2.4 },
        uSeabedBaseHeight: { value: 0.45 },
        uRippleWidthNormal: { value: 4.2 },
        uRippleWidthWhite: { value: 2.2 },
        uThemeMix: { value: 0.0 }
      },

      vertexShader: `
        // Feature Flags for visual effects restoration
        //#define VERTEX_MINIMAL
        #define ENABLE_STATIC_HEIGHT
        #define ENABLE_IDLE_WAVE
        #define ENABLE_AUDIO_HEIGHT
        #define ENABLE_RIPPLE_GEOMETRY
        #define ENABLE_RIPPLE_HIGHLIGHT
        #define ENABLE_CAUSTICS

        uniform float uTime;
        uniform float uThemeMix;
        uniform float uBandEnergies[8];
        uniform float uEnergy;
        uniform float uGridSize;
        uniform float uContinentLiftScale;
        uniform float uSeabedBaseHeight;

        // Ripple config uniforms
        uniform float uRippleNormalLift;
        uniform float uRippleStrongLift;
        uniform float uRippleImpactLift;
        uniform float uRippleMaxLift;
        uniform float uSeabedRippleLift;
        uniform float uSeabedRippleGlow;
        uniform float uRippleWidthNormal;
        uniform float uRippleWidthWhite;

        struct Ripple {
          vec2 pos;
          float time;
          float strength;
          float isActive;
          float rippleType;
        };
        uniform Ripple uRipples[10];

        attribute vec2 aInstancePos;

        varying vec2 vUv;
        varying vec3 vNormal;
        varying vec3 vLocalNormal;
        varying float vRelativeY;
        varying float vElevation;
        varying float vDistance;
        varying float vContinentWeight;
        varying vec2 vInstancePos;
        varying vec2 vRippleAnim;
        varying vec3 vViewDir;

        vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
        vec2 mod289(vec2 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
        vec3 permute(vec3 x) { return mod289(((x * 34.0) + 1.0) * x); }

        float snoise(vec2 v) {
          const vec4 C = vec4(0.211324865405187, 0.366025403784439, -0.577350269189626, 0.024390243902439);
          vec2 i = floor(v + dot(v, C.yy));
          vec2 x0 = v - i + dot(i, C.xx);
          vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
          vec4 x12 = x0.xyxy + C.xxzz;
          x12.xy -= i1;
          i = mod289(i);
          vec3 p = permute(permute(i.y + vec3(0.0, i1.y, 1.0)) + i.x + vec3(0.0, i1.x, 1.0));
          vec3 m = max(0.5 - vec3(dot(x0, x0), dot(x12.xy, x12.xy), dot(x12.zw, x12.zw)), 0.0);
          m = m * m;
          m = m * m;
          vec3 x = 2.0 * fract(p * C.www) - 1.0;
          vec3 h = abs(x) - 0.5;
          vec3 ox = floor(x + 0.5);
          vec3 a0 = x - ox;
          m *= 1.79284291400159 - 0.85373472095314 * (a0 * a0 + h * h);
          vec3 g;
          g.x = a0.x * x0.x + h.x * x0.y;
          g.yz = a0.yz * x12.xz + h.yz * x12.yw;
          return 130.0 * dot(m, g);
        }

        float random(vec2 st) {
          return fract(sin(dot(st.xy, vec2(12.9898,78.233))) * 43758.5453123);
        }

        void main() {
          vUv = uv;
          vLocalNormal = normal;

          #ifdef VERTEX_MINIMAL
            vec3 worldNormal = mat3(modelMatrix) * normal;
            vNormal = length(worldNormal) > 0.0001 ? normalize(worldNormal) : normal;
            vDistance = length(aInstancePos);
            vContinentWeight = 1.0;
            vElevation = 1.0;
            vRelativeY = position.y + 0.5;
            vInstancePos = aInstancePos;
            vRippleAnim = vec2(0.0);
            vViewDir = vec3(0.0);

            vec4 worldPosition = modelMatrix * instanceMatrix * vec4(position, 1.0);
            gl_Position = projectionMatrix * viewMatrix * worldPosition;
          #else
            vec3 worldNormal = mat3(modelMatrix) * normal;
            vNormal = length(worldNormal) > 0.0001 ? normalize(worldNormal) : normal;

            vec2 terrainPos = aInstancePos + vec2(1000.123);
            float centerDist = length(aInstancePos);
            vDistance = centerDist;
            vInstancePos = aInstancePos;

            // 1A. Static Continent & Seabed Height
            float maskVal = snoise(terrainPos * 0.015) + snoise(terrainPos * 0.03) * 0.35;
            float continentWeight = smoothstep(-0.25, 0.15, maskVal);
            vContinentWeight = continentWeight;

            float detail = snoise(terrainPos * 0.08) * 0.18;
            float edgeFalloff = 1.0 - smoothstep(uGridSize * 0.42, uGridSize * 0.58, centerDist);
            float globalFalloff = 1.0 - smoothstep(uGridSize * 0.35, uGridSize * 0.55, centerDist);
            
            float baseElevation = uSeabedBaseHeight;
            #ifdef ENABLE_STATIC_HEIGHT
              baseElevation += continentWeight * uContinentLiftScale + detail;
            #endif

            // 1B. Idle Ambient Wave Breathing
            float idleElevation = 0.0;
            #ifdef ENABLE_IDLE_WAVE
              vec2 movingPos = terrainPos * 0.04 + vec2(uTime * 0.08, uTime * 0.04);
              float baseNoise = (snoise(movingPos) + 1.0) * 0.5;
              float wave = sin(terrainPos.x * 0.12 + terrainPos.y * 0.08 - uTime * 0.45) * 0.5 + 0.5;
              idleElevation = mix(baseNoise, wave, 0.4) * 0.7 * globalFalloff;
              baseElevation += clamp(idleElevation * 0.45, -0.25, 0.45);
            #endif

            // 1C. Audio Band Height Displacement
            float audioElevation = 0.0;
            #ifdef ENABLE_AUDIO_HEIGHT
              float rnd = random(terrainPos);
              
              // Sub-Bass: Center heavy massive lifts (0-22 radius)
              float subRegion = 1.0 - smoothstep(0.0, 22.0, centerDist);
              float subLift = uBandEnergies[0] * subRegion * 4.2;

              // Bass: Region clusters
              float bassNoise = snoise(terrainPos * 0.08 - vec2(0.0, uTime * 0.15));
              float bassRegion = 1.0 - smoothstep(4.0, 32.0, centerDist + bassNoise * 4.0);
              float bassLift = uBandEnergies[1] * bassRegion * (smoothstep(0.0, 1.0, rnd + 0.4)) * 3.5;

              // LowMid & Mid waves
              float lowMidNoise = snoise(terrainPos * 0.04 + vec2(uTime * 0.08, 0.0));
              float lowMidLift = uBandEnergies[2] * (lowMidNoise * 0.5 + 0.5) * 2.0;

              float riverFlow = sin(terrainPos.x * 0.16 + terrainPos.y * 0.16 + snoise(terrainPos * 0.08) * 1.8 - uTime * 1.6);
              float midLift = uBandEnergies[3] * max(0.0, riverFlow) * 2.5;

              // High-Mid/Treble scattered bioluminescent spires (dynamic branch removed)
              float trebleRegion = smoothstep(8.0, 42.0, centerDist);
              float hasHighMidLift = step(0.82, fract(rnd * 13.3));
              float highMidLift = uBandEnergies[5] * trebleRegion * fract(rnd * 7.7) * 2.2 * hasHighMidLift;

              audioElevation = (subLift + bassLift + lowMidLift + midLift + highMidLift) * globalFalloff;

              // High frequency treble sparkles (dynamic branch removed)
              audioElevation += uEnergy * 2.5 * step(0.985, rnd);
              
              float audioRegionalMotion = audioElevation * mix(0.25, 1.0, continentWeight);
              baseElevation += audioRegionalMotion;
            #endif

            // Apply static scale & mask
            baseElevation *= edgeFalloff;

            // 2. Ripple Geometry
            float rippleElevation = 0.0;
            vRippleAnim = vec2(0.0, 0.0);
            #ifdef ENABLE_RIPPLE_GEOMETRY
              float rippleIntensityNormal = 0.0;
              float rippleIntensityWhite = 0.0;
              float speed = 16.0;

              for (int i = 0; i < 10; i++) {
                if (uRipples[i].isActive > 0.5) {
                  float dVal = length(aInstancePos - uRipples[i].pos);
                  float timeSince = uTime - uRipples[i].time;
                  
                  float curSpeed = speed;
                  float curWidth = uRippleWidthNormal;
                  float curFadeDist = 16.0;

                  if (uRipples[i].rippleType > 0.5) {
                    curSpeed = 22.0;
                    curWidth = uRippleWidthWhite;
                    curFadeDist = 9.0;
                  }

                  float waveRadius = timeSince * curSpeed;
                  float deltaDist = dVal - waveRadius;
                  
                  float rippleWave = exp(-deltaDist * deltaDist / curWidth);
                  float fade = exp(-waveRadius / curFadeDist);
                  
                  float rGlow = rippleWave * fade * uRipples[i].strength;
                  
                  float baseLift = uRippleNormalLift;
                  if (uRipples[i].rippleType > 0.5) {
                    baseLift = uRippleImpactLift;
                  } else if (uRipples[i].strength > 6.0) {
                    baseLift = uRippleStrongLift;
                  }
                  
                  float audioTexture = clamp(audioElevation * 0.18, -0.15, 0.25);
                  float rLift = rippleWave * fade * baseLift * (1.0 + audioTexture);
                  
                  float maxLift = uRipples[i].rippleType > 0.5 ? uRippleImpactLift : (uRipples[i].strength > 6.0 ? uRippleStrongLift : uRippleNormalLift);
                  rLift = min(rLift, maxLift);
                  
                  float rippleScale = mix(uSeabedRippleLift, 1.0, continentWeight);
                  rippleElevation += rLift * rippleScale;
                  
                  float rippleSharpness = mix(4.5, 3.0, clamp(uThemeMix, 0.0, 1.0));
                  float colorWave = pow(rippleWave, rippleSharpness);
                  float rColorGlow = colorWave * fade * uRipples[i].strength;

                  float glowScale = mix(uSeabedRippleGlow, 1.0, continentWeight);
                  if (uRipples[i].rippleType > 0.5) {
                    rippleIntensityWhite += rColorGlow * glowScale;
                  } else {
                    rippleIntensityNormal += rColorGlow * glowScale;
                  }
                }
              }

              rippleElevation = min(rippleElevation, uRippleMaxLift) * edgeFalloff;
              vRippleAnim = vec2(clamp(rippleIntensityNormal, 0.0, 1.0), clamp(rippleIntensityWhite, 0.0, 1.0));
            #endif

            float finalElevation = baseElevation + rippleElevation;
            vElevation = finalElevation;

            float yPos = position.y + 0.5;
            vRelativeY = yPos;

            vec3 pos = position;
            pos.y = -0.5 + yPos * (1.0 + finalElevation);

            vec4 worldPosition = modelMatrix * instanceMatrix * vec4(pos, 1.0);
            vViewDir = cameraPosition - worldPosition.xyz;
            gl_Position = projectionMatrix * viewMatrix * worldPosition;
          #endif
        }
      `,

      fragmentShader: `
        // Feature Flags for visual effects restoration
        #define ENABLE_STATIC_HEIGHT
        #define ENABLE_IDLE_WAVE
        #define ENABLE_AUDIO_HEIGHT
        #define ENABLE_RIPPLE_GEOMETRY
        #define ENABLE_RIPPLE_HIGHLIGHT
        #define ENABLE_CAUSTICS

        // SHADING_MODE:
        // 0: Mode A (Flat Unlit - pure topColor, no normal, no scene lights, no bloom)
        // 1: Mode B (Self-lit Base - base color + gridGlow, no top/side shading difference)
        // 2: Mode C (Face Shading - top/side difference, side face shading)
        // 3: Mode D (Full Effects - caustics, ripples, sparks, etc.)
        #define SHADING_MODE 3

        uniform float uTime;
        uniform float uBandEnergies[8];
        uniform float uEnergy;
        uniform float uGridSize;
        uniform float uWarmth;
        uniform float uBrightness;
        uniform float uWarmthLimit;
        uniform float uCausticsIntensity;

        // Theme colors
        uniform vec3 uBaseColor1;
        uniform vec3 uRippleColor;
        uniform float uGlowIntensity;
        uniform float uBathymetricGlow;
        uniform float uThemeMix;

        varying vec2 vUv;
        varying vec3 vNormal;
        varying vec3 vLocalNormal;
        varying float vRelativeY;
        varying float vElevation;
        varying float vDistance;
        varying float vContinentWeight;
        varying vec2 vInstancePos;
        varying vec2 vRippleAnim;
        varying vec3 vViewDir;

        float random(vec2 st) {
          return fract(sin(dot(st.xy, vec2(12.9898,78.233))) * 43758.5453123);
        }

        void main() {
          bool isTop = vLocalNormal.y > 0.5;
          float distFromTop = 1.0 - vRelativeY;

          // Add coordinate offset 1000.123 to avoid origin-aligned seams
          vec2 caustPos = vInstancePos + vec2(1000.123, 1000.123);

          float rnd = random(caustPos);
          float normElevation = clamp(vElevation / 6.0, 0.0, 1.0);

          // 1. Base Palette Colors (Cool Base)
          float themeMix = clamp(uThemeMix, 0.0, 1.0);

          // Theme 0: Cool Deep (Mix = 0.0) / Theme 1: Soft Aqua (Mix = 1.0)
          vec3 base1Cool = mix(vec3(0.006, 0.018, 0.038), vec3(0.012, 0.051, 0.078), themeMix);
          vec3 base2Cool = mix(vec3(0.012, 0.035, 0.075), vec3(0.024, 0.098, 0.137), themeMix);
          vec3 glowCoolPreset = mix(vec3(0.0, 0.35, 1.0), vec3(0.11, 0.82, 0.82), themeMix);
          vec3 glowEdgePreset = mix(vec3(0.0, 0.85, 1.0), vec3(0.40, 0.95, 0.88), themeMix);

          // Blended visual behavior parameters
          float topCenterBright = mix(0.40, 0.80, themeMix);
          float sideDarkness = mix(0.35, 1.0, themeMix);
          float edgeGlowStr = mix(0.85, 0.38, themeMix);
          float gridShadowStr = mix(0.95, 0.45, themeMix);
          float bathyGlow = mix(0.06, 0.28, themeMix);
          
          // Muted warm alternatives for global breathing drift
          vec3 base1Warm = vec3(0.025, 0.012, 0.028); // muted pink-lilac dark base
          vec3 base2Warm = vec3(0.045, 0.022, 0.038); // soft warm peach-violet dark base
          
          // Interpolate base colors based on warmth (clamped mix ratio for visibility: max uWarmthLimit)
          float warmthFactor = clamp(uWarmth, 0.0, uWarmthLimit);
          vec3 cBase1 = mix(base1Cool, base1Warm, warmthFactor);
          vec3 cBase2 = mix(base2Cool, base2Warm, warmthFactor);

          // 2. Glow Colors Interpolation
          vec3 glowCool = mix(glowCoolPreset, glowEdgePreset, fract(rnd * 8.0));
          vec3 glowWarm = vec3(0.82, 0.58, 0.48); // soft warm peach glow
          vec3 targetGlow = mix(glowCool, glowWarm, warmthFactor);
          
          float distFade = 1.0 - smoothstep(uGridSize * 0.35, uGridSize * 0.55, vDistance);

          // Add subtle cyan highlight based on overall energy
          targetGlow = mix(targetGlow, vec3(0.1, 0.75, 1.0), uEnergy * 0.4);

          // Brightness scales the overall glow intensity slightly (driven by uBrightness)
          float dynamicGlowIntensity = uGlowIntensity * (1.0 + clamp(uBrightness - 0.5, -0.25, 0.35));

          // Voxel emission glow (dynamic response to audio)
          vec3 currentGlow = mix(cBase2, targetGlow, normElevation) * dynamicGlowIntensity * distFade;

          // Voxel side glass glow color (always visible, holds baseline blue-cyan/violet glow)
          vec3 sideGlassColor = targetGlow * dynamicGlowIntensity * distFade;

          // Voxel pillar body color (fades down)
          vec3 bodyColor = mix(cBase1, cBase2, vRelativeY * distFade);
          vec3 finalColor;

          // Top face base color
          vec3 topBaseColor = mix(cBase1, cBase2, topCenterBright);

          // Bathymetric Glow: dynamic weight suppression (restricted to seabed/deep water)
          float localBathymetricGlow = bathyGlow * (1.0 - vContinentWeight * 0.75) * (1.0 - smoothstep(0.1, 0.85, normElevation));
          vec3 seabedColor = mix(cBase1 * 1.1, vec3(0.01, 0.42, 0.52), localBathymetricGlow);

          // 3-way color gradient for landmass: deepTeal -> oceanCyan -> seafoam
          vec3 deepTeal = vec3(0.01, 0.12, 0.18);
          vec3 oceanCyan = vec3(0.03, 0.32, 0.42);
          vec3 seafoam = vec3(0.08, 0.55, 0.48);
          vec3 highland = mix(
            mix(deepTeal, oceanCyan, clamp(normElevation * 2.0, 0.0, 1.0)),
            mix(oceanCyan, seafoam, clamp((normElevation - 0.5) * 2.0, 0.0, 1.0)),
            step(0.5, normElevation)
          );

          vec3 targetTopColor = mix(seabedColor, mix(cBase1 * 1.5, highland, mix(0.40, 1.0, themeMix)), vContinentWeight);

          // Finer, softer water caustics with smaller pattern scale
          vec2 pCaust = caustPos * 0.45; 
          vec2 uvCaust = pCaust;
          uvCaust.x += sin(pCaust.y + uTime * 1.2) * 0.25;
          uvCaust.y += cos(pCaust.x + uTime * 0.9) * 0.25;
          
          float wave1 = sin(uvCaust.x * 1.8 + uTime * 0.8) * 0.5 + 0.5;
          float wave2 = cos(uvCaust.y * 1.8 - uTime * 0.6) * 0.5 + 0.5;
          
          float web = 1.0 - abs(wave1 - wave2);
          web = pow(web, 5.0); // Thinner caustic web lines
          
          // Attenuate caustics based on overall energy
          float caustMute = clamp(1.0 - uEnergy * 0.75, 0.05, 1.0);

          if (isTop) {
            // --- TOP FACE ---
            float centerDist = clamp(length(vUv - vec2(0.5)) * 2.0, 0.0, 1.0);
            float centerFactor = smoothstep(0.0, 0.7, centerDist);
            float centerMask = mix(topCenterBright, 1.0, centerFactor);
            finalColor = targetTopColor * centerMask;

            // Glowing top face borders (fake outlines) - using anti-aliased fwidth
            float edgeX = max(1.0 - smoothstep(0.0, fwidth(vUv.x) * 1.5, vUv.x), 1.0 - smoothstep(0.0, fwidth(vUv.x) * 1.5, 1.0 - vUv.x));
            float edgeY = max(1.0 - smoothstep(0.0, fwidth(vUv.y) * 1.5, vUv.y), 1.0 - smoothstep(0.0, fwidth(vUv.y) * 1.5, 1.0 - vUv.y));
            float edge = clamp(max(edgeX, edgeY), 0.0, 1.0);
            
            // Soft glow on top face edges (slightly scaled by uBrightness)
            float edgeGlowVal = edgeGlowStr * (0.15 + normElevation * 0.35) * (1.0 + clamp(uBrightness - 0.5, -0.2, 0.3));
            
            // Grid shadow mix for voxel cell definition (darker on low seabed for separation)
            vec3 gridShadow = mix(vec3(0.002, 0.015, 0.025), vec3(0.01, 0.06, 0.08), normElevation) * gridShadowStr;
            finalColor = mix(finalColor, gridShadow, edge * 0.38);

            // Seabed top edge glow is present but dimmer (minimum 35% intensity)
            float edgeGlowScale = mix(0.35, 1.0, vContinentWeight);
            finalColor += currentGlow * edge * edgeGlowVal * edgeGlowScale;

            // Plankton Sparkles and Bioluminescent flashes are only for continent voxels
            if (vContinentWeight > 0.4) {
              // Shimmering Plankton Sparkles (twinkle driven by high frequencies)
              bool isSparkleTarget = fract(rnd * 29.0) > 0.96;
              if (isSparkleTarget) {
                float twinkleDist = smoothstep(uGridSize * 0.5, uGridSize * 0.25, vDistance);
                float sparkleIntensity = uBandEnergies[7] * 1.8 * twinkleDist;
                finalColor += targetGlow * sparkleIntensity;
              }

              // Random bright bioluminescent flash
              if (fract(rnd * 47.0) > 0.982) {
                float flashFreq = sin(uTime * 35.0 + rnd * 80.0) * 0.5 + 0.5;
                float twinkleDist = smoothstep(uGridSize * 0.5, uGridSize * 0.25, vDistance);
                finalColor += mix(vec3(0.8, 1.0, 1.0), vec3(0.4, 0.9, 1.0), rnd) * flashFreq * uBandEnergies[6] * 1.2 * twinkleDist;
              }
            }

            // Apply ripples to top face (ripple intensities are pre-scaled by SEABED_RIPPLE_GLOW)
            #ifdef ENABLE_RIPPLE_HIGHLIGHT
              finalColor += uRippleColor * vRippleAnim.x * 0.45;
              finalColor += vec3(1.0, 1.0, 1.0) * vRippleAnim.y * 1.0;
            #endif

            // Apply water caustics overlay
            #ifdef ENABLE_CAUSTICS
              finalColor += vec3(0.2, 0.94, 1.0) * web * uCausticsIntensity * caustMute;
            #endif
          } else {
            // --- SIDE FACES ---
            float sideVertical = pow(vRelativeY, 1.25);
            float sideGlowGradient = pow(vRelativeY, 1.3);

            // Side glass glow intensity (seabed side glass is visible and holds outline, minimum 18%)
            float sideGlowWeight = mix(0.12 + sideDarkness * 0.15, 0.55, vContinentWeight);
            float totalSideGlow = (0.18 + sideGlowGradient * 0.52 + normElevation * 0.30 * sideGlowGradient) * sideGlowWeight;
            totalSideGlow = clamp(totalSideGlow, 0.0, 1.0);

            // Blend bodyColor with sideGlassColor, keeping bottoms darker in Cool Deep
            vec3 adjustedBodyColor = bodyColor * sideDarkness;
            finalColor = mix(adjustedBodyColor, sideGlassColor, totalSideGlow);

            // Add sharp top rim outline highlight (scales with music and continent weight)
            float rimGlow = smoothstep(0.025, 0.0, distFromTop);
            finalColor += sideGlassColor * rimGlow * (0.28 + normElevation * 0.72) * sideGlowWeight;

            // Apply ripples to side faces (concentrated near the top)
            #ifdef ENABLE_RIPPLE_HIGHLIGHT
              finalColor += uRippleColor * vRippleAnim.x * 0.45 * sideGlowGradient;
              finalColor += vec3(1.0, 1.0, 1.0) * vRippleAnim.y * 1.0 * sideGlowGradient;
            #endif

            // Apply fixed directional fake shading (darken sides facing away from view)
            float directionalShade = mix(0.78, 1.0, max(dot(normalize(vNormal), normalize(vec3(-0.35, 0.85, 0.40))), 0.0));
            finalColor *= directionalShade;

            // Subtle side vertical edge outline using fwidth
            float sideEdge = max(1.0 - smoothstep(0.0, fwidth(vUv.x) * 1.5, vUv.x), 1.0 - smoothstep(0.0, fwidth(vUv.x) * 1.5, 1.0 - vUv.x));
            vec3 sideEdgeColor = vec3(0.08, 0.55, 0.65) * vContinentWeight;
            finalColor += sideEdgeColor * sideEdge * 0.20 * sideVertical;

            // Apply faint projected caustics for side faces (concentrated near vertical tops)
            #ifdef ENABLE_CAUSTICS
              vec2 pCaustSide = vec2(vInstancePos.x, vRelativeY * 10.0) * 0.45;
              vec2 uvCaustSide = pCaustSide;
              uvCaustSide.x += sin(pCaustSide.y + uTime * 1.2) * 0.25;
              uvCaustSide.y += cos(pCaustSide.x + uTime * 0.9) * 0.25;
              
              float wave1Side = sin(uvCaustSide.x * 1.8 + uTime * 0.8) * 0.5 + 0.5;
              float wave2Side = cos(uvCaustSide.y * 1.8 - uTime * 0.6) * 0.5 + 0.5;
              
              float webSide = 1.0 - abs(wave1Side - wave2Side);
              webSide = pow(webSide, 5.0);
              
              finalColor += vec3(0.2, 0.94, 1.0) * webSide * (uCausticsIntensity * 0.1) * caustMute * sideVertical;
            #endif
          }

          // Apply subtle Fresnel edge sheen for glass/acrylic look (clamped within 0.04 ~ 0.08)
          // Applied to all voxels but scaled by continent weight (minimum 40% on seabed)
          vec3 viewDirNorm = normalize(vViewDir);
          vec3 normalNorm = normalize(vNormal);
          float fresnel = pow(1.0 - max(dot(viewDirNorm, normalNorm), 0.0), 3.0);
          float fresnelScale = mix(0.40, 1.0, vContinentWeight);
          finalColor += sideGlassColor * fresnel * 0.06 * fresnelScale;

          // Minimum deep ocean blue brightness protection to prevent pure black gaps/faces
          finalColor = max(finalColor, vec3(0.012, 0.045, 0.065));

          // 5. Volumetric Fog (Aerial perspective) and smooth boundary fade-out
          float aerialFog = smoothstep(uGridSize * 0.25, uGridSize * 0.58, vDistance);
          vec3 atmosphericColor = mix(cBase1, cBase2, 0.3);
          finalColor = mix(finalColor, atmosphericColor, aerialFog * 0.6);

          float alphaFade = 1.0 - smoothstep(uGridSize * 0.45, uGridSize * 0.62, vDistance);
          vec3 backgroundSceneColor = vec3(0.015, 0.035, 0.055); // Fog color / background navy
          finalColor = mix(backgroundSceneColor, finalColor, alphaFade);

          gl_FragColor = vec4(finalColor, 1.0);
        }
      `,
      transparent: false,
      depthWrite: true,
      depthTest: true,
      blending: THREE.NormalBlending,
      extensions: {
        derivatives: true
      }
    });
  }
}
