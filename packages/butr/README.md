# butr

Multi-chain wallet management primitives for React. Headless, ~10 kB gzipped, bring your own connectors.

```bash
npm install butr zustand react
```

## What it is

`butr` is the small piece every multi-chain dApp ends up writing themselves: a state machine for "which wallet is the user connected with, on which chain, and how do I get a fresh signer when I need one." It gives you a Zustand store, a React provider, and a focused set of hooks. It does not ship a UI, does not ship connectors, and does not ship an RPC client.

You bring connectors that fulfill a `WalletAdapter` interface — one for MetaMask, one for Phantom, one per wallet SDK you use — and `butr` orchestrates connection lifecycle, persistence, hydration, and reactive lookups across all of them.

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
  type WalletAdapter,
  type WalletManagerConfig,
} from "butr";

// 1. Define your connectors. butr does not ship any — you adapt
//    whatever wallet SDKs you actually use to the WalletAdapter shape.
const myMetaMaskConnector: WalletAdapter = {
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

### `WalletAdapter`

The interface every connector must implement. Conceptually it's the intersection of two smaller interfaces — the seam is documentary, but it makes "what `butr` calls" vs. "what your app calls" explicit:

- **`Connector`** — orchestration, what `butr` itself invokes during connect / disconnect / hydrate: `id`, `name`, `chainPlatform`, `connect`, `disconnect`, `getAccount`. Optional: `getAccounts` (multi-account wallets), `subscribe` (bridge wallet-side events into the store).
- **`Wallet`** — capabilities, what your app calls on a connected wallet: `getSigner`, `signMessage`, `sendTx`, `sendTxToChain`, `getTransactionReceipt`, `getBalance`, `switchAccount`, `switchChain`.

`WalletAdapter = Connector & Wallet`. `butr` never inspects the signer or transaction types — the connector returns `unknown` and the consumer casts. That's what keeps the package chain-agnostic.

### Wallet-side events: `Connector.subscribe`

A connector can optionally bridge native wallet events (account swap, external lock/disconnect) into butr's store:

```ts
subscribe?(listener: (event: ConnectorEvent) => void): () => void;

type ConnectorEvent =
  | { type: "accountChanged"; account: Account }
  | { type: "disconnected" };
```

butr calls `subscribe` after a successful `connect()` (and again for every wallet restored during hydration), then unsubscribes on `disconnectWallet` / `reset`. Inside the listener:

- `accountChanged` → the reducer dispatches `ACCOUNT_UPDATED` and persists the pool. The new account is also auto-added to `wallet.accounts` if previously unknown.
- `disconnected` → the reducer dispatches `DISCONNECTED`, fires `config.onDisconnect`, and clears the entry. butr does **not** call `connector.disconnect()` here, since the wallet has already gone away.

Without this bridge, every consumer has to wire `window.ethereum.on('accountsChanged', …)` (and the Solana / WalletConnect equivalents) themselves and translate them into `updateWalletAccount` calls — a class of bugs we'd rather not ship.

### Multi-account per wallet

Each `ConnectedWallet` now carries `accounts: Array<Account>` alongside the active `account`. Populated from `Connector.getAccounts?()` if implemented; otherwise `[account]`. Surface via `useAccounts(connectorId?)` (defaults to the active wallet). Wallet-side `accountChanged` events auto-extend the list when the new address is one we haven't seen before.

### `ConnectorMeta` extras

`ConnectorMeta` carries optional `url` (download link), `icon` (image URL or data URI), and `availability?: () => WalletAvailability` (`"installed" | "loadable" | "not-installed"`). Useful for "Install MetaMask →" affordances and wallet selection UIs without baking either into butr.

### `WalletStore`

Zustand-vanilla store under the hood. Tracks three orthogonal pieces of state:

- **pool**: `Map<connectorId, ConnectedWallet>` — every authorised wallet, keyed by connector id. Multiple connectors can serve the same platform (e.g. MetaMask + Rabby both on EVM); both live in the pool.
- **selection**: `Map<ChainPlatform, connectorId>` — for each platform, which wallet is the routing target right now. `connect("rabby")` makes Rabby the EVM selection; `setSelection("evm", "metamask")` switches it back.
- **activeConnectorId**: `string | null` — a single global UX cursor for "the wallet currently in front of the user." Independent from selection — switching active doesn't shuffle per-platform routing.

Internally the state is driven by a pure reducer (`(state, event) => state`); the runtime composes that reducer with connector I/O and storage. You can subscribe to the raw store via `useWalletStore(selector)` for custom derivations.

### `ChainBase`

CAIP-2 shaped: `{ id, namespace, reference, name }`. Consumers extend it structurally with logos, RPC URLs, block explorers — `butr` never reads beyond the four required fields.

### `WalletPersistence`

Pluggable storage. Default `WalletStorage` uses two `StorageDriver`s: `persistent` (survives reloads) and `session` (cleared on tab close). Built-in factories: `createBrowserStorageDriver` (localStorage + sessionStorage) and `createMemoryStorageDriver` (SSR/RN/tests). Bring your own driver — anything that implements `getItem`/`setItem`/`removeItem` works.

### `ConnectionError`

A tagged union of normalised error variants — `UserRejected`, `RequestPending`, `WalletLocked`, `ChainMismatch`, `NotConnected`, `Timeout`, `Unknown`. butr's `mapConnectionError` translates raw thrown values from connectors (EIP-1193 numeric codes, Solana wallet messages, embedded SDK error classes) into one of these. Consumers branch on `error.kind` for UX decisions instead of regexing message strings.

```ts
const error = useConnectionError();
if (error?.kind === "UserRejected") {
  // show "try again"
} else if (error?.kind === "RequestPending") {
  // hint user to check their wallet popup
} else if (error?.kind === "WalletLocked") {
  // tell user to unlock
}
```

## API

### Provider

| Symbol                      | What it does                                                                                                            |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `WalletManagerProvider`     | Wraps the React tree. Takes a `config: WalletManagerConfig`.                                                            |
| `createWalletStore(config)` | Creates the underlying store directly. The provider does this for you; only call this if you need access outside React. |

### Connection state hooks

| Hook                       | Returns                                                                      |
| -------------------------- | ---------------------------------------------------------------------------- |
| `useConnectionStatus`      | `"idle" \| "connecting" \| "success" \| "error"`                             |
| `useIsConnecting`          | `boolean`                                                                    |
| `useConnectingConnectorId` | `string \| null` — the wallet currently in flight (null when not connecting) |
| `useActiveConnectorId`     | `string \| null` — the global UX cursor                                      |
| `useConnectionError`       | `ConnectionError \| null` — see [`ConnectionError`](#connectionerror)        |
| `useWalletConnected`       | `boolean` (any wallet connected)                                             |
| `useIsHydrated`            | `boolean` — has the store finished its initial load?                         |
| `useIsUserDisconnected`    | session-scoped disconnect-intent flag                                        |

### Pool / selection / active hooks (reactive)

| Hook                               | Returns                                                                           |
| ---------------------------------- | --------------------------------------------------------------------------------- |
| `usePool`                          | `Map<connectorId, ConnectedWallet>` — every authorised wallet                     |
| `useConnectedWallets`              | `Array<ConnectedWallet>` — pool projected as a list                               |
| `useAccounts(connectorId?)`        | `ReadonlyArray<Account>` — all known accounts on a wallet (defaults to active)    |
| `useSelection`                     | `Map<ChainPlatform, connectorId>` — current per-platform routing                  |
| `useActiveWallet`                  | `ConnectedWallet \| undefined` — the globally active wallet                       |
| `useSelectedWallet(platform)`      | `ConnectedWallet \| undefined` — re-renders only when the resolved wallet changes |
| `useIsPlatformConnected(platform)` | `boolean` — does the selection have an entry for this platform?                   |

### Stable accessors (return functions; safe in callbacks)

| Hook                      | Returns                                                     |
| ------------------------- | ----------------------------------------------------------- |
| `useGetWallet`            | `(connectorId: string) => ConnectedWallet \| undefined`     |
| `useGetSelectedWallet`    | `(platform: ChainPlatform) => ConnectedWallet \| undefined` |
| `useGetConnectorInstance` | `(id: string) => WalletAdapter \| null`                     |

### Async hooks (signer + balance)

Both invalidate automatically when `connectorId`, the connected account address, or the chain id changes — so chain switches or account swaps in the wallet refetch without consumer effort.

| Hook                              | Returns                                                                                                  |
| --------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `useSigner(connectorId?)`         | `{ data: unknown \| null; error: unknown \| null; status: "idle" \| "loading" \| "success" \| "error" }` |
| `useBalance(connectorId?, mint?)` | Same shape as `useSigner` plus `refetch: () => void` for poll-on-demand                                  |
| `useWalletEntry(connectorId?)`    | Reactive lookup by `connectorId`. Re-renders only when the resolved wallet identity changes.             |

If `connectorId` is omitted, both default to the active wallet (`useActiveConnectorId`).

```tsx
const { data: signer, status } = useSigner();
const { data: balance, refetch } = useBalance();

if (status === "success" && signer) {
  // signer is ready; consumer casts to its concrete type
}
```

### Mutation hooks

| Hook                       | Action                                                                                               |
| -------------------------- | ---------------------------------------------------------------------------------------------------- |
| `useConnectWallet`         | `(connectorId, onSuccess?, onError?) => Promise<void>`                                               |
| `useDisconnectWallet`      | `(connectorId: string) => void`                                                                      |
| `useSetActiveConnector`    | `(connectorId: string \| null) => void` — change the global active wallet without touching selection |
| `useSetSelection`          | `(platform: ChainPlatform, connectorId: string \| null) => void` — change per-platform routing       |
| `useUpdateWalletAccount`   | `(connectorId: string, account: Account) => void`                                                    |
| `useRefreshWallet`         | `(connectorId: string) => void` (re-emits the wallet entry without changing the account)             |
| `useResetWallet`           | clears all wallets, fires `onReset`                                                                  |
| `useSetConnectionStatus`   | `(status, connectorId?) => void`                                                                     |
| `useResetConnectionStatus` | `() => void`                                                                                         |
| `useSetConnectionError`    | `(error: string \| null) => void`                                                                    |

### Direct store access

```ts
import { useShallow } from "zustand/react/shallow";

const { pool, activeConnectorId } = useWalletStore(
  useShallow((state) => ({
    pool: state.pool,
    activeConnectorId: state.activeConnectorId,
  })),
);
```

## Auto mode (`butr/auto`)

Sub-path export that adds wallet auto-discovery via [EIP-6963](https://eips.ethereum.org/EIPS/eip-6963) (EVM) and the [Wallet Standard](https://github.com/wallet-standard/wallet-standard) (Solana, stubbed). Opt-in — the core `butr` import stays adapter-free.

Drop in `AutoWalletManagerProvider` instead of `WalletManagerProvider` and your app picks up every EIP-6963 wallet the browser announces, no `connectors`/`createConnector` wiring required:

```tsx
import { AutoWalletManagerProvider, useDiscoveredWallets } from "butr/auto";
import { useConnectWallet, useConnectionStatus } from "butr";

const App = () => (
  <AutoWalletManagerProvider>
    <WalletPicker />
  </AutoWalletManagerProvider>
);

const WalletPicker = () => {
  const wallets = useDiscoveredWallets();
  const connect = useConnectWallet();
  const status = useConnectionStatus();

  return (
    <ul>
      {wallets.map((w) => (
        <li key={w.id}>
          <button onClick={() => connect(w.id)} disabled={status === "connecting"}>
            Connect {w.name}
          </button>
        </li>
      ))}
    </ul>
  );
};
```

Adapter IDs come from each wallet's `rdns` field (`io.metamask`, `io.rabby`, `app.phantom`) — stable across page loads.

### What's covered

| Surface               | Discovery               | Adapter                                    | Status                                           |
| --------------------- | ----------------------- | ------------------------------------------ | ------------------------------------------------ |
| EVM (EIP-6963)        | EIP-6963 announcements  | EIP-1193 → `WalletAdapter`                 | Implemented                                      |
| SVM (Wallet Standard) | `getWallets()` registry | Wallet Standard features → `WalletAdapter` | **Stub** — `discoverSvmAdapters` returns a no-op |

Solana is deliberately stubbed for now (needs `@wallet-standard/app` as a peer dep + real-wallet fixtures). Until it lands, Solana wallets still wire manually via `WalletManagerConfig.createConnector`. EVM wallets that also announce on EIP-6963 (Phantom, for instance) get auto-discovered today.

### Caveats on the EVM auto-adapter

The EIP-1193 → `WalletAdapter` conversion lives in [`buildEvmAdapter`](src/auto/eip6963-adapter.ts). A few things behave differently from a hand-written adapter:

- `disconnect()` calls `wallet_revokePermissions`. Many wallets don't implement it and silently ignore the call — butr's reducer still marks the wallet as disconnected on its side.
- `switchAccount()` calls `wallet_requestPermissions` (no standardised "switch to address X" RPC exists). The wallet reopens its account picker; the user chooses.
- `getBalance()` reports native ETH with `symbol: "ETH"` regardless of which EVM chain is active. Consumers targeting multiple chains overlay the symbol themselves.
- `getSigner()` returns the raw EIP-1193 provider. Wrap with `viem.createWalletClient` / `ethers.BrowserProvider` at the call site.

### Lower-level building blocks

The sub-path also exports the pure functions for callers who want to compose discovery into their own provider:

```ts
import {
  discoverEvmAdapters,
  discoverWalletAdapters,
  buildEvmAdapter,
  type Eip1193Provider,
  type Eip6963ProviderInfo,
} from "butr/auto";

const unsubscribe = discoverEvmAdapters((adapter, info) => {
  console.log("found", info.rdns, "→", adapter);
});
```

`discoverEvmAdapters` accepts an optional `{ target: EventTarget }` for environments where listening on `window` isn't appropriate (iframes, tests).

## Comparison

| Library                          | Chain support             | What it ships                                                                 | Bundle                                | UI opinions              | Primitives vs product |
| -------------------------------- | ------------------------- | ----------------------------------------------------------------------------- | ------------------------------------- | ------------------------ | --------------------- |
| **butr**                         | EVM, Solana               | Connection state machine, hooks, persistence, hydration, RN export            | **~10 kB gz** (peer: react + zustand) | None                     | Primitives            |
| **wagmi**                        | EVM only                  | 40+ hooks, connectors, viem, TanStack Query integration                       | ~70 kB min+gz                         | None                     | Primitives            |
| **@solana/wallet-adapter-react** | Solana only               | React context + hooks (`useWallet`, `useConnection`); UI in a sibling package | ~40–60 kB                             | Optional via `-react-ui` | Primitives            |
| **RainbowKit**                   | EVM only (atop wagmi)     | Wallet modal, chain switcher, theming                                         | ~500 kB+ tree                         | Strong — ships modal     | Batteries-included UI |
| **Reown AppKit** (Web3Modal)     | EVM, Solana, Bitcoin      | Modal UI, chain adapters, WalletConnect relay                                 | Large (lazy-loaded)                   | Very strong              | Product               |
| **thirdweb**                     | EVM, Solana, 1000+ chains | Full SDK: hooks, UI, in-app wallets, contracts, RPC, storage                  | Large                                 | Ships UI                 | Product               |
| **Privy**                        | EVM, Solana               | Auth + embedded wallets via TEE/SSS, hooks, login flows                       | Large                                 | Some — login UI          | Auth + wallet product |
| **Dynamic Labs**                 | EVM, Solana, others       | Auth + embedded wallets + connectors, plugin-based chains                     | Large (core ~11 MB unmin)             | Modal + login UI         | Auth + wallet product |
| **viem / ethers**                | EVM only                  | Low-level RPC, ABI, signing — no wallet state, no React                       | viem ~35 kB gz; ethers ~88 kB gz      | None                     | Below butr's level    |

### What makes butr different

- **Multi-chain from day one.** `wagmi` is EVM-only; `@solana/wallet-adapter` is Solana-only. `butr`'s connector abstraction is chain-agnostic and covers EVM and Solana through one model.
- **Bring your own connectors.** No connector implementations are bundled. You write a `WalletAdapter` for whatever wallet SDK you actually use, so there's no upstream coupling to WalletConnect, Phantom, MetaMask, or any specific provider.
- **Genuinely headless.** RainbowKit and AppKit bundle a modal you can't easily skin past their brand. Privy and Dynamic ship login screens. `butr` ships zero UI, which means it composes with any design system without override fights.
- **Smallest in its class.** ~10 kB gzipped, peer deps `react` + `zustand` only. RainbowKit, thirdweb, Privy, and Dynamic add hundreds of kilobytes to megabytes.
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
