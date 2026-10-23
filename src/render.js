// HTML boolean attributes use presence/absence; aria-* values remain strings.
const spineBooleanAttributes = new Set(('allowfullscreen async autofocus autoplay checked controls default defer disabled formnovalidate hidden inert ismap itemscope loop multiple muted nomodule novalidate open playsinline readonly required reversed selected').split(' '));

class Render {
    constructor({ key = "", tag = "", classlist = [], options = {}, text = "", plainText,
        children = [], onload, onmount, ref, store, watch = [], on = {}, attrs = {}, props = {}, classes = {} } = {}) {
        Object.assign(this, { key, tag, classlist, options, text, plainText, children, onload, onmount, ref,
            store, watch, on, attrs, props, classes });
        this._mount = null;
        this._lastElement = null;
    }

    get element() { return this._mount?.element || this._lastElement; }
    // Retain compatibility with custom async subclasses assigning this.element.
    set element(value) { this._lastElement = value; }

    addCleanup(callback) {
        if (typeof callback !== 'function') throw new TypeError('addCleanup requires a function');
        const mount = this._mount;
        if (!mount) throw new Error('addCleanup requires an active render');
        let active = true;
        const cleanup = () => {
            if (!active) return;
            active = false;
            callback();
        };
        mount.cleanups.push(cleanup);
        return cleanup;
    }

    dispose(mount = this._mount) {
        if (!mount || mount !== this._mount) return;
        this._mount = null;
        // Always release the entire owner, even when application cleanup throws.
        const release = callback => { try { callback(); } catch (error) { console.error(error); } };
        for (const owned of mount.children) {
            release(() => this._releaseOwned(owned, null));
        }
        for (const cleanup of mount.cleanups.splice(0)) release(cleanup);
    }

    _releaseOwned(owned, mount = this._mount) {
        if (!owned) return;
        owned.active = false;
        // Passing undefined to a mount-aware component would select its current
        // default mount, which might now belong to another parent.
        if (owned.component && (owned.mount !== undefined || !('_mount' in owned.component))) {
            owned.component.dispose?.(owned.mount);
        }
        for (const child of owned.children || []) this._releaseOwned(child, null);
        if (mount) {
            const index = mount.children.indexOf(owned);
            if (index !== -1) mount.children.splice(index, 1);
        }
    }

    _removeOwned(owned, mount = this._mount) {
        this._releaseOwned(owned, mount);
        let cursor = owned.start;
        while (cursor) {
            const next = cursor.nextSibling;
            cursor.remove();
            if (cursor === owned.end) break;
            cursor = next;
        }
    }

    // A pair of anchors owns the complete async result, including components
    // returned by other components. Removing the slot invalidates all results.
    _appendOwned(child, mount, parent, before = null) {
        const start = document.createComment('child');
        const end = document.createComment('/child');
        parent.insertBefore(start, before);
        parent.insertBefore(end, before);
        const owned = { component: null, mount: undefined, active: true, ready: false,
            node: null, start, end, children: [] };
        mount.children.push(owned);
        const valid = () => this._mount === mount && owned.active;
        const fail = error => {
            if (!valid()) return;
            this.dispose(mount);
            console.error(error);
        };
        const resolve = value => {
            if (!valid()) return;
            if (value && typeof value.then === 'function') {
                Promise.resolve(value).then(resolve).catch(fail);
                return;
            }
            if (value && typeof value.render === 'function') {
                if (owned.component) {
                    const nested = this._appendOwned(value, mount, parent, end);
                    mount.children.splice(mount.children.indexOf(nested), 1);
                    owned.children.push(nested);
                    owned.ready = true;
                    if (mount.mounted) this._notifyOwned(owned);
                    return;
                }
                owned.component = value;
                let result;
                try { result = value.render(); }
                finally { owned.mount = value._mount; }
                resolve(result);
                return;
            }
            if (!value || typeof value.nodeType !== 'number') throw new TypeError('Child render must return a DOM node or component');
            parent.insertBefore(value, end);
            owned.node = value;
            owned.ready = true;
            if (mount.mounted) this._notifyOwned(owned);
        };
        try { resolve(child); }
        catch (error) { this._removeOwned(owned, mount); throw error; }
        return owned;
    }

    _notifyOwned(owned) {
        if (!owned.active || !owned.ready) return;
        for (const child of owned.children) this._notifyOwned(child);
        if (owned.component && owned.component._mount === owned.mount) {
            owned.component._notifyMounted?.(owned.mount);
        }
    }

    _notifyMounted(mount = this._mount) {
        if (!mount || this._mount !== mount || mount.mounted) return;
        mount.mounted = true;
        try {
            for (const owned of mount.children) {
                this._notifyOwned(owned);
                if (this._mount !== mount) return;
            }
            if (typeof this.ref === 'function') {
                const ref = this.ref;
                this.addCleanup(() => ref(null, this));
                const cleanup = ref(mount.element, this);
                if (typeof cleanup === 'function') {
                    if (this._mount !== mount) cleanup();
                    else this.addCleanup(cleanup);
                }
                if (this._mount !== mount) return;
            }
            for (const callback of new Set([this.onmount, this.onload])) {
                if (typeof callback !== 'function') continue;
                const cleanup = callback(mount.element, this);
                if (typeof cleanup === 'function') {
                    if (this._mount !== mount) cleanup();
                    else this.addCleanup(cleanup);
                }
                if (this._mount !== mount) return;
            }
        } catch (error) { this.dispose(mount); throw error; }
    }

    mount(parent, before = null) {
        const rendered = this.render();
        const mount = this._mount;
        const insert = node => {
            if (this._mount !== mount) return null;
            try {
                parent.insertBefore(node, before);
                this._notifyMounted(mount);
                return node;
            } catch (error) {
                this.dispose(mount);
                node.remove?.();
                throw error;
            }
        };
        return rendered && typeof rendered.then === 'function' ? Promise.resolve(rendered).then(insert, error => {
            this.dispose(mount); throw error;
        }) : insert(rendered);
    }

    render() {
        this.dispose();
        const mount = { element: null, cleanups: [], children: [], mounted: false };
        this._mount = mount;
        try {
            const element = document.createElement(this.tag);
            mount.element = this._lastElement = element;
            element.id = this.key;
            element.className = this.classlist.join(' ');
            for (const [key, value] of Object.entries(this.options || {})) element.setAttribute(key, value);
            const updates = [];
            const evaluate = value => typeof value === 'function' ? value(this.store) : value;
            if (this.plainText !== undefined || typeof this.text === 'function') {
                const source = this.plainText !== undefined ? this.plainText : this.text;
                const textNode = document.createTextNode('');
                element.appendChild(textNode);
                const update = () => {
                    const value = String(evaluate(source) ?? '');
                    if (textNode.data !== value) textNode.data = value;
                };
                update();
                if (typeof source === 'function') updates.push(update);
            } else element.innerHTML = this.text;
            for (const [name, source] of Object.entries(this.attrs || {})) {
                const update = () => {
                    const value = evaluate(source);
                    const boolean = spineBooleanAttributes.has(name.toLowerCase());
                    const next = value == null || (boolean && !value) ? null : boolean ? '' : String(value);
                    if (next === null) { if (element.hasAttribute(name)) element.removeAttribute(name); }
                    else if (element.getAttribute(name) !== next) element.setAttribute(name, next);
                };
                update();
                if (typeof source === 'function') updates.push(update);
            }
            for (const [name, source] of Object.entries(this.props || {})) {
                const update = () => {
                    const raw = evaluate(source);
                    // String-valued form controls normalize numbers/null on
                    // assignment. Compare the displayed value before writing,
                    // otherwise an equal numeric value still resets selection.
                    const current = element[name];
                    const value = name === 'value' && typeof current === 'string' ? String(raw ?? '') : raw;
                    if (name === 'value' && element.tagName === 'INPUT' && element.type === 'file' && value !== '') return;
                    if (!Object.is(current, value)) element[name] = value;
                };
                update();
                if (typeof source === 'function') updates.push(update);
            }
            for (const [name, source] of Object.entries(this.classes || {})) {
                const update = () => {
                    const enabled = !!evaluate(source);
                    if (element.classList.contains(name) !== enabled) element.classList.toggle(name, enabled);
                };
                update();
                if (typeof source === 'function') updates.push(update);
            }
            if (updates.length) {
                const update = () => {
                    if (this._mount !== mount) return;
                    for (const callback of updates) callback();
                };
                for (const key of new Set(this.watch)) mount.cleanups.push(this.store.subscribe(key, update));
            }
            for (const [event, callback] of Object.entries(this.on || {})) {
                if (typeof callback !== 'function') throw new TypeError(`Event handler for ${event} must be a function`);
                element.addEventListener(event, callback);
                mount.cleanups.push(() => element.removeEventListener(event, callback));
            }
            for (const child of this.children) this._appendOwned(child, mount, element);
            return element;
        } catch (error) { this.dispose(mount); throw error; }
    }
}
