const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { JSDOM, VirtualConsole } = require('jsdom');

function environment(t, options = {}) {
    const messages = [];
    const virtualConsole = new VirtualConsole();
    for (const level of ['log', 'warn', 'error', 'jsdomError']) {
        virtualConsole.on(level, (...args) => messages.push({ level, args }));
    }
    const dom = new JSDOM('<!doctype html><div id="app"></div>', {
        url: 'http://localhost/',
        runScripts: 'outside-only',
        pretendToBeVisual: true,
        virtualConsole,
    });
    t.after(() => dom.window.close());
    const context = dom.getInternalVMContext();
    Object.assign(dom.window, options);
    for (const file of ['src/state.js', 'src/render.js', 'src/component.js',
        'src/regions.js', 'src/route.js', 'src/spine.js', 'src/fetch.js', 'Example/custom/table.js']) {
        vm.runInContext(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), context, { filename: file });
    }
    const api = vm.runInContext('({ State, Render, Region, List, Div, P, Button, Input, Tree, Spine, Fetch, SingleFetch, request, Resource, TableCreator })', context);
    return { ...api, window: dom.window, document: dom.window.document, context, messages };
}

function deferred() {
    let resolve;
    let reject;
    const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
    return { promise, resolve, reject };
}

async function settle() {
    // Flush fetch/json/component promise chains without real network or timers.
    for (let index = 0; index < 20; index += 1) await Promise.resolve();
}

module.exports = { environment, deferred, settle };
