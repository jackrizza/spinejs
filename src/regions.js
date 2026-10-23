// Dynamic regions own only their wrapper's children; the surrounding UI stays mounted.
class Region extends Render {
    constructor({ render, tag = 'div', ...options } = {}) {
        if (typeof render !== 'function') throw new TypeError('Region requires render(store)');
        super({ ...options, tag, children: [] });
        this.renderBranch = render;
    }

    render() {
        const element = super.render();
        const mount = this._mount;
        let current = null;
        let branch = null;
        const update = () => {
            if (this._mount !== mount) return;
            const next = this.renderBranch(this.store);
            if (next === branch && current) return;
            if (current) this._removeOwned(current, mount);
            current = null;
            branch = next;
            if (next == null || next === false) return;
            const child = next && typeof next.then === 'function'
                ? Promise.resolve(next).then(value => value == null || value === false ? document.createComment('empty') : value)
                : next;
            try { current = this._appendOwned(child, mount, element); }
            catch (error) { this.dispose(mount); throw error; }
        };
        try {
            update();
            for (const key of new Set(this.watch)) mount.cleanups.push(this.store.subscribe(key, update));
            return element;
        } catch (error) { this.dispose(mount); throw error; }
    }
}

class List extends Render {
    constructor({ items, key, render, tag = 'div', ...options } = {}) {
        if (typeof items !== 'function' || typeof key !== 'function' || typeof render !== 'function') {
            throw new TypeError('List requires items(store), key(item), and render(rowStore, key)');
        }
        // List keys identify rows. elementKey can still opt into a wrapper DOM ID.
        const { elementKey = '', ...rest } = options;
        super({ ...rest, key: elementKey, tag, children: [] });
        Object.assign(this, { items, rowKey: key, renderRow: render });
    }

    render() {
        const element = super.render();
        const mount = this._mount;
        const rows = new Map();
        const update = () => {
            if (this._mount !== mount) return;
            const items = this.items(this.store);
            if (!Array.isArray(items)) throw new TypeError('List items(store) must return an array');
            const entries = [];
            const keys = new Set();
            // Diagnose all invalid input before changing row state or DOM.
            items.forEach((item, index) => {
                const key = this.rowKey(item, index);
                if (typeof key !== 'string' && typeof key !== 'number') throw new TypeError('List keys must be strings or numbers');
                if (keys.has(key)) throw new Error(`Duplicate List key: ${String(key)}`);
                keys.add(key);
                entries.push({ item, index, key });
            });
            const focused = element.contains(document.activeElement) ? document.activeElement : null;
            const selection = focused && typeof focused.selectionStart === 'number'
                ? [focused.selectionStart, focused.selectionEnd, focused.selectionDirection] : null;
            try {
                for (const [key, row] of rows) {
                    if (!keys.has(key)) {
                        this._removeOwned(row.owned, mount);
                        rows.delete(key);
                    }
                }
                for (const { item, index, key } of entries) {
                    let row = rows.get(key);
                    if (row) {
                        row.store.set('item', item);
                        if (row.store.get('index') !== index) row.store.set('index', index);
                    } else {
                        const store = new State({ persist: false, initial: { item, index } });
                        const component = this.renderRow(store, key);
                        if (component == null) throw new TypeError('List render(rowStore, key) must return a component or node');
                        row = { store, owned: this._appendOwned(component, mount, element) };
                        rows.set(key, row);
                    }
                }
                let cursor = element.firstChild;
                for (const { key } of entries) {
                    const owned = rows.get(key).owned;
                    const nodes = [];
                    for (let node = owned.start; node; node = node.nextSibling) {
                        nodes.push(node);
                        if (node === owned.end) break;
                    }
                    for (const node of nodes) {
                        if (node !== cursor) {
                            // Browsers supporting moveBefore retain focus/media state natively.
                            if (typeof element.moveBefore === 'function' && node.parentNode === element && element.isConnected) element.moveBefore(node, cursor);
                            else element.insertBefore(node, cursor);
                        }
                        cursor = node.nextSibling;
                    }
                }
                if (focused && element.contains(focused) && document.activeElement !== focused) {
                    focused.focus({ preventScroll: true });
                    if (selection) focused.setSelectionRange(...selection);
                }
            } catch (error) { this.dispose(mount); throw error; }
        };
        try {
            update();
            for (const key of new Set(this.watch)) mount.cleanups.push(this.store.subscribe(key, update));
            return element;
        } catch (error) { this.dispose(mount); throw error; }
    }
}
