import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import appStyles from "./style.css?inline";

const root = document.getElementById("root");
if (root) {
  // Apply the bundled stylesheet before the app renders or can be printed.
  const stylesheet = document.createElement("style");
  stylesheet.textContent = appStyles;
  document.head.appendChild(stylesheet);

  ReactDOM.createRoot(root).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
}
