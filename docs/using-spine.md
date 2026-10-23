# Use Spine independently

SpineJS supplies a browser framework. Your application owns its UI, API adapter,
assets, backend endpoints, authentication, and deployment. The standalone examples
in this repository demonstrate the public API; they are not a required runtime
or an application to copy into a consumer project.

## Build or package the framework

With Node.js 24 or newer, in a Spine checkout:

```sh
npm ci
npm run build:framework
npm pack --dry-run
npm pack
```

The framework-only build generates `dist/spine.js`, `dist/spine.min.js`, and
`dist/spine.min.js.map`. Package preparation runs that framework-only build.
The package has an explicit framework artifact allowlist and includes package
metadata and README documentation. It excludes the demonstration application's
app bundles, HTML, styles, fixtures, and backend adapters. A full `npm run build`
also builds Spine's own examples for development/preview; those example assets
are not part of the reusable package.

The local package version is 0.0.1; packing creates `spinejs-0.0.1.tgz`. Packing
locally does not publish to an npm registry. Distribute that tarball through your
normal artifact/release process. No script copies artifacts into another
repository, and no other checkout or backend is needed to build or pack Spine.

## Install or vendor a release

A consumer can install an explicit tarball, for example:

```sh
npm install /path/to/releases/spinejs-0.0.1.tgz
```

Alternatively, extract the release artifact and vendor the framework bundle and
its source map into your application's static assets. Record the version and
checksum or release identity in your own dependency update process. Your build
can resolve/copy installed package artifacts into your output; Spine's build does
not perform that deployment for you.

Package browser artifact subpaths are:

- `spinejs/spine.js`
- `spinejs/spine.min.js`
- `spinejs/spine.min.js.map`

These subpaths identify distributable classic scripts/source maps. They are not a
CommonJS require API or ES module named exports. Serve the chosen script through
your own static asset pipeline and load it before your application:

```html
<div id="app"></div>
<script src="./vendor/spine.min.js"></script>
<script src="./app.js"></script>
```

Your application's `app.js` can use public constructors directly:

```js
const state = new State({ persist: false, initial: { count: 0 } });
const counter = new Button({
    store: state,
    watch: ["count"],
    plainText: s => `Count: ${s.get("count")}`,
    on: { click: () => state.set("count", state.get("count") + 1) }
});
counter.mount(document.getElementById("app"));
```

No Node runtime is required by the deployed browser framework. A backend can
serve or embed these assets using its own tooling. Consumer integration tests
should exercise that consumer's UI and adapter against its chosen framework
version without reading Spine's source checkout or importing its demo app.

## Standalone file-browser example API

Spine's development-only file-browser example is fixture-backed. Its normalized
entries have the application shape `{ name, path, kind, created }`, with `kind`
equal to `"file"` or `"folder"`. Optional metadata such as size stays in
application data. This is an example convention, not a core framework type.

A replaceable example API implements:

| Member | Application responsibility |
| --- | --- |
| `list(path, {signal})` | Resolve a normalized entry array. |
| `preview(entry, {signal})` | Resolve `{kind, text}`, `{kind, blob}`, or `{kind, url}` as appropriate. |
| `upload(path, file, {signal})` | Perform the application's upload operation. |
| `createFolder(path, name, {signal})` | Perform the application's folder operation. |
| `fileUrl(entry)` | Supply an application-owned download/media URL. |
| `forms.upload`, `forms.newFolder` | Optional application's native form actions. |
| `nativeForms` | Choose native submission when true; otherwise use API operations. |

Construct the example with an explicit API to experiment:

```js
const browser = new FileBrowser({ api: new FixtureFilesApi() });
browser.mount(document.getElementById("app"));
```

`FileBrowser` and `FixtureFilesApi` are demo classes, not exports in the framework
package. A real consumer should write its own UI and adapter using Spine's
public Render, State, Region, List, routing, and request APIs. Normalize backend
responses inside that adapter; keep endpoint URLs, authentication negotiation,
filesystem rules, and upload semantics there. Respect AbortSignals and dispose
owned work through component lifecycle hooks.

## Existing consumer migration

If a consumer previously copied Spine's entire example distribution or depended
on a neighboring source checkout, replace that workflow with an explicit
versioned framework artifact. Keep the consumer's application code, styles,
adapter, asset registration, and tests in the consumer repository. Remove shared
application imports and automatic cross-repository build steps. Each repository
then builds and tests independently; updating the vendored/installed framework is
an intentional consumer dependency change.
