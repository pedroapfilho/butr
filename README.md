<div align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="./assets/butr-logo-dark.svg">
    <img alt="butr" src="./assets/butr-logo-light.svg" width="320">
  </picture>
  <br />
  <br />
</div>

butr is a multi-chain wallet management library for React. It discovers EVM and Solana wallets in the browser, manages their connections across the lifetime of an app, and exposes them through composable hooks — so a single component can talk to a MetaMask account and a Phantom account in the same render pass.

The library is split across small focused packages so consumers bundle only what they need. The monorepo also ships nine demo apps that exercise butr across the major React frameworks and integration patterns.

## Highlights

- **Multi-chain by default.** EVM (EIP-1193 / EIP-6963) and Solana (Wallet Standard) on equal footing. No "one chain at a time" mode.
- **Framework-agnostic core.** `@butr/core` is React-free. `@butr/react` is the binding, not the foundation. Use the core directly from any TS runtime.
- **Modular packages.** Install only the protocol adapters you ship. EVM-only dapp? Skip `@butr/svm` entirely.
- **No middleware lock-in.** Every adapter is just a `WalletAdapter`. Bring WalletConnect, Ledger, or your own.
- **Composes with the ecosystem.** Sits beside viem, wagmi, `@solana/web3.js`, `@solana/wallet-adapter-react`, `@solana/kit`. butr owns discovery and connection state; your existing library owns RPC and signing.

## Packages

The published library is split across eight packages, each with a single responsibility and a small public surface.

| Package               | Purpose                                                                                       |
| --------------------- | --------------------------------------------------------------------------------------------- |
| `@butr/core`          | Types, store, storage, and the `WalletSource` discovery seam. No React, no protocols.         |
| `@butr/react`         | React provider and hooks on top of `@butr/core`.                                              |
| `@butr/evm`           | EIP-1193 / EIP-6963 / injected wallet discovery and adapters.                                 |
| `@butr/svm`           | Wallet Standard adapter for Solana / SVM.                                                     |
| `@butr/wallets`       | Batteries-included composition: EVM + SVM discovery + `AutoWalletManagerProvider`.            |
| `@butr/walletconnect` | WalletConnect v2 adapter (composes over `@butr/evm`).                                         |
| `@butr/ledger`        | Ledger hardware-wallet adapter (EVM).                                                         |
| `@butr/testing`       | Fake adapters, fake persistence, mock storage for tests.                                      |

Workspace-internal packages (not published):

| Package                   | Purpose                                                                  |
| ------------------------- | ------------------------------------------------------------------------ |
| `@repo/typescript-config` | Shared tsconfig bases.                                                   |
| `@repo/config-vitest`     | Shared Vitest configs for node and React environments.                   |
| `@repo/wallet-extensions` | Static registry of wallet metadata and Playwright fixtures for tests.    |

## Demos

Two flavors of demo ship in this repo.

### Framework demos — kitchen-sink references

Each one exercises every public hook in `@butr/react` against discovered wallets. Use them as the canonical example for the framework you're targeting.

| App                   | Framework                       | Dev URL                 |
| --------------------- | ------------------------------- | ----------------------- |
| `demo-vite`           | Vite 7 + React 19 (SPA)         | `http://localhost:5173` |
| `demo-next`           | Next.js 16 (App Router)         | `http://localhost:3000` |
| `demo-tanstack-start` | TanStack Start (Vite SSR)       | `http://localhost:3001` |
| `demo-expo-web`       | Expo (React Native, web target) | `http://localhost:8081` |

### Integration demos — butr + existing web3 libraries

Each integration demo shows butr composing with a library you may already be using. butr handles wallet discovery and connection state; the integration library handles chain reads, signing, and submission. Every demo covers the same four scenarios: **connect → read balance → sign message → send transaction.**

| App                                | Library                            | Network            | Dev URL                 |
| ---------------------------------- | ---------------------------------- | ------------------ | ----------------------- |
| `demo-with-viem`                   | viem                               | EVM, Sepolia       | `http://localhost:5175` |
| `demo-with-wagmi`                  | wagmi + `@wagmi/core`              | EVM, Sepolia       | `http://localhost:5176` |
| `demo-with-solana-web3js`          | `@solana/web3.js`                  | SVM, Devnet        | `http://localhost:5177` |
| `demo-with-solana-wallet-adapter`  | `@solana/wallet-adapter-react`     | SVM, Devnet        | `http://localhost:5178` |
| `demo-with-solana-kit`             | `@solana/kit`                      | SVM, Devnet        | `http://localhost:5179` |

All web demos bind distinct ports so they can run concurrently.

## Stack

- **Library:** `@butr/*` workspace packages (React 19, zustand).
- **Build:** Turborepo + pnpm workspaces; tsdown for package builds (tree-shaking, minification, source maps, watch mode).
- **Linting / formatting:** oxlint + oxfmt.
- **Testing:** Vitest for unit tests.

## Setup

### Prerequisites

- **Node.js 24** (`nvm install 24 && nvm use 24`)
- **pnpm 10** (`npm install -g pnpm@10`)

### 1. Install dependencies

```bash
pnpm install
```

### 2. Run a demo

```bash
pnpm dev --filter=demo-vite
# or any of:
#   demo-next, demo-tanstack-start, demo-expo-web,
#   demo-with-viem, demo-with-wagmi,
#   demo-with-solana-web3js, demo-with-solana-wallet-adapter, demo-with-solana-kit
```

Open the URL from the table above. Distinct ports let every demo run side by side.

## Scripts

| Command             | Description                                |
| ------------------- | ------------------------------------------ |
| `pnpm dev`          | Start every app in development mode.       |
| `pnpm build`        | Build every package and app.               |
| `pnpm test`         | Run unit tests across the monorepo.        |
| `pnpm lint`         | Run oxlint.                                |
| `pnpm format`       | Format with oxfmt.                         |
| `pnpm format:check` | Check formatting without writing.          |
| `pnpm typecheck`    | Run TypeScript checks across the monorepo. |
| `pnpm clean`        | Clean all build artifacts.                 |
| `pnpm fallow:dead`  | Find unused exports.                       |
