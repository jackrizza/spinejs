class State {
    constructor() {
        this.state = JSON.parse(localStorage.getItem("state")) || {};
    }

    load_from_local_storage() {
        // Load the state from local storage
        return JSON.parse(localStorage.getItem("state"));
    }

    save_to_local_storage() {
        // Save the state to local storage
        localStorage.setItem("state", JSON.stringify(this.state));
    }


    set(key, value) {
        // Set the state
        this.state[key] = value;
        this.save_to_local_storage();
        this.load_from_local_storage();
    }

    get(key) {
        // Get the state
        return this.state[key] || [];
    }

    delete(key) {
        // Delete the state
        delete this.state[key];
        this.save_to_local_storage();
        this.load_from_local_storage();
    }

}