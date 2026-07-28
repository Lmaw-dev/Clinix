
  import { createRoot } from "react-dom/client";
  import App from "./app/App.tsx";
  import { installDevtoolsGuard } from "./app/devtools-guard.ts";
  import "./styles/index.css";

  // Deters opening browser dev tools (F12, Ctrl+Shift+I/J/C, Ctrl+U, right-click).
  // Open the app with "?dev" in the URL to keep dev tools while developing.
  installDevtoolsGuard();

  createRoot(document.getElementById("root")!).render(<App />);
