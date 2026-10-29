// RD Expenses transport: the device session token rides as a Bearer header.
// Receipt screens reuse the public receipt endpoints (by link token), so this
// only covers sign-in and the home screen.
import { base, json } from "../modules/cc/api";

const KEY = "rd-expenses:session";

export const session = {
  get(): string | null {
    try {
      return localStorage.getItem(KEY);
    } catch {
      return null;
    }
  },
  set(token: string) {
    try {
      localStorage.setItem(KEY, token);
    } catch {
      // Private mode: signed in for this visit only.
    }
  },
  clear() {
    try {
      localStorage.removeItem(KEY);
    } catch {
      // Nothing stored.
    }
  },
};

export class SignedOut extends Error {}

export async function appRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const token = session.get();
  const headers = new Headers(init?.headers);
  if (token) headers.set("Authorization", `Bearer ${token}`);
  const res = await fetch(`${base}/${path}`, {
    ...init,
    headers,
    credentials: "omit",
    referrerPolicy: "no-referrer",
    cache: "no-store",
  });
  if (res.status === 401 && token) {
    session.clear();
    throw new SignedOut("Sign in again.");
  }
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.message || `Something went wrong (${res.status}). Try again.`);
  }
  return res.json() as Promise<T>;
}

export { json };

export interface Row {
  token: string;
  state: string;
  description: string;
  amountCents: number;
  receiptDate: string;
  correction: boolean;
  correctionReason?: string;
}
export interface Me {
  name: string;
  /** The cardholder (the tester's chosen one when testing). */
  actingAs?: string;
  cardLast4: string;
  testMode: boolean;
  /** The tech's test phone: testing as one of these cardholders. */
  tester?: boolean;
  cardholders?: { cardLast4: string; name: string }[];
  todo: Row[];
  recent: Row[];
}
