const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { JSDOM, VirtualConsole } = require('jsdom');
const { settle } = require('./helpers.cjs');

const repository = path.join(__dirname, '..');

function exactResourcePath(url) {
    let current = repository;
    for (const part of url.replace(/^\//, '').split('/')) {
        assert.ok(fs.readdirSync(current).includes(part), `Resource path must exist with exact case: ${url}`);
        current = path.join(current, part);
    }
    return current;
}

test('the shipped classic-script example starts cleanly and counter navigation remounts fresh bindings', async t => {
    const errors = [];
    const virtualConsole = new VirtualConsole();
    virtualConsole.on('error', error => errors.push(error));
    virtualConsole.on('jsdomError', error => errors.push(error));
    const html = fs.readFileSync(path.join(repository, 'Example/index.html'), 'utf8');
    const dom = new JSDOM(html, { url: 'http://localhost/Example/', runScripts: 'outside-only',
        pretendToBeVisual: true, virtualConsole });
    t.after(() => dom.window.close());
    const { window } = dom;
    const { document } = window;
    window.fetch = () => assert.fail('counter/home should not make requests');
    for (const resource of document.querySelectorAll('script[src], link[href]')) {
        exactResourcePath(new URL(resource.src || resource.href).pathname);
    }
    for (const script of document.querySelectorAll('script')) {
        const src = script.getAttribute('src');
        vm.runInContext(src ? fs.readFileSync(exactResourcePath(new URL(script.src).pathname), 'utf8') : script.textContent,
            dom.getInternalVMContext(), { filename: src || 'index.html startup' });
    }
    await settle();
    assert.match(document.getElementById('app').textContent, /Hello World/);
    assert.deepEqual(errors, []);
    const navigate = hash => {
        window.history.replaceState(null, '', hash);
        window.dispatchEvent(new window.HashChangeEvent('hashchange'));
    };
    navigate('#counter');
    const input = document.getElementById('counter_input');
    const firstView = document.getElementById('counter_value');
    const oldIncrement = [...document.querySelectorAll('button')].find(button => button.textContent === 'Increase');
    const reset = [...document.querySelectorAll('button')].find(button => button.textContent === 'Reset');
    assert.equal(firstView.textContent, 'Count: 0');
    input.value = 'draft survives';
    input.focus();
    input.setSelectionRange(1, 6);
    oldIncrement.click();
    assert.equal(firstView.textContent, 'Count: 1');
    assert.match(input.parentElement.textContent, /Second view: 1/);
    assert.equal(document.getElementById('counter_input'), input);
    assert.equal(input.value, 'draft survives');
    assert.equal(document.activeElement, input);
    assert.equal(input.selectionStart, 1);
    assert.equal(input.selectionEnd, 6);
    reset.click();
    assert.equal(firstView.textContent, 'Count: 0');
    navigate('#home');
    oldIncrement.click();
    assert.equal(firstView.textContent, 'Count: 0');
    navigate('#counter');
    const freshView = document.getElementById('counter_value');
    assert.equal(freshView.textContent, 'Count: 0');
    [...document.querySelectorAll('button')].find(button => button.textContent === 'Increase').click();
    assert.equal(freshView.textContent, 'Count: 1');
    assert.equal(firstView.textContent, 'Count: 0');

    let idle;
    window.requestIdleCallback = callback => { idle = callback; return 1; };
    window.cancelIdleCallback = () => { idle = null; };
    const urls = [];
    window.fetch = async url => {
        const pathname = new URL(url, window.location.href).pathname;
        urls.push(pathname);
        return { json: async () => JSON.parse(fs.readFileSync(exactResourcePath(pathname), 'utf8')) };
    };
    navigate('#about');
    await settle();
    assert.equal(typeof idle, 'function');
    idle();
    await settle();
    assert.deepEqual(urls, ['/Example/example_table.json']);
    assert.ok(document.querySelectorAll('table tbody tr').length > 0);
    navigate('#counter');
    assert.deepEqual(errors, []);
});
