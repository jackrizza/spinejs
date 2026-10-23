const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { environment, deferred, settle } = require('./helpers.cjs');

test('State preserves falsy values and saved-data compatibility; only missing keys use fallback', t => {
    const { State, window } = environment(t);
    window.localStorage.setItem('state', JSON.stringify({ zero: 0, flag: false, empty: '', nil: null }));
    const state = new State();
    for (const [key, value] of Object.entries({ zero: 0, flag: false, empty: '', nil: null })) {
        assert.equal(state.get(key, 'fallback'), value);
    }
    assert.equal(state.get('missing', 'fallback'), 'fallback');
    assert.equal(Array.isArray(state.get('missing')), true);
    assert.equal(Array.isArray(state.get('toString')), true);
    state.set('count', 2);
    const saved = JSON.parse(window.localStorage.getItem('state'));
    assert.deepEqual(saved, { zero: 0, flag: false, empty: '', nil: null, count: 2 });
});

test('State notifies synchronously by key on every set and existing-key deletion', t => {
    const { State, window } = environment(t);
    const state = new State();
    const seen = [];
    state.subscribe('count', (value, key) => seen.push([value, key]));
    state.subscribe('other', () => assert.fail('unrelated listener fired'));
    state.set('count', 1);
    state.set('count', 1);
    state.delete('count');
    state.delete('count');
    assert.deepEqual(seen, [[1, 'count'], [1, 'count'], [undefined, 'count']]);
    assert.deepEqual(JSON.parse(window.localStorage.getItem('state')), {});
});

test('State unsubscribe is idempotent and safe during notification and resubscription', t => {
    const { State } = environment(t);
    const state = new State();
    const seen = [];
    let off;
    off = state.subscribe('key', () => { seen.push('self'); off(); });
    const second = state.subscribe('key', () => seen.push('second'));
    state.set('key', 1);
    state.set('key', 2);
    assert.deepEqual(seen, ['self', 'second', 'second']);
    second();
    const callback = () => seen.push('new');
    const oldOff = state.subscribe('key', callback);
    oldOff();
    state.subscribe('key', callback);
    oldOff();
    state.set('key', 3);
    assert.equal(seen.at(-1), 'new');
});

test('dynamic text updates multiple views locally and preserves child DOM, input state, and event handlers', t => {
    const { State, Div, P, Input, Button, window, document } = environment(t);
    const state = new State();
    state.set('count', 0);
    let evaluations = 0;
    const child = new Input({ options: { type: 'text', 'aria-label': 'Draft' } });
    const first = new P({ store: state, watch: ['count'], text: store => {
        evaluations += 1;
        return `Count: ${store.get('count')}`;
    }, children: [child] });
    const second = new P({ store: state, watch: ['count'], text: store => store.get('count') });
    const button = new Button({ text: 'Increase', options: { type: 'button' }, on: {
        click: () => state.set('count', state.get('count') + 1),
    } });
    const root = new Div({ children: [first, second, button] });
    const element = root.render();
    document.getElementById('app').appendChild(element);
    const [firstElement, secondElement, buttonElement] = element.children;
    const input = firstElement.querySelector('input');
    const textNode = firstElement.firstChild;
    assert.equal(textNode.nodeType, 3);
    assert.equal(textNode.data, 'Count: 0');
    assert.equal(secondElement.textContent, '0');
    input.value = 'typed draft';
    input.focus();
    input.setSelectionRange(2, 7);
    const observer = new window.MutationObserver(() => {});
    observer.observe(firstElement, { characterData: true, subtree: true, childList: true });
    t.after(() => observer.disconnect());
    state.set('unrelated', 10);
    assert.equal(evaluations, 1);
    assert.equal(observer.takeRecords().length, 0);
    state.set('count', 0);
    assert.equal(evaluations, 2);
    assert.equal(observer.takeRecords().length, 0, 'same displayed value must not mutate text');
    buttonElement.click();
    assert.equal(firstElement.firstChild, textNode);
    assert.equal(textNode.data, 'Count: 1');
    assert.equal(secondElement.textContent, '1');
    assert.equal(firstElement.querySelector('input'), input);
    assert.equal(input.value, 'typed draft');
    assert.equal(document.activeElement, input);
    assert.equal(input.selectionStart, 2);
    assert.equal(input.selectionEnd, 7);
    assert.equal(buttonElement.getAttribute('type'), 'button');
    root.dispose();
    root.dispose();
    buttonElement.click();
    state.set('count', 9);
    assert.equal(textNode.data, 'Count: 1');
    assert.equal(secondElement.textContent, '1');
    assert.equal(evaluations, 3);
});

test('dynamic text escapes HTML while existing static HTML remains compatible', t => {
    const { State, P } = environment(t);
    const state = new State();
    const dynamic = new P({ store: state, watch: ['value'], text: () => '<b>safe</b>' });
    assert.equal(dynamic.render().innerHTML, '&lt;b&gt;safe&lt;/b&gt;');
    assert.equal(new P({ text: '<b>existing</b>' }).render().querySelector('b').textContent, 'existing');
    dynamic.dispose();
});

test('remounting the same instance detaches previous subscriptions and event handlers', t => {
    const { State, Button } = environment(t);
    const state = new State();
    state.set('count', 0);
    let evaluations = 0;
    const component = new Button({ store: state, watch: ['count'], text: store => {
        evaluations += 1;
        return store.get('count');
    }, on: { click: () => state.set('count', state.get('count') + 1) } });
    const old = component.render();
    const fresh = component.render();
    old.click();
    assert.equal(state.get('count'), 0);
    fresh.click();
    assert.equal(old.textContent, '0');
    assert.equal(fresh.textContent, '1');
    assert.equal(evaluations, 3);
    component.dispose();
});

test('route replacement disposes before DOM removal, and return visits establish one fresh binding', t => {
    const { State, Div, Button, Tree, Spine, document, context } = environment(t);
    const state = new State();
    context.testState = state;
    vm.runInContext('const state = testState;', context);
    state.set('count', 0);
    let evaluations = 0;
    let disposedWhileConnected = false;
    const counter = new Button({ store: state, watch: ['count'], text: store => {
        evaluations += 1;
        return store.get('count');
    }, on: { click: () => state.set('count', state.get('count') + 1) } });
    const root = new Div({ children: [counter] });
    const originalDispose = root.dispose;
    root.dispose = function (...args) {
        disposedWhileConnected ||= !!document.querySelector('button')?.isConnected;
        return originalDispose.apply(this, args);
    };
    const home = new Tree('home', root);
    const spine = new Spine([{ key: 'home', tree: home }, { key: 'away', tree: new Tree('away', new Div({ text: 'Away' })) }]);
    spine.setActiveRoute('home');
    spine.renderRoute();
    const oldButton = document.querySelector('button');
    spine.setActiveRoute('away');
    spine.renderRoute();
    assert.equal(disposedWhileConnected, true);
    oldButton.click();
    state.set('count', 4);
    assert.equal(evaluations, 1);
    assert.equal(oldButton.textContent, '0');
    spine.setActiveRoute('home');
    spine.renderRoute();
    document.querySelector('button').click();
    assert.equal(state.get('count'), 5);
    assert.equal(evaluations, 3);
    home.dispose();
});

test('failed render releases its own bindings, completed children, and events', t => {
    const { State, Div, Button } = environment(t);
    const state = new State();
    let evaluations = 0;
    let clicks = 0;
    let childElement;
    const child = new Button({ store: state, watch: ['key'], text: () => { evaluations += 1; return 'child'; },
        on: { click: () => clicks += 1 } });
    const originalRender = child.render;
    child.render = function () { childElement = originalRender.call(this); return childElement; };
    const root = new Div({ store: state, watch: ['key'], text: () => { evaluations += 1; return 'root'; },
        children: [child, { render() { throw new Error('broken child'); } }] });
    assert.throws(() => root.render(), /broken child/);
    state.set('key', 1);
    childElement.click();
    assert.equal(evaluations, 2);
    assert.equal(clicks, 0);
    root.dispose();
});

test('Spine shows an error after a failed route while disposing partial bindings', t => {
    const { State, Div, P, Tree, Spine, document } = environment(t);
    const state = new State();
    let evaluations = 0;
    const root = new Div({ children: [new P({ store: state, watch: ['key'], text: () => {
        evaluations += 1; return 'bound';
    } }), { render() { throw new Error('route failed'); } }] });
    const spine = new Spine([{ key: 'broken', tree: new Tree('broken', root) }]);
    spine.setActiveRoute('broken');
    assert.doesNotThrow(() => spine.renderRoute());
    assert.match(document.getElementById('app').textContent, /route failed/);
    state.set('key', 1);
    assert.equal(evaluations, 1);
});

test('a child resolving after parent disposal cannot mount or acquire reactive bindings', async t => {
    const { State, Div, P } = environment(t);
    const state = new State();
    const pending = deferred();
    let evaluations = 0;
    const root = new Div({ children: [{ isNotAComponent: true, render: () => pending.promise }] });
    const element = root.render();
    root.dispose();
    pending.resolve(new P({ store: state, watch: ['key'], text: () => { evaluations += 1; return 'late'; } }));
    await settle();
    assert.equal(element.querySelector('p'), null);
    assert.equal(element.textContent, '');
    assert.equal(evaluations, 0);
    state.set('key', 1);
    assert.equal(evaluations, 0);
});

test('an async Render child mounted before awaiting loses bindings and events if its parent is disposed', async t => {
    const { State, Div, Button } = environment(t);
    const state = new State();
    const pending = deferred();
    let evaluations = 0;
    let clicks = 0;
    class AsyncChild extends Div {
        async render() {
            this.element = super.render();
            await pending.promise;
            return this.element;
        }
    }
    const child = new AsyncChild({ store: state, watch: ['key'],
        text: () => { evaluations += 1; return 'bound'; }, children: [
            new Button({ text: 'Action', on: { click: () => clicks += 1 } }),
        ] });
    const root = new Div({ children: [child] });
    const element = root.render();
    assert.equal(evaluations, 1);
    root.dispose();
    state.set('key', 1);
    child.element.querySelector('button').click();
    assert.equal(evaluations, 1);
    assert.equal(clicks, 0);
    pending.resolve();
    await settle();
    assert.equal(element.children.length, 0);
    state.set('key', 2);
    child.element.querySelector('button').click();
    assert.equal(evaluations, 1);
    assert.equal(clicks, 0);
});

test('active asynchronous children support component and DOM-node results', async t => {
    const { State, Div, P, document } = environment(t);
    const state = new State();
    state.set('key', 1);
    const node = document.createElement('span');
    node.textContent = 'plain node';
    const root = new Div({ children: [
        { render: async () => new P({ store: state, watch: ['key'], text: store => store.get('key') }) },
        { render: async () => node },
    ] });
    const element = root.render();
    await settle();
    assert.equal(element.querySelector('p').textContent, '1');
    assert.equal(element.querySelector('span'), node);
    state.set('key', 2);
    assert.equal(element.querySelector('p').textContent, '2');
    root.dispose();
    state.set('key', 3);
    assert.equal(element.querySelector('p').textContent, '2');
});

test('asynchronous child rejection disposes already-mounted sibling bindings and events', async t => {
    const { State, Div, Button } = environment(t);
    const state = new State();
    const pending = deferred();
    let evaluations = 0;
    let clicks = 0;
    const root = new Div({ children: [new Button({ store: state, watch: ['key'],
        text: () => { evaluations += 1; return 'bound'; }, on: { click: () => clicks += 1 } }),
    { render: () => pending.promise }] });
    const element = root.render();
    pending.reject(new Error('async child failed'));
    await settle();
    state.set('key', 1);
    element.querySelector('button').click();
    assert.equal(evaluations, 1);
    assert.equal(clicks, 0);
    root.dispose();
});

test('disposing an older parent cannot dispose a child that has since been mounted elsewhere', t => {
    const { State, Div, Button } = environment(t);
    const state = new State();
    let clicks = 0;
    const shared = new Button({ store: state, watch: ['key'], text: store => store.get('key', 0),
        on: { click: () => clicks += 1 } });
    const oldRoot = new Div({ children: [shared] });
    const old = oldRoot.render();
    const newRoot = new Div({ children: [shared] });
    const fresh = newRoot.render();
    oldRoot.dispose();
    state.set('key', 2);
    fresh.querySelector('button').click();
    old.querySelector('button').click();
    assert.equal(fresh.textContent, '2');
    assert.equal(old.textContent, '0');
    assert.equal(clicks, 1);
    newRoot.dispose();
});

test('repeated table rendering preserves source rows and numeric zero cells', t => {
    const { TableCreator } = environment(t);
    const data = { table: [[0, 'Header'], ['first', 0], ['second', 2]] };
    const original = structuredClone(data);
    const creator = new TableCreator({ key: 'table', table_data: data });
    for (let count = 0; count < 3; count += 1) {
        const component = creator.table();
        const element = component.render();
        assert.deepEqual([...element.querySelectorAll('td, th')].map(cell => cell.textContent),
            ['0', 'Header', 'first', '0', 'second', '2']);
        assert.equal(element.querySelectorAll('tbody tr').length, 2);
        assert.deepEqual(data, original);
        component.dispose();
    }
});
