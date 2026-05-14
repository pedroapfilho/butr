import { useCallback, useEffect, useMemo, useReducer } from "react";
import { useStoreWithEqualityFn } from "zustand/traditional";
import type { Balance } from "@butr/core";
import { walletEqual } from "@butr/core";
import { useWalletStoreContext } from "./context";

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

/**
 * Generic async-resource hook. Encapsulates the load → fetch → cancel-
 * on-deps-change → dispatch-result lifecycle that every async wallet
 * read needs. `fn` is the request closure; pass `null` to stay idle.
 *
 * Invalidation is keyed on the identity of `fn` itself — callers
 * stabilise via `useMemo` and re-create the closure when they want a
 * refetch. This keeps the React-hooks exhaustive-deps lint rule happy
 * (the effect's deps list is the literal `[fn]`).
 *
 * Why factored out: every consumer (`useSigner`, `useBalance`, future
 * `useTokenBalance`, `useTransactionReceipt`, …) needs the exact same
 * cancellation discipline. Centralising it keeps the fragile parts
 * (`cancelled` flag, dispatch order) in one place — adding a new
 * async hook becomes a 3-line definition.
 */
const useAsyncResource = <T>(fn: (() => Promise<T>) | null): AsyncState<T> => {
  const [state, dispatch] = useReducer(asyncReducer<T>, IDLE);

  useEffect(() => {
    if (!fn) {
      dispatch({ type: "reset" });
      return;
    }
    dispatch({ type: "load" });
    let cancelled = false;
    void (async () => {
      try {
        const data = await fn();
        if (!cancelled) {
          dispatch({ data, type: "success" });
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
  }, [fn]);

  return state;
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
  // Stabilise the request closure so `useAsyncResource` only re-runs
  // when the resolved wallet identity changes (not on every render).
  const fn = useMemo(() => (wallet ? () => wallet.connector.getSigner() : null), [wallet]);
  return useAsyncResource(fn);
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
  const [counter, bumpCounter] = useReducer((n: number) => n + 1, 0);
  const refetch = useCallback(() => {
    bumpCounter();
  }, []);
  // `counter` participates in the closure identity, so calling
  // `refetch()` produces a new `fn` and `useAsyncResource` re-runs.
  const fn = useMemo(
    () => (wallet ? () => wallet.connector.getBalance(mint) : null),
    // oxlint-disable-next-line eslint-plugin-react-hooks/exhaustive-deps -- counter is the refetch trigger; not used inside the closure
    [wallet, mint, counter],
  );
  const state = useAsyncResource(fn);
  return { ...state, refetch };
};

export type { AsyncState, UseBalanceResult };
export { useBalance, useSigner, useWalletEntry };
