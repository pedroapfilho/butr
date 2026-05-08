import { ConnectionSection } from "./sections/connection";
import { InternalsSection } from "./sections/internals";
import { ModeSection } from "./sections/mode";
import { WalletsSection } from "./sections/wallets";

const App = () => (
  <main style={{ fontFamily: "system-ui, sans-serif", margin: "0 auto", maxWidth: 720 }}>
    <header style={{ padding: 16 }}>
      <h1>butr · Vite</h1>
    </header>
    <ConnectionSection />
    <WalletsSection />
    <ModeSection />
    <InternalsSection />
  </main>
);

export { App };
