// This transport is shared by the isolated receipt page. Do not import auth,
// dashboard analytics or the application router into this module.
import type { Request } from "./types";
export const base = (
  import.meta.env.VITE_API_URL || "http://localhost:8080/"
).replace(/\/$/, "");
export const publicRequest: Request = async <T>(
  path: string,
  init?: RequestInit,
): Promise<T> => {
  const response = await fetch(`${base}/${path.replace(/^\//, "")}`, {
    ...init,
    credentials: "omit",
    referrerPolicy: "no-referrer",
    cache: "no-store",
  });
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(
      body?.message || `Request failed (${response.status}). Please retry.`,
    );
  }
  return response.json() as Promise<T>;
};
export const json = (method: string, body: unknown): RequestInit => ({
  method,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});
