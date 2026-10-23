# SpineJS

SpineJS is an independent browser UI framework using JavaScript component objects, explicit state subscriptions, and direct DOM updates. Reactive text, element bindings, conditional regions, and keyed lists update their own DOM regions. Source files run as classic browser scripts; a Node build creates readable and minified distribution bundles. There are no production runtime dependencies.

## Run the examples with Node.js

Use Node.js 24 or newer. From the repository root:

```sh
npm ci
npm run dev
```

Open [the home page](http://127.0.0.1:8080/), [the file browser](http://127.0.0.1:8080/#/files/), or [the counter](http://127.0.0.1:8080/#counter). Home, about, and contact remain available; about fetches the local sample table data. The standalone file browser uses in-memory fixtures and needs no backend. It demonstrates nested folders, sorting, uploads, new folders, previews, and request states. Consumers own their application UI and adapters independently; see [using Spine in your application](docs/using-spine.md).

All demo HTML, application scripts, styles, and fixtures live in `Example/`. The development server serves that demo at `/` with caching disabled and makes the framework sources available at `/src/`. Existing `/Example/` links also work. Save changes and refresh manually; there is no automatic reload or build step. Stop with Ctrl+C. Choose another port with `npm run dev -- -p 8001`.

Type into the counter input, then increase or reset the count. Both views update while the input and its typed value stay intact. Clicking naturally focuses the clicked button; check state-driven focus preservation by focusing the input and calling `state.set("count", 5)` in the browser console. Navigation away and back exercises disposal and fresh subscriptions.

## Build for distribution

```sh
npm ci
npm run build
```

The build uses Terser as a development dependency and writes generated files to `dist/`:

| Output | Purpose |
| --- | --- |
| `spine.js`, `spine.min.js` | Readable/minified framework bundles for your applications. |
| `app.js`, `app.min.js` | Readable/minified example application and startup. |
| `*.min.js.map` | Source maps with embedded source content. |
| `index.html` | Example using minified bundles. |
| `index.debug.html` | Example using readable bundles. |
| `style/`, `example_table.json` | Assets copied from `Example/`. |

Load one framework bundle before your own application:

```html
<div id="app"></div>
<script src="./spine.min.js"></script>
<script src="./my-app.js"></script>
```

Use constructors directly, such as `new State()` and `new Div({...})`. These are classic scripts, not CommonJS or ES modules. Minification preserves public names and properties. The build does not transpile or add polyfills; use a modern browser supporting Fetch, AbortController, and the DOM APIs in the sources.

Preview after building:

```sh
npm run preview
```

Open [the built file browser](http://127.0.0.1:8080/#/files/) or `/index.debug.html#/files/` for readable bundles. Dev and preview share port 8080 by default: stop the other server or use `npm run preview -- -p 8001`. Deploy `dist/` to a static HTTP host; relative asset URLs support subdirectories. Node is needed for development/building, not in the deployed browser application. `dist/` is generated and ignored by Git; edit sources and rebuild.

## Framework package and independent consumers

Build only the reusable framework, or create a local versioned package:

```sh
npm run build:framework
npm pack --dry-run
npm pack
```

The framework-only build creates `dist/spine.js`, `dist/spine.min.js`, and its source map without building the demo application. Prepack runs this build. The package includes those framework artifacts, package metadata, and README documentation; its allowlist excludes example applications and fixtures even after a full demo build. Version 0.1.0 packs as `spinejs-0.1.0.tgz`; this does not publish a package to a registry.

Consumers may install an explicit release tarball or vendor the framework bundles into their own asset pipeline. Browser artifact export subpaths are `spinejs/spine.js`, `spinejs/spine.min.js`, and `spinejs/spine.min.js.map`. These identify classic browser scripts, not a CommonJS require API or ES module exports. Load the selected framework before your own application script.

Framework builds/tests never require a consumer checkout, backend, or shared application source. A consumer owns its UI, adapters, vendored/installed version, asset registration, and integration tests. There are no cross-repository deployment scripts. See [independent usage and example adapter contract](docs/using-spine.md).

## GitHub releases

The [release workflow](.github/workflows/release.yml) runs when a tag beginning
with `v` is pushed. It installs development dependencies, runs the tests, builds
the framework, and creates a GitHub release with `spine.min.js`, its source map,
and the readable `spine.js`. Example application assets are excluded.

Commit and push the source and workflow first, then tag that commit:

```sh
git tag -a v0.1.0 -m "SpineJS v0.1.0"
git push origin v0.1.0
```

Use a new version tag for each release; update `package.json` to match the version
before tagging. Tags with a hyphen, such as `v0.2.0-beta.1`, create prereleases.
The workflow uses GitHub's built-in token with release write permission; no extra
secret or npm publication is needed. Rerunning a job uploads/replaces its assets
on an existing mutable release. GitHub repository policies still apply.

Download assets from [GitHub Releases](https://github.com/jackrizza/spinejs/releases).
Keep `spine.min.js.map` alongside `spine.min.js` when serving it. Each consumer
chooses when to upgrade its copy.

## Observable state and persistence

```js
const state = new State(); // Existing localStorage key "state" and JSON object format.
const unsubscribe = state.subscribe("count", (value, key) => console.log(key, value));
state.set("count", 0); // Synchronous notification.
state.set("count", 0); // Every explicit set notifies, including equal values.
state.delete("count"); // Existing keys notify with undefined; missing keys do nothing.
unsubscribe();
unsubscribe(); // Idempotent.

const ui = new State({ persist: false, initial: { files: [], loading: false } });
const preferences = new State({
    key: "file-browser-preferences",
    initial: { sort: "name", dialogOpen: false },
    persistKeys: ["sort"],
    onError: (error, store) => console.error("Could not save preferences", error)
});
preferences.set("dialogOpen", true); // Memory only; no storage write.
```

`get(key, fallback = [])` uses the fallback only for absent keys. `0`, `false`, `""`, `null`, and explicitly stored `undefined` survive in memory. Objects and arrays are not observed internally: call `set()` after mutation or pass a replacement value. Notifications only reach subscribers for that key. Registrations are independent, removed subscriptions are skipped during notification, and newly added subscribers start on the next change. Subscribing does not invoke the callback immediately.

`State` options are `persist` (default true), `initial`, `key` (default `"state"`), `storage` (a Storage-compatible object), `persistKeys` (optional durable key list), and `onError`. Saved data overrides `initial` for persisted keys. Memory stores never access localStorage. Use them for Files, Blobs, dialogs, progress, and transient requests. Independent memory stores do not share values; persisted stores with the same storage/key share saved data but do not synchronize live or across tabs.

Storage access, parsing, quota, and serialization failures leave in-memory state and synchronous notifications working. Inspect `store.persistenceError` or use `onError`; a successful save clears the error. Persistence requires JSON-compatible values. Undefined, functions, symbols, non-finite numbers, and Blob/File values are rejected during serialization; BigInt and circular structures also fail. The previous saved snapshot remains intact when saving fails. JSON transforms values such as Dates into strings; plain JSON data is the durable format. Never persist passwords or server session credentials.

## Components, safe text, and element bindings

Components such as `Div`, `P`, `Input`, `Button`, and `new Render({tag: "video", ...})` share these options:

| Option | Behavior |
| --- | --- |
| `key` | Existing DOM element ID; independent of list reconciliation keys. |
| `store`, `watch` | Store passed to binding functions and explicit array of subscribed keys. |
| `text` | Static trusted HTML for compatibility; function results are escaped text. |
| `plainText` | Safe static or function-valued text; takes precedence over `text`. |
| `options` | Existing static attribute map using `setAttribute()`. |
| `attrs` | Attribute map; values may be static or functions of the store. |
| `props` | DOM property map; values may be static or functions of the store. |
| `classlist`, `classes` | Static class array and a class-name-to-boolean/function map. |
| `on` | Event-name-to-callback map, installed with `addEventListener()`. |
| `children` | Owned child components; text/binding changes preserve their DOM. |
| `ref`, `onmount`, `onload` | Mount reference and lifecycle callbacks described below. |

```js
const store = new State({ persist: false, initial: { pending: false, name: "<draft>.txt", value: "Draft" } });
const editor = new Div({ children: [
    new P({ store, watch: ["name"], plainText: s => s.get("name") }),
    new Input({
        store, watch: ["value", "pending"],
        options: { type: "text", "aria-label": "Filename" },
        props: { value: s => s.get("value") },
        attrs: { disabled: s => s.get("pending"), "aria-busy": s => s.get("pending") },
        classes: { pending: s => s.get("pending") },
        on: { input: event => store.set("value", event.target.value) }
    })
] });
editor.mount(document.getElementById("app"));
```

Use `plainText` for filenames, server errors, and file contents. Text null/undefined becomes an empty string. Only trusted content belongs in static `text`; function-valued `text` remains safe. Reactive text uses a dedicated Text node and leaves child elements intact.

For `attrs`, null/undefined removes an attribute. Standard HTML boolean attributes use presence/absence: `disabled: false` enables the control. Other attribute values are strings, including `"false"` for `aria-busy: false`. `props` assigns DOM properties such as `value`, `checked`, `muted`, and `controls`. Nonempty file-input values are skipped because browsers prohibit assigning them. Use `options` for input type before value bindings. Unchanged text, attributes, properties, and classes skip DOM writes; unchanged input values preserve selection. Binding functions reevaluate only on their explicit watched keys. External input changes still need an event handler to update state.

## Conditional regions

```js
const ui = new State({ persist: false, initial: { status: "loading", error: "" } });
const result = new Region({
    store: ui, watch: ["status", "error"], tag: "section",
    render: s => {
        if (s.get("status") === "closed") return null;
        if (s.get("status") === "loading") return new P({ plainText: "Loading…" });
        if (s.get("status") === "error") return new P({ plainText: s.get("error") });
        return new P({ plainText: "Ready" });
    }
});
const shell = new Div({ children: [new Input({}), result] });
shell.mount(document.getElementById("app"));
ui.set("status", "success");
```

`Region` owns a wrapper (`div` by default) and its current branch. `render(store)` returns a component, DOM node, promise, or null/false for no branch. Replaced branches are disposed before DOM removal. A factory returning a fresh component creates fresh bindings each time; branch-local DOM state is not cached. Returning the same component object retains the current branch. Surrounding inputs/toolbars stay mounted. Late results from removed branches cannot acquire bindings or mount.

## Keyed lists

```js
const files = new State({ persist: false, initial: {
    entries: [{ path: "docs/a.txt", name: "a.txt" }, { path: "docs/b.txt", name: "b.txt" }]
} });
const rows = new List({
    store: files, watch: ["entries"], tag: "ul", elementKey: "directory",
    items: s => s.get("entries"),
    key: item => item.path,
    render: (rowStore, key) => new Li({
        children: [new Button({
            store: rowStore, watch: ["item", "index"],
            plainText: s => `${s.get("index") + 1}. ${s.get("item").name}`,
            on: { click: () => console.log(rowStore.get("item").path) }
        }), new Input({ options: { "aria-label": "Row note" } })]
    })
});
rows.mount(document.getElementById("app"));
files.set("entries", [...files.get("entries")].reverse());
```

`items(store)` returns an array. `key(item, index)` returns a stable string or number; use an application's durable ID/path rather than the current index. Keys are separate from DOM IDs. `elementKey` optionally sets the list wrapper ID; normal components still use `key` for IDs.

The renderer runs once for each newly inserted key and receives an independent memory-only `rowStore` containing `item` and `index`. Retained rows receive the latest item and position through that store; bind to those keys and read the current item inside event callbacks. Capturing the initial item in a closure would keep stale data. Duplicate keys throw a diagnostic before changing existing rows or DOM; a later valid update can recover.

Reordering preserves row component/node identity, handlers, typed values, and selection/focus. Native `moveBefore` is used when available; older browsers use node moves with focus/selection restoration. Removed rows dispose before detachment. Async row results are guarded against removal, parent disposal, and remounting. An unrelated store key does not reconcile the list.

## Mounting, references, and cleanup

`component.render()` builds detached DOM and subscriptions. `component.mount(parent, before = null)` renders, inserts, then invokes hooks; it returns the node, or a promise for an asynchronous renderer. `Tree.mount(parent)` also establishes the component mount boundary. The router invokes hooks after inserting a new tree. Manual users who need hooks should use `mount()`.

Hooks run once per mount, descendants before parent. `ref(element, component)` runs next, followed by `onmount(element, component)` and legacy component `onload(element, component)`. If both hook properties reference the same function it runs once. `Tree.onload(context)` is a separate route-level callback, after insertion and the initial route update invocation; it is not called for parameter-only updates. Async children and reactive branches receive their hooks when their own DOM is inserted.

```js
const preview = new Render({
    tag: "video", props: { controls: true }, attrs: { src: "/preview/movie.mp4" },
    onmount: (element, component) => {
        const onEnded = () => console.log("Preview ended");
        element.addEventListener("ended", onEnded);
        component.addCleanup(() => element.removeEventListener("ended", onEnded));
        return () => { element.pause(); element.removeAttribute("src"); element.load(); };
    }
});
preview.mount(document.getElementById("app"));
console.log(preview.element); // Public element reference; no ID lookup needed.
preview.dispose(); // Release resources before removing DOM.
preview.element.remove();
```

A hook/ref may return a cleanup function. `ref` also receives null during disposal. `component.addCleanup(fn)` registers cleanup with the active mount and returns an idempotent cleanup handle. Use it for timers, external listeners, media, and third-party integrations. A text preview can invoke its supplied highlighter inside `onmount`; return the highlighter's teardown function when it provides one.

Each instance has one active mount. Rendering again first releases the old mount; use separate instances for multiple simultaneous mounts. `dispose()` is idempotent and recursively releases owned work, but does not remove its own DOM. Region/list replacement and routing perform removal after disposal. Failed render/mount work is released, stale async results are ignored, and an old parent's disposal cannot dispose a child's newer mount. `element` retains the last node after disposal for inspection/removal; it does not prove the mount is active. Cleanup exceptions are logged while other owned resources are released.

## Requests and observable request state

`request(url, options)` returns a rejecting promise with `abort()`/`dispose()` cancellation handles and `response` metadata after response headers arrive. Fetch options such as method, headers, body, and credentials pass through. Additional options are `responseType` (`json`, `text`, or `blob`), `signal`, `cache` (default false), `cacheKey` (JSON defaults to the URL; text to `URL::text`), `storage`, and `allowRedirects` (default false).

```js
async function upload(file, signal) {
    const body = new FormData();
    body.append("file", file);
    return request("/api/uploads", {
        method: "POST", body, credentials: "same-origin", signal,
        responseType: "text", allowRedirects: true
    });
}
const previewRequest = request("/files/readme.txt", { responseType: "text" });
previewRequest.then(text => console.log(text)).catch(error => console.error(error));
// previewRequest.abort(); // Rejects with an AbortError.
```

The browser creates multipart boundaries; a supplied Content-Type is removed for FormData. HTTP failures reject with `RequestError` (`code: "HTTP_ERROR"`, status, URL, response). Unexpected redirects reject with `AUTH_REDIRECT`; JSON requests receiving HTML reject with `AUTH_HTML`, and other non-JSON content types with `RESPONSE_TYPE`. A login redirect must be handled by the app; cookie/session enforcement remains on the server. 204/205 and HEAD responses produce null. JSON bodies still must parse successfully. `allowRedirects: true` is an explicit choice for compatible redirect-based mutation endpoints.

Caching is opt-in for general requests. `cache: true` supports JSON/text GET cache writes and offline reads using the response-type default or supplied key. Blob responses and mutation requests do not read or write this cache. Cancelled or older requests cannot overwrite newer cache generations. Cache failures do not prevent fresh data display. Choose distinct keys for different response shapes and avoid caching authenticated/transient data.

```js
const resource = new Resource("/api/list", { credentials: "same-origin" });
const status = new P({ store: resource, watch: ["status"], plainText: r => r.get("status") });
status.mount(document.getElementById("app"));
status.addCleanup(() => resource.dispose());
resource.refresh().catch(error => console.error(error));
// resource.retry(); // Returns another promise; handle its rejection too.
```

`Resource(urlOrFunction, options)` starts idle and fetches on `refresh(overrides)` or `retry(overrides)`. It exposes `get`/`subscribe` and its memory-only `.state`: `status` is idle/loading/success/empty/error, alongside `loading`, `data`, `error`, and `httpStatus`. Empty means null or an empty array. Refresh cancels the previous request; old results cannot update current state. Errors still reject the refresh promise and are recorded in state. `dispose()` cancels and permanently closes the resource; create a fresh resource for a fresh mount.

`Fetch` remains an owned child component and accepts general rendering callbacks:

```js
const listing = new Fetch({
    url: "/api/list", options: { credentials: "same-origin", cache: false },
    loading: () => new P({ plainText: "Loading…" }),
    empty: () => new P({ plainText: "No files" }),
    error: error => new P({ plainText: error.message }),
    render: data => new P({ plainText: JSON.stringify(data) })
});
new Div({ children: [listing] }).mount(document.getElementById("app"));
// listing.refresh(); listing.retry();
```

`Fetch.state` exposes status/loading/data/error. `isEmpty(data)` can override empty detection. The loading factory creates the initial placeholder and replaces existing output during refresh. Without a loading factory, refresh retains current output while request state reports loading. The default runtime fetches once after idle scheduling; `runtime: "slow"` polls every 1500 ms and skips ticks while work is pending. Fetch owns scheduling, requests, and rendered children. Existing `new Fetch({url, runtime, callback: TableCreator})` and callback `.placeholder()`/`.table()` behavior remain supported. Legacy Fetch and `new SingleFetch(url)` default to URL caching; general Fetch renderers default to no cache. `SingleFetch(url, options)` preserves promises resolving errors as `{Error: error}` and supports cancellation. State changes do not implicitly rerun routes or start requests.

## Paths and persistent route layouts

```js
const routeStore = new State({ persist: false, initial: { path: "" } });
const shell = new Div({ children: [new Input({ options: { "aria-label": "Search" } }),
    new P({ store: routeStore, watch: ["path"], plainText: s => s.get("path") })
] });
const router = new Spine({
    root: "#app", store: routeStore, defaultRoute: "/files/",
    routes: [{
        key: "/files/*path", tree: new Tree("files", shell),
        update: async ({ params, signal, store }) => {
            store.set("path", params.path);
            // Pass signal into your directory request; check it before async state writes.
        }
    }]
});
router.start();
// router.stop();    // Remove hash listener and cancel navigation, leaving the UI mounted.
// router.dispose(); // Also dispose and remove the active tree.
```

The existing `new Spine(routesArray)` constructor, `setActiveRoute()` and `renderRoute()` remain supported; the array form also accepts a second options object. Options are `root` (selector or element, default `#app`), `store`, `defaultRoute` (default `home`), and `onError(error, router)`. `start()` owns one hashchange listener and handles initial deep links/back/forward; `stop()` releases it. Empty hash uses `defaultRoute`.

Static routes take precedence. `:name` matches one decoded segment and final `*path` matches the remaining decoded path. Build links with `encodeURIComponent` per path segment, for example `#/files/${segments.map(encodeURIComponent).join("/")}`. The file browser uses `#/files/` for root. Unknown routes and invalid encoded parameters dispose the current UI and show a safe error message; `onError` can report the failure.

`route.update({params, path, signal, store, router})` runs initially and on navigation. When the same route object/tree matches new parameters, its tree and inputs remain mounted. Navigating to a different route disposes the old tree. Every new navigation aborts the previous signal; use it in requests and guard later application state writes. Obsolete promise rejections do not replace a newer view. Automatic cancellation cannot prevent arbitrary application promises from writing state unless they respect that signal.

## Tests and limits

```sh
npm test
npm run build
git diff --check
```

Tests use Node's test runner and jsdom with controlled requests/timers; no live backend is required. Distribution tests exercise readable/minified bundles and subdirectory assets. jsdom checks are separate from actual browser checks. Backend-specific integration tests belong to each consumer; see [independent consumer usage](docs/using-spine.md).

Dependencies remain explicit, with no JSX, virtual DOM, automatic dependency tracking, cross-tab state synchronization, or deep object observation. Conditional branches do not cache local DOM state. Inputs persist while their mount/retained key stays active; store values explicitly if they must survive route removal. Upload progress and a general widget library are outside this milestone. The standalone demo downloads Blob preview content before display, including video. Endpoint contracts, backend asset embedding, authentication, and application-specific adapters belong to consumers. Framework and independent distribution requirements are tracked in [tasks.md](tasks.md).
