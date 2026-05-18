import { defineConfig, defineDocs } from "fumadocs-mdx/config";

export const docs = defineDocs({
  dir: "content/docs",
});

export default defineConfig({
  mdxOptions: {
    // `remarkNpm` is on by default; persist the reader's package-manager
    // choice across every code block site-wide.
    remarkNpmOptions: {
      persist: { id: "package-manager" },
    },
  },
});
