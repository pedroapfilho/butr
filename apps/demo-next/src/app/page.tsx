"use client";

import { useState } from "react";
import {
  CHAINS_BY_PLATFORM,
  useActiveWallet,
  useBalance,
  useConnectWallet,
  useConnectedWallets,
  useConnectionError,
  useConnectionStatus,
  useDisconnectWallet,
  useDiscoveredWallets,
  useIsHydrated,
  useRequestAccounts,
  useSetActiveConnector,
  type Account,
  type ConnectedWallet,
  type WalletAdapter,
} from "butr";

const Page = () => (
  <main className="mx-auto max-w-2xl px-6 py-10 font-sans text-neutral-900">
    <header className="mb-8">
      <h1 className="text-3xl font-bold tracking-tight">butr · Next.js</h1>
      <p className="mt-1 text-sm text-neutral-500">
        Multi-chain wallet primitives. Discovering wallets via EIP-6963 and Wallet Standard.
      </p>
    </header>
    <Content />
  </main>
);

const Content = () => {
  const isHydrated = useIsHydrated();
  const status = useConnectionStatus();
  const error = useConnectionError();
  const connected = useConnectedWallets();
  const discovered = useDiscoveredWallets();

  if (!isHydrated) {
    return <p className="text-sm text-neutral-500">Loading…</p>;
  }

  const available = discovered.filter(
    (d) => !connected.some((c) => c.connector.id === d.id),
  );

  return (
    <div className="space-y-6">
      <StatusBar status={status} />
      {connected.length > 0 ? <ConnectedList wallets={connected} /> : null}
      <WalletPicker available={available} hasConnected={connected.length > 0} />
      {error ? (
        <p className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error.kind} — {error.message}
        </p>
      ) : null}
    </div>
  );
};

const StatusBar = ({ status }: { status: string }) => (
  <div className="flex items-center gap-2 text-sm text-neutral-600">
    <span className="font-medium">Status:</span>
    <span className="rounded-full bg-neutral-100 px-2 py-0.5 font-mono text-xs">{status}</span>
  </div>
);

const ConnectedList = ({ wallets }: { wallets: ReadonlyArray<ConnectedWallet> }) => (
  <section>
    <h2 className="mb-3 flex items-center gap-2 font-semibold">
      Connected
      <span className="rounded-full bg-neutral-100 px-2 py-0.5 font-mono text-xs text-neutral-500">
        {wallets.length}
      </span>
    </h2>
    <ul className="space-y-3">
      {wallets.map((wallet) => (
        <li key={wallet.connector.id}>
          <ConnectedWalletCard wallet={wallet} />
        </li>
      ))}
    </ul>
  </section>
);

const ConnectedWalletCard = ({ wallet }: { wallet: ConnectedWallet }) => {
  const active = useActiveWallet();
  const setActive = useSetActiveConnector();
  const disconnect = useDisconnectWallet();
  const requestAccounts = useRequestAccounts();
  const balance = useBalance(wallet.connector.id);
  const isActive = active?.connector.id === wallet.connector.id;
  const { capabilities } = wallet.connector;
  const balanceText =
    balance.status === "success"
      ? `${balance.data.formatted} ${balance.data.symbol}`
      : balance.status === "loading"
        ? "…"
        : balance.status === "error"
          ? "error"
          : "—";

  return (
    <div className="space-y-3 rounded-lg border border-neutral-200 bg-white p-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {wallet.connector.icon ? (
            <img alt="" className="h-8 w-8 rounded" src={wallet.connector.icon} />
          ) : null}
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-semibold">{wallet.connector.name}</h3>
              {isActive ? (
                <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700">
                  active
                </span>
              ) : null}
            </div>
            <p className="text-xs text-neutral-500">{wallet.account.chain.name}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {isActive ? null : (
            <button
              className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm hover:bg-neutral-50"
              onClick={() => setActive(wallet.connector.id)}
              type="button"
            >
              Make active
            </button>
          )}
          <button
            className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm hover:bg-neutral-50"
            onClick={() => disconnect(wallet.connector.id)}
            type="button"
          >
            Disconnect
          </button>
        </div>
      </div>
      <dl className="grid grid-cols-[120px_1fr] gap-y-1.5 text-sm">
        <dt className="text-neutral-500">Address</dt>
        <dd>
          {wallet.accounts.length > 1 ? (
            <AccountPicker wallet={wallet} />
          ) : (
            <span className="break-all font-mono text-xs">{wallet.account.walletAddress}</span>
          )}
        </dd>
        <dt className="text-neutral-500">Balance</dt>
        <dd className="font-mono text-xs">{balanceText}</dd>
        {capabilities.switchChain ? (
          <>
            <dt className="text-neutral-500">Chain</dt>
            <dd>
              <ChainPicker wallet={wallet} />
            </dd>
          </>
        ) : null}
      </dl>
      {capabilities.requestAccounts ? (
        <button
          className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm hover:bg-neutral-50"
          onClick={() => {
            void requestAccounts(wallet.connector.id);
          }}
          type="button"
        >
          Request more accounts
        </button>
      ) : null}
    </div>
  );
};

const ChainPicker = ({ wallet }: { wallet: ConnectedWallet }) => {
  const chains = CHAINS_BY_PLATFORM[wallet.connector.chainPlatform];
  return (
    <select
      className="w-full rounded-md border border-neutral-300 bg-white px-2 py-1 text-xs"
      onChange={(e) => {
        const target = chains.find((c) => c.id === e.target.value);
        if (target) {
          void wallet.connector.switchChain(target);
        }
      }}
      value={wallet.account.chain.id}
    >
      {chains.some((c) => c.id === wallet.account.chain.id) ? null : (
        <option value={wallet.account.chain.id}>{wallet.account.chain.name} (current)</option>
      )}
      {chains.map((chain) => (
        <option key={chain.id} value={chain.id}>
          {chain.name}
        </option>
      ))}
    </select>
  );
};

const AccountPicker = ({ wallet }: { wallet: ConnectedWallet }) => (
  <div className="space-y-1">
    <ul className="space-y-1">
      {wallet.accounts.map((account) => (
        <AccountRow account={account} key={account.id} wallet={wallet} />
      ))}
    </ul>
    <p className="text-xs text-neutral-500">
      Active account is set in your wallet. Use Sign to test per-account signing.
    </p>
  </div>
);

type SignState =
  | { kind: "idle" }
  | { kind: "signing" }
  | { kind: "ok" }
  | { kind: "error"; message: string };

const SIGN_MESSAGE_TEXT = "Hello from the butr demo";

const AccountRow = ({ account, wallet }: { account: Account; wallet: ConnectedWallet }) => {
  const isCurrent = account.walletAddress === wallet.account.walletAddress;
  const [state, setState] = useState<SignState>({ kind: "idle" });

  const handleSign = async () => {
    setState({ kind: "signing" });
    try {
      const bytes = new TextEncoder().encode(SIGN_MESSAGE_TEXT);
      await wallet.connector.signMessage(bytes, account);
      setState({ kind: "ok" });
    } catch (error) {
      setState({
        kind: "error",
        message: error instanceof Error ? error.message : "Unknown error",
      });
    }
  };

  return (
    <li
      className={`flex items-center justify-between gap-2 rounded-md border px-2 py-1 ${
        isCurrent
          ? "border-emerald-200 bg-emerald-50 text-emerald-900"
          : "border-neutral-200 text-neutral-700"
      }`}
    >
      <span className="break-all font-mono text-xs">{account.walletAddress}</span>
      <span className="flex shrink-0 items-center gap-2">
        {state.kind === "ok" ? (
          <span className="text-xs text-emerald-700">✓ signed</span>
        ) : state.kind === "error" ? (
          <span title={state.message} className="text-xs text-red-700">
            ✗ failed
          </span>
        ) : null}
        <button
          className="rounded border border-neutral-300 bg-white px-2 py-0.5 text-xs hover:bg-neutral-50 disabled:opacity-50"
          disabled={state.kind === "signing"}
          onClick={() => {
            void handleSign();
          }}
          type="button"
        >
          {state.kind === "signing" ? "…" : "Sign"}
        </button>
      </span>
    </li>
  );
};

type WalletBrand = {
  adapters: Array<WalletAdapter>;
  icon: string | undefined;
  name: string;
};

const groupByBrand = (wallets: ReadonlyArray<WalletAdapter>): Array<WalletBrand> => {
  const byName = new Map<string, WalletBrand>();
  for (const wallet of wallets) {
    const key = wallet.name.toLowerCase();
    const existing = byName.get(key);
    if (existing) {
      existing.adapters.push(wallet);
      existing.icon = existing.icon ?? wallet.icon;
    } else {
      byName.set(key, { adapters: [wallet], icon: wallet.icon, name: wallet.name });
    }
  }
  return [...byName.values()];
};

const WalletPicker = ({
  available,
  hasConnected,
}: {
  available: ReadonlyArray<WalletAdapter>;
  hasConnected: boolean;
}) => {
  const connect = useConnectWallet();

  if (available.length === 0 && !hasConnected) {
    return (
      <section className="rounded-lg border border-neutral-200 bg-neutral-50 p-6">
        <h2 className="font-semibold">No wallets detected</h2>
        <p className="mt-2 text-sm text-neutral-600">
          Install a browser wallet to get started. Try{" "}
          <a
            className="text-blue-600 underline"
            href="https://metamask.io/download"
            rel="noopener noreferrer"
            target="_blank"
          >
            MetaMask
          </a>{" "}
          (EVM) or{" "}
          <a
            className="text-blue-600 underline"
            href="https://phantom.app/download"
            rel="noopener noreferrer"
            target="_blank"
          >
            Phantom
          </a>{" "}
          (Solana).
        </p>
      </section>
    );
  }
  if (available.length === 0) {
    return null;
  }

  const brands = groupByBrand(available);

  return (
    <section>
      <h2 className="mb-3 font-semibold">{hasConnected ? "Connect another" : "Available wallets"}</h2>
      <ul className="space-y-2">
        {brands.map((brand) => (
          <li key={brand.name}>
            <WalletBrandRow brand={brand} connect={connect} />
          </li>
        ))}
      </ul>
    </section>
  );
};

const WalletBrandRow = ({
  brand,
  connect,
}: {
  brand: WalletBrand;
  connect: (id: string) => void;
}) => (
  <div className="rounded-lg border border-neutral-200 bg-white px-4 py-3">
    <div className="flex items-center justify-between gap-3">
      <span className="flex items-center gap-3">
        {brand.icon ? <img alt="" className="h-6 w-6 rounded" src={brand.icon} /> : null}
        <span className="font-medium">{brand.name}</span>
      </span>
      <span className="flex gap-2">
        {brand.adapters.map((adapter) => (
          <button
            className="rounded-md border border-neutral-300 px-2 py-1 font-mono text-xs uppercase hover:bg-neutral-50"
            key={adapter.id}
            onClick={() => connect(adapter.id)}
            type="button"
          >
            {adapter.chainPlatform}
          </button>
        ))}
      </span>
    </div>
  </div>
);

export default Page;
