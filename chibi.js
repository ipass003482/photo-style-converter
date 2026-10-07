const SPACE = 'black-forest-labs/FLUX.2-klein-4B';
const PROMPT = 'Redraw the reference photo as a cute chibi fairy-tale picture-book illustration. Make the original people unmistakably chibi: extremely large rounded heads taking up at least half of each character, tiny compact bodies, short little arms and legs, large expressive eyes and soft rounded cheeks. Use two-head-tall proportions even for adults. Keep exactly the original people and animals, recognizable hair, facial hair, age, gender presentation, clothing colors and accessories. Preserve their original skin tones; do not lighten skin. Do not add children, fairies, pets or other characters. Keep the original setting and recognizable background objects. Fully paint the scene with clean soft outlines, watercolor texture, soft pastel surroundings and warm gentle light. The result should be a whimsical chibi storybook drawing, with exaggerated head-to-body proportions. No lettering, watermark or frame.';
let connection;

export async function createChibiJob(photo, width, height) {
  const { Client, handle_file } = await import('./vendor/gradio-client.js');
  connection ||= Client.connect(SPACE, { events: ['data', 'status'] }).catch(error => { connection = null; throw error; });
  const client = await connection;
  return () => client.submit('/infer', {
    prompt: PROMPT,
    input_images: [{ image: handle_file(photo), caption: null }],
    mode_choice: 'Distilled (4 steps)',
    seed: Math.floor(Math.random() * 2147483647),
    randomize_seed: false,
    width, height,
    num_inference_steps: 4,
    guidance_scale: 1,
    prompt_upsampling: false
  });
}

export function chibiError(error) {
  const message = String(error?.message || error || '');
  if (/quota|exceed|duration|GPU.*limit/i.test(message)) return '免費轉圖額度不足，請等待額度恢復後再試。鉛筆素描仍可使用。';
  if (/queue|busy|capacity|429/i.test(message)) return '免費服務目前忙碌，請稍後再試。';
  if (/auth|log.?in|sign.?in|403|401/i.test(message)) return '免費服務暫時限制匿名使用。請稍後再試，或開啟官方示範頁查看。';
  if (/timeout/i.test(message)) return '等候超過 3 分鐘，已停止等待。請稍後再試。';
  return '免費服務這次未能完成轉換，可能正在忙碌或維護。請稍後再試。';
}
