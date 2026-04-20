export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { progressEmitter, type ProgressEvent } from '@/app/progressEmitter';

/**
 * GET /api/progress
 * Server-Sent Events endpoint — the frontend connects here once and receives
 * live progress updates from every pipeline as they run.
 */
export async function GET() {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      // Send a heartbeat comment every 15s to keep the connection alive
      const hb = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(': heartbeat\n\n'));
        } catch {
          clearInterval(hb);
        }
      }, 15000);

      const onProgress = (data: ProgressEvent) => {
        try {
          const payload = `data: ${JSON.stringify(data)}\n\n`;
          controller.enqueue(encoder.encode(payload));
        } catch {
          // Client disconnected
        }
      };

      progressEmitter.on('progress', onProgress);

      // Cleanup when the client disconnects
      const cleanup = () => {
        clearInterval(hb);
        progressEmitter.off('progress', onProgress);
        try { controller.close(); } catch { /* already closed */ }
      };

      // Return cleanup via the cancel callback
      return cleanup;
    },
    cancel() {
      // Called when the client closes the connection
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
