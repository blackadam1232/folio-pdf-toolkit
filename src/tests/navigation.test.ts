import { setupTestEnvironment } from "./testEnv";
setupTestEnvironment();

import { describe, it, expect, beforeEach } from "vitest";
import { router } from "../lib/router";

describe("Router & History API Navigation", () => {
  beforeEach(() => {
    (window.history as any).reset?.();
    window.history.replaceState({ folio: true, toolId: "home", stage: "upload" }, "", "/");
  });

  it("parses root path as home view", () => {
    router.navigate({ toolId: "home", stage: "upload", replace: true });
    const route = router.getRoute();
    expect(route.toolId).toBe("home");
    expect(route.path).toBe("/");
    expect(route.isUnknown).toBe(false);
  });

  it("navigates to tool routes and tracks stages cleanly", () => {
    // 1. Home -> Compress PDF
    router.navigate({ toolId: "compress-pdf", stage: "upload" });
    let route = router.getRoute();
    expect(route.toolId).toBe("compress-pdf");
    expect(route.stage).toBe("upload");
    expect(window.location.pathname).toBe("/compress-pdf");

    // 2. Select file -> Editor stage
    router.navigate({ toolId: "compress-pdf", stage: "editor" });
    route = router.getRoute();
    expect(route.toolId).toBe("compress-pdf");
    expect(route.stage).toBe("editor");
    expect(window.location.search).toContain("stage=editor");

    // 3. Start compression -> Processing stage
    router.navigate({ toolId: "compress-pdf", stage: "processing" });
    route = router.getRoute();
    expect(route.toolId).toBe("compress-pdf");
    expect(route.stage).toBe("processing");
    expect(window.location.search).toContain("stage=processing");

    // 4. Complete compression -> Result stage with replace
    router.navigate({ toolId: "compress-pdf", stage: "result", replace: true });
    route = router.getRoute();
    expect(route.toolId).toBe("compress-pdf");
    expect(route.stage).toBe("result");
    expect(window.location.search).toContain("stage=result");
  });

  it("handles history-backed overlays without navigating away from page", () => {
    router.navigate({ toolId: "compress-pdf", stage: "editor" });
    expect(router.getRoute().overlay).toBeNull();

    // Open preview overlay
    router.openOverlay("preview");
    expect(router.getRoute().overlay).toBe("preview");
    expect(router.getRoute().toolId).toBe("compress-pdf");
    expect(router.getRoute().stage).toBe("editor");

    // Close preview overlay
    router.closeOverlay();
    expect(router.getRoute().overlay).toBeNull();
    expect(router.getRoute().toolId).toBe("compress-pdf");
    expect(router.getRoute().stage).toBe("editor");
  });

  it("detects unknown routes and flags isUnknown", () => {
    window.history.replaceState({}, "", "/invalid-nonexistent-tool");
    window.dispatchEvent(new PopStateEvent("popstate"));
    const route = router.getRoute();
    expect(route.isUnknown).toBe(true);
  });
});
