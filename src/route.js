class Tree {
    constructor(key, component, onload = () => {}) {
        // Add properties and methods for the Route object here
        this.key = key;
        this.forward = null;
        this.backward = null;
        this.component = component;
        this.onload = onload
        this._mount = null;
        this._rendered = false;
    }

    render(context) {
        try { return this.component.render(context); }
        finally { this._mount = this.component._mount; this._rendered = true; }
    }

    mount(parent, before = null) {
        if (typeof this.component.mount === 'function') {
            try { return this.component.mount(parent, before); }
            finally { this._mount = this.component._mount; this._rendered = true; }
        }
        const element = this.render();
        try {
            parent.insertBefore(element, before);
            this.component._notifyMounted?.(this._mount);
            return element;
        } catch (error) {
            this.dispose();
            element.remove();
            throw error;
        }
    }

    dispose(mount = this._mount) {
        if (!this._rendered) return;
        this.component.dispose(mount);
    }
}
