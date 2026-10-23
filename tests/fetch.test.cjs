const test = require('node:test');
const assert = require('node:assert/strict');
const { environment, deferred, settle } = require('./helpers.cjs');

function controlledEnvironment(t) {
    const idle = new Map();
    const intervals = new Map();
    const requests = [];
    let nextId = 0;
    const env = environment(t, {
        requestIdleCallback(callback) { const id = ++nextId; idle.set(id, callback); return id; },
        cancelIdleCallback(id) { idle.delete(id); },
        setInterval(callback) { const id = ++nextId; intervals.set(id, callback); return id; },
        clearInterval(id) { intervals.delete(id); },
        fetch(url, options) {
            const pending = deferred();
            requests.push({ url, ...options, ...pending });
            return pending.promise;
        },
    });
    return {
        ...env, idle, intervals, requests,
        runIdle() {
            const callbacks = [...idle.values()];
            idle.clear();
            for (const callback of callbacks) callback({ didTimeout: false, timeRemaining: () => 50 });
        },
        respond(index, data) { requests[index].resolve({ json: async () => data }); },
    };
}

function adapter(env, state, counts = { evaluations: 0, clicks: 0 }) {
    return class Callback {
        constructor({ key, table_data }) { this.key = key; this.data = table_data; }
        placeholder() { return new env.Div({ key: this.key, text: 'Loading' }); }
        table() {
            return new env.Div({ children: [new env.Button({
                store: state, watch: ['count'],
                text: () => { counts.evaluations += 1; return `${this.data.value}:${state.get('count', 0)}`; },
                on: { click: () => { counts.clicks += 1; } },
            })] });
        }
    };
}

test('Fetch cancels pending idle work before mount disposal can start a request', async t => {
    const env = controlledEnvironment(t);
    const state = new env.State();
    const component = new env.Fetch({ url: '/data', callback: adapter(env, state) });
    const root = new env.Div({ children: [component] });
    root.render();
    await settle();
    assert.equal(env.idle.size, 1);
    root.dispose();
    root.dispose();
    assert.equal(env.idle.size, 0);
    env.runIdle();
    assert.equal(env.requests.length, 0);
});

test('Fetch slow polling belongs to its mount; unrelated state updates create no requests or intervals', async t => {
    const env = controlledEnvironment(t);
    const state = new env.State();
    const counts = { evaluations: 0, clicks: 0 };
    const fetcher = new env.Fetch({ url: '/data', runtime: 'slow', callback: adapter(env, state, counts) });
    const root = new env.Div({ children: [fetcher] });
    const element = root.render();
    env.document.getElementById('app').appendChild(element);
    await settle();
    env.runIdle();
    assert.equal(env.requests.length, 1);
    assert.equal(env.intervals.size, 1);
    env.respond(0, { value: 'first' });
    await settle();
    const oldButton = element.querySelector('button');
    assert.equal(oldButton.textContent, 'first:0');
    state.set('unrelated', 2);
    state.set('count', 3);
    assert.equal(oldButton.textContent, 'first:3');
    assert.equal(env.requests.length, 1);
    assert.equal(env.intervals.size, 1);
    [...env.intervals.values()][0]();
    assert.equal(env.requests.length, 2);
    env.respond(1, { value: 'second' });
    await settle();
    oldButton.click();
    assert.equal(counts.clicks, 0, 'replaced fetched child must lose its event listener');
    const currentButton = element.querySelector('button');
    assert.equal(currentButton.textContent, 'second:3');
    [...env.intervals.values()][0]();
    assert.equal(env.requests.length, 3);
    root.dispose();
    assert.equal(env.intervals.size, 0);
    assert.equal(env.requests[2].signal.aborted, true);
    const evaluations = counts.evaluations;
    state.set('count', 4);
    currentButton.click();
    assert.equal(counts.evaluations, evaluations);
    assert.equal(counts.clicks, 0);
    env.respond(2, { value: 'late' });
    await settle();
    assert.equal(currentButton.textContent, 'second:3');
    assert.equal(JSON.parse(env.window.localStorage.getItem('/data')).value, 'second');
});

test('a response from an older Fetch mount cannot target a fresh mount with the same ID', async t => {
    const env = controlledEnvironment(t);
    const state = new env.State();
    const root = new env.Div({ children: [new env.Fetch({ url: '/data', callback: adapter(env, state) })] });
    const old = root.render();
    env.document.getElementById('app').appendChild(old);
    await settle();
    env.runIdle();
    const oldId = old.firstElementChild.id;
    const fresh = root.render();
    env.document.getElementById('app').replaceChildren(fresh);
    await settle();
    assert.equal(fresh.firstElementChild.id, oldId);
    assert.equal(env.requests[0].signal.aborted, true);
    env.runIdle();
    env.respond(1, { value: 'fresh' });
    await settle();
    assert.equal(fresh.textContent, 'fresh:0');
    env.respond(0, { value: 'obsolete' });
    await settle();
    assert.equal(fresh.textContent, 'fresh:0');
    assert.equal(old.textContent, 'Loading');
    assert.equal(JSON.parse(env.window.localStorage.getItem('/data')).value, 'fresh');
    root.dispose();
});

test('explicit Fetch execution supersedes a pending request without accepting its stale response', async t => {
    const env = controlledEnvironment(t);
    const state = new env.State();
    const fetcher = new env.Fetch({ url: '/data', runtime: 'slow', callback: adapter(env, state) });
    const root = new env.Div({ children: [fetcher] });
    const element = root.render();
    await settle();
    env.runIdle();
    fetcher.execute();
    assert.equal(env.requests[0].signal.aborted, true);
    env.respond(1, { value: 'newest' });
    await settle();
    env.respond(0, { value: 'old' });
    await settle();
    assert.equal(element.textContent, 'newest:0');
    assert.equal(JSON.parse(env.window.localStorage.getItem('/data')).value, 'newest');
    root.dispose();
});

test('polling waits for a pending slow request to finish, then resumes on the next tick', async t => {
    const env = controlledEnvironment(t);
    const state = new env.State();
    const fetcher = new env.Fetch({ url: '/slow', runtime: 'slow', callback: adapter(env, state) });
    const root = new env.Div({ children: [fetcher] });
    const element = root.render();
    await settle();
    env.runIdle();
    const tick = [...env.intervals.values()][0];
    for (let index = 0; index < 5; index += 1) tick();
    assert.equal(env.requests.length, 1, 'pending request should survive multiple polling ticks');
    assert.equal(env.requests[0].signal.aborted, false);
    env.respond(0, { value: 'eventually ready' });
    await settle();
    assert.equal(element.textContent, 'eventually ready:0');
    tick();
    assert.equal(env.requests.length, 2);
    assert.equal(env.requests[1].signal.aborted, false);
    env.respond(1, { value: 'next result' });
    await settle();
    assert.equal(element.textContent, 'next result:0');
    root.dispose();
    assert.equal(env.intervals.size, 0);
});

test('Fetch falls back to a cancellable timeout without requestIdleCallback', async t => {
    const timeouts = new Map();
    let nextId = 0;
    let requests = 0;
    const env = environment(t, {
        setTimeout(callback) { const id = ++nextId; timeouts.set(id, callback); return id; },
        clearTimeout(id) { timeouts.delete(id); },
        fetch: async () => { requests += 1; return { json: async () => ({ value: 'fallback' }) }; },
    });
    const state = new env.State();
    const root = new env.Div({ children: [new env.Fetch({ url: '/data', callback: adapter(env, state) })] });
    const element = root.render();
    await settle();
    assert.equal(timeouts.size, 1);
    const callbacks = [...timeouts.values()];
    timeouts.clear();
    callbacks[0]();
    await settle();
    assert.equal(requests, 1);
    assert.equal(element.textContent, 'fallback:0');
    root.render();
    await settle();
    assert.equal(timeouts.size, 1);
    root.dispose();
    assert.equal(timeouts.size, 0);
});

test('SingleFetch preserves offline cache, settles empty data, and exposes cancellation', async t => {
    const env = controlledEnvironment(t);
    Object.defineProperty(env.window.navigator, 'onLine', { configurable: true, value: false });
    env.window.localStorage.setItem('/cached', JSON.stringify({ value: 'cached' }));
    const cached = await new env.SingleFetch('/cached');
    assert.equal(cached.value, 'cached');
    assert.equal(env.requests.length, 0);
    Object.defineProperty(env.window.navigator, 'onLine', { configurable: true, value: true });
    const empty = new env.SingleFetch('/empty');
    env.respond(0, {});
    assert.deepEqual(JSON.parse(JSON.stringify(await empty)), {});
    const cancelled = new env.SingleFetch('/cancelled');
    cancelled.dispose();
    cancelled.dispose();
    assert.equal(env.requests[1].signal.aborted, true);
    env.respond(1, { value: 'ignore' });
    const result = await cancelled;
    assert.equal(result.Error.name, 'AbortError');
    assert.equal(env.window.localStorage.getItem('/cancelled'), null);
});
