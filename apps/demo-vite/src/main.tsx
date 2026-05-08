import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./app";
import { WalletProvider } from "./wallet-provider";

const root = document.querySelector("#root");
if (!root) {
  throw new Error("#root not found");
}

ReactDOM.createRoot(root).render(
  <React.StrictMode>
    <WalletProvider>
      <App />
    </WalletProvider>
  </React.StrictMode>,
);
