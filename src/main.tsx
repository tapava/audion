import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { ComputeKitProvider } from "@computekit/react";
import App from "./App.tsx";
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ComputeKitProvider options={{ maxWorkers: 4, debug: false }}>
      <App />
    </ComputeKitProvider>
  </StrictMode>
);
