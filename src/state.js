class State {
    constructor() {
        this.state = JSON.parse(localStorage.getItem("state")) || {};
        this.subscriptions = new Map();
    }

    load_from_local_storage() {
        return JSON.parse(localStorage.getItem("state"));
    }

    save_to_local_storage() {
        localStorage.setItem("state", JSON.stringify(this.state));
    }

    set(key, value) {
        // Define an own property even for keys such as "__proto__".
        Object.defineProperty(this.state, key, {
            value, writable: true, enumerable: true, configurable: true
        });
        this.save_to_local_storage();
        this.notify(key, value);
    }

    get(key, fallback = []) {
        return Object.prototype.hasOwnProperty.call(this.state, key)
            ? this.state[key] : fallback;
    }

    delete(key) {
        if (!Object.prototype.hasOwnProperty.call(this.state, key)) return;
        delete this.state[key];
        this.save_to_local_storage();
        this.notify(key, undefined);
    }

    subscribe(key, callback) {
        if (typeof callback !== "function") {
            throw new TypeError("State.subscribe requires a callback function");
        }
        key = String(key);
        let listeners = this.subscriptions.get(key);
        if (!listeners) this.subscriptions.set(key, listeners = new Set());
        // Each registration has its own identity, including repeated callbacks.
        const subscription = { callback };
        listeners.add(subscription);
        return () => {
            listeners.delete(subscription);
            if (!listeners.size && this.subscriptions.get(key) === listeners) {
                this.subscriptions.delete(key);
            }
        };
    }

    notify(key, value) {
        const listeners = this.subscriptions.get(String(key));
        if (!listeners) return;
        // Removed listeners are skipped; newly added ones wait for the next set.
        for (const subscription of [...listeners]) {
            if (listeners.has(subscription)) subscription.callback(value, key);
        }
    }
}
