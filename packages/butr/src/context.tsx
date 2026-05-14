import React from "react";
import type { WalletManagerConfig } from "@butr/core";
import { WalletManagerProvider as BaseWalletManagerProvider, useWalletStoreContext } from "@butr/react";
import {
  type AutoWalletManagerProviderProps,
  type DiscoverOptions,
  AutoWalletManagerProvider,
  useDiscoveredWallets,
} from "@butr/wallets";

/**
 * Backwards-compatible butr provider that supports both manual and auto
 * modes. Manual mode delegates straight to `@butr/react`; auto mode
 * delegates to `@butr/wallets`'s `AutoWalletManagerProvider`.
 *
 * This is a compatibility shim during the migration. New code should
 * import `WalletManagerProvider` from `@butr/react` (manual) or
 * `AutoWalletManagerProvider` from `@butr/wallets` (auto-discovery).
 */
type AutoProviderProps = AutoWalletManagerProviderProps & { auto: true | DiscoverOptions };
type ManualProviderProps = { auto?: false; children: React.ReactNode; config: WalletManagerConfig };
type WalletManagerProviderProps = AutoProviderProps | ManualProviderProps;

const WalletManagerProvider: React.FC<WalletManagerProviderProps> = (props) => {
  if (!props.auto) {
    return (
      <BaseWalletManagerProvider config={props.config}>{props.children}</BaseWalletManagerProvider>
    );
  }
  const { auto: _auto, ...rest } = props;
  return <AutoWalletManagerProvider auto={props.auto} {...rest} />;
};

export type { AutoProviderProps, ManualProviderProps, WalletManagerProviderProps };
export { WalletManagerProvider, useDiscoveredWallets, useWalletStoreContext };
