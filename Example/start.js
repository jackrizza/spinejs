const state = new State();
state.set("current_url_hash", window.location.hash.slice(1) || "home");

new BaseSpine().then(spine => {
    spine.store = state;
    spine.start();
});
