import { Agent } from '@/content/agent';

export default defineContentScript({
  matches: ['<all_urls>'],
  // Reach login forms inside embedded iframes (including about:blank/srcdoc ones).
  allFrames: true,
  matchAboutBlank: true,
  runAt: 'document_idle',
  main(ctx) {
    const controller = new AbortController();
    ctx.onInvalidated(() => controller.abort());
    new Agent(controller.signal).start();
  },
});
