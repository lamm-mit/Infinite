/**
 * GET /api/collaborate/[sessionId]/stream  — SSE stream of collaboration events.
 *
 * Tails the events.jsonl file and sends each line as an SSE event.
 * Closes when SessionDone is received or after a timeout.
 */

import { NextRequest } from 'next/server';
import { existsSync, openSync, readSync, closeSync, statSync } from 'fs';

const MAX_DURATION_MS = 10 * 60 * 1000; // 10 minutes max
const POLL_INTERVAL_MS = 250;

export async function GET(
  _req: NextRequest,
  { params }: { params: { sessionId: string } }
) {
  const { sessionId } = params;
  const eventsFile = `/tmp/sc-collab-${sessionId}/events.jsonl`;

  const encoder = new TextEncoder();
  let closed = false;

  const stream = new ReadableStream({
    start(controller) {
      const startTime = Date.now();
      let fileOffset = 0;
      let buffer = '';
      let fd: number | null = null;
      let pollTimer: ReturnType<typeof setInterval> | null = null;

      const send = (data: object) => {
        const line = `data: ${JSON.stringify(data)}\n\n`;
        controller.enqueue(encoder.encode(line));
      };

      // Send a heartbeat comment to keep connection alive
      const sendPing = () => {
        controller.enqueue(encoder.encode(`: ping\n\n`));
      };

      const poll = () => {
        if (closed) return;

        // Check timeout
        if (Date.now() - startTime > MAX_DURATION_MS) {
          send({ type: 'Timeout', agent: 'system', payload: { detail: 'Session timed out' }, timestamp: new Date().toISOString() });
          cleanup();
          return;
        }

        // Wait for file to appear (process may take a moment to start)
        if (!existsSync(eventsFile)) {
          sendPing();
          return;
        }

        try {
          if (fd === null) {
            fd = openSync(eventsFile, 'r');
          }

          // Read new bytes
          const chunkSize = 16384;
          const buf = Buffer.alloc(chunkSize);
          let bytesRead = 0;

          while (true) {
            bytesRead = readSync(fd, buf, 0, chunkSize, fileOffset);
            if (bytesRead === 0) break;
            fileOffset += bytesRead;
            buffer += buf.slice(0, bytesRead).toString('utf-8');
          }

          // Process complete lines
          const lines = buffer.split('\n');
          buffer = lines.pop() || ''; // keep incomplete line in buffer

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed) continue;
            try {
              const event = JSON.parse(trimmed);
              send(event);
              // Stop on session done
              if (event.type === 'SessionDone') {
                setTimeout(() => cleanup(), 500);
                return;
              }
            } catch {
              // Skip malformed lines
            }
          }
        } catch (err) {
          // File read error — send ping and continue
          sendPing();
        }
      };

      const cleanup = () => {
        closed = true;
        if (pollTimer) clearInterval(pollTimer);
        if (fd !== null) {
          try { closeSync(fd); } catch {}
          fd = null;
        }
        try { controller.close(); } catch {}
      };

      // Start polling
      sendPing();
      pollTimer = setInterval(poll, POLL_INTERVAL_MS);

      // Cleanup on abort
      _req.signal.addEventListener('abort', cleanup);
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
