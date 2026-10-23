const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { JSDOM, VirtualConsole } = require('jsdom');
const { build, buildFramework } = require('../scripts/build.cjs');
const { settle } = require('./helpers.cjs');

test('framework builds from an isolated src directory without an example or consumer checkout', async t => {
    const isolated = await fs.mkdtemp(path.join(os.tmpdir(), 'spinejs-framework-'));
    t.after(async () => {
        assert.equal(path.dirname(isolated), path.resolve(os.tmpdir()));
        assert.ok(path.basename(isolated).startsWith('spinejs-framework-'));
        await fs.rm(isolated, { recursive: true, force: true });
    });
    const sources = path.join(isolated, 'framework');
    const output = path.join(isolated, 'dist');
    await fs.cp(path.resolve(__dirname, '../src'), path.join(sources, 'src'), { recursive: true });
    await buildFramework(output, sources);
    assert.deepEqual((await fs.readdir(output)).sort(), ['spine.js', 'spine.min.js', 'spine.min.js.map']);
    for (const file of ['spine.js', 'spine.min.js']) {
        const code = await fs.readFile(path.join(output, file), 'utf8');
        assert.doesNotMatch(code, /HttpFilesApi|FixtureFilesApi|FileBrowser|\/upload_file|\/api\/new_folder|spine-files-api/);
        const dom = new JSDOM('<main id="consumer"></main>', { url: 'http://independent.test/', runScripts: 'outside-only' });
        try {
            vm.runInContext(code, dom.getInternalVMContext(), { filename: file });
            vm.runInContext(`
                const store = new State({persist:false,initial:{value:'independent'}});
                const view = new P({store,watch:['value'],plainText:s=>s.get('value')});
                view.mount(document.getElementById('consumer'));
                store.set('value','updated');
                if(document.querySelector('p').textContent !== 'updated') throw new Error('Consumer binding failed');
                view.dispose();
            `, dom.getInternalVMContext());
        } finally { dom.window.close(); }
    }
});

test('Node build emits usable readable and minified distributions', async t => {
    const output = await fs.mkdtemp(path.join(os.tmpdir(), 'spinejs-build-'));
    t.after(async () => {
        // Only remove the directory allocated for this test.
        assert.equal(path.dirname(output), path.resolve(os.tmpdir()));
        assert.ok(path.basename(output).startsWith('spinejs-build-'));
        await fs.rm(output, { recursive: true, force: true });
    });
    await build(output);

    // Example sources stay together; generated pages resolve only bundled assets.
    assert.equal((await fs.stat(path.join(output, 'example_table.json'))).isFile(), true);
    assert.equal((await fs.stat(path.join(output, 'style/css/files.css'))).isFile(), true);
    await assert.rejects(fs.access(path.join(output, 'src')));
    await assert.rejects(fs.access(path.join(output, 'Example')));

    for (const name of ['spine', 'app']) {
        const readable = await fs.readFile(path.join(output, `${name}.js`), 'utf8');
        const minified = await fs.readFile(path.join(output, `${name}.min.js`), 'utf8');
        assert.ok(Buffer.byteLength(minified) < Buffer.byteLength(readable));
        const map = JSON.parse(await fs.readFile(path.join(output, `${name}.min.js.map`), 'utf8'));
        assert.equal(map.file, `${name}.min.js`);
        assert.equal(map.sources.length, map.sourcesContent.length);
        assert.ok(map.sourcesContent.every(source => typeof source === 'string' && source.length));
        assert.match(minified, new RegExp(`sourceMappingURL=${name}\\.min\\.js\\.map`));
    }

    for (const suffix of ['', '.min']) {
        await t.test(`spine${suffix}.js retains the public classic-script API without the example app`, async () => {
            const dom = new JSDOM('<div id="app"></div>', { url: 'http://localhost/', runScripts: 'outside-only' });
            try {
                const context = dom.getInternalVMContext();
                vm.runInContext(await fs.readFile(path.join(output, `spine${suffix}.js`), 'utf8'), context);
                vm.runInContext(`
                    const publicAPI = { Render, Component, H1, H2, H3, H4, P, A, Ul, Li,
                        Div, Table, Tr, TableData, Thead, Th, Td, Nav, Tbody, Form, Label,
                        Input, Button, State, Tree, Spine, Fetch, SingleFetch, makeid,
                        Region, List, request, Resource };
                    for (const [name, value] of Object.entries(publicAPI)) {
                        if (typeof value !== 'function') throw new Error(name + ' is missing');
                    }
                    const state = new State();
                    const paragraph = new P({ store: state, watch: ['count'], text: s => s.get('count', 0) });
                    document.getElementById('app').appendChild(paragraph.render());
                    state.set('count', 7);
                    if (document.querySelector('p').textContent !== '7') throw new Error('Binding failed');
                    paragraph.dispose();
                    state.set('count', 8);
                    if (document.querySelector('p').textContent !== '7') throw new Error('Disposal failed');
                `, context, { filename: 'consumer.js' });
            } finally {
                dom.window.close();
            }
        });

        await t.test(`${suffix ? 'minified' : 'readable'} application starts and navigates from a subdirectory`, async () => {
            const html = await fs.readFile(path.join(output, suffix ? 'index.html' : 'index.debug.html'), 'utf8');
            const errors = [];
            const virtualConsole = new VirtualConsole();
            virtualConsole.on('error', error => errors.push(error));
            virtualConsole.on('jsdomError', error => errors.push(error));
            const dom = new JSDOM(html, { url: 'http://localhost/demo/#counter',
                runScripts: 'outside-only', pretendToBeVisual: true, virtualConsole });
            try {
                const { window } = dom;
                const { document } = window;
                let blobSequence = 0;
                const blobUrls = new Set();
                window.URL.createObjectURL = () => { const url = `blob:test-${++blobSequence}`; blobUrls.add(url); return url; };
                window.URL.revokeObjectURL = url => blobUrls.delete(url);
                const urls = [];
                const sampleData = await fs.readFile(path.join(output, 'example_table.json'), 'utf8');
                window.fetch = async url => {
                    urls.push(new URL(url, window.location.href).pathname);
                    return { json: async () => JSON.parse(sampleData) };
                };
                // Controlled idle start without relying on real timers.
                let idle;
                window.requestIdleCallback = callback => { idle = callback; return 1; };
                window.cancelIdleCallback = () => { idle = null; };
                const scripts = [...document.querySelectorAll('script')];
                assert.equal(scripts.length, 2);
                assert.deepEqual(scripts.map(script => script.getAttribute('src')),
                    [`./spine${suffix}.js`, `./app${suffix}.js`]);
                for (const element of document.querySelectorAll('script[src], link[href]')) {
                    const resource = element.getAttribute('src') || element.getAttribute('href');
                    assert.ok(resource.startsWith('./'), resource);
                    await fs.access(path.join(output, resource));
                }
                for (const script of scripts) {
                    const file = script.getAttribute('src');
                    vm.runInContext(await fs.readFile(path.join(output, file), 'utf8'), dom.getInternalVMContext(), { filename: file });
                }
                await settle();
                assert.equal(document.getElementById('counter_value').textContent, 'Count: 0');
                const oldButton = [...document.querySelectorAll('button')].find(node => node.textContent === 'Increase');
                oldButton.click();
                assert.equal(document.getElementById('counter_value').textContent, 'Count: 1');
                const navigate = hash => {
                    window.history.replaceState(null, '', hash);
                    window.dispatchEvent(new window.HashChangeEvent('hashchange'));
                };
                navigate('#about');
                await settle();
                idle();
                await settle();
                assert.deepEqual(urls, ['/demo/example_table.json']);
                assert.ok(document.querySelectorAll('table tbody tr').length > 0);
                navigate('#counter');
                oldButton.click();
                assert.equal(document.getElementById('counter_value').textContent, 'Count: 1');
                document.querySelector('button').click();
                assert.equal(document.getElementById('counter_value').textContent, 'Count: 2');

                navigate('#/files/');
                await settle();
                const browserShell = document.querySelector('.files-browser');
                assert.ok(browserShell);
                const welcomeRow = document.querySelector('[data-file-path="welcome.txt"]');
                assert.ok(welcomeRow);
                const folderInput = document.getElementById('files_folder_name');
                folderInput.value = 'build-test-folder';
                document.querySelector('form[aria-label="Create folder"]').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
                await settle();
                assert.ok(document.querySelector('[data-file-path="build-test-folder"]'));
                assert.equal(document.querySelector('[data-file-path="welcome.txt"]'), welcomeRow);
                welcomeRow.querySelector('a').click();
                await settle();
                assert.match(document.querySelector('.files-preview code').textContent, /Welcome to the Spine file browser/);
                assert.equal(blobUrls.size, 1);
                [...document.querySelectorAll('button')].find(node => node.textContent === 'Close preview').click();
                assert.equal(blobUrls.size, 0);
                navigate('#/files/documents'); await settle();
                assert.equal(document.querySelector('.files-browser'), browserShell);
                assert.ok(document.querySelector('[data-file-path="documents/notes.md"]'));
                navigate('#counter');
                assert.equal(document.querySelector('.files-browser'), null);
                assert.deepEqual(errors, []);
            } finally {
                dom.window.close();
            }
        });
    }
});
