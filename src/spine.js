class Spine {
    constructor(routes) {
        this.active_route = "";
        this.routes = routes;
        this.mounted_tree = null;
    }

    setActiveRoute(route) {
        this.active_route = route;
    }

    renderRoute() {
        if (!this.active_route) {
            const savedRoute = typeof state !== "undefined" ? state.get("current_url_hash", "home") : "home";
            this.active_route = typeof savedRoute === "string" && savedRoute ? savedRoute : "home";
        }
        const app = document.getElementById("app");
        if (!app) throw new Error("Spine requires an #app element");
        this.mounted_tree?.dispose();
        this.mounted_tree = null;
        app.replaceChildren();
        const route = this.routes.find(route => route.key === this.active_route);
        try {
            if (!route) throw new Error(`Unknown route: ${this.active_route}`);
            this.mounted_tree = route.tree;
            app.appendChild(route.tree.render());
            route.tree.onload();
        } catch (error) {
            this.mounted_tree?.dispose();
            this.mounted_tree = null;
            console.error(error);
            const message = document.createElement("div");
            message.className = "error message";
            message.textContent = error.message;
            app.replaceChildren(message);
        }
    }
}
