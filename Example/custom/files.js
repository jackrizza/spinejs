class FilesPreview extends Div {
    constructor({ entry, result, close, highlighter }) {
        const kind = result.kind;
        const content = kind === "text"
            ? new Render({ tag: "pre", children: [new Render({ tag: "code", plainText: result.text })] })
            : kind === "image" ? new Render({ tag: "img", attrs: { alt: entry.name } })
            : kind === "pdf" ? new Render({ tag: "iframe", attrs: { title: `Preview of ${entry.name}` } })
            : kind === "video" ? new Render({ tag: "video", props: { controls: true }, attrs: { preload: "metadata" } })
            : new P({ plainText: "Preview unavailable. Download the file to open it." });
        super({ classlist: ["files-preview"], attrs: { role: "region", "aria-label": "File preview" },
            children: [new H2({ plainText: entry.name }), new Button({ plainText: "Close preview",
                attrs: { type: "button" }, on: { click: close } }), content,
            new A({ plainText: "Download", attrs: { download: entry.name, "data-download": "" } })],
            onmount: element => {
                const blobUrl = result.blob ? URL.createObjectURL(result.blob) : null;
                const url = blobUrl || result.url;
                const media = element.querySelector("img,iframe,video");
                if (media && url) media.src = url;
                const download = element.querySelector("[data-download]");
                if (url) download.href = url;
                else if (kind === "text") {
                    const textUrl = URL.createObjectURL(new Blob([result.text], { type: "text/plain" }));
                    download.href = textUrl;
                    this.addCleanup(() => URL.revokeObjectURL(textUrl));
                }
                let cleanup;
                try {
                    cleanup = kind === "text" ? highlighter?.(element.querySelector("code"), entry) : undefined;
                } catch (error) {
                    if (blobUrl) URL.revokeObjectURL(blobUrl);
                    throw error;
                }
                return () => {
                    try { if (typeof cleanup === "function") cleanup(); }
                    finally {
                        try {
                            if (kind === "video" && media) {
                                try { media.pause(); }
                                finally {
                                    media.removeAttribute("src");
                                    media.load();
                                }
                            } else media?.removeAttribute("src");
                        } finally { if (blobUrl) URL.revokeObjectURL(blobUrl); }
                    }
                };
            }
        });
    }
}

class FileBrowser extends Div {
    constructor({ api = new FixtureFilesApi(), path = "", highlighter } = {}) {
        const store = new State({ persist: false, initial: { path: filesPath(path), entries: [], sort: "name",
            ascending: true, loading: false, busy: false, error: "", preview: null, uploadOpen: false } });
        super({ classlist: ["files-browser"] });
        this.api = api;
        this.state = store;
        this.highlighter = highlighter;
        this._loadId = 0;
        this._previewId = 0;
        this._mutationId = 0;
        this._downloadId = 0;
        const button = (plainText, click, attrs = {}) => new Button({ plainText,
            attrs: { type: "button", ...attrs }, on: { click } });
        const pending = config => ({ ...config, store, watch: ["busy", "loading"],
            props: { disabled: state => state.get("busy") || state.get("loading") } });
        const hiddenPath = () => new Input({ store, watch: ["path"], attrs: { type: "hidden", name: "path" },
            props: { value: state => state.get("path") } });
        const newFolder = new Form({ attrs: { method: "post", action: api.forms?.newFolder,
            enctype: "multipart/form-data", "aria-label": "Create folder" },
            on: { submit: event => this._submit(event, "folder") }, children: [
                hiddenPath(), new Label({ plainText: "Folder name", attrs: { for: "files_folder_name" } }),
                new Input({ key: "files_folder_name", attrs: { name: "name", required: true,
                    placeholder: "New folder", autocomplete: "off" } }),
                new Button(pending({ plainText: "Create folder", attrs: { type: "submit" } }))
            ] });
        const rows = new List({ tag: "tbody", store, watch: ["entries", "sort", "ascending"],
            items: state => this._sorted(state), key: entry => entry.path,
            render: row => this._row(row) });
        this.children = [
            new H1({ plainText: "File browser" }),
            new P({ plainText: api.description || "Custom file service" }),
            new Div({ classlist: ["files-toolbar"], children: [
                new A({ plainText: "Root", attrs: { href: "#/files/" } }),
                new A({ store, watch: ["path"], plainText: "Parent folder",
                    attrs: { href: state => `#/files/${filesEncodedPath(state.get("path").split("/").slice(0, -1).join("/"))}` } }),
                button("Refresh", () => this.navigate(store.get("path"))),
                button("Upload file", () => store.set("uploadOpen", !store.get("uploadOpen"))),
                new P({ store, watch: ["path"], plainText: state => `/${state.get("path")}`,
                    attrs: { "aria-label": "Current directory" } })
            ] }),
            newFolder,
            new Region({ store, watch: ["uploadOpen"], render: state => state.get("uploadOpen")
                ? new Form({ attrs: { method: "post", action: api.forms?.upload, enctype: "multipart/form-data",
                    "aria-label": "Upload file" }, on: { submit: event => this._submit(event, "upload") }, children: [
                    hiddenPath(), new Label({ plainText: "Choose file", attrs: { for: "files_upload" } }),
                    new Input({ key: "files_upload", attrs: { type: "file", name: "file", required: true } }),
                    new Button(pending({ plainText: "Upload", attrs: { type: "submit" } })),
                    button("Cancel upload", () => store.set("uploadOpen", false))
                ] }) : null }),
            new Region({ store, watch: ["loading"], render: state => state.get("loading")
                ? new P({ plainText: "Loading directory…", attrs: { role: "status" } }) : null }),
            new Region({ store, watch: ["error"], render: state => state.get("error")
                ? new Div({ attrs: { role: "alert" }, children: [new P({ plainText: state.get("error") }),
                    button("Retry", () => this.navigate(store.get("path")))] }) : null }),
            new Region({ store, watch: ["entries", "loading", "error"], render: state =>
                !state.get("loading") && !state.get("error") && !state.get("entries").length
                    ? new P({ plainText: "This folder is empty." }) : null }),
            new Table({ classlist: ["files-table"], children: [
                new Render({ tag: "caption", plainText: "Directory contents" }),
                new Thead({ children: [new Tr({ children: [
                    new Th({ children: [button("Name", () => this.sort("name"))] }),
                    new Th({ children: [button("Date", () => this.sort("created"))] }),
                    new Th({ plainText: "Download" })
                ] })] }), rows
            ] }),
            new Region({ store, watch: ["preview"], render: state => {
                const preview = state.get("preview");
                return preview ? new FilesPreview({ ...preview, highlighter: this.highlighter,
                    close: () => this.closePreview() }) : null;
            } })
        ];
        this.onmount = () => {
            this._active = true;
            this.navigate(store.get("path"));
            return () => {
                this._active = false;
                this._cancelLoads();
                store.set("preview", null);
                store.set("busy", false);
                store.set("loading", false);
            };
        };
    }

    _sorted(store) {
        const field = store.get("sort");
        const direction = store.get("ascending") ? 1 : -1;
        return [...store.get("entries")].sort((a, b) => {
            if (a.kind !== b.kind) return a.kind === "folder" ? -1 : 1;
            const aTime = field === "created" ? Date.parse(a.created) : NaN;
            const bTime = field === "created" ? Date.parse(b.created) : NaN;
            return (Number.isFinite(aTime) && Number.isFinite(bTime)
                ? aTime - bTime : String(a[field]).localeCompare(String(b[field]))) * direction;
        });
    }

    sort(field) {
        if (this.state.get("sort") === field) this.state.set("ascending", !this.state.get("ascending"));
        else { this.state.set("sort", field); this.state.set("ascending", true); }
    }

    _row(store) {
        const entry = () => store.get("item");
        return new Tr({ store, watch: ["item"], attrs: { "data-file-path": () => entry().path }, children: [
            new Td({ children: [new A({ store, watch: ["item"],
                plainText: () => `${entry().kind === "folder" ? "📁" : "📄"} ${entry().name}`,
                attrs: { href: () => entry().kind === "folder"
                    ? `#/files/${filesEncodedPath(entry().path)}` : this.api.fileUrl?.(entry()) || "#" },
                on: { click: event => {
                    if (entry().kind !== "folder") { event.preventDefault(); this.openPreview(entry()); }
                } } })] }),
            new Td({ store, watch: ["item"], plainText: () => entry().created }),
            new Td({ children: [new A({ store, watch: ["item"], plainText: () => entry().kind === "folder" ? "" : "Download",
                attrs: { href: () => entry().kind === "folder" ? null : this.api.fileUrl?.(entry()) || "#",
                    download: () => entry().kind === "folder" ? null : entry().name },
                on: { click: event => {
                    if (entry().kind === "file" && !this.api.fileUrl?.(entry())) {
                        event.preventDefault(); this.download(entry());
                    }
                } } })] })
        ] });
    }

    _cancelLoads() {
        this._loadId++;
        this._previewId++;
        this._mutationId++;
        this._downloadId++;
        this._directoryTask?.cleanups.splice(0).forEach(cleanup => cleanup());
        this._directoryController?.abort();
        this._previewController?.abort();
        this._mutationController?.abort();
        this._downloadController?.abort();
    }

    navigate(path = "", { signal } = {}) {
        path = filesPath(path);
        if (signal?.aborted) return Promise.resolve();
        const attachSignal = task => {
            if (!signal) return;
            const abort = () => task.controller.abort();
            signal.addEventListener("abort", abort, { once: true });
            task.cleanups.push(() => signal.removeEventListener("abort", abort));
        };
        if (this._directoryTask?.path === path && !this._directoryTask.controller.signal.aborted) {
            attachSignal(this._directoryTask);
            return this._directoryTask.promise;
        }
        this._cancelLoads();
        this.state.set("preview", null);
        this.state.set("busy", false);
        if (this.state.get("path") !== path) this.state.set("entries", []);
        this.state.set("path", path);
        this.state.set("error", "");
        this.state.set("loading", true);
        const id = this._loadId;
        const controller = this._directoryController = new AbortController();
        const task = this._directoryTask = { path, controller, cleanups: [], promise: null };
        attachSignal(task);
        task.promise = (async () => {
            try {
                const entries = await this.api.list(path, { signal: controller.signal });
                if (id !== this._loadId || controller.signal.aborted) return;
                this.state.set("entries", entries);
            } catch (error) {
                if (id === this._loadId && !controller.signal.aborted) this.state.set("error", error.message || String(error));
            } finally {
                task.cleanups.splice(0).forEach(cleanup => cleanup());
                if (this._directoryTask === task) this._directoryTask = null;
                if (id === this._loadId) this.state.set("loading", false);
            }
        })();
        return task.promise;
    }

    async download(entry) {
        this._downloadController?.abort();
        const controller = this._downloadController = new AbortController();
        const id = ++this._downloadId;
        try {
            const result = await this.api.preview(entry, { signal: controller.signal });
            if (id !== this._downloadId || controller.signal.aborted || !this._active) return;
            const blob = result.blob || (result.text !== undefined
                ? new Blob([result.text], { type: "text/plain" }) : null);
            const objectUrl = blob ? URL.createObjectURL(blob) : null;
            const url = objectUrl || result.url;
            if (!url) throw new Error("This file has no downloadable content");
            let timer;
            const cleanup = objectUrl
                ? this.addCleanup(() => { clearTimeout(timer); URL.revokeObjectURL(objectUrl); }) : null;
            const link = document.createElement("a");
            link.href = url;
            link.download = entry.name;
            link.hidden = true;
            this.element.appendChild(link);
            try { link.click(); }
            finally {
                link.remove();
                // Give the browser a task boundary to consume its download URL.
                if (cleanup) timer = setTimeout(cleanup, 1000);
            }
        } catch (error) {
            if (id === this._downloadId && !controller.signal.aborted) this.state.set("error", error.message || String(error));
        }
    }

    closePreview() {
        this._previewId++;
        this._previewController?.abort();
        this.state.set("preview", null);
    }

    async openPreview(entry) {
        this.closePreview();
        this.state.set("error", "");
        const id = this._previewId;
        const controller = this._previewController = new AbortController();
        try {
            const result = await this.api.preview(entry, { signal: controller.signal });
            if (id === this._previewId && !controller.signal.aborted) this.state.set("preview", { entry, result });
        } catch (error) {
            if (id === this._previewId && !controller.signal.aborted) this.state.set("error", error.message || String(error));
        }
    }

    async _submit(event, kind) {
        if (this.api.nativeForms) return;
        event.preventDefault();
        if (this.state.get("busy") || this.state.get("loading")) return;
        const form = event.currentTarget;
        const file = kind === "upload" ? form.elements.namedItem("file").files[0] : null;
        const name = kind === "folder" ? form.elements.namedItem("name").value.trim() : null;
        if ((kind === "upload" && !file) || (kind === "folder" && (!name || /[\\/]/.test(name) || [".", ".."].includes(name)))) {
            this.state.set("error", kind === "upload" ? "Choose a file first" : "Enter one folder name without slashes");
            return;
        }
        this._mutationController?.abort();
        const controller = this._mutationController = new AbortController();
        const id = ++this._mutationId;
        const path = this.state.get("path");
        this.state.set("busy", true);
        this.state.set("error", "");
        try {
            if (kind === "upload") await this.api.upload(path, file, { signal: controller.signal });
            else await this.api.createFolder(path, name, { signal: controller.signal });
            if (id !== this._mutationId || controller.signal.aborted) return;
            if (kind === "upload") this.state.set("uploadOpen", false);
            else form.reset();
            await this.navigate(path);
        } catch (error) {
            if (id === this._mutationId && !controller.signal.aborted) this.state.set("error", error.message || String(error));
        } finally {
            if (id === this._mutationId) this.state.set("busy", false);
        }
    }
}
