class Render {
    constructor({ key = "", tag = "", classlist = [], options = {}, text = "",
        children = [], onload = () => {}, store, watch = [], on = {} } = {}) {
        Object.assign(this, { key, tag, classlist, options, text, children, onload, store, watch, on });
        this._mount = null;
    }

    dispose(mount = this._mount) {
        if (!mount || mount !== this._mount) return;
        this._mount = null;
        for (const cleanup of mount.cleanups) cleanup();
        for (const child of mount.children) child.component.dispose?.(child.mount);
    }

    render() {
        this.dispose();
        const mount = { element: null, cleanups: [], children: [] };
        this._mount = mount;
        try {
            const element = document.createElement(this.tag);
            mount.element = element;
            element.id = this.key;
            element.className = this.classlist.join(" ");

            for (const [key, value] of Object.entries(this.options || {})) {
                element.setAttribute(key, value);
            }
            if (typeof this.text === "function") {
                const textNode = document.createTextNode("");
                element.appendChild(textNode);
                const update = () => {
                    if (this._mount !== mount) return;
                    const value = String(this.text(this.store) ?? "");
                    if (textNode.data !== value) textNode.data = value;
                };
                update();
                for (const key of new Set(this.watch)) {
                    mount.cleanups.push(this.store.subscribe(key, update));
                }
            } else {
                // Static text retains the original HTML behavior.
                element.innerHTML = this.text;
            }
            for (const [event, callback] of Object.entries(this.on || {})) {
                if (typeof callback !== "function") {
                    throw new TypeError(`Event handler for ${event} must be a function`);
                }
                element.addEventListener(event, callback);
                mount.cleanups.push(() => element.removeEventListener(event, callback));
            }

            const renderChild = child => {
                const owned = { component: child, mount: undefined };
                mount.children.push(owned);
                try {
                    return child.render();
                } finally {
                    owned.mount = child._mount;
                }
            };
            for (const child of this.children) {
                const result = renderChild(child);
                if (result && typeof result.then === "function") {
                    const position = document.createComment("async child");
                    element.appendChild(position);
                    Promise.resolve(result).then(resolved => {
                        if (this._mount !== mount) return;
                        const node = typeof resolved?.render === "function"
                            ? renderChild(resolved) : resolved;
                        if (this._mount === mount) position.replaceWith(node);
                    }).catch(error => {
                        if (this._mount !== mount) return;
                        this.dispose(mount);
                        console.error(error);
                    });
                } else {
                    element.appendChild(result);
                }
            }
            return element;
        } catch (error) {
            this.dispose(mount);
            throw error;
        }
    }
}
