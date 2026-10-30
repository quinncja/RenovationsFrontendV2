import { useSyncExternalStore } from "react";

const KEY = "rd-cc:demo";
const EVENT = "rd-cc:demo";

function read(): boolean {
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

function write(on: boolean): boolean {
  try {
    if (on) localStorage.setItem(KEY, "1");
    else localStorage.removeItem(KEY);
    return true;
  } catch {
    return false;
  }
}

let current = read();

function subscribe(onChange: () => void) {
  const sync = () => {
    const next = read();
    if (next === current) return;
    current = next;
    onChange();
  };
  window.addEventListener(EVENT, onChange);
  window.addEventListener("storage", sync);
  return () => {
    window.removeEventListener(EVENT, onChange);
    window.removeEventListener("storage", sync);
  };
}

export const demoMode = {
  get: () => current,
  set(on: boolean) {
    current = on;
    write(on);
    window.dispatchEvent(new Event(EVENT));
  },
  headers: (): Record<string, string> => (current ? { "X-CC-Demo": "1" } : {}),
};

export function useDemoMode() {
  return useSyncExternalStore(subscribe, demoMode.get, () => false);
}
