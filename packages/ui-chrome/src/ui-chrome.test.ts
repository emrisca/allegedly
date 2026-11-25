import { describe, expect, it } from "vitest";
import { ChromeToolbar, StatusBar, WorkspaceHost } from "./index.js";

describe("@allegedly/ui-chrome package exports", () => {
  it("exports ChromeToolbar, StatusBar, and WorkspaceHost components", () => {
    expect(typeof ChromeToolbar).toBe("function");
    expect(typeof StatusBar).toBe("function");
    expect(typeof WorkspaceHost).toBe("function");
  });
});
