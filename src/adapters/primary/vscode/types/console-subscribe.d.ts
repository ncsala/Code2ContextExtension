import type { ConsoleListener } from "../infrastructure/console/ConsoleLogInterceptor";

declare global {
  interface Console {
    /** VS Code ≥ 1.88 */
    subscribe?: (listener: ConsoleListener) => () => void;
  }
}
