import { auth } from "../../core/auth/firebase";
import { publicRequest, base } from "./api";
import type { Request } from "./types";
export async function staffHeaders(): Promise<Record<string, string>> {
  const token = await auth.currentUser?.getIdToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}
export const staffRequest: Request = async (path, init) => {
  const headers = new Headers(init?.headers);
  for (const [key, value] of Object.entries(await staffHeaders()))
    headers.set(key, value);
  return publicRequest(path, { ...init, headers });
};
export async function staffFile(path: string) {
  const res = await fetch(`${base}/${path}`, {
    headers: await staffHeaders(),
    cache: "no-store",
  });
  if (!res.ok) throw new Error("Unable to load the receipt file.");
  return URL.createObjectURL(await res.blob());
}
// Live "receipts changed" signal from GET /cc/stream (server-sent events read
// through fetch so the login token rides in the Authorization header, which
// EventSource cannot send). Reconnects with backoff; returns a stop function.
export function watchReceipts(onChange: () => void): () => void {
  let stopped = false,
    controller: AbortController | null = null,
    delay = 2000;
  async function connect() {
    while (!stopped) {
      controller = new AbortController();
      try {
        const res = await fetch(`${base}/cc/stream`, {
          headers: await staffHeaders(),
          cache: "no-store",
          signal: controller.signal,
        });
        if (!res.ok || !res.body) throw new Error(String(res.status));
        delay = 2000;
        // Catch up on anything missed while disconnected.
        onChange();
        const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
        let buffer = "";
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += value;
          const frames = buffer.split("\n\n");
          buffer = frames.pop() || "";
          if (frames.some((f) => f.split("\n").includes("event: receipts")))
            onChange();
        }
      } catch {
        if (stopped) return;
      }
      await new Promise((r) => setTimeout(r, delay));
      delay = Math.min(delay * 2, 30000);
    }
  }
  void connect();
  return () => {
    stopped = true;
    controller?.abort();
  };
}
