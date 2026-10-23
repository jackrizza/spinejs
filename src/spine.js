class Spine {
    constructor(routes, options = {}) {
        if (!Array.isArray(routes)) {
            options = routes || {};
            routes = options.routes || [];
        }
        this.active_route = "";
        this.routes = routes;
        this.root = options.root || "#app";
        this.store = options.store;
        this.defaultRoute = options.defaultRoute || "home";
        this.onError = options.onError;
        this.mounted_tree = null;
        this._treeMount = null;
        this._treeElement = null;
        this.current = null;
        this._navigation = null;
        this._listening = false;
        this._hashchange = () => {
            this.setActiveRoute(window.location.hash.slice(1) || this.defaultRoute);
            this.renderRoute();
        };
    }

    setActiveRoute(route) {
        this.active_route = String(route).replace(/^#/, "");
    }

    _element() {
        const element = typeof this.root === "string" ? document.querySelector(this.root) : this.root;
        if (!element) throw new Error(`Spine requires a root element (${this.root})`);
        return element;
    }

    _match(path) {
        // Prefer static routes to parameter/wildcard routes regardless of order.
        const exact = this.routes.find(route => (route.path || route.key) === path);
        if (exact) return { route: exact, params: {} };
        for (const route of this.routes) {
            const pattern = (route.path || route.key).split("/");
            const segments = path.split("/");
            const params = {};
            let index = 0;
            let matches = true;
            for (; index < pattern.length; index++) {
                const part = pattern[index];
                if (part.startsWith("*")) {
                    if (index !== pattern.length - 1) throw new Error("Route wildcard must be the last segment");
                    params[part.slice(1) || "path"] = segments.slice(index).map(decodeURIComponent).join("/");
                    index = segments.length;
                    break;
                }
                if (segments[index] === undefined) { matches = false; break; }
                if (part.startsWith(":")) params[part.slice(1)] = decodeURIComponent(segments[index]);
                else if (part !== segments[index]) { matches = false; break; }
            }
            if (matches && index === segments.length && pattern.some(part => /^[:*]/.test(part))) {
                return { route, params };
            }
        }
        return null;
    }

    _failed(error, navigation, app) {
        if (this._navigation !== navigation || navigation.controller.signal.aborted) return;
        navigation.controller.abort();
        this.mounted_tree?.dispose(this._treeMount);
        this.mounted_tree = null;
        this.current = null;
        if (this.onError) this.onError(error, this);
        else console.error(error);
        const message = document.createElement("div");
        message.className = "error message";
        message.textContent = error.message || String(error);
        app.replaceChildren(message);
    }

    renderRoute() {
        const app = this._element();
        if (!this.active_route) {
            const store = this.store || (typeof state !== "undefined" ? state : null);
            const saved = store?.get("current_url_hash", this.defaultRoute);
            this.active_route = typeof saved === "string" && saved ? saved : this.defaultRoute;
        }
        this._navigation?.controller.abort();
        const navigation = { controller: new AbortController() };
        this._navigation = navigation;
        try {
            const match = this._match(this.active_route);
            if (!match) throw new Error(`Unknown route: ${this.active_route}`);
            const { route, params } = match;
            const context = { path: this.active_route, params, signal: navigation.controller.signal,
                store: this.store, router: this };
            const retained = this.current?.route === route && this.mounted_tree === route.tree &&
                this._treeMount === route.tree.component._mount;
            if (!retained) {
                this.mounted_tree?.dispose(this._treeMount);
                this.mounted_tree = null;
                app.replaceChildren();
                this.mounted_tree = route.tree;
                let rendered;
                try { rendered = route.tree.render(context); }
                finally { this._treeMount = route.tree.component._mount; }
                this._treeElement = rendered;
                app.appendChild(rendered);
                route.tree.component._notifyMounted?.(this._treeMount);
            }
            this.current = { route, context };
            const updated = route.update?.(context);
            if (!retained) route.tree.onload(context);
            if (updated && typeof updated.then === "function") {
                return Promise.resolve(updated).catch(error => this._failed(error, navigation, app));
            }
            return context;
        } catch (error) {
            this._failed(error, navigation, app);
        }
    }

    start() {
        if (!this._listening) {
            window.addEventListener("hashchange", this._hashchange);
            this._listening = true;
        }
        this._hashchange();
        return this;
    }

    stop() {
        if (this._listening) window.removeEventListener("hashchange", this._hashchange);
        this._listening = false;
        this._navigation?.controller.abort();
    }

    dispose() {
        this.stop();
        const element = this._treeElement;
        this.mounted_tree?.dispose(this._treeMount);
        this.mounted_tree = null;
        this.current = null;
        this._treeMount = null;
        this._treeElement = null;
        element?.remove();
    }
}
