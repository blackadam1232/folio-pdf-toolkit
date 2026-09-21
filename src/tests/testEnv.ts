class MockHistory {
  state: any = null;
  length: number = 1;
  private stack: { state: any; url: string }[] = [];
  private pointer: number = 0;

  constructor() {
    this.reset();
  }

  reset() {
    this.stack = [{ state: { folio: true, toolId: "home", stage: "upload" }, url: "/" }];
    this.pointer = 0;
    this.state = this.stack[0].state;
    this.length = 1;
    this.updateLocation("/");
  }

  pushState(state: any, title: string, url: string) {
    this.stack = this.stack.slice(0, this.pointer + 1);
    this.stack.push({ state, url });
    this.pointer++;
    this.state = state;
    this.length = this.stack.length;
    this.updateLocation(url);
  }

  replaceState(state: any, title: string, url: string) {
    this.stack[this.pointer] = { state, url };
    this.state = state;
    this.updateLocation(url);
  }

  back() {
    if (this.pointer > 0) {
      this.pointer--;
      const entry = this.stack[this.pointer];
      this.state = entry.state;
      this.updateLocation(entry.url);
      (globalThis as any).window.dispatchEvent({ type: "popstate", state: this.state });
    }
  }

  forward() {
    if (this.pointer < this.stack.length - 1) {
      this.pointer++;
      const entry = this.stack[this.pointer];
      this.state = entry.state;
      this.updateLocation(entry.url);
      (globalThis as any).window.dispatchEvent({ type: "popstate", state: this.state });
    }
  }

  private updateLocation(url: string) {
    const parsed = new URL(url, "http://localhost");
    if ((globalThis as any).window?.location) {
      (globalThis as any).window.location.pathname = parsed.pathname;
      (globalThis as any).window.location.search = parsed.search;
      (globalThis as any).window.location.href = parsed.href;
    }
  }
}

export function setupTestEnvironment() {
  if (typeof (globalThis as any).window === "undefined") {
    const listeners: Record<string, ((e: any) => void)[]> = {};
    const mockHistory = new MockHistory();

    const mockWindow: any = {
      location: {
        pathname: "/",
        search: "",
        href: "http://localhost/",
      },
      history: mockHistory,
      scrollTo: () => {},
      addEventListener: (type: string, listener: any) => {
        if (!listeners[type]) listeners[type] = [];
        listeners[type].push(listener);
      },
      removeEventListener: (type: string, listener: any) => {
        if (listeners[type]) {
          listeners[type] = listeners[type].filter((l) => l !== listener);
        }
      },
      dispatchEvent: (event: any) => {
        const list = listeners[event.type || "popstate"] || [];
        list.forEach((l) => l(event));
        return true;
      },
    };

    (globalThis as any).window = mockWindow;

    if (typeof (globalThis as any).PopStateEvent === "undefined") {
      (globalThis as any).PopStateEvent = class PopStateEvent {
        type: string;
        state: any;
        constructor(type: string, init?: any) {
          this.type = type;
          this.state = init?.state;
        }
      };
    }

    if (!(globalThis as any).URL.createObjectURL) {
      (globalThis as any).URL.createObjectURL = (blob: any) => `blob:mock-${Math.random()}`;
      (globalThis as any).URL.revokeObjectURL = () => {};
    }
  }
}
