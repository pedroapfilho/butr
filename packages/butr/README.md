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

## Mental model

butr keeps three orthogonal slices of state. Most wallet libraries collapse them; butr keeps them separate because they answer different questions and change at different rates.

```
┌─ pool ─────────────────────────────────────────────────────────┐
│  every connected wallet, keyed by connectorId                  │
│                                                                │
│    io.metamask              →  MetaMask    @ 0x53d1…           │
│    io.rabby                 →  Rabby       @ 0x12ab…           │
│    wallet-standard:phantom  →  Phantom     @ AbCd…             │
└────────────────────────────────────────────────────────────────┘
                │                                  │
                ▼                                  ▼
   ┌─ selection ─────────────┐      ┌─ active ───────────────────┐
   │  per chain family       │      │  global UX cursor          │
   │                         │      │                            │
   │   "evm" → io.rabby      │      │    io.metamask             │
   │   "svm" → wallet-…      │      │                            │
   └─────────────────────────┘      └────────────────────────────┘
       "which wallet to use            "which wallet is in
        for an EVM / SVM op"            focus right now"
```

- **pool** answers _"who's connected?"_ It's a Map of every authorised wallet. Multiple wallets on the same chain (MetaMask + Rabby) coexist.
- **selection** answers _"if I'm about to send an EVM tx, which wallet routes it?"_ One entry per chain family. Changing the active wallet doesn't shuffle this.
- **active** answers _"which wallet does the user have in focus right now?"_ A single cursor for UX, independent of routing.

Within a single wallet, the `ConnectedWallet` carries an `accounts: Array<Account>` (every exposed address) and an `account: Account` (the wallet's currently-active one). Signing methods accept an optional `account` parameter for per-call routing without changing the wallet's active address — see [Per-call account routing](#per-call-account-routing) below.

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

Each `ConnectedWallet` carries `accounts: Array<Account>` alongside the active `account`. Populated from `Connector.getAccounts?()` if implemented; otherwise `[account]`. Surface via `useAccounts(connectorId?)` (defaults to the active wallet). Wallet-side `accountChanged` events auto-extend the list when the new address is one we haven't seen before.

Two related capabilities widen and refresh this list:

- **`Connector.requestAccounts?()`** — ask the wallet to open its account-selection UI. EIP-6963 wallets implement this via `wallet_requestPermissions`; Wallet Standard wallets typically leave it unset (the user enables more accounts directly in the extension).
- **`useRequestAccounts()`** — the React-side wrapper. Calls the connector's `requestAccounts`, then re-reads `getAccounts()` and updates the pool entry's `accounts` array. UI should hide the trigger when `connector.requestAccounts` is undefined.

### Per-call account routing

Switching _the wallet's_ active account is sovereign to the wallet UI — neither EIP-1193 nor Wallet Standard exposes a silent "use address X" RPC. But _per-call_ signing with a specific exposed address is possible, and butr threads it through:

```ts
// Default behaviour — signs with the wallet's currently-active account
await wallet.connector.signMessage(bytes);

// Sign with a specific exposed account, without changing the wallet's
// active address. Pick from wallet.accounts.
await wallet.connector.signMessage(bytes, wallet.accounts[1]);

// Same for transactions
await wallet.connector.sendTx(tx, wallet.accounts[1]);
await wallet.connector.sendTxToChain(tx, chainId, wallet.accounts[1]);
```

Under the hood: EIP-1193 routes through `personal_sign`'s address slot or `tx.from`; Wallet Standard routes through the feature input's `account`. Both work without prompting to switch the wallet's active account.

EVM caveat: `eth_sendTransaction` with a non-active `from` may still prompt some MetaMask versions to switch (`personal_sign` doesn't). Per-call signing is the more reliable path for verifying address routing in real wallets.

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

Pluggable storage. Default `WalletStorage` uses two `StorageDriver`s: `persistent` (survives reloads) and `session` (cleared on tab close). Built-in factories:

- `createBrowserStorageDriver()` — localStorage + sessionStorage. Default for web demos.
- `createMemoryStorageDriver()` — in-memory map. Default for SSR / React Native / tests.
- `createCookieStorageDriver(options?)` — `document.cookie` reader/writer. Server-readable, so SSR apps can prime the connected-wallet UI from the request without hydration flicker. Configure `domain` / `maxAgeSeconds` / `sameSite` / `secure` per app.

Bring your own driver — anything that implements `getItem`/`setItem`/`removeItem` works.

### Observability

`WalletManagerConfig` accepts two optional callbacks for piping connection telemetry into Sentry/OTel without each consumer wrapping `connectWallet` themselves:

- `onConnectError(error: ConnectionError, connectorId: string)` — fires after a failed connect attempt. Receives the normalised `ConnectionError`.
- `onSlowConnect(connectorId: string)` — fires when a connect hasn't resolved within `slowConnectThresholdMs` (default 5 000 ms). Useful for showing a "still trying — check your wallet" hint.

```tsx
<WalletManagerProvider
  auto
  onConnectError={(error, connectorId) => Sentry.captureMessage(`butr.connect.failed`, { extra: { error, connectorId } })}
  onSlowConnect={(connectorId) => console.warn("slow connect:", connectorId)}
  slowConnectThresholdMs={3_000}
>
```

### Capability flags

Different wallets implement different subsets of EIP-1193 / Wallet Standard. Probing for method existence via `typeof === "function"` only catches truly-optional methods — `signMessage` on SVM is always defined but throws if `solana:signMessage` isn't advertised. To gate UI affordances honestly, every connector carries a `capabilities: WalletCapabilities` field with runtime flags:

```ts
type WalletCapabilities = {
  getBalance: boolean;            // false for SVM auto-adapter (no RPC)
  getTransactionReceipt: boolean; // false for SVM auto-adapter (no RPC)
  requestAccounts: boolean;       // EIP-2255 on EVM, standard:connect on SVM
  sendTransaction: boolean;       // false for SVM wallets missing solana:signAndSendTransaction
  signMessage: boolean;           // false for SVM wallets missing solana:signMessage
  subscribe: boolean;             // does the wallet emit change events?
  switchAccount: boolean;         // almost always false — no protocol RPC
  switchChain: boolean;           // EVM: true. SVM: true when wallet advertises >1 chain
};

// Consumer code
{wallet.connector.capabilities.requestAccounts ? (
  <button onClick={() => requestAccounts(wallet.connector.id)}>
    Request more accounts
  </button>
) : null}
```

Auto-built adapters populate these from the underlying protocol's feature advertisements (e.g. SVM's `signMessage` flag mirrors whether the wallet advertises `solana:signMessage`); hand-rolled adapters declare them explicitly. Each flag means "can this work right now," not "is this method defined." Use these instead of probing — they're honest about whether the call would reject.

### Chain switching

Each adapter implements `Connector.switchChain(chain: ChainBase)`. butr ships a small registry of common chains so consumers don't have to hand-roll the CAIP-2 tuples:

```tsx
import { CHAINS_BY_PLATFORM } from "butr";

CHAINS_BY_PLATFORM[wallet.connector.chainPlatform].map((chain) => (
  <button key={chain.id} onClick={() => wallet.connector.switchChain(chain)}>
    {chain.name}
  </button>
));
```

EVM coverage: Ethereum, Sepolia, Polygon, Arbitrum, Optimism, Base, BNB Smart Chain. SVM coverage: Solana Mainnet, Devnet. Granular chains live as named exports (`EVM_CHAINS.base`, etc.) so consumers can construct their own subsets.

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
| `useRequestAccounts`       | `(connectorId: string) => Promise<void>` — opens the wallet's picker, refreshes `accounts` array     |
| `useResetWallet`           | clears all wallets, fires `onReset`                                                                  |
| `useResetConnectionStatus` | `() => void`                                                                                         |
| `useSetConnectionError`    | `(error: ConnectionError \| null) => void`                                                           |

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

## Auto mode

`WalletManagerProvider` accepts an `auto` prop that wires wallet discovery for you. butr subscribes to [EIP-6963](https://eips.ethereum.org/EIPS/eip-6963) (EVM) and the [Wallet Standard](https://github.com/wallet-standard/wallet-standard) (Solana) and feeds the announced wallets to the store. No `config`, no `connectors`, no `createConnector`. `useDiscoveredWallets()` returns the live list for rendering a wallet picker.

### Install — pick your target

The Solana side requires one extra package as an **optional peer dependency**. The three modes:

| You want              | Install                                 | What to use                                         |
| --------------------- | --------------------------------------- | --------------------------------------------------- |
| **EVM only**          | `npm install butr`                      | `<WalletManagerProvider auto={{ evm: true }}>`      |
| **Solana only**       | `npm install butr @wallet-standard/app` | `<WalletManagerProvider auto={{ svm: true }}>`      |
| **Both EVM + Solana** | `npm install butr @wallet-standard/app` | `<WalletManagerProvider auto>` (shorthand for both) |

`auto={true}` is the shorthand for "discover everything butr knows how to discover." Pass an object to scope explicitly. Even with `auto={true}`, if `@wallet-standard/app` isn't installed the SVM side silently no-ops — your EVM wallets still come through. That's why the explicit `{ evm: true }` form is cleaner for EVM-only apps: it skips even attempting the SVM dynamic import.

### Usage

```tsx
import {
  WalletManagerProvider,
  useConnectWallet,
  useConnectionStatus,
  useDiscoveredWallets,
} from "butr";

const App = () => (
  <WalletManagerProvider auto>
    {" "}
    {/* both platforms */}
    <WalletPicker />
  </WalletManagerProvider>
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

Scope to one platform:

```tsx
// EVM-only app — no Solana wallets show up in useDiscoveredWallets()
<WalletManagerProvider auto={{ evm: true }}>…</WalletManagerProvider>

// Solana-only app — no EVM listener attaches at all
<WalletManagerProvider auto={{ svm: true }}>…</WalletManagerProvider>
```

Adapter IDs:

- EVM: `info.rdns` from EIP-6963 → `io.metamask`, `io.rabby`, `app.phantom`, etc.
- SVM: `wallet-standard:<slug>` from the wallet's name → `wallet-standard:phantom`, `wallet-standard:solflare`.

Stable across page loads. Callbacks (`onConnect`, `onDisconnect`, `onReset`) and custom storage pass through as top-level props on the provider when `auto` is set:

```tsx
<WalletManagerProvider auto onConnect={(w) => console.log(w)} storageKeyPrefix="my-app">
  …
</WalletManagerProvider>
```

`auto` is mutually exclusive with `config` — the type system enforces this. Manual wiring still works:

```tsx
<WalletManagerProvider config={myConfig}>…</WalletManagerProvider>
```

### What's covered

| Surface               | Discovery               | Adapter                                    | Status      |
| --------------------- | ----------------------- | ------------------------------------------ | ----------- |
| EVM (EIP-6963)        | EIP-6963 announcements  | EIP-1193 → `WalletAdapter`                 | Implemented |
| SVM (Wallet Standard) | `getWallets()` registry | Wallet Standard features → `WalletAdapter` | Implemented |

End-to-end tested against MetaMask (EIP-6963) and Phantom (Wallet Standard) in the kitchen-sink demos.

### Capability caveats for SVM auto-adapters

The Wallet Standard exposes wallet features but no RPC connection. Adapters generated from `buildSvmAdapter` therefore have limits:

- `getBalance()` returns `{ value: 0n, formatted: "0", … }`. Real balances need an RPC client; wrap your own.
- `getTransactionReceipt()` always returns `{ status: "Pending" }`. Same reason — needs an RPC.
- `switchChain()` is a no-op. The Wallet Standard has no `switchChain` feature; chains are passed per-call to `signAndSendTransaction`.
- `switchAccount()` is intentionally unimplemented. Wallet Standard has no silent "use address X" feature; users switch the active account in the wallet's own UI, and butr's `subscribe` bridge picks the change up. For per-tx routing use `signMessage(msg, account)` / `sendTx(tx, account)` instead.
- `sendTx()` requires the wallet to advertise `solana:signAndSendTransaction`. Without it, the call rejects with a clear message.
- `signMessage()` requires the wallet to advertise `solana:signMessage`. Without it, the call rejects with a clear message.

### Caveats on the EVM auto-adapter

The EIP-1193 → `WalletAdapter` conversion lives in [`buildEvmAdapter`](src/auto/eip6963-adapter.ts). A few things behave differently from a hand-written adapter:

- `disconnect()` calls `wallet_revokePermissions`. Many wallets don't implement it and silently ignore the call — butr's reducer still marks the wallet as disconnected on its side.
- `switchAccount()` is intentionally unimplemented. EIP-1193 has no silent "use address X" RPC. The user changes the active account in the wallet's own UI (MetaMask account picker); butr's `accountsChanged` subscription auto-updates the pool entry. Use `requestAccounts()` to widen which accounts the wallet exposes, and `signMessage(msg, account)` for per-call routing.
- `getBalance()` reports native ETH with `symbol: "ETH"` regardless of which EVM chain is active. Consumers targeting multiple chains overlay the symbol themselves.
- `getSigner()` returns the raw EIP-1193 provider. Wrap with `viem.createWalletClient` / `ethers.BrowserProvider` at the call site.

### Lower-level building blocks (`butr/auto`)

The sub-path export `butr/auto` exposes the pure discovery functions for callers who want to compose discovery into a custom provider (server-rendered apps, mobile webviews, iframe integrations):

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

`pnpm dev --filter=demo-vite` (etc.) to run any of them. Each demo is a single page exercising the multi-wallet pool, account discovery, per-address signing, and the auto-discovery flow.

## Roadmap

Where butr is heading next. Not promises — guideposts.

### Near-term

- **First npm publish.** butr is currently workspace-only. `npm pack --dry-run` runs clean (~73 kB compressed, 111 files). Cut a 0.x release once an external consumer has exercised the full surface.
- **Per-tx account routing in the demos.** `signMessage(msg, account)` ships with a per-row Sign button. `sendTx(tx, account)` needs equivalent UI to verify the `from`-address flow against real wallets — deferred because broadcasting requires a chain-specific tx builder.

### Medium-term

- **Optional RPC helpers.** butr's auto-built Solana adapter returns `getBalance: 0` and `getTransactionReceipt: Pending` because Wallet Standard has no RPC. A `butr/svm-rpc` sub-path (optional peer on `@solana/web3.js`) would close the gap without baking RPC into the core.
- **NativeWind v5 in `demo-expo`.** Currently uses React Native `StyleSheet` with Tailwind-shaped design tokens because NativeWind v5 (Tailwind v4 port) is in preview and breaks against `react-native-web@0.21`. Revisit when it ships GA.
- **Expanded Playwright coverage.** A smoke spec ships at `tests/e2e/demo-vite/smoke.spec.ts`. Next: wallet-extensions-backed tests using the `wallet-extensions` registry so CI exercises real EIP-6963 discovery against bundled MetaMask / Rabby tarballs.

### Longer-term

- **WalletConnect bridge.** Real native-mobile wallet connection needs WalletConnect's relay. A `butr/walletconnect` adapter would unlock the Expo native target.
- **Account abstraction (ERC-4337) signers.** Smart-account wallets expose the same shape as EOAs but with extra capabilities (paymasters, session keys). butr's `WalletAdapter` can hold them as an optional capability extension without bloating the core surface.

### Recently shipped (this iteration)

- **Cookie storage driver** — `createCookieStorageDriver(options?)`.
- **Observability hooks** — `WalletManagerConfig.onConnectError`, `WalletManagerConfig.onSlowConnect`, `slowConnectThresholdMs`.
- **Common chains registry** — `CHAINS`, `CHAINS_BY_PLATFORM`, `EVM_CHAINS`, `SVM_CHAINS`.
- **Chain-switcher UI** — each connected-wallet card in the demos exposes per-platform chain switching via `Connector.switchChain`.
- **Wallet-brand grouping** — the discovered picker renders one row per wallet brand with per-platform chips (so Phantom doesn't show up twice).
- **First Playwright spec** — `tests/e2e/demo-vite/smoke.spec.ts` covers the empty-state render + install-link integrity.

### Won't ship

- **Bundled connectors.** "Bring your own" is load-bearing for the headless pitch. Auto-discovery via EIP-6963 / Wallet Standard is the closest butr gets to ergonomic out-of-box behaviour.
- **A modal.** RainbowKit / AppKit / ConnectKit own this space. butr is the layer below.
- **Auth.** Privy / Dynamic / Magic own this space. butr is the layer below.
- **Multi-tenant wallet state.** One provider, one store. Apps with multiple sections that each want their own pool can mount multiple providers themselves.

## License

MIT.
