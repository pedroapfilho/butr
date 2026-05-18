import "@/app/global.css";
import { RootProvider } from "fumadocs-ui/provider/next";
import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  description:
    "Documentation for butr: multi-chain (EVM + Solana) wallet management primitives for React.",
  metadataBase: new URL("https://docs.usebutr.com"),
  title: {
    default: "butr — multi-chain wallet management for React",
    template: "%s · butr docs",
  },
};

const RootLayout = ({ children }: { children: ReactNode }) => (
  <html lang="en" suppressHydrationWarning>
    <body className="flex min-h-screen flex-col">
      <RootProvider search={{ options: { type: "static" } }}>{children}</RootProvider>
    </body>
  </html>
);

export default RootLayout;
