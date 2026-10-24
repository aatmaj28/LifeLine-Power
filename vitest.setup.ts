import { expect } from "vitest";
import * as matchers from "@testing-library/jest-dom/matchers";
import * as axeMatchers from "vitest-axe/matchers";

// Register DOM assertion matchers (used by jsdom component/axe tests).
// Importing these is safe under the node environment; they only exercise the
// DOM when actually called, which node-environment tests never do.
expect.extend(matchers);
expect.extend(axeMatchers);
