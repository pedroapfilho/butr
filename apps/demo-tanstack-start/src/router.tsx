import { createRouter as createTanStackRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

export function getRouter() {
  const router = createTanStackRouter({
    defaultPreload: "intent",
    defaultPreloadStaleTime: 0,
    routeTree,
    scrollRestoration: true,
  });

  return router;
}

declare module "@tanstack/react-router" {
  // oxlint-disable-next-line consistent-type-definitions -- module augmentation requires interface
  interface Register {
    router: ReturnType<typeof getRouter>;
  }
}
