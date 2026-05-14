import { useEffect, useMemo, useState } from "react";
import { type Address, type EIP1193Provider, custom, formatEther, http, parseEther } from "viem";
import { sepolia } from "viem/chains";
import {
  type Config,
  createConfig,
  getBalance,
  sendTransaction,
  signMessage,
} from "@wagmi/core";
import { mock } from "@wagmi/connectors";
import {
  useActiveWallet,
  useConnectWallet,
  useDisconnectWallet,
  useIsHydrated,
} from "@butr/react";
import { useDiscoveredWallets } from "./wallet-provider";

const BURN_ADDRESS: Address = "0x000000000000000000000000000000000000dEaD";

// One wagmi Config per active wallet. The trick: we bridge butr's
// EIP-1193 provider into wagmi via the `mock` connector — wagmi expects
// connectors to expose a provider getter, and `mock` lets us hand it
// one directly. From there every @wagmi/core action works exactly like
// it would with a wagmi-native connector. Hooks via @wagmi/react would
// work the same way; this demo uses the imperative API to keep the
// integration boundary readable.
const buildWagmiConfig = (provider: EIP1193Provider, account: Address): Config =>
  createConfig({
    chains: [sepolia],
    connectors: [
      mock({
        accounts: [account],
        features: { defaultConnected: true },
      }),
    ],
    transports: {
      [sepolia.id]: custom(provider),
    },
  });

const App = () => (
  <main className="mx-auto max-w-2xl px-6 py-10 font-sans text-neutral-900">
    <header className="mb-8">
      <h1 className="text-3xl font-bold tracking-tight">butr + wagmi</h1>
      <p className="mt-1 text-sm text-neutral-500">
        butr discovers and manages the wallet connection (EIP-6963 + multi-platform
        pool). wagmi (via <code>@wagmi/core</code>) handles chain reads, signing, and
        tx submission against the same EIP-1193 provider butr exposes through{" "}
        <code>wallet.connector.getSigner()</code>.
      </p>
    </header>
    <Content />
  </main>
);

const Content = () => {
  const isHydrated = useIsHydrated();
  const active = useActiveWallet();
  const connect = useConnectWallet();
  const disconnect = useDisconnectWallet();
  const discovered = useDiscoveredWallets();

  if (!isHydrated) {
    return <p className="text-sm text-neutral-500">Loading…</p>;
  }

  if (!active) {
    return (
      <section className="space-y-3">
        <h2 className="font-semibold">Available wallets</h2>
        {discovered.length === 0 ? (
          <p className="text-sm text-neutral-500">
            No EIP-6963 wallets detected. Install MetaMask, Rabby, or another EVM browser
            wallet and refresh.
          </p>
        ) : (
          <ul className="space-y-2">
            {discovered.map((wallet) => (
              <li key={wallet.id}>
                <button
                  className="flex w-full items-center gap-3 rounded-lg border border-neutral-200 bg-white px-4 py-3 text-left hover:bg-neutral-50"
                  onClick={() => void connect(wallet.id)}
                  type="button"
                >
                  {wallet.icon ? (
                    <img alt="" className="h-6 w-6 rounded" src={wallet.icon} />
                  ) : null}
                  <span className="font-medium">{wallet.name}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    );
  }

  return <Connected wallet={active} onDisconnect={() => disconnect(active.connector.id)} />;
};

const Connected = ({
  onDisconnect,
  wallet,
}: {
  onDisconnect: () => void;
  wallet: ReturnType<typeof useActiveWallet> & object;
}) => {
  const [wagmiConfig, setWagmiConfig] = useState<Config | null>(null);
  const [balance, setBalance] = useState<string>("…");
  const [signature, setSignature] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const account: Address = useMemo(
    () => wallet.account.walletAddress as Address,
    [wallet.account.walletAddress],
  );

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const provider = (await wallet.connector.getSigner()) as EIP1193Provider;
        if (cancelled) return;
        setWagmiConfig(buildWagmiConfig(provider, account));
      } catch (e) {
        if (!cancelled) setError(formatError(e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [account, wallet.connector]);

  useEffect(() => {
    if (!wagmiConfig) return;
    let cancelled = false;
    void (async () => {
      try {
        const result = await getBalance(wagmiConfig, { address: account });
        if (!cancelled) setBalance(`${formatEther(result.value)} ${result.symbol}`);
      } catch (e) {
        if (!cancelled) setBalance("error");
        console.warn("getBalance failed:", e);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [account, wagmiConfig]);

  const handleSign = async () => {
    if (!wagmiConfig) return;
    setError(null);
    try {
      const sig = await signMessage(wagmiConfig, { message: "Hello from butr + wagmi" });
      setSignature(sig);
    } catch (e) {
      setError(formatError(e));
    }
  };

  const handleSendTx = async () => {
    if (!wagmiConfig) return;
    setError(null);
    try {
      const hash = await sendTransaction(wagmiConfig, {
        chainId: sepolia.id,
        to: BURN_ADDRESS,
        value: parseEther("0"),
      });
      setTxHash(hash);
    } catch (e) {
      setError(formatError(e));
    }
  };

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between rounded-lg border border-emerald-200 bg-emerald-50 p-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-emerald-700">Connected</p>
          <p className="font-mono text-sm text-neutral-900">{wallet.connector.name}</p>
          <p className="font-mono text-xs text-neutral-500">{account}</p>
        </div>
        <button
          className="rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-sm hover:bg-neutral-50"
          onClick={onDisconnect}
          type="button"
        >
          Disconnect
        </button>
      </div>
      <Row label="Network">Sepolia (via wagmi)</Row>
      <Row label="Balance">{balance}</Row>
      <div className="flex flex-wrap gap-2">
        <button
          className="rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-sm hover:bg-neutral-50 disabled:opacity-50"
          disabled={!wagmiConfig}
          onClick={() => void handleSign()}
          type="button"
        >
          Sign &quot;Hello from butr + wagmi&quot;
        </button>
        <button
          className="rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-sm hover:bg-neutral-50 disabled:opacity-50"
          disabled={!wagmiConfig}
          onClick={() => void handleSendTx()}
          type="button"
        >
          Send 0 ETH to burn address
        </button>
      </div>
      {signature ? (
        <Row label="Signature">
          <code className="break-all font-mono text-xs">{signature}</code>
        </Row>
      ) : null}
      {txHash ? (
        <Row label="Tx hash">
          <a
            className="break-all font-mono text-xs text-blue-600 hover:underline"
            href={`https://sepolia.etherscan.io/tx/${txHash}`}
            rel="noreferrer noopener"
            target="_blank"
          >
            {txHash}
          </a>
        </Row>
      ) : null}
      {error ? (
        <p className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>
      ) : null}
    </section>
  );
};

const Row = ({ children, label }: { children: React.ReactNode; label: string }) => (
  <div className="flex items-baseline gap-3 rounded-lg border border-neutral-200 bg-white p-4">
    <span className="w-28 shrink-0 text-xs font-medium uppercase tracking-wide text-neutral-500">
      {label}
    </span>
    <span className="text-sm text-neutral-900">{children}</span>
  </div>
);

const formatError = (e: unknown): string => {
  if (e instanceof Error) return e.message;
  return String(e);
};

export { App };
