import { useWalletMode } from "butr";

const ModeSection = () => {
  const mode = useWalletMode();
  return (
    <section style={{ borderBottom: "1px solid #ddd", padding: 16 }}>
      <h2>Mode</h2>
      <p>
        current: <strong>{mode}</strong>
      </p>
      <p style={{ color: "#666", fontSize: 12 }}>
        Mode is derived from connector type (smart vs external). Connect a wallet above to change
        it.
      </p>
    </section>
  );
};

export { ModeSection };
