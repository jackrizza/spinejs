function makeid(length) {
    let result = '';
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    const charactersLength = characters.length;
    let counter = 0;
    while (counter < length) {
        result += characters.charAt(Math.floor(Math.random() * charactersLength));
        counter += 1;
    }
    return result;
}

class SingleFetch {
    constructor(url, after = {}) {
        this.isNotAComponent = true;
        this._disposed = false;
        this._controller = typeof AbortController === "function" ? new AbortController() : null;
        // Preserve new SingleFetch(url).then(...) and expose request cancellation.
        const request = this.fetcher(url).catch(error => ({ Error: error }));
        request.dispose = () => this.dispose();
        return request;
    }

    isOnline() {
        return window.navigator.onLine !== false;
    }

    noAfterFallback() {
        "You need a after function."
    }

    readCache(url) {
        try {
            return JSON.parse(localStorage.getItem(url));
        } catch (error) {
            return null;
        }
    }

    async fetcher(url) {
        if (!this.isOnline()) return this.readCache(url);
        const options = this._controller ? { signal: this._controller.signal } : {};
        const response = await fetch(url, options);
        const data = await response.json();
        if (this._disposed) {
            const error = new Error("Request disposed");
            error.name = "AbortError";
            throw error;
        }
        try {
            localStorage.setItem(url, JSON.stringify(data));
        } catch (error) {
            // Cache availability must not prevent displaying fresh data.
        }
        return data;
    }

    dispose() {
        if (this._disposed) return;
        this._disposed = true;
        if (this._controller) this._controller.abort();
    }
}

class Fetch {
    constructor({ url = "", runtime = "", callback = {} }) {
        this.key = makeid(16);
        this.url = url;
        this.runtime = runtime;
        this.callback = callback;
        this.isNotAComponent = true;
        this._mount = null;
    }

    _disposeChild(owned) {
        if (owned && typeof owned.component.dispose === "function") {
            owned.component.dispose(owned.mount);
        }
    }

    async execute(mount = this._mount) {
        if (!mount || this._mount !== mount) return;
        const sequence = ++mount.sequence;
        if (mount.request) mount.request.dispose();
        const request = new SingleFetch(this.url);
        mount.request = request;
        let owned = null;
        try {
            const data = await request;
            if (this._mount !== mount || mount.sequence !== sequence) return;
            mount.request = null;

            // The parent renders the placeholder. Retain its element identity;
            // an element with the same ID may belong to a newer mount.
            if (!mount.element) {
                mount.placeholder.mount = mount.placeholder.component._mount;
                mount.element = mount.placeholder.mount && mount.placeholder.mount.element;
            }
            if (!mount.element) return;

            const callback = new this.callback({ key: this.key, table_data: data });
            const component = callback.table();
            owned = { component, mount: null };
            mount.pending.add(owned);
            let rendered;
            try {
                rendered = component.render();
            } finally {
                owned.mount = component._mount;
            }
            const element = await rendered;
            if (this._mount !== mount || mount.sequence !== sequence) return;

            this._disposeChild(mount.output);
            this._disposeChild(mount.placeholder);
            mount.element.replaceChildren(element);
            mount.element.className = "";
            mount.output = owned;
        } catch (error) {
            if (this._mount === mount && mount.sequence === sequence) console.error(error);
        } finally {
            if (owned) {
                mount.pending.delete(owned);
                if (owned !== mount.output) this._disposeChild(owned);
            }
            if (mount.request === request) mount.request = null;
        }
    }

    // Async children return a component for their parent to render. Publish the
    // mount synchronously so the parent can capture it before awaiting this call.
    async render() {
        this.dispose();
        const mount = {
            idle: null,
            interval: null,
            request: null,
            placeholder: null,
            output: null,
            pending: new Set(),
            element: null,
            sequence: 0
        };
        this._mount = mount;
        try {
            const placeholder = new this.callback({ key: this.key }).placeholder();
            mount.placeholder = { component: placeholder, mount: null };
            const start = () => {
                mount.idle = null;
                if (this._mount !== mount) return;
                if (this.runtime === "" || this.runtime === "slow") this.execute(mount);
                if (this.runtime === "slow") {
                    mount.interval = window.setInterval(() => {
                        // Let slow requests finish instead of aborting them on every tick.
                        if (!mount.request) this.execute(mount);
                    }, 1500);
                }
            };
            if (typeof window.requestIdleCallback === "function") {
                mount.idle = {
                    kind: "idle",
                    id: window.requestIdleCallback(start, { timeout: 4000 })
                };
            } else {
                mount.idle = { kind: "timeout", id: window.setTimeout(start, 0) };
            }
            return placeholder;
        } catch (error) {
            this.dispose(mount);
            throw error;
        }
    }

    dispose(mount = this._mount) {
        if (!mount || this._mount !== mount) return;
        this._mount = null;
        if (mount.idle) {
            if (mount.idle.kind === "idle") {
                if (typeof window.cancelIdleCallback === "function") {
                    window.cancelIdleCallback(mount.idle.id);
                }
            } else {
                window.clearTimeout(mount.idle.id);
            }
        }
        if (mount.interval !== null) window.clearInterval(mount.interval);
        if (mount.request) mount.request.dispose();
        if (mount.placeholder && !mount.placeholder.mount) {
            mount.placeholder.mount = mount.placeholder.component._mount;
        }
        this._disposeChild(mount.placeholder);
        this._disposeChild(mount.output);
        for (const owned of mount.pending) this._disposeChild(owned);
        mount.pending.clear();
    }
}
