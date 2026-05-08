# butr

Multi-chain wallet management primitives for React. Headless, ~7 kB gzipped, bring your own connectors.

```bash
npm install butr zustand react
```

## What it is

`butr` is the small piece every multi-chain dApp ends up writing themselves: a state machine for "which wallet is the user connected with, on which chain, and how do I get a fresh signer when I need one." It gives you a Zustand store, a React provider, and a focused set of hooks. It does not ship a UI, does not ship connectors, and does not ship an RPC client.

You bring connectors that fulfill a `UIConnector` interface — one for MetaMask, one for Phantom, one per wallet SDK you use — and `butr` orchestrates connection lifecycle, persistence, hydration, and reactive lookups across all of them.

## Why it exists

Every wallet library that exists today is opinionated about one of three things: **which chain you're on** (wagmi assumes EVM, `@solana/wallet-adapter` assumes Solana), **what your UI looks like** (RainbowKit, Reown AppKit, and Privy ship modals you can't easily skin past their brand), or **which auth provider you use** (Privy and Dynamic ship full account systems you adopt as a vendor relationship).

`butr` is what's left when you remove all three opinions. It's a state container with the same concerns React Query has — caching, hydration, reactivity, error states — applied specifically to the question of "which wallet, where, and how do I sign right now."

It exists because we had three internal apps each maintaining their own version of the same Zustand store, and the abstraction kept getting copied wrong. Now there's one.

## Quick start

```tsx
import {
  WalletManagerProvider,
  useConnectWallet,
  useConnectedWallets,
  useConnectionStatus,
  type UIConnector,
  type WalletManagerConfig,
} from "butr";

// 1. Define your connectors. butr does not ship any — you adapt
//    whatever wallet SDKs you actually use to the UIConnector shape.
const myMetaMaskConnector: UIConnector = {
  id: "metamask",
  name: "MetaMask",
  chainPlatform: "evm",
  async connect() {
    /* … */
  },
  async getAccount() {
    /* … */
  },
  async switchChain(chain) {
    /* … */
  },
  async getSigner() {
    /* … */
  },
  async signMessage(msg) {
    /* … */
  },
  async sendTx(tx) {
    /* … */
  },
  async sendTxToChain(tx, chainId, cb) {
    /* … */
  },
  async getTransactionReceipt(tx) {
    /* … */
  },
  async getBalance(mint) {
    /* … */
  },
};

// 2. Wire the provider once at the top of your tree.
const config: WalletManagerConfig = {
  connectors: [{ id: "metamask", name: "MetaMask", chainPlatform: "evm" }],
  createConnector: (id) => (id === "metamask" ? myMetaMaskConnector : null),
};

const App = () => (
  <WalletManagerProvider config={config}>
    <ConnectButton />
  </WalletManagerProvider>
);

// 3. Use hooks anywhere below the provider.
const ConnectButton = () => {
  const connect = useConnectWallet();
  const status = useConnectionStatus();
  const wallets = useConnectedWallets();

  return (
    <button onClick={() => connect("metamask")} disabled={status === "connecting"}>
      {wallets.length > 0 ? `Connected: ${wallets[0].account.walletAddress}` : "Connect"}
    </button>
  );
};
```

## Core concepts

### `UIConnector`

The interface every connector must implement. Lifecycle: `connect`, `disconnect`, `getAccount`, `switchChain`, `switchAccount`. Capabilities: `getSigner`, `signMessage`, `sendTx`, `sendTxToChain`, `getTransactionReceipt`, `getBalance`.

`butr` never inspects the signer or transaction types — the connector returns `unknown` and the consumer casts. This is what keeps the package chain-agnostic.

### `WalletStore`

Zustand-vanilla store under the hood. Tracks connected wallets keyed by `ChainPlatform` (`"evm" | "svm"`), connection status, hydration state, and a session-scoped disconnect-intent flag. You can subscribe to the raw store via `useWalletStore(selector)` for custom derivations.

### `ChainBase`

CAIP-2 shaped: `{ id, namespace, reference, name }`. Consumers extend it structurally with logos, RPC URLs, block explorers — `butr` never reads beyond the four required fields.

### `WalletPersistence`

Pluggable storage. Default `WalletStorage` uses two `StorageDriver`s: `persistent` (survives reloads) and `session` (cleared on tab close). Built-in factories: `createBrowserStorageDriver` (localStorage + sessionStorage) and `createMemoryStorageDriver` (SSR/RN/tests). Bring your own driver — anything that implements `getItem`/`setItem`/`removeItem` works.

## API

### Provider

| Symbol                      | What it does                                                                                                            |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `WalletManagerProvider`     | Wraps the React tree. Takes a `config: WalletManagerConfig`.                                                            |
| `createWalletStore(config)` | Creates the underlying store directly. The provider does this for you; only call this if you need access outside React. |

### State hooks (read connection)

| Hook                    | Returns                                          |
| ----------------------- | ------------------------------------------------ |
| `useConnectionStatus`   | `"idle" \| "connecting" \| "success" \| "error"` |
| `useIsConnecting`       | `boolean`                                        |
| `useActiveConnectorId`  | `string \| null`                                 |
| `useConnectionError`    | `string \| null`                                 |
| `useWalletConnected`    | `boolean` (any wallet connected)                 |
| `useHasAnyWallet`       | `boolean` (alias, same value)                    |
| `useIsUserDisconnected` | session-scoped disconnect-intent flag            |

### Wallet lookup hooks

| Hook                       | Returns                                                                |
| -------------------------- | ---------------------------------------------------------------------- |
| `useConnectedWallets`      | `ConnectedWallet[]`                                                    |
| `useConnectedWalletsMap`   | `Map<ChainPlatform, ConnectedWallet>`                                  |
| `useGetWalletByPlatform`   | `(p: ChainPlatform) => ConnectedWallet \| undefined`                   |
| `useGetWalletByChain`      | alias of above for readability at call sites                           |
| `useGetWalletForOperation` | platform-keyed lookup intended for operation call sites                |
| `useWalletForOperation(p)` | reactive variant that re-renders only when the resolved wallet changes |
| `useIsWalletConnected`     | `(p: ChainPlatform) => boolean`                                        |
| `useGetConnectorInstance`  | `(id: string) => UIConnector \| null`                                  |

### Mutation hooks

| Hook                       | Action                                                                                |
| -------------------------- | ------------------------------------------------------------------------------------- |
| `useConnectWallet`         | `(id, onSuccess?, onError?) => Promise<void>`                                         |
| `useDisconnectWallet`      | `(p: ChainPlatform) => void`                                                          |
| `useRefreshWallet`         | `(p: ChainPlatform) => void` (re-emits the wallet entry without changing the account) |
| `useResetWallet`           | clears all wallets, fires `onReset`                                                   |
| `useUpdateWalletAccount`   | `(p: ChainPlatform, account: Account) => void`                                        |
| `useSetConnectionStatus`   | `(status, connectorId?) => void`                                                      |
| `useResetConnectionStatus` | `() => void`                                                                          |

### Direct store access

```ts
import { useShallow } from "zustand/react/shallow";

const { wallets, connected } = useWalletStore(
  useShallow((state) => ({ wallets: state.wallets, connected: state.connected })),
);
```

## Comparison

| Library                          | Chain support             | What it ships                                                                 | Bundle                               | UI opinions              | Primitives vs product |
| -------------------------------- | ------------------------- | ----------------------------------------------------------------------------- | ------------------------------------ | ------------------------ | --------------------- |
| **butr**                         | EVM, Solana               | Connection state machine, hooks, persistence, hydration, RN export            | **~7 kB gz** (peer: react + zustand) | None                     | Primitives            |
| **wagmi**                        | EVM only                  | 40+ hooks, connectors, viem, TanStack Query integration                       | ~70 kB min+gz                        | None                     | Primitives            |
| **@solana/wallet-adapter-react** | Solana only               | React context + hooks (`useWallet`, `useConnection`); UI in a sibling package | ~40–60 kB                            | Optional via `-react-ui` | Primitives            |
| **RainbowKit**                   | EVM only (atop wagmi)     | Wallet modal, chain switcher, theming                                         | ~500 kB+ tree                        | Strong — ships modal     | Batteries-included UI |
| **Reown AppKit** (Web3Modal)     | EVM, Solana, Bitcoin      | Modal UI, chain adapters, WalletConnect relay                                 | Large (lazy-loaded)                  | Very strong              | Product               |
| **thirdweb**                     | EVM, Solana, 1000+ chains | Full SDK: hooks, UI, in-app wallets, contracts, RPC, storage                  | Large                                | Ships UI                 | Product               |
| **Privy**                        | EVM, Solana               | Auth + embedded wallets via TEE/SSS, hooks, login flows                       | Large                                | Some — login UI          | Auth + wallet product |
| **Dynamic Labs**                 | EVM, Solana, others       | Auth + embedded wallets + connectors, plugin-based chains                     | Large (core ~11 MB unmin)            | Modal + login UI         | Auth + wallet product |
| **viem / ethers**                | EVM only                  | Low-level RPC, ABI, signing — no wallet state, no React                       | viem ~35 kB gz; ethers ~88 kB gz     | None                     | Below butr's level    |

### What makes butr different

- **Multi-chain from day one.** `wagmi` is EVM-only; `@solana/wallet-adapter` is Solana-only. `butr`'s connector abstraction is chain-agnostic and covers EVM and Solana through one model.
- **Bring your own connectors.** No connector implementations are bundled. You write a `UIConnector` for whatever wallet SDK you actually use, so there's no upstream coupling to WalletConnect, Phantom, MetaMask, or any specific provider.
- **Genuinely headless.** RainbowKit and AppKit bundle a modal you can't easily skin past their brand. Privy and Dynamic ship login screens. `butr` ships zero UI, which means it composes with any design system without override fights.
- **Smallest in its class.** ~7 kB gzipped, peer deps `react` + `zustand` only. RainbowKit, thirdweb, Privy, and Dynamic add hundreds of kilobytes to megabytes.
- **Runs everywhere React runs.** A `react-native` export condition and pluggable storage drivers (browser + memory) mean the same package works in browsers, React Native, and SSR — no separate adapters.

## React Native

`butr`'s `package.json` declares a `react-native` export condition pointing at the same ESM build. Use the in-memory storage driver:

```tsx
import { WalletStorage, createMemoryStorageDriver } from "butr";

const storage = (() => {
  const driver = createMemoryStorageDriver();
  return new WalletStorage({
    keyPrefix: "myapp",
    persistent: driver,
    session: driver,
  });
})();

const config: WalletManagerConfig = {
  connectors: [...],
  createConnector,
  storage,
};
```

For Metro + pnpm monorepos, set `unstable_enablePackageExports = true` in `metro.config.js` so Metro honors the `react-native` export condition. See `apps/demo-expo/metro.config.js` in this repo for a working example.

## Demos

This monorepo ships four working demo apps that exercise every public export of `butr`. Each is a kitchen-sink reference page in a different framework:

- `apps/demo-vite` — Vite + React 19 SPA
- `apps/demo-next` — Next.js 16 App Router
- `apps/demo-tanstack-start` — TanStack Start (Vite SSR)
- `apps/demo-expo` — Expo / React Native (web target)

`pnpm dev --filter=demo-vite` (etc.) to run any of them. Source under `apps/demo-*/src/sections/` shows the conventional usage of each hook.

## License

MIT.
