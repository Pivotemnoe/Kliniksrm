import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.jsx";
import "./v1.css";
import "./real-photos.css";

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
