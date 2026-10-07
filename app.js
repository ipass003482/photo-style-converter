import { applyFilter } from './filters.js';
import { createChibiJob, chibiError } from './chibi.js';

const $ = id => document.getElementById(id);
const names = { chibi: '童話 Q 版', pencil: '鉛筆素描' };
const state = { style: 'chibi', strength: 75, source: null, sourceCanvas: null, cached: {}, filename: 'photo', loadId: 0, renderId: 0, exportId: 0, aiId: 0, worker: null, cancelCompute: null, job: null, aiAbort: null, aiTimer: null, aiActive: false, busy: false, loading: false, demo: false, ready: false, exportFile: null, exportURL: null };
const original = $('original-canvas'), result = $('result-canvas');
let exportTimer, dragDepth = 0;

function status(message, error = false) {
  $('status').textContent = message;
  $('status').classList.toggle('error', error);
}
function invalidateExport() {
  clearTimeout(exportTimer);
  state.exportId++;
  state.exportFile = null;
  if (state.exportURL) URL.revokeObjectURL(state.exportURL);
  state.exportURL = null;
  $('download-button').disabled = true;
  $('share-button').hidden = true;
  $('saved-image').removeAttribute('src');
  $('save-help').hidden = true;
}
function busy(value, label = '正在處理照片…') {
  state.busy = value;
  $('busy-overlay').hidden = !value;
  $('busy-label').textContent = label;
  $('cancel-ai').hidden = !state.aiActive;
  $('view-toggle').disabled = value || !state.source;
  $('intensity').disabled = value;
  $('generate-button').disabled = value || !state.source;
  if (value) invalidateExport();
}
function fitPreview() {
  if (!state.source) return;
  const box = $('drop-zone');
  const scale = Math.min((box.clientWidth - 2) / result.width, (box.clientHeight - 2) / result.height);
  $('comparison').style.width = `${Math.max(1, result.width * scale)}px`;
  $('comparison').style.height = `${Math.max(1, result.height * scale)}px`;
}
new ResizeObserver(fitPreview).observe($('drop-zone'));
function drawContained(context, image, width, height) {
  context.fillStyle = '#fff';
  context.fillRect(0, 0, width, height);
  const scale = Math.min(width / image.width, height / image.height);
  const w = image.width * scale, h = image.height * scale;
  context.drawImage(image, (width - w) / 2, (height - h) / 2, w, h);
}
function setCanvasSize(width, height) {
  original.width = result.width = width;
  original.height = result.height = height;
  drawContained(original.getContext('2d'), state.sourceCanvas, width, height);
  fitPreview();
}
async function decode(blob) {
  if ('createImageBitmap' in window) {
    try { return await createImageBitmap(blob, { imageOrientation: 'from-image' }); } catch { /* Use Image fallback for codecs such as HEIC. */ }
  }
  const url = URL.createObjectURL(blob);
  try { const image = new Image(); image.src = url; await image.decode(); return image; }
  finally { URL.revokeObjectURL(url); }
}
function cancelWorker() {
  state.worker?.terminate(); state.worker = null;
  state.cancelCompute?.(); state.cancelCompute = null;
}
function cancelAI() {
  state.aiId++;
  clearTimeout(state.aiTimer);
  state.aiAbort?.abort(); state.aiAbort = null;
  if (state.job) { try { Promise.resolve(state.job.cancel()).catch(() => {}); } catch {} }
  state.job = null; state.aiActive = false;
  $('cancel-ai').hidden = true;
}
async function loadPhoto(file, isDemo = false, requestId = null) {
  if (!file) return;
  if (file.size > 25 * 1024 * 1024) { status('這張照片超過 25 MB，請縮小檔案後再試。', true); return; }
  if (!(file.type.startsWith('image/') || /\.(jpe?g|png|webp|avif|hei[cf])$/i.test(file.name || ''))) { status('請選擇照片檔案，例如 JPG、PNG 或 WebP。', true); return; }
  const id = requestId ?? ++state.loadId;
  if (id !== state.loadId) return;
  state.renderId++;
  cancelWorker(); cancelAI();
  state.loading = true;
  busy(true, '正在讀取照片…');
  status('已在裝置內讀取。只有按下「上傳並產生 Q 版」才會送出照片。');
  let image;
  try {
    image = await decode(file);
    if (id !== state.loadId) return;
    const width = image.width || image.naturalWidth, height = image.height || image.naturalHeight;
    if (!width || !height || width * height > 80000000) throw new Error('dimensions');
    const scale = Math.min(1, 1800 / Math.max(width, height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(width * scale)); canvas.height = Math.max(1, Math.round(height * scale));
    const context = canvas.getContext('2d', { willReadFrequently: true });
    context.fillStyle = '#fff'; context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    image.close?.(); image = null;
    state.source = context.getImageData(0, 0, canvas.width, canvas.height);
    state.sourceCanvas = canvas; state.cached = {}; state.ready = false;
    state.filename = (file.name || 'photo').replace(/\.[^.]+$/, '').replace(/[^\p{L}\p{N}_-]/gu, '_').slice(0, 60) || 'photo';
    state.demo = isDemo;
    $('empty-state').hidden = true; $('comparison').hidden = false;
    $('source-badge').textContent = isDemo ? '示範照片' : '已選照片';
    $('upload-button').lastChild.textContent = '更換照片';
    $('demo-credit').hidden = !isDemo;
    if (isDemo) {
      // This bundled example is a real result generated with the same model, not a filter approximation.
      try {
        const response = await fetch(new URL('./demo-chibi.webp', import.meta.url));
        if (!response.ok) throw new Error('demo');
        const preview = await decode(await response.blob());
        if (id !== state.loadId) { preview.close?.(); return; }
        const example = document.createElement('canvas'); example.width = preview.width; example.height = preview.height;
        example.getContext('2d').drawImage(preview, 0, 0); preview.close?.();
        state.cached.chibi = example;
      } catch { /* The photo can still be processed when a cached example is unavailable. */ }
    }
    if (id !== state.loadId) return;
    state.loading = false;
    await render();
  } catch (error) {
    if (id !== state.loadId) return;
    state.loading = false; busy(false);
    if (state.source) await render();
    status(error.message === 'dimensions' ? '照片尺寸太大，請先縮小後再試。' : '無法讀取這張照片。若是 HEIC，請轉存為 JPG，或使用支援 HEIC 的 Safari。', true);
  } finally { image?.close?.(); if (id === state.loadId) state.loading = false; }
}
function compute(id) {
  return new Promise((resolve, reject) => {
    const cancel = () => resolve(null); state.cancelCompute = cancel;
    const { data, width, height } = state.source;
    const fallback = () => setTimeout(() => {
      if (id !== state.renderId) { resolve(null); return; }
      try { resolve(applyFilter(data, width, height, 'pencil')); } catch (error) { reject(error); }
    }, 20);
    try {
      const worker = new Worker(new URL('./filter-worker.js', import.meta.url), { type: 'module' });
      state.worker = worker;
      worker.onmessage = ({ data: message }) => {
        worker.terminate(); if (state.worker === worker) state.worker = null;
        if (state.cancelCompute === cancel) state.cancelCompute = null;
        if (message.error) reject(new Error(message.error)); else resolve(new Uint8ClampedArray(message.pixels));
      };
      worker.onerror = event => { event.preventDefault(); worker.terminate(); if (state.worker === worker) state.worker = null; fallback(); };
      const pixels = data.slice(); worker.postMessage({ id, width, height, style: 'pencil', pixels: pixels.buffer }, [pixels.buffer]);
    } catch { fallback(); }
  });
}
async function render() {
  if (!state.source || state.loading) return;
  const id = ++state.renderId, style = state.style;
  cancelWorker(); busy(true);
  state.ready = false;
  if (style === 'chibi') {
    const effect = state.cached.chibi;
    setCanvasSize(effect?.width || state.source.width, effect?.height || state.source.height);
    result.getContext('2d').drawImage(effect || original, 0, 0);
    state.ready = Boolean(effect);
    $('result-label').textContent = effect ? names.chibi : '尚未產生 Q 版';
    $('image-info').textContent = `${result.width} × ${result.height} px${effect ? ' · Q 版輸出' : ' · 原圖預覽'}`;
    $('export-note').textContent = effect ? '正在準備下載…' : '產生 Q 版後即可下載。';
    busy(false);
    if (effect) {
      void prepareExport();
      status(state.demo && !state.cached.regenerated ? '這是用同一模型預先產生的示範結果，可拖曳比較。' : 'Q 版已完成，可拖曳比較或下載。');
    } else status('目前顯示原圖。按「上傳並產生 Q 版」開始重繪。');
    return;
  }
  try {
    if (!state.cached.pencil) {
      const pixels = await compute(id);
      if (id !== state.renderId || !pixels) return;
      const buffer = document.createElement('canvas'); buffer.width = state.source.width; buffer.height = state.source.height;
      buffer.getContext('2d').putImageData(new ImageData(pixels, buffer.width, buffer.height), 0, 0);
      state.cached.pencil = buffer;
    }
    if (id !== state.renderId) return;
    setCanvasSize(state.source.width, state.source.height);
    state.ready = true; busy(false); blend();
    status('左右拖曳照片上的分隔線，就能比較前後效果。');
  } catch {
    if (id !== state.renderId) return;
    busy(false); status('這次處理沒有完成，請換一張較小的照片再試。', true);
  }
}
function blend() {
  if (state.style !== 'pencil' || !state.cached.pencil || state.busy) return;
  invalidateExport();
  const context = result.getContext('2d'); context.globalAlpha = 1; context.drawImage(original, 0, 0);
  context.globalAlpha = 1 - Math.pow(1 - state.strength / 100, 3);
  context.drawImage(state.cached.pencil, 0, 0); context.globalAlpha = 1;
  $('result-label').textContent = names.pencil;
  $('image-info').textContent = `${result.width} × ${result.height} px · 鉛筆輸出`;
  exportTimer = setTimeout(prepareExport, 150);
}
async function setStyle(style) {
  if (!Object.hasOwn(names, style)) throw new Error('Unknown style');
  cancelAI(); state.style = style;
  document.querySelectorAll('[data-style]').forEach(button => {
    const selected = button.dataset.style === style;
    button.classList.toggle('selected', selected); button.setAttribute('aria-pressed', String(selected));
  });
  $('local-adjust').hidden = style !== 'pencil'; $('ai-controls').hidden = style !== 'chibi';
  $('adjust-heading').textContent = style === 'pencil' ? '調整效果' : '產生 Q 版';
  $('style-note').textContent = style === 'pencil' ? '將照片轉成灰階素描，保留輪廓與明暗細節。照片在裝置內處理。' : '照片會上傳至 Hugging Face 公開示範服務，服務會暫存圖片。人物相似度及構圖可能改變。';
  if (state.source && !state.loading) await render();
}
const canvasBlob = (canvas, type = 'image/png') => new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('encode')), type, .92));
async function generateChibi() {
  if (!state.source || state.busy || state.style !== 'chibi') return;
  cancelAI();
  const id = state.aiId, sourceId = state.loadId;
  const current = () => id === state.aiId && sourceId === state.loadId && state.style === 'chibi';
  state.aiActive = true;
  state.aiAbort = new AbortController();
  const controller = state.aiAbort;
  busy(true, '正在連線到免費轉圖服務…');
  status('正在上傳並產生 Q 版，繁忙時需要排隊。');
  state.aiTimer = setTimeout(() => {
    if (!current()) return;
    cancelAI(); busy(false); void render().then(() => status(chibiError(new Error('timeout')), true));
  }, 180000);
  try {
    // Match a bounded output aspect ratio, padding extreme panoramas rather than stretching them.
    const ratio = state.source.width / state.source.height;
    let width = ratio >= 1 ? 768 : Math.max(256, Math.round(768 * ratio / 8) * 8);
    let height = ratio >= 1 ? Math.max(256, Math.round(768 / ratio / 8) * 8) : 768;
    const reference = document.createElement('canvas'); reference.width = width; reference.height = height;
    drawContained(reference.getContext('2d'), state.sourceCanvas, width, height);
    const file = await canvasBlob(reference, 'image/jpeg');
    if (!current()) return;
    const submit = await createChibiJob(file, width, height);
    if (!current()) return;
    const job = submit(); state.job = job;
    let received = null;
    for await (const event of job) {
      if (!current()) return;
      if (event.type === 'status') {
        if (event.stage === 'error') throw new Error(event.message || 'generation');
        $('busy-label').textContent = event.stage === 'pending' ? '免費服務排隊中…' : '正在重繪成 Q 版…';
      }
      if (event.type === 'data') received = event.data?.[0];
    }
    if (!current()) return;
    if (!received?.url) throw new Error('output');
    const url = new URL(received.url);
    if (url.protocol !== 'https:' || url.hostname !== 'black-forest-labs-flux-2-klein-4b.hf.space') throw new Error('output_origin');
    $('busy-label').textContent = '正在取得完成的圖片…';
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) throw new Error('output_download');
    const image = await decode(await response.blob());
    if (!current()) { image.close?.(); return; }
    if (image.width > 2048 || image.height > 2048) { image.close?.(); throw new Error('output_size'); }
    const canvas = document.createElement('canvas'); canvas.width = image.width; canvas.height = image.height;
    canvas.getContext('2d').drawImage(image, 0, 0); image.close?.();
    state.cached.chibi = canvas;
    state.cached.regenerated = true;
    clearTimeout(state.aiTimer); state.aiActive = false; state.job = null; state.aiAbort = null;
    await render();
  } catch (error) {
    if (!current()) return;
    clearTimeout(state.aiTimer); state.aiActive = false; state.job = null; state.aiAbort = null;
    busy(false); await render(); status(chibiError(error), true);
  }
}
function prepareExport() {
  if (!state.ready || !state.source || state.busy) return Promise.resolve();
  const id = ++state.exportId, format = $('format').value;
  return new Promise(resolve => {
    result.toBlob(blob => {
      if (id !== state.exportId) { resolve(); return; }
      if (!blob) { status('無法產生下載檔案，請換一張較小的照片。', true); resolve(); return; }
      if (state.exportURL) URL.revokeObjectURL(state.exportURL);
      state.exportFile = new File([blob], `${state.filename}-${state.style}.${format === 'jpeg' ? 'jpg' : 'png'}`, { type: blob.type });
      state.exportURL = URL.createObjectURL(blob);
      $('download-button').disabled = false;
      $('export-note').textContent = `${result.width} × ${result.height} px · ${(blob.size / 1024 / 1024).toFixed(1)} MB`;
      try { $('share-button').hidden = !(navigator.canShare && navigator.canShare({ files: [state.exportFile] })); } catch { $('share-button').hidden = true; }
      $('saved-image').src = state.exportURL; resolve();
    }, `image/${format}`, .94);
  });
}
for (const id of ['upload-button', 'empty-upload']) $(id).addEventListener('click', () => $('file-input').click());
$('file-input').addEventListener('change', event => { const file = event.target.files[0]; event.target.value = ''; void loadPhoto(file); });
for (const button of document.querySelectorAll('[data-style]')) button.addEventListener('click', () => void setStyle(button.dataset.style));
$('intensity').addEventListener('input', event => { state.strength = Number(event.target.value); $('intensity-value').value = `${state.strength}%`; blend(); });
$('compare-slider').addEventListener('input', event => $('comparison').style.setProperty('--split', `${event.target.value}%`));
$('view-toggle').addEventListener('click', () => {
  const full = $('comparison').classList.toggle('full');
  $('view-toggle').textContent = full ? '顯示前後比較' : '看完整效果'; $('view-toggle').setAttribute('aria-pressed', String(full));
});
$('generate-button').addEventListener('click', () => void generateChibi());
$('cancel-ai').addEventListener('click', () => { cancelAI(); busy(false); void render().then(() => status('已取消等待。已開始的運算仍可能使用服務額度。')); });
$('format').addEventListener('change', () => { invalidateExport(); void prepareExport(); });
$('download-button').addEventListener('click', () => {
  if (!state.exportFile || !state.exportURL) return;
  const anchor = document.createElement('a'); anchor.href = state.exportURL; anchor.download = state.exportFile.name;
  document.body.appendChild(anchor); anchor.click(); anchor.remove();
  $('save-help').hidden = false;
  status('已準備下載。若手機沒有自動儲存，可展開下方圖片並長按儲存。');
});
$('share-button').addEventListener('click', async () => {
  if (!state.exportFile) return;
  try { await navigator.share({ files: [state.exportFile], title: '轉換後的照片' }); }
  catch (error) { if (error.name !== 'AbortError') { $('save-help').hidden = false; status('此瀏覽器無法分享，請改用下載或長按圖片儲存。', true); } }
});
const drop = $('drop-zone');
drop.addEventListener('dragenter', event => { event.preventDefault(); dragDepth++; $('drag-overlay').hidden = false; });
drop.addEventListener('dragover', event => event.preventDefault());
drop.addEventListener('dragleave', () => { dragDepth = Math.max(0, dragDepth - 1); if (!dragDepth) $('drag-overlay').hidden = true; });
drop.addEventListener('drop', event => { event.preventDefault(); dragDepth = 0; $('drag-overlay').hidden = true; void loadPhoto(event.dataTransfer.files[0]); });
window.addEventListener('dragover', event => event.preventDefault()); window.addEventListener('drop', event => event.preventDefault());
async function loadDemo() {
  const id = ++state.loadId; state.renderId++; cancelWorker(); cancelAI(); state.loading = true;
  busy(true, '正在讀取示範照片…');
  try {
    $('demo-button').disabled = true;
    const response = await fetch(new URL('./demo.jpg', import.meta.url));
    if (!response.ok) throw new Error('demo');
    const blob = await response.blob(); if (id !== state.loadId) return;
    await loadPhoto(new File([blob], 'bibury-cottages.jpg', { type: 'image/jpeg' }), true, id);
  } catch {
    if (id !== state.loadId) return;
    state.loading = false; busy(false); if (state.source) await render();
    status('示範照片暫時無法載入，你可以先選擇自己的照片。', true);
  } finally { $('demo-button').disabled = false; }
}
$('demo-button').addEventListener('click', () => void loadDemo());
window.addEventListener('pagehide', () => { cancelAI(); if (state.exportURL) URL.revokeObjectURL(state.exportURL); });
window.addEventListener('pageshow', event => { if (event.persisted && state.source) { busy(false); void render(); } });
if (document.modelContext?.registerTool) {
  const lifecycle = new AbortController();
  try {
    Promise.resolve(document.modelContext.registerTool({
      name: 'configure_pencil_style', description: 'Apply local pencil sketch to the selected photo. Does not upload photos or download files.',
      inputSchema: { type: 'object', properties: { strength: { type: 'number', minimum: 0, maximum: 100 } }, required: ['strength'], additionalProperties: false },
      annotations: { readOnlyHint: false, untrustedContentHint: false },
      async execute(input) {
        if (!input || !Number.isFinite(input.strength) || input.strength < 0 || input.strength > 100) throw new Error('Invalid strength');
        if (!state.source || state.busy) throw new Error('Select a photo and wait for processing first');
        state.strength = input.strength; $('intensity').value = String(input.strength); $('intensity-value').value = `${input.strength}%`;
        await setStyle('pencil'); if (!state.ready) throw new Error('Photo processing failed');
        return { style: state.style, strength: state.strength, width: result.width, height: result.height };
      }
    }, { signal: lifecycle.signal })).catch(() => {});
  } catch { /* Unsupported proposals never block the editor. */ }
}
