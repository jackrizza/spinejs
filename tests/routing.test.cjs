const test = require('node:test');
const assert = require('node:assert/strict');
const { environment, deferred, settle } = require('./helpers.cjs');

test('wildcard and named routes decode paths and retain the mounted shell', t => {
    const { State, Div, Input, Tree, Spine, document } = environment(t);
    const store = new State({ persist: false });
    const shell = new Div({ children: [new Input({ options: { type: 'text' } })] });
    const visits = [];
    const router = new Spine({ root: '#app', store, routes: [
        { key: '/files/*path', tree: new Tree('files', shell), update: ctx => visits.push(ctx) },
        { key: '/user/:name', tree: new Tree('user', new Div({ text: 'User' })), update: ctx => visits.push(ctx) },
    ] });
    t.after(() => router.dispose());
    router.setActiveRoute('/files/'); router.renderRoute();
    const element = shell.element;
    const input = document.querySelector('input');
    input.value = 'draft'; input.focus(); input.setSelectionRange(1, 3);
    router.setActiveRoute('/files/My%20Folder/sub%23folder'); router.renderRoute();
    assert.equal(shell.element, element);
    assert.equal(document.activeElement, input);
    assert.equal(input.value, 'draft');
    assert.equal(input.selectionStart, 1);
    assert.equal(input.selectionEnd, 3);
    assert.equal(visits[0].signal.aborted, true);
    assert.equal(visits[1].params.path, 'My Folder/sub#folder');
    assert.equal(visits[1].store, store);
    router.setActiveRoute('/user/Ada%20Lovelace'); router.renderRoute();
    assert.equal(visits[2].params.name, 'Ada Lovelace');
    assert.equal(element.isConnected, false);
});

test('router owns one hash listener, handles deep links and root fallback, and stops cleanly', t => {
    const { Div, Tree, Spine, window, document } = environment(t);
    const visits = [];
    const router = new Spine({ defaultRoute: '/files/', routes: [
        { key: '/files/*path', tree: new Tree('files', new Div({ text: 'Files' })), update: ctx => visits.push(ctx.path) },
    ] });
    window.history.replaceState(null, '', '#/files/nested');
    router.start(); router.start();
    assert.equal(visits.at(-1), '/files/nested');
    const before = visits.length;
    window.history.replaceState(null, '', '#/files/back');
    window.dispatchEvent(new window.HashChangeEvent('hashchange'));
    assert.equal(visits.length, before + 1);
    window.history.replaceState(null, '', '/');
    window.dispatchEvent(new window.HashChangeEvent('hashchange'));
    assert.equal(visits.at(-1), '/files/');
    router.dispose(); router.dispose();
    window.dispatchEvent(new window.HashChangeEvent('hashchange'));
    assert.equal(visits.length, before + 2);
    assert.equal(document.getElementById('app').textContent, '');
});

test('obsolete async navigation failures cannot overwrite a newer route', async t => {
    const { Div, Tree, Spine, document } = environment(t);
    const pending = deferred();
    const router = new Spine([
        { key: 'slow', tree: new Tree('slow', new Div({ text: 'Slow' })), update: () => pending.promise },
        { key: 'ready', tree: new Tree('ready', new Div({ text: 'Ready' })) },
    ]);
    router.setActiveRoute('slow'); router.renderRoute();
    router.setActiveRoute('ready'); router.renderRoute();
    pending.reject(new Error('late failure')); await settle();
    assert.equal(document.getElementById('app').textContent, 'Ready');
    router.dispose();
});

test('unknown and malformed routes dispose existing mounts and report safe errors', t => {
    const { Div, Tree, Spine, document } = environment(t);
    const errors = [];
    const router = new Spine({ routes: [{ key: '/files/*path', tree: new Tree('files', new Div({ text: 'Files' })) }],
        onError: error => errors.push(error) });
    router.setActiveRoute('/files/'); router.renderRoute();
    router.setActiveRoute('missing'); router.renderRoute();
    assert.match(document.getElementById('app').textContent, /Unknown route/);
    router.setActiveRoute('/files/%E0%A4%A'); router.renderRoute();
    assert.equal(errors.length, 2);
    assert.equal(document.querySelectorAll('.error').length, 1);
    router.dispose();
});

test('older trees and routers cannot dispose a newer shared component mount', t => {
    const { State, Button, Tree, Spine, document } = environment(t);
    const state = new State({ persist: false, initial: { count: 0 } });
    const component = new Button({ store: state, watch: ['count'], text: s => s.get('count'),
        on: { click: () => state.set('count', state.get('count') + 1) } });
    const oldTree = new Tree('old', component);
    oldTree.mount(document.getElementById('app'));
    const newerTree = new Tree('new', component);
    const newest = newerTree.mount(document.getElementById('app'));
    oldTree.dispose();
    newest.click();
    assert.equal(newest.textContent, '1');
    newerTree.dispose();
    const oldRouter = new Spine([{ key: 'home', tree: oldTree }]);
    const otherRoot = document.createElement('div'); document.body.appendChild(otherRoot);
    const newRouter = new Spine({ root: otherRoot, routes: [{ key: 'home', tree: oldTree }] });
    oldRouter.renderRoute(); newRouter.renderRoute(); oldRouter.dispose();
    const newButton = otherRoot.querySelector('button');
    newButton.click();
    assert.equal(newButton.textContent, '2');
    assert.equal(newButton.isConnected, true);
    newRouter.dispose();
});

test('Tree.mount releases failed hooks and removes the inserted DOM', t => {
    const { Div, Tree, document } = environment(t);
    let cleanups = 0;
    const tree = new Tree('broken', new Div({ children: [new Div({ onmount: () => () => cleanups++ })],
        onmount: () => { throw new Error('failed hook'); } }));
    assert.throws(() => tree.mount(document.getElementById('app')), /failed hook/);
    assert.equal(document.getElementById('app').childElementCount, 0);
    assert.equal(cleanups, 1);
});
