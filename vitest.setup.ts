import "@testing-library/jest-dom/vitest";

import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

afterEach(cleanup);

// jsdom reports zero-sized layout boxes; give elements a viewport so virtualized rows mount.
Object.defineProperties(HTMLElement.prototype, {
  offsetWidth: { configurable: true, get: () => 1024 },
  offsetHeight: { configurable: true, get: () => 600 },
});
