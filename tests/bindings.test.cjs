const test = require('node:test');
const assert = require('node:assert/strict');
const { environment, deferred, settle } = require('./helpers.cjs');

test('attributes, properties and classes update locally with boolean and removal semantics', t => {
    const { State, Input, document } = environment(t);
    const store = new State({ persist: false, initial: { disabled: true, value: 'draft', checked: false, title: 'hello' } });
    const input = new Input({ store, watch: ['disabled', 'value', 'checked', 'title'], options: { type: 'text' },
        attrs: { disabled: s => s.get('disabled'), title: s => s.get('title'), 'aria-busy': s => s.get('disabled') },
        props: { value: s => s.get('value'), checked: s => s.get('checked') }, classes: { pending: s => s.get('disabled') } });
    const element = input.mount(document.getElementById('app'));
    assert.equal(element.disabled, true);
    assert.equal(element.getAttribute('disabled'), '');
    element.focus();
    store.set('disabled', false);
    assert.equal(element.disabled, false);
    assert.equal(element.hasAttribute('disabled'), false);
    assert.equal(element.getAttribute('aria-busy'), 'false');
    assert.equal(element.classList.contains('pending'), false);
    element.focus();
    element.setSelectionRange(1, 3);
    store.set('value', 'draft');
    assert.equal(document.activeElement, element);
    assert.equal(element.selectionStart, 1);
    assert.equal(element.selectionEnd, 3);
    store.set('value', 'changed');
    store.set('checked', true);
    store.set('title', null);
    assert.equal(element.value, 'changed');
    assert.equal(element.checked, true);
    assert.equal(element.hasAttribute('title'), false);
    input.dispose();
    store.set('value', 'stale');
    assert.equal(element.value, 'changed');
});

test('unchanged attribute, property and class values do not write DOM; file values are guarded', t => {
    const { State, Input, window } = environment(t);
    const store = new State({ persist: false, initial: { value: 'same' } });
    const input = new Input({ store, watch: ['value'], attrs: { title: () => 'same' }, props: { value: s => s.get('value') }, classes: { fixed: () => true } });
    const node = input.render();
    const observer = new window.MutationObserver(() => {});
    observer.observe(node, { attributes: true });
    let writes = 0;
    const descriptor = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value');
    Object.defineProperty(node, 'value', { get() { return descriptor.get.call(this); }, set(value) { writes++; descriptor.set.call(this, value); } });
    store.set('value', 'same');
    assert.equal(writes, 0);
    assert.equal(observer.takeRecords().length, 0);
    const file = new Input({ options: { type: 'file' }, props: { value: 'C:/fake/file.txt' } });
    assert.equal(file.render().value, '');
    file.dispose(); input.dispose(); observer.disconnect();
});

test('plainText always escapes external strings and dynamic plainText keeps child identities', t => {
    const { State, Div, P, Input } = environment(t);
    const store = new State({ persist: false, initial: { name: '<img src=x onerror=evil()>' } });
    const staticText = new P({ plainText: '<b>filename</b>' }).render();
    assert.equal(staticText.querySelector('b'), null);
    const component = new Div({ store, watch: ['name'], plainText: s => s.get('name'), children: [new Input({})] });
    const node = component.render();
    const child = node.querySelector('input');
    assert.equal(node.querySelector('img'), null);
    store.set('name', '<script>text</script>');
    assert.equal(node.firstChild.data, '<script>text</script>');
    assert.equal(node.querySelector('input'), child);
    component.dispose();
});

test('mount runs descendant hooks after insertion, invokes legacy onload once and owns cleanup', t => {
    const { Div, document } = environment(t);
    const seen = [];
    const child = new Div({ onmount: element => { assert.equal(element.isConnected, true); seen.push('child'); return () => seen.push('child cleanup'); } });
    const root = new Div({ children: [child], ref: element => seen.push(element ? 'ref' : 'ref null'),
        onmount: (element, component) => { seen.push('root'); component.addCleanup(() => seen.push('custom cleanup')); },
        onload: () => seen.push('legacy') });
    root.render();
    assert.deepEqual(seen, []);
    root.mount(document.getElementById('app'));
    root._notifyMounted();
    assert.deepEqual(seen, ['child', 'ref', 'root', 'legacy']);
    const oldMount = root._mount;
    root.dispose(); root.dispose();
    assert.deepEqual(seen, ['child', 'ref', 'root', 'legacy', 'child cleanup', 'ref null', 'custom cleanup']);
    root.mount(document.getElementById('app'));
    root.dispose(oldMount);
    assert.ok(root._mount);
    root.dispose();
});

test('async children receive hooks only after insertion; late and failed mounts release owners', async t => {
    const { Div, document } = environment(t);
    const pending = deferred();
    let hooks = 0;
    class Async extends Div { async render() { const node = super.render(); await pending.promise; return node; } }
    const child = new Async({ onmount: node => { assert.equal(node.isConnected, true); hooks++; } });
    const root = new Div({ children: [child] });
    root.mount(document.getElementById('app'));
    assert.equal(hooks, 0);
    pending.resolve(); await settle();
    assert.equal(hooks, 1);
    root.dispose();
    let cleanups = 0;
    const failed = new Div({ onmount: (element, component) => {
        component.addCleanup(() => cleanups++);
        throw new Error('hook failed');
    } });
    assert.throws(() => failed.mount(document.getElementById('app')), /hook failed/);
    assert.equal(cleanups, 1);
    assert.equal(failed._mount, null);
    assert.equal(failed.element.isConnected, false);
    const later = deferred();
    const stale = new Div({ children: [{ render: () => later.promise }] });
    stale.mount(document.getElementById('app'));
    stale.dispose();
    later.resolve(new Div({ onmount: () => hooks++ }));
    await settle();
    assert.equal(hooks, 1);
});

test('cleanup from an async child with no original mount cannot dispose its later mount', async t => {
    const { Div, document } = environment(t);
    const pending = deferred();
    class Delayed extends Div {
        render() {
            if (this.delayed) return super.render();
            this.delayed = true;
            return pending.promise;
        }
    }
    let cleaned = 0;
    const shared = new Delayed({ onmount: () => () => cleaned++ });
    const old = new Div({ children: [shared] });
    old.mount(document.getElementById('app'));
    shared.mount(document.getElementById('app'));
    old.dispose();
    assert.equal(cleaned, 0);
    assert.ok(shared._mount);
    pending.resolve(document.createElement('div')); await settle();
    shared.dispose();
    assert.equal(cleaned, 1);
});

test('hook reentrancy cannot attach an obsolete cleanup to a newer mount', t => {
    const { Div, document } = environment(t);
    let calls = 0;
    const cleaned = [];
    const component = new Div({ onmount: () => {
        const call = ++calls;
        if (call === 1) component.mount(document.getElementById('app'));
        return () => cleaned.push(call);
    } });
    component.mount(document.getElementById('app'));
    assert.deepEqual(cleaned, [1]);
    assert.ok(component._mount);
    component.dispose();
    assert.deepEqual(cleaned, [1, 2]);
});

test('string-valued controls normalize numeric and null values before comparing DOM writes', t => {
    const { State, Input, window, document } = environment(t);
    const store = new State({ persist: false, initial: { value: 12345 } });
    const input = new Input({ store, watch: ['value'], props: { value: s => s.get('value') } });
    const node = input.mount(document.getElementById('app'));
    const descriptor = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value');
    let writes = 0;
    Object.defineProperty(node, 'value', { get() { return descriptor.get.call(this); }, set(value) { writes++; descriptor.set.call(this, value); } });
    node.focus(); node.setSelectionRange(1, 4);
    store.set('value', 12345);
    store.set('value', '12345');
    assert.equal(writes, 0);
    assert.equal(node.selectionStart, 1);
    assert.equal(node.selectionEnd, 4);
    store.set('value', null);
    assert.equal(node.value, '');
    assert.equal(writes, 1);
    store.set('value', undefined);
    store.set('value', '');
    assert.equal(writes, 1);
    input.dispose();
});
