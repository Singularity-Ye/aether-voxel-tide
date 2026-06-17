// A simple, fast 2D Value Noise generator to avoid heavy external dependencies
export class ValueNoise2D {
  constructor() {
    this.grid = new Float32Array(256 * 256);
    for (let i = 0; i < this.grid.length; i++) {
      this.grid[i] = Math.random();
    }
  }

  noise(x, y) {
    const X = Math.floor(x) & 255;
    const Y = Math.floor(y) & 255;
    const xf = x - Math.floor(x);
    const yf = y - Math.floor(y);
    
    // Smoothstep interpolation curves
    const u = xf * xf * (3.0 - 2.0 * xf);
    const v = yf * yf * (3.0 - 2.0 * yf);
    
    const row0 = Y * 256;
    const row1 = ((Y + 1) & 255) * 256;
    const nextX = (X + 1) & 255;

    const n00 = this.grid[X + row0];
    const n10 = this.grid[nextX + row0];
    const n01 = this.grid[X + row1];
    const n11 = this.grid[nextX + row1];
    
    const nx0 = n00 + u * (n10 - n00);
    const nx1 = n01 + u * (n11 - n01);
    
    return nx0 + v * (nx1 - nx0);
  }

  // Fractional Brownian Motion (fBm)
  fbm(x, y, octaves = 2) {
    let value = 0.0;
    let amplitude = 1.0;
    let frequency = 1.0;
    let maxAmp = 0.0;

    for (let i = 0; i < octaves; i++) {
      value += this.noise(x * frequency, y * frequency) * amplitude;
      maxAmp += amplitude;
      frequency *= 2.0;
      amplitude *= 0.5;
    }
    return value / maxAmp;
  }
}

// A deterministic 2D Simplex Noise generator matching standard 2D Simplex formulas
export class SimplexNoise2D {
  constructor() {
    const p = new Uint8Array(256);
    // Use a simple seeded LCG to guarantee exact same noise patterns on every reload
    let seed = 42;
    const random = () => {
      const x = Math.sin(seed++) * 10000;
      return x - Math.floor(x);
    };

    for (let i = 0; i < 256; i++) p[i] = i;
    for (let i = 255; i > 0; i--) {
      const r = Math.floor(random() * (i + 1));
      const tmp = p[i];
      p[i] = p[r];
      p[r] = tmp;
    }

    this.perm = new Uint8Array(512);
    this.permMod12 = new Uint8Array(512);
    for (let i = 0; i < 512; i++) {
      this.perm[i] = p[i & 255];
      this.permMod12[i] = this.perm[i] % 12;
    }
  }

  noise(x, y) {
    const F2 = 0.5 * (Math.sqrt(3.0) - 1.0);
    const G2 = (3.0 - Math.sqrt(3.0)) / 6.0;

    let n0 = 0.0, n1 = 0.0, n2 = 0.0;

    const s = (x + y) * F2;
    const i = Math.floor(x + s);
    const j = Math.floor(y + s);

    const t = (i + j) * G2;
    const X0 = i - t;
    const Y0 = j - t;
    const x0 = x - X0;
    const y0 = y - Y0;

    let i1, j1;
    if (x0 > y0) { i1 = 1; j1 = 0; }
    else { i1 = 0; j1 = 1; }

    const x1 = x0 - i1 + G2;
    const y1 = y0 - j1 + G2;
    const x2 = x0 - 1.0 + 2.0 * G2;
    const y2 = y0 - 1.0 + 2.0 * G2;

    const ii = i & 255;
    const jj = j & 255;
    const gi0 = this.permMod12[ii + this.perm[jj]];
    const gi1 = this.permMod12[ii + i1 + this.perm[jj + j1]];
    const gi2 = this.permMod12[ii + 1 + this.perm[jj + 1]];

    let t0 = 0.5 - x0 * x0 - y0 * y0;
    if (t0 >= 0) {
      t0 *= t0;
      n0 = t0 * t0 * this.grad(gi0, x0, y0);
    }

    let t1 = 0.5 - x1 * x1 - y1 * y1;
    if (t1 >= 0) {
      t1 *= t1;
      n1 = t1 * t1 * this.grad(gi1, x1, y1);
    }

    let t2 = 0.5 - x2 * x2 - y2 * y2;
    if (t2 >= 0) {
      t2 *= t2;
      n2 = t2 * t2 * this.grad(gi2, x2, y2);
    }

    return 70.0 * (n0 + n1 + n2);
  }

  grad(hash, x, y) {
    const h = hash & 7;
    const gradX = h < 4 ? (h === 0 || h === 3 ? 1.0 : -1.0) : 0.0;
    const gradY = h >= 4 ? (h === 4 || h === 7 ? 1.0 : -1.0) : (h === 1 || h === 2 ? 1.0 : -1.0);
    return gradX * x + gradY * y;
  }
}

