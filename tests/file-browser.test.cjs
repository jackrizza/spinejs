const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { environment, deferred, settle } = require('./helpers.cjs');

function setup(t) {
    const env = environment(t);
    for (const file of ['Example/files-api.js', 'Example/files-fixtures.js', 'Example/custom/files.js']) {
        vm.runInContext(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), env.context, { filename: file });
    }
    let urlIndex = 0;
    env.urls = [];
    env.revoked = [];
    env.window.URL.createObjectURL = blob => { const url = `blob:test-${++urlIndex}`; env.urls.push({ url, blob }); return url; };
    env.window.URL.revokeObjectURL = url => env.revoked.push(url);
    Object.assign(env, vm.runInContext('({ FileBrowser, FilesPreview, FixtureFilesApi, filesEncodedPath })', env.context));
    env.click = label => {
        const button = [...env.document.querySelectorAll('button')].find(node => node.textContent === label);
        assert.ok(button, `Button ${label}`);
        button.click();
    };
    env.submit = form => form.dispatchEvent(new env.window.Event('submit', { bubbles: true, cancelable: true }));
    return env;
}

test('fixture file browser navigates, sorts stable rows, creates folders, uploads, and previews safe text', async t => {
    const e = setup(t);
    const browser = new e.FileBrowser();
    browser.mount(e.document.getElementById('app'));
    await settle();
    const input = e.document.getElementById('files_folder_name');
    const row = e.document.querySelector('[data-file-path="welcome.txt"]');
    input.value = 'keep draft';
    input.focus();
    input.setSelectionRange(1, 4);
    e.click('Name');
    assert.equal(e.document.querySelector('[data-file-path="welcome.txt"]'), row);
    assert.equal(e.document.activeElement, input);
    assert.equal(input.value, 'keep draft');
    assert.equal(input.selectionStart, 1);
    e.click('Date');
    assert.equal(e.document.querySelector('[data-file-path="welcome.txt"]'), row);
    input.value = 'new folder';
    e.submit(input.form);
    await settle();
    assert.ok(e.document.querySelector('[data-file-path="new folder"]'));
    assert.equal(e.document.querySelector('[data-file-path="welcome.txt"]'), row);
    e.click('Upload file');
    const fileInput = e.document.getElementById('files_upload');
    const file = new e.window.File(['<img src=x onerror=alert(1)>'], 'unsafe<name>.txt', { type: 'text/plain' });
    Object.defineProperty(fileInput, 'files', { value: [file] });
    e.submit(fileInput.form);
    await settle();
    assert.match(e.document.querySelector('tbody').textContent, /unsafe<name>\.txt/);
    assert.equal(e.document.querySelector('tbody img'), null);
    const entry = browser.state.get('entries').find(item => item.name === file.name);
    await browser.openPreview(entry);
    // FileReader callbacks are tasks, unlike the fixture listing promises.
    assert.equal(e.document.querySelector('code').textContent, '<img src=x onerror=alert(1)>');
    assert.equal(e.document.querySelector('code img'), null);
    e.click('Close preview');
    assert.equal(e.document.querySelector('.files-preview'), null);
    assert.equal(e.revoked.length, 1);
    await browser.navigate('documents/empty');
    assert.match(e.document.body.textContent, /This folder is empty/);
    assert.equal(e.document.getElementById('files_folder_name'), input);
    await browser.navigate('missing');
    assert.match(e.document.querySelector('[role=alert]').textContent, /Directory not found/);
    await browser.navigate('documents');
    assert.match(e.document.querySelector('[data-file-path="documents/empty"] a').getAttribute('href'), /#\/files\/documents\/empty/);
    browser.dispose();
    assert.equal(browser.state.subscriptions.size, 0);
});

test('navigation and disposal invalidate late directory, preview, and mutation responses', async t => {
    const e = setup(t);
    const loads = [];
    const previews = [];
    const mutations = [];
    const api = { nativeForms: false, forms: { upload: '/upload', newFolder: '/folder' }, fileUrl: () => '/file',
        list(path, options) { const job = deferred(); loads.push({ path, options, ...job }); return job.promise; },
        preview(entry, options) { const job = deferred(); previews.push({ options, ...job }); return job.promise; },
        createFolder(path, name, options) { const job = deferred(); mutations.push({ options, ...job }); return job.promise; } };
    const browser = new e.FileBrowser({ api });
    browser.mount(e.document.getElementById('app'));
    const latest = browser.navigate('latest');
    assert.equal(loads[0].options.signal.aborted, true);
    loads[1].resolve([{ name: 'latest.txt', path: 'latest/latest.txt', created: '', kind: 'file' }]);
    await latest;
    loads[0].resolve([{ name: 'stale.txt', path: 'stale.txt', created: '', kind: 'file' }]);
    await settle();
    assert.equal(browser.state.get('entries')[0].name, 'latest.txt');
    const preview = browser.openPreview(browser.state.get('entries')[0]);
    browser.closePreview();
    previews[0].resolve({ kind: 'text', text: 'late content' });
    await preview;
    assert.equal(browser.state.get('preview'), null);
    assert.equal(previews[0].options.signal.aborted, true);
    const form = e.document.querySelector('form');
    form.elements.namedItem('name').value = 'folder';
    e.submit(form);
    assert.equal(browser.state.get('busy'), true);
    browser.dispose();
    assert.equal(mutations[0].options.signal.aborted, true);
    mutations[0].resolve();
    await settle();
    assert.equal(loads.length, 2);
    assert.equal(browser.state.subscriptions.size, 0);
    browser.mount(e.document.getElementById('app'));
    assert.equal(loads.length, 3);
    loads[2].resolve([]);
    await settle();
    browser.dispose();
    assert.equal(browser.state.subscriptions.size, 0);
});

test('loading, HTTP error, retry, and empty transitions keep the toolbar mounted', async t => {
    const e = setup(t);
    const jobs = [];
    const api = new e.FixtureFilesApi();
    api.list = () => { const job = deferred(); jobs.push(job); return job.promise; };
    const browser = new e.FileBrowser({ api });
    browser.mount(e.document.getElementById('app'));
    const toolbar = e.document.querySelector('.files-toolbar');
    assert.match(e.document.querySelector('[role=status]').textContent, /Loading/);
    jobs[0].reject(new Error('HTTP 503 unavailable'));
    await settle();
    assert.match(e.document.querySelector('[role=alert]').textContent, /503/);
    e.click('Retry');
    jobs[1].resolve([]);
    await settle();
    assert.equal(e.document.querySelector('.files-toolbar'), toolbar);
    assert.equal(e.document.querySelector('[role=alert]'), null);
    assert.match(e.document.body.textContent, /This folder is empty/);
    browser.dispose();
});

test('text highlighter and image, PDF, video blob resources release on preview removal', t => {
    const e = setup(t);
    let highlights = 0;
    let cleanup = 0;
    let pause = 0;
    let load = 0;
    e.window.HTMLMediaElement.prototype.pause = () => { pause++; };
    e.window.HTMLMediaElement.prototype.load = () => { load++; };
    for (const kind of ['text', 'image', 'pdf', 'video']) {
        const preview = new e.FilesPreview({ entry: { name: '<safe>.txt' },
            result: kind === 'text' ? { kind, text: '<b>safe</b>' } : { kind, blob: new e.window.Blob(['content']) },
            close() {}, highlighter(element) { assert.equal(element.isConnected, true); highlights++; return () => { cleanup++; }; } });
        preview.mount(e.document.getElementById('app'));
        assert.equal(preview.element.querySelector('h2').textContent, '<safe>.txt');
        if (kind === 'text') assert.equal(preview.element.querySelector('code b'), null);
        else assert.match(preview.element.querySelector('img,iframe,video').src, /^blob:test/);
        preview.dispose();
        preview.dispose();
    }
    assert.equal(highlights, 1);
    assert.equal(cleanup, 1);
    assert.equal(pause, 1);
    assert.equal(load, 1);
    assert.equal(e.urls.length, 4);
    assert.equal(e.revoked.length, 4);
});

test('injected native forms retain custom actions and multipart fields without interception', async t => {
    const e = setup(t);
    const api = { nativeForms: true, forms: { upload: '/test-upload', newFolder: '/test-folders' },
        list: async () => [], fileUrl: () => null,
        createFolder: () => assert.fail('native forms must not invoke async mutations') };
    const browser = new e.FileBrowser({ api });
    browser.mount(e.document.getElementById('app'));
    await settle();
    await browser.navigate('documents');
    const form = e.document.querySelector('form');
    assert.equal(form.getAttribute('action'), '/test-folders');
    assert.equal(form.enctype, 'multipart/form-data');
    assert.equal(form.elements.namedItem('path').value, 'documents');
    const event = new e.window.Event('submit', { cancelable: true });
    form.dispatchEvent(event);
    assert.equal(event.defaultPrevented, false);
    e.click('Upload file');
    assert.equal(e.document.getElementById('files_upload').form.getAttribute('action'), '/test-upload');
    browser.dispose();
});

test('normalized adapters inject data and direct download links without backend assumptions', async t => {
    const e = setup(t);
    const calls = [];
    const api = {
        list(path, options) {
            calls.push({ path, options });
            return Promise.resolve([{ name: 'a?.txt', path: 'a b/a?.txt', kind: 'file', created: 'today' },
                { name: 'folder #', path: 'a b/folder #', kind: 'folder', created: '' }]);
        },
        fileUrl: entry => `https://example.test/download/${e.filesEncodedPath(entry.path)}`,
        preview: async () => ({ kind: 'text', text: 'Adapter-controlled content' })
    };
    const browser = new e.FileBrowser({ api, path: 'a b' });
    browser.mount(e.document.getElementById('app'));
    await settle();
    assert.equal(calls.length, 1);
    assert.equal(calls[0].path, 'a b');
    assert.equal(calls[0].options.signal.aborted, false);
    assert.equal(e.document.querySelector('form').hasAttribute('action'), false);
    assert.match(e.document.body.textContent, /Custom file service/);
    const row = e.document.querySelector('[data-file-path="a b/a?.txt"]');
    const download = row.querySelector('a[download]');
    assert.equal(download.href, 'https://example.test/download/a%20b/a%3F.txt');
    const click = new e.window.MouseEvent('click', { cancelable: true });
    download.dispatchEvent(click);
    assert.equal(click.defaultPrevented, false, 'direct links use the browser download path');
    assert.equal(e.document.querySelector('[data-file-path="a b/folder #"] a').getAttribute('href'), '#/files/a%20b/folder%20%23');
    await browser.openPreview(browser.state.get('entries')[0]);
    assert.equal(e.document.querySelector('code').textContent, 'Adapter-controlled content');
    browser.dispose();
});

test('query strings and service metadata cannot activate a backend in the default demo', async t => {
    const e = setup(t);
    e.window.history.replaceState(null, '', '?filesApi=live&nativeForms=true#/files/');
    const meta = e.document.createElement('meta');
    meta.name = 'spine-files-api'; meta.content = 'live'; e.document.head.appendChild(meta);
    e.window.fetch = () => assert.fail('default demo must not access a backend');
    const browser = new e.FileBrowser();
    assert.ok(browser.api instanceof e.FixtureFilesApi);
    assert.equal(browser.api.nativeForms, false);
    browser.mount(e.document.getElementById('app'));
    await settle();
    assert.match(e.document.body.textContent, /In-memory example/);
    assert.equal(e.document.querySelector('form').hasAttribute('action'), false);
    assert.ok(browser.state.get('entries').every(entry => 'name' in entry && 'path' in entry && 'kind' in entry));
    browser.dispose();
});

test('an injected adapter can resolve a download URL without creating a blob', async t => {
    const e = setup(t);
    const api = { list: async () => [], fileUrl: () => null,
        preview: async () => ({ kind: 'download', url: 'https://example.test/signed-download' }) };
    const browser = new e.FileBrowser({ api });
    browser.mount(e.document.getElementById('app'));
    await settle();
    const clicks = [];
    e.window.HTMLAnchorElement.prototype.click = function () { clicks.push({ href: this.href, name: this.download }); };
    await browser.download({ name: 'archive.zip', path: 'archive.zip', kind: 'file' });
    assert.equal(clicks[0].href, 'https://example.test/signed-download');
    assert.equal(clicks[0].name, 'archive.zip');
    assert.equal(e.urls.length, 0);
    assert.equal(browser.state.get('error'), '');
    browser.dispose();
});

test('same-path navigation shares a pending listing and owns router signal listeners', async t => {
    const e = setup(t);
    const api = new e.FixtureFilesApi();
    const jobs = [];
    api.list = (path, options) => { const job = deferred(); jobs.push({ path, options, ...job }); return job.promise; };
    const browser = new e.FileBrowser({ api });
    browser.mount(e.document.getElementById('app'));
    const controller = new e.window.AbortController();
    const signal = controller.signal;
    let added = 0;
    let removed = 0;
    const add = signal.addEventListener.bind(signal);
    const remove = signal.removeEventListener.bind(signal);
    signal.addEventListener = (...args) => { added++; return add(...args); };
    signal.removeEventListener = (...args) => { removed++; return remove(...args); };
    browser.navigate('', { signal });
    assert.equal(jobs.length, 1, 'onmount and initial route update share one request');
    const next = browser.navigate('next');
    assert.equal(added, 1);
    assert.equal(removed, 1, 'obsolete route listener released without waiting for an ignored request');
    const nextController = new e.window.AbortController();
    const sameNext = browser.navigate('next', { signal: nextController.signal });
    assert.equal(next, sameNext);
    nextController.abort();
    assert.equal(jobs[1].options.signal.aborted, true);
    jobs[1].resolve([{ name: 'stale', path: 'next/stale', kind: 'file' }]);
    jobs[0].resolve([]);
    await next;
    await settle();
    assert.equal(browser.state.get('entries').length, 0);
    browser.dispose();
});

test('date sorting uses chronological RFC dates and fixture downloads release their owned URLs', async t => {
    const e = setup(t);
    const browser = new e.FileBrowser();
    browser.mount(e.document.getElementById('app'));
    await settle();
    browser.state.set('entries', [
        { name: 'later.txt', path: 'later.txt', kind: 'file', created: 'Fri, 02 Jan 2026 00:00:00 GMT' },
        { name: 'earlier.txt', path: 'earlier.txt', kind: 'file', created: 'Thu, 01 Jan 2026 00:00:00 GMT' }
    ]);
    e.click('Date');
    assert.equal(e.document.querySelector('tbody tr').dataset.filePath, 'earlier.txt');
    e.click('Date');
    assert.equal(e.document.querySelector('tbody tr').dataset.filePath, 'later.txt');
    const clicks = [];
    e.window.HTMLAnchorElement.prototype.click = function () { clicks.push({ name: this.download, href: this.href }); };
    let timerCallback;
    let cleared = 0;
    e.window.setTimeout = callback => { timerCallback = callback; return 42; };
    e.window.clearTimeout = timer => { assert.equal(timer, 42); cleared++; };
    await browser.download({ name: 'welcome.txt', path: 'welcome.txt', kind: 'file' });
    assert.equal(clicks[0].name, 'welcome.txt');
    assert.match(clicks[0].href, /^blob:test/);
    assert.equal(e.document.querySelector('a[hidden]'), null);
    assert.equal(e.revoked.length, 0);
    timerCallback();
    assert.equal(e.revoked.length, 1);
    browser.dispose();
    assert.equal(e.revoked.length, 1, 'cleanup is idempotent after its timer fires');
    assert.equal(cleared, 1);
});
