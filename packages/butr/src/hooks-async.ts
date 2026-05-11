import { useCallback, useEffect, useReducer } from "react";
import { useStoreWithEqualityFn } from "zustand/traditional";
import { useWalletStoreContext } from "./context";
import type { Balance, ConnectedWallet } from "./types";

type AsyncState<T> =
  | { data: null; error: null; status: "idle" }
  | { data: null; error: null; status: "loading" }
  | { data: T; error: null; status: "success" }
  | { data: null; error: unknown; status: "error" };

type AsyncAction<T> =
  | { type: "reset" }
  | { type: "load" }
  | { data: T; type: "success" }
  | { error: unknown; type: "error" };

/** Pure async-lifecycle reducer. One dispatch per state transition
 *  keeps `useEffect` clear of cascading setState calls — each effect
 *  branch invokes the reducer exactly once. */
const asyncReducer = <T>(_state: AsyncState<T>, action: AsyncAction<T>): AsyncState<T> => {
  switch (action.type) {
    case "reset": {
      return { data: null, error: null, status: "idle" };
    }
    case "load": {
      return { data: null, error: null, status: "loading" };
    }
    case "success": {
      return { data: action.data, error: null, status: "success" };
    }
    case "error": {
      return { data: null, error: action.error, status: "error" };
    }
    default: {
      // Exhaustiveness check — TS errors here if `AsyncAction` grows
      // a variant without a case.
      const _exhaustive: never = action;
      void _exhaustive;
      return { data: null, error: null, status: "idle" };
    }
  }
};

const IDLE: AsyncState<never> = { data: null, error: null, status: "idle" };

const walletEqual = (a: ConnectedWallet | undefined, b: ConnectedWallet | undefined) => {
  if (a === b) {
    return true;
  }
  if (!a || !b) {
    return false;
  }
  return (
    a.connector.id === b.connector.id &&
    a.account.walletAddress === b.account.walletAddress &&
    a.account.chain.id === b.account.chain.id
  );
};

/** Subscribe to the pool entry for a connectorId. Re-renders only when the
 *  resolved wallet's identity (connectorId / address / chainId) changes. */
const useWalletEntry = (connectorId: string | null | undefined) => {
  const store = useWalletStoreContext();
  return useStoreWithEqualityFn(
    store,
    (state) => {
      const id = connectorId ?? state.activeConnectorId;
      return id ? state.pool.get(id) : undefined;
    },
    walletEqual,
  );
};

/**
 * Cached signer for a connector. Invalidates when `connectorId`, account
 * address, or chain id changes — so a chain switch or account switch in the
 * wallet invalidates the cached signer automatically.
 *
 * If `connectorId` is omitted (or `null`/`undefined`), the active wallet's
 * signer is returned.
 *
 * Returns `{ data, error, status }`. `status` is `"idle"` when there's no
 * wallet, `"loading"` while the connector resolves, `"success"` once the
 * signer is available, `"error"` if `getSigner()` rejected.
 */
const useSigner = (connectorId?: string | null): AsyncState<unknown> => {
  const wallet = useWalletEntry(connectorId);
  const [state, dispatch] = useReducer(asyncReducer<unknown>, IDLE);

  useEffect(() => {
    if (!wallet) {
      dispatch({ type: "reset" });
      return;
    }
    dispatch({ type: "load" });
    let cancelled = false;
    void (async () => {
      try {
        const signer = await wallet.connector.getSigner();
        if (!cancelled) {
          dispatch({ data: signer, type: "success" });
        }
      } catch (error: unknown) {
        if (!cancelled) {
          dispatch({ error, type: "error" });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [wallet]);

  return state;
};

type UseBalanceResult = AsyncState<Balance> & { refetch: () => void };

/**
 * Cached balance for a connector. Invalidates on the same events as
 * `useSigner` (connectorId / address / chainId), plus an explicit `refetch`
 * handle for poll-on-demand or after-action refreshes.
 *
 * If `connectorId` is omitted, the active wallet's balance is returned.
 * `mint` is forwarded to the connector — semantics depend on the chain.
 */
const useBalance = (connectorId?: string | null, mint?: string): UseBalanceResult => {
  const wallet = useWalletEntry(connectorId);
  const [state, dispatch] = useReducer(asyncReducer<Balance>, IDLE);
  const [counter, bumpCounter] = useReducer((n: number) => n + 1, 0);
  const refetch = useCallback(() => {
    bumpCounter();
  }, []);

  useEffect(() => {
    if (!wallet) {
      dispatch({ type: "reset" });
      return;
    }
    dispatch({ type: "load" });
    let cancelled = false;
    void (async () => {
      try {
        const balance = await wallet.connector.getBalance(mint);
        if (!cancelled) {
          dispatch({ data: balance, type: "success" });
        }
      } catch (error: unknown) {
        if (!cancelled) {
          dispatch({ error, type: "error" });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [wallet, mint, counter]);

  return { ...state, refetch };
};

export type { AsyncState, UseBalanceResult };
export { useBalance, useSigner, useWalletEntry };
