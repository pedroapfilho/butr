import type { ReactNode } from "react";
import { WalletProvider } from "../wallet-provider";

export const metadata = {
  title: "butr · Next.js",
};

const RootLayout = ({ children }: { children: ReactNode }) => (
  <html lang="en">
    <body style={{ margin: 0 }}>
      <WalletProvider>{children}</WalletProvider>
    </body>
  </html>
);

export default RootLayout;
