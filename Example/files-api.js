// Example-only path and preview helpers. A service adapter supplies normalized
// { name, path, kind: 'file'|'folder', created } entries to FileBrowser.
// Adapter operations: list(path,{signal}), preview(entry,{signal}),
// upload(path,file,{signal}), createFolder(path,name,{signal}), fileUrl(entry).
// preview returns {kind,text|blob|url}; a null fileUrl uses that preview for
// downloads. Optional nativeForms + forms:{upload,newFolder} enable native POSTs.
function filesPath(path = "") {
    return String(path).replace(/\\/g, "/").replace(/^\.\//, "").split("/")
        .filter(part => part && part !== ".").join("/");
}

function filesEncodedPath(path) {
    return filesPath(path).split("/").map(encodeURIComponent).join("/");
}

function filePreviewKind(name) {
    const extension = String(name).split(".").pop().toLowerCase();
    if (["png", "jpg", "jpeg", "gif", "webp", "svg", "avif"].includes(extension)) return "image";
    if (extension === "pdf") return "pdf";
    if (["mp4", "webm", "ogg", "mov"].includes(extension)) return "video";
    if (["txt", "md", "json", "js", "css", "html", "csv", "rs", "xml", "log"].includes(extension)) return "text";
    return "download";
}
