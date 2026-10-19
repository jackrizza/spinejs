# SpineJS

SpineJS uses plain JavaScript component objects and classic browser scripts. Reactive text bindings update their own DOM Text node when explicitly watched state keys change. There is no build step or production runtime dependency.

## Run the examples

From the repository root, serve the files over HTTP:

```sh
python -m http.server 8000
```

Open [the counter example](http://localhost:8000/#counter). The home, about, contact, and counter pages use the existing hash router. The about page fetches the local sample table data.

Type into the counter input, then increase or reset the count. Both views update while the input element, typed value, and selection remain intact. Clicking a button naturally moves browser focus to that button; to check that a state update itself preserves input focus, keep the input focused and call `state.set("count", 5)` in the browser console, or activate a counter button with its keyboard shortcut if you add one. Navigate away and back to exercise disposal and fresh subscriptions.

## Observable state

```js
const state = new State();
const unsubscribe = state.subscribe("count", (value, key) => {
    console.log(key, value);
});

state.set("count", 0); // Synchronously calls the subscriber with (0, "count").
state.set("count", 0); // Every explicit set notifies, even for the same value.
state.delete("count"); // Calls the subscriber with (undefined, "count").
unsubscribe();
unsubscribe(); // Safe to call repeatedly.
```

`get(key, fallback = [])` uses the fallback only when the key is absent. Stored `0`, `false`, `""`, `null`, and even an explicitly set `undefined` are returned as stored in memory. State continues to use the existing localStorage key, `"state"`, with JSON serialization; subscriptions are kept separately and are never persisted. JSON's usual serialization rules apply.

Notifications affect only subscribers to the changed key. Deleting an absent key does nothing. Each `subscribe()` call registers independently; an old unsubscribe function cannot remove a later registration. A subscription removed during notification is skipped, and a subscription added during notification starts with the next change. Subscribing does not immediately invoke the callback.

Objects and arrays are not observed internally. Call `set()` after changing them, or use a replacement value:

```js
state.set("items", [...state.get("items", []), "New item"]);
```

## Components and reactive text

Keep the existing constructors such as `Div`, `P`, `Input`, and `Button`. Their shared rendering options include:

| Option | Behavior |
| --- | --- |
| `store` | The state instance passed to a function-valued `text`. |
| `watch` | An array of keys to subscribe to for this mount. Dependencies are explicit. |
| `text` | A static value with the existing HTML behavior, or a function evaluated initially and when a watched key changes. |
| `on` | Event names mapped to callback functions, installed with `addEventListener()`. Callbacks receive the browser event. |
| `options` | The existing DOM attribute map, applied with `setAttribute()`. |
| `children` | Owned child components, preserved when reactive text updates. |

A dynamic text result is converted to text, with `null` and `undefined` displayed as an empty string. HTML returned by a function is displayed literally. Its dedicated Text node is only changed when the displayed value differs. Static `text` still accepts HTML, so use trusted content for static HTML.

## Complete counter example

After loading the core scripts in the order shown in `index.html`, this standalone example mounts into an existing `<div id="app"></div>`:

```js
const state = new State();
const counter = new Div({
    children: [
        new P({
            store: state,
            watch: ["count"],
            text: store => `Count: ${store.get("count", 0)}`
        }),
        new Div({
            store: state,
            watch: ["count"],
            text: store => `Second view: ${store.get("count", 0)}. `,
            children: [
                new Label({ text: "Your text: ", options: { for: "draft" } }),
                new Input({ key: "draft", options: { type: "text" } })
            ]
        }),
        new Button({
            text: "Increase",
            options: { type: "button" },
            on: {
                click: () => state.set("count", state.get("count", 0) + 1)
            }
        }),
        new Button({
            text: "Reset",
            options: { type: "button" },
            on: { click: () => state.set("count", 0) }
        })
    ]
});

document.getElementById("app").appendChild(counter.render());

// Before manually removing or replacing this UI:
// counter.dispose();
```

The integrated version lives in `Example/custom/counter.js` and is registered by `index.js`. Use that version to try navigation and route cleanup.

## Mounting and disposal

Each component instance has one active mount. Calling `render()` again first releases the previous mount's bindings. Use separate instances to mount equivalent components in multiple places.

Call `dispose()` before manually removing a component's DOM. It recursively releases owned children's subscriptions and event handlers, and repeated calls are safe. Disposal releases resources; it does not remove the DOM itself. `Tree.dispose()` delegates to its root component, and `Spine.renderRoute()` disposes the previous tree before replacing its DOM. Failed renders also release resources already registered. Asynchronous children use mount identities so late completion cannot mount into a disposed or replaced parent.

`Fetch` owns its idle callback (or fallback timeout), polling interval, outstanding request, and rendered children. Disposal cancels these resources, aborts requests when supported, and rejects stale responses from older mounts. The default runtime fetches once; `runtime: "slow"` polls every 1500 ms after its initial idle start, skipping ticks while a request is pending. `SingleFetch` retains URL-keyed localStorage caching for offline reads and returns a promise with a `dispose()` cancellation method. Reactive state updates do not rerun routes or start more fetches.

## Tests and limits

Use Node.js 24 or newer for the development-only DOM test environment:

```sh
npm ci
npm test
```

Tests use Node's test runner and jsdom, with controlled requests and timers. These are automated DOM-environment checks; use the browser example to inspect actual browser behavior. The application itself needs neither npm packages nor compilation.

Bindings support text updates only. There is no automatic dependency tracking, reactive attribute binding, list reconciliation, or cross-tab state synchronization. Input preservation applies while its mount remains active; navigating away removes that input. Persist values explicitly in state if they must survive route changes.

## Todo

- [ ] Forms
    - [x] UI
    - [ ] HTTP request
- [ ] Notifications
- [ ] Additive / modifier fetching
