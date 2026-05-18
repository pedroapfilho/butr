import { source } from "@/lib/source";

export const revalidate = false;

const BASE_URL = "https://docs.usebutr.com";

/**
 * Exposes the docs as an llms.txt index so language models can
 * discover every page, title, and summary in one fetch.
 */
export const GET = () => {
  const pages = source.getPages();

  const lines = [
    "# butr",
    "",
    "> Multi-chain (EVM + Solana) wallet management primitives for React.",
    "",
    "## Docs",
    "",
    ...pages.map((page) => {
      const summary = page.data.description ? `: ${page.data.description}` : "";
      return `- [${page.data.title}](${BASE_URL}${page.url})${summary}`;
    }),
    "",
  ];

  return new Response(lines.join("\n"), {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
};
