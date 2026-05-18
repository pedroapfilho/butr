import { useState } from "react";
import {
  Image,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import type { Account, ConnectedWallet, WalletAdapter } from "@butr/core";
import {
  useActiveWallet,
  useBalance,
  useConnectWallet,
  useConnectedWallets,
  useConnectionError,
  useConnectionStatus,
  useDiscoveredWallets,
  useDisconnectWallet,
  useIsHydrated,
  useRequestAccounts,
  useSetActiveConnector,
} from "@butr/react";
import { CHAINS_BY_PLATFORM } from "@butr/wallets";

// NOTE: Expo target uses React Native's StyleSheet with design tokens
// that mirror Tailwind's neutral palette and spacing. NativeWind v5
// (the Tailwind v4 port) is still in preview and has compatibility
// gaps with react-native-web 0.21; revisit once it stabilises.

const tokens = {
  emerald100: "#d1fae5",
  emerald700: "#047857",
  neutral50: "#fafafa",
  neutral100: "#f5f5f5",
  neutral200: "#e5e5e5",
  neutral300: "#d4d4d4",
  neutral500: "#737373",
  neutral600: "#525252",
  neutral700: "#404040",
  neutral900: "#171717",
  red50: "#fef2f2",
  red200: "#fecaca",
  red700: "#b91c1c",
  white: "#ffffff",
};

const Index = () => (
  <ScrollView style={styles.root}>
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.h1}>butr · Expo</Text>
        <Text style={styles.lede}>
          React Native target. EVM (EIP-6963) and SVM (Wallet Standard)
          discovery via @butr/wallets; persistence via an AsyncStorage-backed
          WalletStorage driver.
        </Text>
      </View>
      <Content />
    </View>
  </ScrollView>
);

const Content = () => {
  const isHydrated = useIsHydrated();
  const status = useConnectionStatus();
  const error = useConnectionError();
  const connected = useConnectedWallets();
  const discovered = useDiscoveredWallets();

  if (!isHydrated) {
    return <Text style={styles.muted}>Loading…</Text>;
  }

  const available = discovered.filter(
    (d) => !connected.some((c) => c.connector.id === d.id),
  );

  return (
    <View style={styles.stack}>
      <StatusBar status={status} />
      {connected.length > 0 ? <ConnectedList wallets={connected} /> : null}
      <WalletPicker available={available} hasConnected={connected.length > 0} />
      {error ? (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>
            {error.kind} — {error.message}
          </Text>
        </View>
      ) : null}
    </View>
  );
};

const StatusBar = ({ status }: { status: string }) => (
  <View style={styles.statusRow}>
    <Text style={styles.statusLabel}>Status:</Text>
    <View style={styles.statusPill}>
      <Text style={styles.statusPillText}>{status}</Text>
    </View>
  </View>
);

const ConnectedList = ({
  wallets,
}: {
  wallets: ReadonlyArray<ConnectedWallet>;
}) => (
  <View>
    <View style={styles.groupHeader}>
      <Text style={styles.h2}>Connected</Text>
      <View style={styles.countPill}>
        <Text style={styles.countPillText}>{wallets.length}</Text>
      </View>
    </View>
    <View style={styles.stackSmall}>
      {wallets.map((wallet) => (
        <ConnectedWalletCard key={wallet.connector.id} wallet={wallet} />
      ))}
    </View>
  </View>
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
    <View style={styles.activeCard}>
      <View style={styles.activeHeader}>
        <View style={styles.walletRowLeft}>
          {wallet.connector.icon ? (
            <Image
              source={{ uri: wallet.connector.icon }}
              style={styles.activeIcon}
            />
          ) : null}
          <View>
            <View style={styles.titleRow}>
              <Text style={styles.activeName}>{wallet.connector.name}</Text>
              {isActive ? (
                <View style={styles.activeBadge}>
                  <Text style={styles.activeBadgeText}>active</Text>
                </View>
              ) : null}
            </View>
            <Text style={styles.muted}>{wallet.account.chain.name}</Text>
          </View>
        </View>
        <View style={styles.actionRow}>
          {isActive ? null : (
            <Pressable
              onPress={() => setActive(wallet.connector.id)}
              style={styles.outlineButton}
            >
              <Text style={styles.outlineButtonText}>Make active</Text>
            </Pressable>
          )}
          <Pressable
            onPress={() => disconnect(wallet.connector.id)}
            style={styles.outlineButton}
          >
            <Text style={styles.outlineButtonText}>Disconnect</Text>
          </Pressable>
        </View>
      </View>
      <View style={styles.dlRow}>
        <Text style={styles.dt}>Address</Text>
        <AccountPicker wallet={wallet} />
      </View>
      <View style={styles.dlRow}>
        <Text style={styles.dt}>Balance</Text>
        <Text style={styles.dd}>{balanceText}</Text>
      </View>
      {capabilities.switchChain ? (
        <View style={styles.dlRow}>
          <Text style={styles.dt}>Chain</Text>
          <View style={styles.dd}>
            <ChainPicker wallet={wallet} />
          </View>
        </View>
      ) : null}
      {capabilities.requestAccounts ? (
        <Pressable
          onPress={() => {
            void requestAccounts(wallet.connector.id);
          }}
          style={styles.outlineButton}
        >
          <Text style={styles.outlineButtonText}>Request more accounts</Text>
        </Pressable>
      ) : null}
    </View>
  );
};

const ChainPicker = ({ wallet }: { wallet: ConnectedWallet }) => {
  const chains = CHAINS_BY_PLATFORM[wallet.connector.chainPlatform];
  return (
    <View style={styles.chainList}>
      {chains.map((chain) => {
        const isCurrent = chain.id === wallet.account.chain.id;
        return (
          <Pressable
            key={chain.id}
            onPress={() => {
              void wallet.connector.switchChain(chain);
            }}
            style={[
              styles.chainChip,
              isCurrent ? styles.chainChipCurrent : null,
            ]}
          >
            <Text
              style={
                isCurrent ? styles.chainChipTextCurrent : styles.chainChipText
              }
            >
              {chain.name}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
};

const AccountPicker = ({ wallet }: { wallet: ConnectedWallet }) => (
  <View style={styles.accountList}>
    {wallet.accounts.map((account) => (
      <AccountRow account={account} key={account.id} wallet={wallet} />
    ))}
    <Text style={styles.muted}>
      Active account is set in your wallet. Use Sign to test per-account
      signing.
    </Text>
  </View>
);

type SignState =
  | { kind: "idle" }
  | { kind: "signing" }
  | { kind: "ok" }
  | { kind: "error"; message: string };

const SIGN_MESSAGE_TEXT = "Hello from the butr demo";

const AccountRow = ({
  account,
  wallet,
}: {
  account: Account;
  wallet: ConnectedWallet;
}) => {
  const isCurrent = account.walletAddress === wallet.account.walletAddress;
  const canSign = wallet.connector.capabilities.signMessage;
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
    <View
      style={[styles.accountRow, isCurrent ? styles.accountRowCurrent : null]}
    >
      <Text
        style={isCurrent ? styles.accountAddressActive : styles.accountAddress}
      >
        {account.walletAddress}
      </Text>
      {canSign ? (
        <View style={styles.accountRowActions}>
          {state.kind === "ok" ? (
            <Text style={styles.signOk}>✓ signed</Text>
          ) : state.kind === "error" ? (
            <Text style={styles.signError}>✗ failed</Text>
          ) : null}
          <Pressable
            disabled={state.kind === "signing"}
            onPress={() => {
              void handleSign();
            }}
            style={styles.signButton}
          >
            <Text style={styles.signButtonText}>
              {state.kind === "signing" ? "…" : "Sign"}
            </Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
};

type WalletBrand = {
  adapters: Array<WalletAdapter>;
  icon: string | undefined;
  name: string;
};

const groupByBrand = (
  wallets: ReadonlyArray<WalletAdapter>,
): Array<WalletBrand> => {
  const byName = new Map<string, WalletBrand>();
  for (const wallet of wallets) {
    const key = wallet.name.toLowerCase();
    const existing = byName.get(key);
    if (existing) {
      existing.adapters.push(wallet);
      existing.icon = existing.icon ?? wallet.icon;
    } else {
      byName.set(key, {
        adapters: [wallet],
        icon: wallet.icon,
        name: wallet.name,
      });
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
      <View style={styles.emptyCard}>
        <Text style={styles.h2}>No wallets detected</Text>
        <Text style={styles.bodySmall}>
          Wallet discovery on native requires WalletConnect or a chain-specific
          SDK. The web target discovers browser-extension wallets via EIP-6963
          and the Solana Wallet Standard.
        </Text>
        <Pressable
          onPress={() => Linking.openURL("https://metamask.io/download")}
          style={styles.outlineButton}
        >
          <Text style={styles.outlineButtonText}>Install MetaMask</Text>
        </Pressable>
      </View>
    );
  }
  if (available.length === 0) {
    return null;
  }

  const brands = groupByBrand(available);

  return (
    <View>
      <Text style={styles.h2}>
        {hasConnected ? "Connect another" : "Available wallets"}
      </Text>
      <View style={[styles.stackSmall, { marginTop: 12 }]}>
        {brands.map((brand) => (
          <WalletBrandRow brand={brand} connect={connect} key={brand.name} />
        ))}
      </View>
    </View>
  );
};

const WalletBrandRow = ({
  brand,
  connect,
}: {
  brand: WalletBrand;
  connect: (id: string) => void;
}) => (
  <View style={styles.walletRow}>
    <View style={styles.walletRowLeft}>
      {brand.icon ? (
        <Image source={{ uri: brand.icon }} style={styles.walletIcon} />
      ) : null}
      <Text style={styles.walletName}>{brand.name}</Text>
    </View>
    <View style={styles.brandPlatformList}>
      {brand.adapters.map((adapter) => (
        <Pressable
          key={adapter.id}
          onPress={() => connect(adapter.id)}
          style={styles.platformChip}
        >
          <Text style={styles.platformChipText}>
            {adapter.chainPlatform.toUpperCase()}
          </Text>
        </Pressable>
      ))}
    </View>
  </View>
);

const styles = StyleSheet.create({
  accountAddress: {
    color: tokens.neutral700,
    flex: 1,
    fontFamily: "Menlo",
    fontSize: 12,
  },
  accountAddressActive: {
    color: tokens.emerald700,
    flex: 1,
    fontFamily: "Menlo",
    fontSize: 12,
  },
  accountList: { flex: 1, gap: 4 },
  accountRow: {
    alignItems: "center",
    borderColor: tokens.neutral200,
    borderRadius: 6,
    borderWidth: 1,
    flexDirection: "row",
    gap: 8,
    justifyContent: "space-between",
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  accountRowActions: { alignItems: "center", flexDirection: "row", gap: 8 },
  accountRowCurrent: {
    backgroundColor: "#ecfdf5",
    borderColor: "#a7f3d0",
  },
  signButton: {
    backgroundColor: tokens.white,
    borderColor: tokens.neutral300,
    borderRadius: 4,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  signButtonText: { color: tokens.neutral700, fontSize: 12 },
  signError: { color: tokens.red700, fontSize: 12 },
  signOk: { color: tokens.emerald700, fontSize: 12 },
  actionRow: { flexDirection: "row", gap: 8 },
  activeBadge: {
    backgroundColor: tokens.emerald100,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  activeBadgeText: {
    color: tokens.emerald700,
    fontSize: 12,
    fontWeight: "500",
  },
  activeCard: {
    backgroundColor: tokens.white,
    borderColor: tokens.neutral200,
    borderRadius: 8,
    borderWidth: 1,
    gap: 12,
    padding: 20,
  },
  activeHeader: {
    alignItems: "flex-start",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  activeIcon: { borderRadius: 4, height: 32, width: 32 },
  activeName: { color: tokens.neutral900, fontSize: 16, fontWeight: "600" },
  bodySmall: { color: tokens.neutral600, fontSize: 14, marginTop: 8 },
  brandPlatformList: { flexDirection: "row", gap: 8 },
  chainChip: {
    borderColor: tokens.neutral300,
    borderRadius: 6,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  chainChipCurrent: {
    backgroundColor: "#ecfdf5",
    borderColor: "#a7f3d0",
  },
  chainChipText: { color: tokens.neutral700, fontSize: 12 },
  chainChipTextCurrent: {
    color: tokens.emerald700,
    fontSize: 12,
    fontWeight: "500",
  },
  chainList: { flex: 1, flexDirection: "row", flexWrap: "wrap", gap: 6 },
  container: {
    marginHorizontal: "auto",
    maxWidth: 672,
    paddingHorizontal: 24,
    paddingVertical: 40,
    width: "100%",
  },
  countPill: {
    backgroundColor: tokens.neutral100,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  countPillText: {
    color: tokens.neutral500,
    fontFamily: "Menlo",
    fontSize: 12,
  },
  dd: { color: tokens.neutral900, flex: 1, fontFamily: "Menlo", fontSize: 12 },
  dlRow: { flexDirection: "row" },
  dt: { color: tokens.neutral500, fontSize: 14, width: 112 },
  emptyCard: {
    backgroundColor: tokens.neutral50,
    borderColor: tokens.neutral200,
    borderRadius: 8,
    borderWidth: 1,
    padding: 24,
  },
  errorBox: {
    backgroundColor: tokens.red50,
    borderColor: tokens.red200,
    borderRadius: 6,
    borderWidth: 1,
    padding: 12,
  },
  errorText: { color: tokens.red700, fontSize: 14 },
  groupHeader: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
    marginBottom: 12,
  },
  groupHeading: { color: tokens.neutral700, fontSize: 14, fontWeight: "500" },
  h1: {
    color: tokens.neutral900,
    fontSize: 30,
    fontWeight: "700",
    letterSpacing: -0.5,
  },
  h2: { color: tokens.neutral900, fontSize: 16, fontWeight: "600" },
  header: { marginBottom: 32 },
  lede: { color: tokens.neutral500, fontSize: 14, marginTop: 4 },
  muted: { color: tokens.neutral500, fontSize: 12 },
  outlineButton: {
    alignSelf: "flex-start",
    borderColor: tokens.neutral300,
    borderRadius: 6,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  outlineButtonText: { color: tokens.neutral700, fontSize: 14 },
  platformChip: {
    borderColor: tokens.neutral300,
    borderRadius: 6,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  platformChipText: {
    color: tokens.neutral700,
    fontFamily: "Menlo",
    fontSize: 12,
  },
  root: { backgroundColor: tokens.white, flex: 1 },
  stack: { gap: 24 },
  stackSmall: { gap: 8 },
  statusLabel: { color: tokens.neutral600, fontSize: 14, fontWeight: "500" },
  statusPill: {
    backgroundColor: tokens.neutral100,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  statusPillText: {
    color: tokens.neutral600,
    fontFamily: "Menlo",
    fontSize: 12,
  },
  statusRow: { alignItems: "center", flexDirection: "row", gap: 8 },
  titleRow: { alignItems: "center", flexDirection: "row", gap: 8 },
  walletIcon: { borderRadius: 4, height: 24, width: 24 },
  walletName: { color: tokens.neutral900, fontSize: 14, fontWeight: "500" },
  walletRow: {
    alignItems: "center",
    backgroundColor: tokens.white,
    borderColor: tokens.neutral200,
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  walletRowLeft: { alignItems: "center", flexDirection: "row", gap: 12 },
});

export default Index;
