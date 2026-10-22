import React from "react";
import { createRoot, hydrateRoot } from "react-dom/client";
import { App } from "./App.jsx";
import "./styles.css";
import "./experiences.css";
import "./articles.css";
import "./topics.css";

const root = document.getElementById("root");
const app = (
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
if (
  root.querySelector("main")?.dataset.page ===
  (window.location.pathname.replace(/\/$/, "") || "/")
)
  hydrateRoot(root, app);
else createRoot(root).render(app);
