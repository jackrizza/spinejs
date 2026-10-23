const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { environment, deferred, settle } = require('./helpers.cjs');
function setup(t) {
    const env = environment(t);
    if (!env.Region) vm.runInContext(fs.readFileSync(path.join(__dirname, '../src/regions.js'), 'utf8'), env.context);
    return { ...env, ...vm.runInContext('({Region, List})', env.context) };
}

test('keyed lists add, remove, reorder and refresh row data without replacing unaffected DOM', t => {
    const { State, List, Div, Input, Button, document } = setup(t);
    const store = new State({ persist: false, initial: { entries: [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }] } });
    const removed = [];
    const clicks = [];
    let renders = 0;
    const list = new List({ store, watch: ['entries'], items: s => s.get('entries'), key: item => item.id,
        render: (row, key) => {
            renders++;
            return new Div({ attrs: { 'data-id': key }, children: [
                new Button({ store: row, watch: ['item', 'index'], plainText: s => `${s.get('index')}:${s.get('item').name}`,
                    on: { click: () => clicks.push(row.get('item').name) } }), new Input({})
            ], onmount: () => () => { assert.equal(document.querySelector(`[data-id="${key}"]`).isConnected, true); removed.push(key); } });
        } });
    list.mount(document.getElementById('app'));
    const a = list.element.querySelector('[data-id=a]');
    const b = list.element.querySelector('[data-id=b]');
    const input = a.querySelector('input');
    input.value = 'typed'; input.focus(); input.setSelectionRange(1, 4);
    store.set('unrelated', 1);
    assert.equal(renders, 2);
    store.set('entries', [{ id: 'b', name: 'Bee' }, { id: 'a', name: 'Aye' }, { id: 'c', name: 'C' }]);
    assert.deepEqual([...list.element.children].map(node => node.getAttribute('data-id')), ['b', 'a', 'c']);
    assert.equal(list.element.children[0], b);
    assert.equal(list.element.children[1], a);
    assert.equal(input.value, 'typed');
    assert.equal(document.activeElement, input);
    assert.equal(input.selectionStart, 1); assert.equal(input.selectionEnd, 4);
    assert.equal(a.querySelector('button').textContent, '1:Aye');
    a.querySelector('button').click(); assert.deepEqual(clicks, ['Aye']);
    assert.equal(renders, 3);
    store.set('entries', [{ id: 'a', name: 'Aye' }, { id: 'c', name: 'C' }]);
    assert.deepEqual(removed, ['b']);
    b.querySelector('button').click(); assert.deepEqual(clicks, ['Aye']);
    list.dispose(); list.dispose();
    assert.deepEqual(removed, ['b', 'a', 'c']);
});

test('duplicate keys fail before mutating the current list and recover on the next valid update', t => {
    const { State, List, P, document } = setup(t);
    const store = new State({ persist: false, initial: { rows: [{ id: 'a', value: 'original' }] } });
    const list = new List({ store, watch: ['rows'], items: s => s.get('rows'), key: row => row.id,
        render: row => new P({ store: row, watch: ['item'], plainText: s => s.get('item').value }) });
    list.mount(document.getElementById('app'));
    const node = list.element.querySelector('p');
    assert.throws(() => store.set('rows', [{ id: 'a', value: 'wrong' }, { id: 'a', value: 'duplicate' }]), /Duplicate List key: a/);
    assert.equal(list.element.querySelector('p'), node);
    assert.equal(node.textContent, 'original');
    store.set('rows', [{ id: 'a', value: 'correct' }]);
    assert.equal(node.textContent, 'correct');
    list.dispose();
});

test('removed and remounted asynchronous rows cannot acquire bindings or mount hooks', async t => {
    const { State, List, P, document } = setup(t);
    const store = new State({ persist: false, initial: { rows: [{ id: 'a' }] } });
    const pending = deferred();
    let hooks = 0;
    let evaluations = 0;
    const list = new List({ store, watch: ['rows'], items: s => s.get('rows'), key: row => row.id, render: () => pending.promise });
    list.mount(document.getElementById('app'));
    store.set('rows', []);
    pending.resolve(new P({ store, watch: ['rows'], plainText: () => { evaluations++; return 'late'; }, onmount: () => hooks++ }));
    await settle();
    assert.equal(list.element.children.length, 0);
    assert.equal(hooks, 0); assert.equal(evaluations, 0);
    list.dispose();
    const newer = deferred();
    list.renderRow = () => newer.promise;
    store.set('rows', [{ id: 'b' }]);
    const old = list.mount(document.getElementById('app'));
    list.mount(document.getElementById('app'));
    newer.resolve(new P({ plainText: 'new', onmount: () => hooks++ }));
    await settle();
    assert.equal(old.children.length, 0);
    assert.equal(list.element.textContent, 'new');
    assert.equal(hooks, 1);
    list.dispose();
});

test('conditional regions replace and dispose fresh branches while the shell stays mounted', t => {
    const { State, Region, Div, Input, Button, document } = setup(t);
    const store = new State({ persist: false, initial: { branch: 'loading' } });
    const mounted = [], disposed = [], clicks = [];
    const region = new Region({ store, watch: ['branch'], render: s => {
        const name = s.get('branch');
        return name === 'closed' ? null : new Button({ plainText: name, on: { click: () => clicks.push(name) },
            onmount: () => { mounted.push(name); return () => disposed.push(name); } });
    } });
    const shell = new Div({ children: [new Input({}), region] });
    shell.mount(document.getElementById('app'));
    const input = shell.element.querySelector('input');
    input.value = 'keep'; input.focus();
    const old = region.element.querySelector('button');
    for (const branch of ['success', 'error', 'closed', 'success', 'closed']) store.set('branch', branch);
    assert.deepEqual(mounted, ['loading', 'success', 'error', 'success']);
    assert.deepEqual(disposed, mounted);
    assert.equal(shell.element.querySelector('input'), input);
    assert.equal(document.activeElement, input);
    assert.equal(input.value, 'keep');
    old.click(); assert.deepEqual(clicks, []);
    shell.dispose();
    store.set('branch', 'error');
    assert.equal(mounted.length, 4);
});

test('conditional async branches ignore late completions and clean resources on removal', async t => {
    const { State, Region, Div, document } = setup(t);
    const store = new State({ persist: false, initial: { open: true } });
    const pending = deferred();
    let hooks = 0;
    const region = new Region({ store, watch: ['open'], render: s => s.get('open') ? pending.promise : null });
    region.mount(document.getElementById('app'));
    store.set('open', false);
    pending.resolve(new Div({ onmount: () => hooks++ })); await settle();
    assert.equal(hooks, 0);
    assert.equal(region.element.children.length, 0);
    region.dispose();
});
