class State {
    constructor({ persist = true, initial = {}, storage, key = "state", persistKeys, onError } = {}) {
        this.subscriptions = new Map();
        this.persist = persist !== false;
        this.key = key;
        this.persistKeys = persistKeys == null ? null : new Set(persistKeys.map(String));
        this.onError = onError;
        this.persistenceError = null;
        this.storage = null;
        if (this.persist) {
            try { this.storage = storage === undefined ? localStorage : storage; }
            catch (error) { this._persistenceFailed(error); }
        }
        const saved = this.load_from_local_storage();
        this.state = { ...initial, ...(saved && typeof saved === "object" && !Array.isArray(saved) ? saved : {}) };
    }

    _persistenceFailed(error) {
        this.persistenceError = error;
        // Storage failures never prevent synchronous state delivery.
        try { this.onError?.(error, this); } catch (reportError) { console.error(reportError); }
    }

    load_from_local_storage() {
        if (!this.persist || !this.storage) return null;
        try {
            const saved = JSON.parse(this.storage.getItem(this.key));
            if (!this.persistKeys || !saved || typeof saved !== "object") return saved;
            return Object.fromEntries(Object.entries(saved).filter(([key]) => this.persistKeys.has(key)));
        } catch (error) { this._persistenceFailed(error); return null; }
    }

    save_to_local_storage() {
        if (!this.persist || !this.storage) return;
        try {
            const values = this.persistKeys
                ? Object.fromEntries(Object.entries(this.state).filter(([key]) => this.persistKeys.has(key)))
                : this.state;
            // Reject values JSON silently drops or corrupts, rather than persisting
            // a misleading value. Transient File/Blob values belong in memory stores.
            const json = JSON.stringify(values, (key, value) => {
                if (typeof value === "undefined" || typeof value === "function" || typeof value === "symbol" ||
                    (typeof value === "number" && !Number.isFinite(value)) ||
                    (typeof Blob !== "undefined" && value instanceof Blob)) {
                    throw new TypeError("State persistence requires JSON-compatible values");
                }
                return value;
            });
            this.storage.setItem(this.key, json);
            this.persistenceError = null;
        } catch (error) { this._persistenceFailed(error); }
    }

    set(key, value) {
        Object.defineProperty(this.state, key, {
            value, writable: true, enumerable: true, configurable: true
        });
        if (!this.persistKeys || this.persistKeys.has(String(key))) this.save_to_local_storage();
        this.notify(key, value);
    }

    get(key, fallback = []) {
        return Object.prototype.hasOwnProperty.call(this.state, key) ? this.state[key] : fallback;
    }

    delete(key) {
        if (!Object.prototype.hasOwnProperty.call(this.state, key)) return;
        delete this.state[key];
        if (!this.persistKeys || this.persistKeys.has(String(key))) this.save_to_local_storage();
        this.notify(key, undefined);
    }

    subscribe(key, callback) {
        if (typeof callback !== "function") throw new TypeError("State.subscribe requires a callback function");
        key = String(key);
        let listeners = this.subscriptions.get(key);
        if (!listeners) this.subscriptions.set(key, listeners = new Set());
        const subscription = { callback };
        listeners.add(subscription);
        return () => {
            listeners.delete(subscription);
            if (!listeners.size && this.subscriptions.get(key) === listeners) this.subscriptions.delete(key);
        };
    }

    notify(key, value) {
        const listeners = this.subscriptions.get(String(key));
        if (!listeners) return;
        for (const subscription of [...listeners]) {
            if (listeners.has(subscription)) subscription.callback(value, key);
        }
    }
}
