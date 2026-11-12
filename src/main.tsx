import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { configLoaded } from "./api";
import { App } from "./App";
import "./styles.css";

// /config.json first: it sets where "Open in Infuse" points.
configLoaded.then(() =>
  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </StrictMode>,
  ),
);
