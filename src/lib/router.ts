import { useSyncExternalStore } from "react";
import { ToolId } from "../types";

export type RouteStage = "upload" | "editor" | "processing" | "result";

export interface RouteState {
  path: string;
  toolId: ToolId | "home" | null;
  stage: RouteStage;
  overlay: string | null;
  isUnknown: boolean;
  historyLength: number;
}

export interface NavigateOptions {
  toolId?: ToolId | "home";
  stage?: RouteStage;
  overlay?: string | null;
  replace?: boolean;
}

const VALID_TOOLS: Set<string> = new Set([
  "images-to-pdf",
  "merge-pdf",
  "split-pdf",
  "rotate-pdf",
  "pdf-to-images",
  "organize-pdf",
  "page-numbers",
  "watermark",
  "compress-pdf",
]);

let entryCounter = 0;

function parseCurrentLocation(): RouteState {
  if (typeof window === "undefined") {
    return {
      path: "/",
      toolId: "home",
      stage: "upload",
      overlay: null,
      isUnknown: false,
      historyLength: 1,
    };
  }

  const pathname = window.location.pathname.replace(/\/+$/, "") || "/";
  const searchParams = new URLSearchParams(window.location.search);
  const stageParam = searchParams.get("stage") as RouteStage | null;
  const overlayParam = searchParams.get("overlay");
  const state = window.history.state || {};

  let toolId: ToolId | "home" | null = "home";
  let isUnknown = false;

  if (pathname === "/" || pathname === "") {
    toolId = "home";
  } else {
    const segment = pathname.startsWith("/") ? pathname.slice(1) : pathname;
    if (VALID_TOOLS.has(segment)) {
      toolId = segment as ToolId;
    } else {
      toolId = null;
      isUnknown = true;
    }
  }

  const validStages: RouteStage[] = ["upload", "editor", "processing", "result"];
  const stage: RouteStage = (stageParam && validStages.includes(stageParam))
    ? stageParam
    : (state.stage && validStages.includes(state.stage))
    ? state.stage
    : "upload";

  const overlay = state.overlay || overlayParam || null;

  return {
    path: pathname,
    toolId,
    stage,
    overlay,
    isUnknown,
    historyLength: window.history.length,
  };
}

let currentState: RouteState = parseCurrentLocation();
const listeners = new Set<() => void>();
let popstateRegistered = false;

function ensurePopstateListener() {
  if (typeof window !== "undefined" && !popstateRegistered) {
    window.addEventListener("popstate", () => {
      notify();
    });
    popstateRegistered = true;

    // Ensure initial history state has folio marker
    if (window.history && (!window.history.state || !window.history.state.folio)) {
      const initial = parseCurrentLocation();
      entryCounter++;
      window.history.replaceState(
        {
          folio: true,
          toolId: initial.toolId,
          stage: initial.stage,
          overlay: initial.overlay,
          entryId: entryCounter,
        },
        "",
        window.location.href
      );
    }
  }
}

function areStatesEqual(a: RouteState, b: RouteState): boolean {
  return (
    a.path === b.path &&
    a.toolId === b.toolId &&
    a.stage === b.stage &&
    a.overlay === b.overlay &&
    a.isUnknown === b.isUnknown
  );
}

function updateState() {
  const next = parseCurrentLocation();
  if (!areStatesEqual(currentState, next)) {
    currentState = next;
    return true;
  }
  return false;
}

function notify() {
  if (updateState()) {
    listeners.forEach((listener) => listener());
  }
}

ensurePopstateListener();

export const router = {
  getRoute(): RouteState {
    ensurePopstateListener();
    updateState();
    return currentState;
  },

  navigate(options: NavigateOptions) {
    if (typeof window === "undefined") return;

    const current = parseCurrentLocation();
    const targetToolId = options.toolId !== undefined ? options.toolId : current.toolId;
    const targetStage = options.stage !== undefined ? options.stage : current.stage;
    const targetOverlay = options.overlay !== undefined ? options.overlay : null;

    let targetPath = "/";
    if (targetToolId && targetToolId !== "home") {
      targetPath = `/${targetToolId}`;
    }

    const params = new URLSearchParams();
    if (targetStage && targetStage !== "upload" && targetToolId !== "home") {
      params.set("stage", targetStage);
    }
    if (targetOverlay) {
      params.set("overlay", targetOverlay);
    }

    const queryString = params.toString();
    const targetUrl = queryString ? `${targetPath}?${queryString}` : targetPath;

    entryCounter++;
    const stateObj = {
      folio: true,
      toolId: targetToolId,
      stage: targetStage,
      overlay: targetOverlay,
      entryId: entryCounter,
    };

    if (options.replace) {
      window.history.replaceState(stateObj, "", targetUrl);
    } else {
      window.history.pushState(stateObj, "", targetUrl);
    }

    notify();
    window.scrollTo({ top: 0, behavior: "smooth" });
  },

  openOverlay(overlayName: string) {
    if (typeof window === "undefined") return;
    const current = parseCurrentLocation();
    if (current.overlay === overlayName) return;

    const targetToolId = current.toolId;
    let targetPath = "/";
    if (targetToolId && targetToolId !== "home") {
      targetPath = `/${targetToolId}`;
    }

    const params = new URLSearchParams(window.location.search);
    params.set("overlay", overlayName);
    const targetUrl = `${targetPath}?${params.toString()}`;

    entryCounter++;
    window.history.pushState(
      {
        folio: true,
        toolId: current.toolId,
        stage: current.stage,
        overlay: overlayName,
        entryId: entryCounter,
      },
      "",
      targetUrl
    );

    notify();
  },

  closeOverlay() {
    if (typeof window === "undefined") return;
    const current = parseCurrentLocation();
    if (!current.overlay) return;

    if (window.history.state && window.history.state.overlay) {
      window.history.back();
    } else {
      const targetToolId = current.toolId;
      let targetPath = "/";
      if (targetToolId && targetToolId !== "home") {
        targetPath = `/${targetToolId}`;
      }
      const params = new URLSearchParams(window.location.search);
      params.delete("overlay");
      const queryString = params.toString();
      const targetUrl = queryString ? `${targetPath}?${queryString}` : targetPath;

      window.history.replaceState(
        {
          folio: true,
          toolId: current.toolId,
          stage: current.stage,
          overlay: null,
          entryId: entryCounter,
        },
        "",
        targetUrl
      );
      notify();
    }
  },

  back() {
    if (typeof window !== "undefined") {
      window.history.back();
    }
  },

  forward() {
    if (typeof window !== "undefined") {
      window.history.forward();
    }
  },

  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
};

export function useRouter(): RouteState {
  return useSyncExternalStore(
    router.subscribe,
    router.getRoute,
    () => ({
      path: "/",
      toolId: "home",
      stage: "upload",
      overlay: null,
      isUnknown: false,
      historyLength: 1,
    })
  );
}
