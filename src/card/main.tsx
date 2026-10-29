import { createRoot } from "react-dom/client";
import { Root } from "./Root";
import "../modules/cc/receipt-page.css";
import "./card.css";

// The worker caches nothing (see public/card-sw.js); it makes the app
// installable and receives notifications.
if ("serviceWorker" in navigator)
  void navigator.serviceWorker.register("/card-sw.js", { scope: "/card/" }).catch(() => {});

createRoot(document.getElementById("root")!).render(<Root />);
