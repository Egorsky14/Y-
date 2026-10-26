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

/** Draws the EGO bolt glyph into a canvas context. */
function drawBolt(ctx: CanvasRenderingContext2D, x: number, y: number, h: number, color = '#19d3c5') {
  const k = h / 180;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x + 15 * k, y);
  ctx.lineTo(x + 85 * k, y);
  ctx.lineTo(x + 50 * k, y + 85 * k);
  ctx.lineTo(x + 95 * k, y + 85 * k);
  ctx.lineTo(x + 15 * k, y + 180 * k);
  ctx.lineTo(x + 40 * k, y + 105 * k);
  ctx.lineTo(x, y + 105 * k);
  ctx.closePath();
  ctx.fill();
}

/** Company wordmark decal with transparent background. The tagline is optional: it is only legible on large panels. */
export function wordmarkTexture(variant: 'light' | 'dark' = 'light', tagline = true): THREE.Texture {
  return canvasTexture(`wordmark-${variant}-${tagline ? 'tag' : 'plain'}`, 1024, 256, (ctx) => {
    ctx.clearRect(0, 0, 1024, 256);
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    const ink = variant === 'light' ? '#ffffff' : '#0b0f14';
    if (tagline) {
      drawBolt(ctx, 45, 40, 180);
      ctx.font = '900 150px Inter, Arial Black, Arial, sans-serif';
      ctx.fillStyle = ink;
      ctx.fillText('EGO', 165, 108);
      ctx.fillStyle = '#19d3c5';
      ctx.font = '800 92px Inter, Arial Black, Arial, sans-serif';
      ctx.fillText('HVAC', 560, 104);
      ctx.fillStyle = variant === 'light' ? 'rgba(255,255,255,0.85)' : 'rgba(11,15,20,0.85)';
      ctx.font = '600 40px Inter, Arial, sans-serif';
      ctx.fillText('MEASURED. VERIFIED. DONE RIGHT.', 170, 200);
    } else {
      drawBolt(ctx, 40, 38, 180);
      ctx.font = '900 170px Inter, Arial Black, Arial, sans-serif';
      ctx.fillStyle = ink;
      ctx.fillText('EGO', 165, 128);
      ctx.fillStyle = '#19d3c5';
      ctx.font = '800 118px Inter, Arial Black, Arial, sans-serif';
      ctx.fillText('HVAC', 580, 132);
    }
  });
}

/** Monument sign face: wordmark, legal name and the tagline on a charcoal panel. */
export function monumentTexture(): THREE.Texture {
  return canvasTexture('monument', 1024, 512, (ctx) => {
    ctx.fillStyle = '#15181c';
    ctx.fillRect(0, 0, 1024, 512);
    ctx.fillStyle = '#19d3c5';
    ctx.fillRect(0, 0, 1024, 14);
    drawBolt(ctx, 70, 70, 190);
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    ctx.fillStyle = '#ffffff';
    ctx.font = '900 150px Inter, Arial Black, Arial, sans-serif';
    ctx.fillText('EGO', 200, 150);
    ctx.fillStyle = '#19d3c5';
    ctx.font = '800 100px Inter, Arial Black, Arial, sans-serif';
    ctx.fillText('HVAC', 590, 154);
    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    ctx.fillRect(80, 270, 864, 3);
    ctx.fillStyle = '#e9eef2';
    ctx.font = '600 50px Inter, Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('EGO HVAC SERVICES LLC', 512, 330);
    ctx.fillStyle = '#9fb3bd';
    ctx.font = '500 40px Inter, Arial, sans-serif';
    ctx.fillText('MOST HVAC COMPANIES GUESS. WE MEASURE.', 512, 420);
  });
}

/** Painted pavement text (white on transparent). */
export function pavementTextTexture(text: string, color = '#e8e8e4'): THREE.Texture {
  return canvasTexture(`pave-${text}-${color}`, 512, 128, (ctx) => {
    ctx.clearRect(0, 0, 512, 128);
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'center';
    ctx.fillStyle = color;
    ctx.font = '800 96px Inter, Arial Black, Arial, sans-serif';
    ctx.fillText(text, 256, 68);
  });
}

/** International symbol of access on a blue field. */
export function adaTexture(): THREE.Texture {
  return canvasTexture('ada', 128, 128, (ctx) => {
    ctx.fillStyle = '#1f5fb8';
    ctx.fillRect(0, 0, 128, 128);
    ctx.strokeStyle = '#ffffff';
    ctx.fillStyle = '#ffffff';
    ctx.lineWidth = 9;
    ctx.beginPath();
    ctx.arc(44, 30, 10, 0, Math.PI * 2); // head
    ctx.fill();
    ctx.beginPath();
    ctx.arc(58, 82, 26, Math.PI * 0.9, Math.PI * 2.2); // wheel
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(48, 44);
    ctx.lineTo(50, 74);
    ctx.lineTo(86, 74);
    ctx.lineTo(100, 100);
    ctx.stroke();
  });
}

/** Chain-link fence fabric: diamond wire mesh with transparent gaps. */
export function chainLinkTexture(): THREE.Texture {
  return canvasTexture(
    'chain-link',
    128,
    128,
    (ctx) => {
      ctx.clearRect(0, 0, 128, 128);
      ctx.strokeStyle = 'rgba(190,196,202,0.95)';
      ctx.lineWidth = 3;
      const step = 32;
      for (let i = -4; i < 8; i++) {
        ctx.beginPath();
        ctx.moveTo(i * step, 0);
        ctx.lineTo(i * step + 128, 128);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(i * step + 128, 0);
        ctx.lineTo(i * step, 128);
        ctx.stroke();
      }
    },
    { srgb: true },
  );
}

/** Soft dark tire-wear band: opaque in the center, feathered to transparent at the edges. */
export function wearTexture(): THREE.Texture {
  return canvasTexture('wear', 256, 64, (ctx) => {
    ctx.clearRect(0, 0, 256, 64);
    const g = ctx.createLinearGradient(0, 0, 0, 64);
    g.addColorStop(0, 'rgba(20,20,22,0)');
    g.addColorStop(0.35, 'rgba(20,20,22,0.16)');
    g.addColorStop(0.65, 'rgba(20,20,22,0.16)');
    g.addColorStop(1, 'rgba(20,20,22,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 256, 64);
    const rnd = seededNoise(99);
    for (let i = 0; i < 1400; i++) {
      ctx.fillStyle = `rgba(40,40,42,${rnd() * 0.25})`;
      ctx.fillRect(rnd() * 256, rnd() * 64, 1, 1);
    }
  });
}

/** Oil drip stain: irregular dark blob with a feathered edge. */
export function stainTexture(): THREE.Texture {
  return canvasTexture('stain', 128, 128, (ctx) => {
    ctx.clearRect(0, 0, 128, 128);
    const rnd = seededNoise(123);
    for (let i = 0; i < 10; i++) {
      const g = ctx.createRadialGradient(64 + (rnd() - 0.5) * 50, 64 + (rnd() - 0.5) * 40, 0, 64 + (rnd() - 0.5) * 20, 64, 18 + rnd() * 30);
      g.addColorStop(0, 'rgba(18,16,14,0.22)');
      g.addColorStop(1, 'rgba(18,16,14,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, 128, 128);
    }
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
