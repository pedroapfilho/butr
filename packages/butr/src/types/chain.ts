/**
 * Minimal chain shape that butr needs to function.
 * Follows the CAIP-2 chain identifier standard.
 *
 * Consumers extend this with app-specific fields (logos, block explorers, etc.)
 * via structural typing — butr never inspects beyond these 4 fields.
 */
type ChainBase = {
  /** CAIP-2 identifier, e.g. "eip155:1", "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp" */
  id: string;
  /** Human-readable name, e.g. "Ethereum", "Solana" */
  name: string;
  /** CAIP-2 namespace, e.g. "eip155", "solana" */
  namespace: string;
  /** CAIP-2 reference, e.g. "1", "5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp" */
  reference: string;
};

export type { ChainBase };
