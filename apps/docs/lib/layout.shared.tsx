import type { BaseLayoutProps } from "fumadocs-ui/layouts/shared";
import Image from "next/image";

const GITHUB_URL = "https://github.com/pedroapfilho/butr";

/**
 * Layout options shared between the docs layout and the home layout.
 * The nav title renders the butr brand mark, swapping the light/dark
 * SVG variant with the active theme.
 */
export const baseOptions = (): BaseLayoutProps => ({
  githubUrl: GITHUB_URL,
  nav: {
    title: (
      <>
        <Image
          alt="butr"
          className="h-5 w-auto dark:hidden"
          height={20}
          priority
          src="/butr-logo-light.svg"
          width={80}
        />
        <Image
          alt="butr"
          className="hidden h-5 w-auto dark:block"
          height={20}
          priority
          src="/butr-logo-dark.svg"
          width={80}
        />
      </>
    ),
    transparentMode: "top",
  },
});
