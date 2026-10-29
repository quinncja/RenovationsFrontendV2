import { useState } from "react";
import { App } from "./App";
import { Install } from "./Install";

// RD Expenses opens two ways: from the home screen (installed: the app) or in
// a browser tab (how to install it). "Use it in this browser" is remembered
// for the visit.
const installed =
  window.matchMedia("(display-mode: standalone)").matches ||
  (navigator as Navigator & { standalone?: boolean }).standalone === true;
const BROWSER = "rd-expenses:browser";

export function Root() {
  const [inBrowser, setInBrowser] = useState(() => {
    try {
      return sessionStorage.getItem(BROWSER) === "1";
    } catch {
      return false;
    }
  });
  if (installed || inBrowser) return <App />;
  return (
    <Install
      onUseInBrowser={() => {
        try {
          sessionStorage.setItem(BROWSER, "1");
        } catch {
          // Not remembered; fine for this view.
        }
        setInBrowser(true);
      }}
    />
  );
}
