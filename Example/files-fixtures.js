// Standalone in-memory adapter. No server, URL convention, or credentials needed.
class FixtureFilesApi {
    constructor() {
        this.nativeForms = false;
        this.description = "In-memory example: files and folders live in memory. Upload a file to try its preview.";
        this.entries = [
            { name: "documents", path: "documents", kind: "folder", created: "2026-10-01" },
            { name: "welcome.txt", path: "welcome.txt", kind: "file", created: "2026-10-19" },
            { name: "landscape.svg", path: "landscape.svg", kind: "file", created: "2026-10-12" },
            { name: "empty", path: "documents/empty", kind: "folder", created: "2026-10-02" },
            { name: "notes.md", path: "documents/notes.md", kind: "file", created: "2026-10-05" }
        ];
        this.contents = new Map([
            ["welcome.txt", "Welcome to the Spine file browser.\nCreate a folder or upload a file; this demo stores changes in memory.\nNames such as <script> stay plain text."],
            ["documents/notes.md", "# Example notes\nNested links support browser back and forward navigation."],
            ["landscape.svg", '<svg xmlns="http://www.w3.org/2000/svg" width="640" height="300"><rect width="640" height="300" fill="#dceee9"/><path d="M0 300 170 80 300 230 420 100 640 300" fill="#22675f"/><circle cx="520" cy="65" r="30" fill="#eab96a"/></svg>']
        ]);
        this.uploads = new Map();
    }

    _check(signal) {
        if (signal?.aborted) throw new DOMException("Request cancelled", "AbortError");
    }

    async list(path, { signal } = {}) {
        this._check(signal);
        path = filesPath(path);
        if (path && !this.entries.some(entry => entry.kind === "folder" && entry.path === path)) {
            throw new Error("Directory not found");
        }
        return this.entries.filter(entry => entry.path.split("/").slice(0, -1).join("/") === path)
            .map(entry => ({ ...entry }));
    }

    // No direct URL exists for in-memory files; the UI downloads preview blobs.
    fileUrl() { return null; }

    async preview(entry, { signal } = {}) {
        this._check(signal);
        const kind = filePreviewKind(entry.name);
        const uploaded = this.uploads.get(entry.path);
        if (kind === "text") {
            const text = uploaded ? await new Promise((resolve, reject) => {
                const reader = new FileReader();
                const cancel = () => { reader.abort(); reject(new DOMException("Request cancelled", "AbortError")); };
                signal?.addEventListener("abort", cancel, { once: true });
                reader.onload = () => { signal?.removeEventListener("abort", cancel); resolve(reader.result); };
                reader.onerror = () => { signal?.removeEventListener("abort", cancel); reject(reader.error); };
                reader.readAsText(uploaded);
            }) : this.contents.get(entry.path) || "";
            this._check(signal);
            return { kind, text };
        }
        const blob = uploaded || new Blob([this.contents.get(entry.path) || ""], { type: "image/svg+xml" });
        return { kind, blob };
    }

    async upload(path, file, { signal } = {}) {
        this._check(signal);
        if (!file || !file.name) throw new Error("Choose a file first");
        const fullPath = [filesPath(path), file.name].filter(Boolean).join("/");
        this.entries = this.entries.filter(entry => entry.path !== fullPath);
        this.entries.push({ name: file.name, path: fullPath, kind: "file", created: new Date().toISOString() });
        this.uploads.set(fullPath, file);
    }

    async createFolder(path, name, { signal } = {}) {
        this._check(signal);
        if (!name.trim() || /[\\/]/.test(name) || [".", ".."].includes(name)) throw new Error("Enter one folder name without slashes");
        const fullPath = [filesPath(path), name].filter(Boolean).join("/");
        if (this.entries.some(entry => entry.path === fullPath)) throw new Error("Name already exists");
        this.entries.push({ name, path: fullPath, kind: "folder", created: new Date().toISOString() });
    }
}
