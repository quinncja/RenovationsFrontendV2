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
