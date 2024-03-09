class Tree {
    constructor(key, component, onload = {}) {
        // Add properties and methods for the Route object here
        this.key = key;
        this.forward = null;
        this.backward = null;
        this.component = component;
        this.onload = onload
    }

    render() {
        return this.component.render();
    }
}