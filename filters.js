// Deterministic, local pixel filters. No network requests or external dependencies.
const clamp = (x) => Math.max(0, Math.min(255, x));

function blur(source, width, height, radius) {
  const horizontal = new Float32Array(source.length);
  const out = new Float32Array(source.length);
  const span = radius * 2 + 1;
  for (let y = 0; y < height; y++) {
    const row = y * width;
    let sum = 0;
    for (let k = -radius; k <= radius; k++) sum += source[row + Math.max(0, Math.min(width - 1, k))];
    for (let x = 0; x < width; x++) {
      horizontal[row + x] = sum / span;
      sum += source[row + Math.min(width - 1, x + radius + 1)] - source[row + Math.max(0, x - radius)];
    }
  }
  for (let x = 0; x < width; x++) {
    let sum = 0;
    for (let k = -radius; k <= radius; k++) sum += horizontal[Math.max(0, Math.min(height - 1, k)) * width + x];
    for (let y = 0; y < height; y++) {
      out[y * width + x] = sum / span;
      sum += horizontal[Math.min(height - 1, y + radius + 1) * width + x] - horizontal[Math.max(0, y - radius) * width + x];
    }
  }
  return out;
}

function grain(x, y) {
  let hash = Math.imul(x + 17, 374761393) ^ Math.imul(y + 31, 668265263);
  hash = Math.imul(hash ^ (hash >>> 13), 1274126177);
  return ((hash ^ (hash >>> 16)) >>> 0) / 4294967295 - .5;
}

export function applyFilter(rgba, width, height, style) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || rgba.length !== width * height * 4) throw new Error('Invalid image dimensions');
  if (!['fairytale', 'pencil'].includes(style)) throw new Error('Unknown style');
  const size = width * height;
  const light = new Float32Array(size);
  for (let i = 0; i < size; i++) light[i] = rgba[i * 4] * .299 + rgba[i * 4 + 1] * .587 + rgba[i * 4 + 2] * .114;
  const output = new Uint8ClampedArray(rgba.length);
  const radius = Math.max(2, Math.round(Math.max(width, height) / 240));
  const softLight = blur(blur(light, width, height, radius), width, height, radius);
  if (style === 'pencil') {
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = y * width + x, j = i * 4;
        const left = light[y * width + Math.max(0, x - 1)], right = light[y * width + Math.min(width - 1, x + 1)];
        const top = light[Math.max(0, y - 1) * width + x], bottom = light[Math.min(height - 1, y + 1) * width + x];
        const edge = Math.min(100, Math.hypot(right - left, bottom - top));
        const dodge = Math.min(255, light[i] * 255 / Math.max(1, softLight[i]));
        const shadows = Math.pow(1 - light[i] / 255, 1.5);
        const hatching = ((x + y * 2) % 6 < 2 ? 5 : 0) * shadows;
        const pencil = 249 - (255 - dodge) * 1.22 - edge * .37 - shadows * 29 - hatching + grain(x, y) * 4;
        output[j] = clamp(pencil + 3);
        output[j + 1] = clamp(pencil + 2);
        output[j + 2] = clamp(pencil);
        output[j + 3] = 255;
      }
    }
  } else {
    const channels = [];
    for (let c = 0; c < 3; c++) {
      const channel = new Float32Array(size);
      for (let i = 0; i < size; i++) channel[i] = rgba[i * 4 + c];
      channels.push(blur(channel, width, height, Math.max(1, Math.round(radius * .55))));
    }
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = y * width + x, j = i * 4;
        const shade = 1 - light[i] / 255;
        const halo = Math.max(0, softLight[i] - 145) / 110;
        const detail = Math.abs(light[i] - softLight[i]);
        const smooth = .64 * Math.max(.12, 1 - detail / 48);
        const color = [0, 1, 2].map(c => rgba[j + c] * (1 - smooth) + channels[c][i] * smooth);
        const luma = color[0] * .299 + color[1] * .587 + color[2] * .114;
        for (let c = 0; c < 3; c++) color[c] = luma + (color[c] - luma) * 1.19;
        color[0] += 14 + shade * 7 + halo * 11;
        color[1] += 5 + halo * 9 - shade * 2;
        color[2] += 12 + shade * 16 + halo * 3;
        const noise = grain(x, y) * 1.8;
        for (let c = 0; c < 3; c++) {
          const curved = 255 * Math.pow(clamp(color[c]) / 255, .91);
          output[j + c] = clamp(curved * .94 + 8 + noise);
        }
        output[j + 3] = 255;
      }
    }
  }
  return output;
}
