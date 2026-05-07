import { useWalletMode } from "butr";

const ModeSection = () => {
  const mode = useWalletMode();
  return (
    <section style={{ padding: 16, borderBottom: "1px solid #ddd" }}>
      <h2>Mode</h2>
      <p>
        current: <strong>{mode}</strong>
      </p>
      <p style={{ fontSize: 12, color: "#666" }}>
        Mode is derived from connector type (smart vs external). Connect a wallet above to change
        it.
      </p>
    </section>
  );
};

export { ModeSection };
