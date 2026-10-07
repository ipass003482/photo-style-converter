import { applyFilter } from './filters.js';
self.onmessage = ({ data: { id, pixels, width, height, style } }) => {
  try {
    const result = applyFilter(new Uint8ClampedArray(pixels), width, height, style);
    self.postMessage({ id, pixels: result.buffer, width, height, style }, [result.buffer]);
  } catch (error) {
    self.postMessage({ id, error: error.message });
  }
};
