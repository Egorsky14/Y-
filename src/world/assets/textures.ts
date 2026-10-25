import * as THREE from 'three';

/**
 * Procedural textures generated on a 2D canvas at runtime. Everything is original and
 * license-free; see ASSET_LICENSES.md.
 */
const cache = new Map<string, THREE.Texture>();

function canvasTexture(key: string, w: number, h: number, draw: (ctx: CanvasRenderingContext2D) => void, opts: { repeat?: [number, number]; srgb?: boolean } = {}): THREE.Texture {
  const cached = cache.get(key);
  if (cached) return cached;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  draw(ctx);
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  if (opts.repeat) tex.repeat.set(opts.repeat[0], opts.repeat[1]);
  tex.anisotropy = 8;
  if (opts.srgb !== false) tex.colorSpace = THREE.SRGBColorSpace;
  cache.set(key, tex);
  return tex;
}

function seededNoise(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), s | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function sandTexture(): THREE.Texture {
  return canvasTexture(
    'sand',
    512,
    512,
    (ctx) => {
      ctx.fillStyle = '#d9b982';
      ctx.fillRect(0, 0, 512, 512);
      const rnd = seededNoise(7);
      for (let i = 0; i < 9000; i++) {
        const v = 180 + Math.floor(rnd() * 60);
        ctx.fillStyle = `rgba(${v}, ${Math.floor(v * 0.84)}, ${Math.floor(v * 0.56)}, 0.55)`;
        ctx.fillRect(rnd() * 512, rnd() * 512, 2 + rnd() * 3, 2 + rnd() * 3);
      }
      for (let i = 0; i < 300; i++) {
        ctx.fillStyle = `rgba(120, 95, 60, ${0.15 + rnd() * 0.2})`;
        ctx.beginPath();
        ctx.arc(rnd() * 512, rnd() * 512, 1 + rnd() * 2.5, 0, Math.PI * 2);
        ctx.fill();
      }
    },
    { repeat: [60, 60] },
  );
}

export function gravelTexture(): THREE.Texture {
  return canvasTexture(
    'gravel',
    256,
    256,
    (ctx) => {
      ctx.fillStyle = '#c9ad7c';
      ctx.fillRect(0, 0, 256, 256);
      const rnd = seededNoise(3);
      for (let i = 0; i < 4000; i++) {
        const v = 150 + Math.floor(rnd() * 90);
        ctx.fillStyle = `rgb(${v}, ${Math.floor(v * 0.86)}, ${Math.floor(v * 0.62)})`;
        ctx.beginPath();
        ctx.arc(rnd() * 256, rnd() * 256, 1 + rnd() * 2, 0, Math.PI * 2);
        ctx.fill();
      }
    },
    { repeat: [4, 4] },
  );
}

export function asphaltTexture(): THREE.Texture {
  return canvasTexture(
    'asphalt',
    256,
    256,
    (ctx) => {
      ctx.fillStyle = '#4b4f55';
      ctx.fillRect(0, 0, 256, 256);
      const rnd = seededNoise(11);
      for (let i = 0; i < 6000; i++) {
        const v = 60 + Math.floor(rnd() * 50);
        ctx.fillStyle = `rgba(${v}, ${v}, ${v + 4}, 0.6)`;
        ctx.fillRect(rnd() * 256, rnd() * 256, 1.5, 1.5);
      }
    },
    { repeat: [1, 1] },
  );
}

/** A road strip texture: asphalt with a dashed yellow center line and white edge lines. Oriented along V. */
export function roadStripTexture(): THREE.Texture {
  return canvasTexture(
    'road-strip',
    256,
    512,
    (ctx) => {
      ctx.fillStyle = '#4a4e54';
      ctx.fillRect(0, 0, 256, 512);
      const rnd = seededNoise(5);
      for (let i = 0; i < 9000; i++) {
        const v = 55 + Math.floor(rnd() * 50);
        ctx.fillStyle = `rgba(${v}, ${v}, ${v + 5}, 0.7)`;
        ctx.fillRect(rnd() * 256, rnd() * 512, 2, 2);
      }
      ctx.fillStyle = '#e9d36a';
      for (let y = 0; y < 512; y += 64) ctx.fillRect(124, y + 8, 8, 36);
      ctx.fillStyle = 'rgba(235,235,235,0.9)';
      ctx.fillRect(6, 0, 4, 512);
      ctx.fillRect(246, 0, 4, 512);
    },
    { repeat: [1, 1] },
  );
}

export function concreteTexture(): THREE.Texture {
  return canvasTexture(
    'concrete',
    128,
    128,
    (ctx) => {
      ctx.fillStyle = '#d8d4cc';
      ctx.fillRect(0, 0, 128, 128);
      const rnd = seededNoise(9);
      for (let i = 0; i < 1500; i++) {
        const v = 190 + Math.floor(rnd() * 40);
        ctx.fillStyle = `rgba(${v}, ${v - 3}, ${v - 8}, 0.6)`;
        ctx.fillRect(rnd() * 128, rnd() * 128, 2, 2);
      }
      ctx.strokeStyle = 'rgba(120,120,120,0.35)';
      ctx.lineWidth = 2;
      ctx.strokeRect(0, 0, 128, 128);
    },
    { repeat: [1, 1] },
  );
}

export function stuccoTexture(): THREE.Texture {
  return canvasTexture(
    'stucco',
    128,
    128,
    (ctx) => {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, 128, 128);
      const rnd = seededNoise(13);
      for (let i = 0; i < 2500; i++) {
        const v = 225 + Math.floor(rnd() * 30);
        ctx.fillStyle = `rgba(${v}, ${v}, ${v}, 0.9)`;
        ctx.fillRect(rnd() * 128, rnd() * 128, 2, 2);
      }
    },
    { repeat: [2, 1], srgb: true },
  );
}

/** Company wordmark decal with transparent background. */
export function wordmarkTexture(variant: 'light' | 'dark' = 'light'): THREE.Texture {
  return canvasTexture(`wordmark-${variant}`, 1024, 256, (ctx) => {
    ctx.clearRect(0, 0, 1024, 256);
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    // Teal bolt/thermometer glyph
    ctx.fillStyle = '#19d3c5';
    ctx.beginPath();
    ctx.moveTo(60, 40);
    ctx.lineTo(130, 40);
    ctx.lineTo(95, 125);
    ctx.lineTo(140, 125);
    ctx.lineTo(60, 220);
    ctx.lineTo(85, 145);
    ctx.lineTo(45, 145);
    ctx.closePath();
    ctx.fill();
    ctx.font = '900 150px Inter, Arial Black, Arial, sans-serif';
    ctx.fillStyle = variant === 'light' ? '#ffffff' : '#0b0f14';
    ctx.fillText('EGO', 165, 108);
    ctx.fillStyle = '#19d3c5';
    ctx.font = '800 92px Inter, Arial Black, Arial, sans-serif';
    ctx.fillText('HVAC', 560, 104);
    ctx.fillStyle = variant === 'light' ? 'rgba(255,255,255,0.85)' : 'rgba(11,15,20,0.85)';
    ctx.font = '600 40px Inter, Arial, sans-serif';
    ctx.fillText('MEASURED. VERIFIED. DONE RIGHT.', 170, 200);
  });
}

export function signTexture(text: string, color = '#19d3c5', bg = '#0f1318'): THREE.Texture {
  return canvasTexture(`sign-${text}-${color}-${bg}`, 1024, 256, (ctx) => {
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, 1024, 256);
    ctx.fillStyle = color;
    ctx.fillRect(0, 230, 1024, 26);
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffffff';
    ctx.font = '900 110px Inter, Arial Black, Arial, sans-serif';
    ctx.fillText(text, 512, 118);
  });
}

export function windowTexture(): THREE.Texture {
  return canvasTexture(
    'window',
    128,
    128,
    (ctx) => {
      const g = ctx.createLinearGradient(0, 0, 128, 128);
      g.addColorStop(0, '#7fb4d8');
      g.addColorStop(0.5, '#3b6f99');
      g.addColorStop(1, '#8cc3e6');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, 128, 128);
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      ctx.fillRect(60, 0, 8, 128);
      ctx.fillRect(0, 60, 128, 8);
      // Frame baked into the texture so a window is a single draw call.
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 10;
      ctx.strokeRect(0, 0, 128, 128);
    },
    { repeat: [1, 1] },
  );
}
