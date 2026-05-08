"use client";

import { ConnectionSection } from "../sections/connection";
import { InternalsSection } from "../sections/internals";
import { WalletsSection } from "../sections/wallets";

const Page = () => (
  <main style={{ fontFamily: "system-ui, sans-serif", margin: "0 auto", maxWidth: 720 }}>
    <header style={{ padding: 16 }}>
      <h1>butr · Next.js</h1>
    </header>
    <ConnectionSection />
    <WalletsSection />
    <InternalsSection />
  </main>
);

export default Page;
