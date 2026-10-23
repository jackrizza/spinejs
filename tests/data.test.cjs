const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { environment, deferred, settle } = require('./helpers.cjs');

function dataEnvironment(t, options = {}) {
    const requests = [];
    const env = environment(t, {
        fetch(url, options) { const pending = deferred(); requests.push({ url, options, ...pending }); return pending.promise; },
        ...options,
    });
    return { ...env, ...vm.runInContext('({ request, Resource, RequestError })', env.context), requests };
}
function response(data, { type = 'application/json', status = 200, redirected = false } = {}) {
    return { ok: status >= 200 && status < 300, status, redirected,
        headers: { get: () => type }, json: async () => data, text: async () => data, blob: async () => data };
}

test('memory State never touches storage, keeps File identity, and isolates stores', t => {
    const env = dataEnvironment(t);
    let reads = 0;
    Object.defineProperty(env.window, 'localStorage', { get() { reads++; throw new Error('Unavailable'); } });
    const state = new env.State({ persist: false, initial: { count: 0 } });
    const other = new env.State({ persist: false });
    const file = new env.window.File(['hello'], 'hello.txt');
    let notifications = 0;
    const off = state.subscribe('file', value => { assert.equal(value, file); notifications++; });
    state.set('file', file);
    state.set('file', file);
    off(); off(); state.set('file', file);
    assert.equal(state.get('file'), file);
    assert.equal(state.get('count'), 0);
    assert.equal(other.get('file', null), null);
    assert.equal(notifications, 2);
    assert.equal(reads, 0);
});

test('State selects persistent keys, loads legacy falsy data and reports storage failures without losing notifications', t => {
    const env = dataEnvironment(t);
    const writes = [];
    const storage = { getItem: key => key === 'preferences' ? '{"sort":"name","secret":"ignore"}' : null,
        setItem: (key, value) => writes.push([key, JSON.parse(value)]) };
    const state = new env.State({ key: 'preferences', storage, persistKeys: ['sort'] });
    assert.equal(state.get('sort'), 'name');
    assert.equal(state.get('secret', null), null);
    state.set('file', new env.window.File(['x'], 'x'));
    assert.equal(writes.length, 0);
    state.set('sort', 'date');
    assert.deepEqual(writes, [['preferences', { sort: 'date' }]]);
    const errors = [];
    const broken = new env.State({ storage: { getItem() { throw Error('read'); }, setItem() { throw Error('write'); } }, onError: error => errors.push(error.message) });
    let value;
    broken.subscribe('count', next => { value = next; });
    broken.set('count', 2);
    assert.equal(value, 2);
    assert.deepEqual(errors, ['read', 'write']);
    assert.equal(broken.persistenceError.message, 'write');
    env.window.localStorage.setItem('state', '{"zero":0,"no":false,"blank":""}');
    const legacy = new env.State();
    assert.equal(legacy.get('zero'), 0); assert.equal(legacy.get('no'), false); assert.equal(legacy.get('blank'), '');
});

test('invalid JSON state remains usable and serialization failures leave durable data intact', t => {
    const env = dataEnvironment(t);
    env.window.localStorage.setItem('state', 'broken');
    const errors = [];
    const state = new env.State({ onError: error => errors.push(error) });
    state.set('ok', 1);
    let notifications = 0;
    state.subscribe('bad', () => notifications++);
    const cyclic = {}; cyclic.self = cyclic;
    state.set('bad', cyclic);
    assert.equal(state.get('bad'), cyclic);
    assert.equal(notifications, 1);
    assert.deepEqual(JSON.parse(env.window.localStorage.getItem('state')), { ok: 1 });
    assert.equal(errors.length, 2);
    state.delete('bad');
    assert.equal(state.persistenceError, null);
});

test('request supports JSON, text, blobs, multipart and request options without default persistence', async t => {
    const env = dataEnvironment(t);
    const json = env.request('/listing', { credentials: 'include', headers: { Accept: 'application/json' } });
    assert.equal(env.requests[0].options.credentials, 'include');
    env.requests[0].resolve(response([{ name: 'hello' }]));
    assert.equal((await json)[0].name, 'hello');
    assert.equal(json.response.status, 200);
    assert.equal(env.window.localStorage.length, 0);
    const text = env.request('/text', { responseType: 'text' });
    env.requests[1].resolve(response('<hello>', { type: 'text/plain' }));
    assert.equal(await text, '<hello>');
    const blobValue = new env.window.Blob(['x']);
    const blob = env.request('/image', { responseType: 'blob' });
    env.requests[2].resolve(response(blobValue, { type: 'image/png' }));
    assert.equal(await blob, blobValue);
    const body = new env.window.FormData(); body.append('file', new env.window.File(['hello'], 'hello.txt'));
    const upload = env.request('/upload', { method: 'POST', body, headers: { 'Content-Type': 'multipart/form-data', 'X-Test': 'yes' }, responseType: 'text' });
    assert.equal(env.requests[3].options.body, body);
    assert.equal(env.requests[3].options.headers.get('content-type'), null);
    assert.equal(env.requests[3].options.headers.get('x-test'), 'yes');
    env.requests[3].resolve(response('uploaded', { type: 'text/plain' }));
    assert.equal(await upload, 'uploaded');
});

test('request diagnoses HTTP failures, redirect/login HTML and response mismatches', async t => {
    const env = dataEnvironment(t);
    for (const [index, options, code] of [
        [0, { status: 403 }, 'HTTP_ERROR'], [1, { redirected: true }, 'AUTH_REDIRECT'],
        [2, { type: 'text/html' }, 'AUTH_HTML'], [3, { type: 'text/plain' }, 'RESPONSE_TYPE'],
    ]) {
        const pending = env.request('/data');
        env.requests[index].resolve(response('bad', options));
        await assert.rejects(pending, error => error.code === code && error.url === '/data');
    }
    const empty = env.request('/delete', { method: 'DELETE' });
    env.requests[4].resolve(response(null, { status: 204, type: '' }));
    assert.equal(await empty, null);
});

test('request cancellation settles even when fetch ignores abort, and latest request owns persistent cache', async t => {
    const env = dataEnvironment(t);
    const cancelled = env.request('/cancel', { cache: true });
    cancelled.dispose(); cancelled.dispose();
    await assert.rejects(cancelled, { name: 'AbortError' });
    assert.equal(env.requests[0].options.signal.aborted, true);
    env.requests[0].resolve(response('late'));
    const first = env.request('/cached', { cache: true });
    const second = env.request('/cached', { cache: true });
    env.requests[2].resolve(response('new')); await second;
    env.requests[1].resolve(response('old')); await first;
    assert.equal(JSON.parse(env.window.localStorage.getItem('/cached')), 'new');
    assert.equal(env.window.localStorage.getItem('/cancel'), null);
    const controller = new env.window.AbortController();
    const external = env.request('/external', { signal: controller.signal });
    controller.abort();
    await assert.rejects(external, { name: 'AbortError' });
});

test('Resource exposes loading, errors, retries, empty results and ignores obsolete work after disposal', async t => {
    const env = dataEnvironment(t);
    const resource = new env.Resource('/directory');
    const statuses = []; resource.subscribe('status', status => statuses.push(status));
    const failed = resource.refresh();
    assert.equal(resource.get('loading'), true);
    env.requests[0].resolve(response(null, { status: 500 }));
    await assert.rejects(failed, error => error.status === 500);
    assert.equal(resource.get('status'), 'error'); assert.equal(resource.get('loading'), false);
    const retry = resource.retry(); env.requests[1].resolve(response([])); await retry;
    assert.equal(resource.get('status'), 'empty');
    const old = resource.refresh().catch(error => error);
    const fresh = resource.refresh();
    env.requests[3].resolve(response(['fresh'])); await fresh;
    assert.equal((await old).name, 'AbortError');
    env.requests[2].resolve(response(['obsolete'])); await settle();
    assert.equal(resource.get('data')[0], 'fresh');
    const pending = resource.refresh().catch(error => error);
    resource.dispose(); resource.dispose();
    assert.equal((await pending).name, 'AbortError');
    assert.equal(resource.get('loading'), false);
    env.requests[4].resolve(response(['late'])); await settle();
    assert.equal(resource.get('data')[0], 'fresh');
    assert.equal(env.window.localStorage.length, 0);
    assert.ok(statuses.includes('error') && statuses.includes('empty') && statuses.includes('success'));
});

test('Fetch general renderers transition through error, retry and empty states without table callbacks', async t => {
    const idle = [];
    const env = dataEnvironment(t, { requestIdleCallback: callback => { idle.push(callback); return idle.length; }, cancelIdleCallback() {} });
    const component = new env.Fetch({ url: '/data',
        loading: () => new env.P({ text: () => 'Loading' }),
        render: data => new env.P({ text: () => data.join(',') }),
        error: error => new env.P({ text: () => `Error ${error.status}` }),
        empty: () => new env.P({ text: () => 'Empty' }),
    });
    const root = new env.Div({ children: [component] });
    const node = root.render(); env.document.getElementById('app').append(node);
    await settle(); assert.equal(node.textContent, 'Loading');
    idle[0](); env.requests[0].resolve(response(null, { status: 401 })); await settle();
    assert.equal(node.textContent, 'Error 401'); assert.equal(component.state.get('status'), 'error');
    const retry = component.retry(); env.requests[1].resolve(response(['one'])); await retry;
    assert.equal(node.textContent, 'one');
    const refresh = component.refresh(); env.requests[2].resolve(response([])); await refresh;
    assert.equal(node.textContent, 'Empty'); assert.equal(component.state.get('status'), 'empty');
    root.dispose(); assert.equal(component.state.get('loading'), false);
});

test('late Fetch renderer results cannot dispose a component acquired by a newer result', async t => {
    const idle = [];
    const env = dataEnvironment(t, { requestIdleCallback: callback => { idle.push(callback); return idle.length; }, cancelIdleCallback() {} });
    const state = new env.State({ persist: false, initial: { text: 'fresh' } });
    let disposed = 0;
    const shared = new env.P({ store: state, watch: ['text'], text: () => state.get('text'),
        onmount: element => { assert.equal(element.isConnected, true); return () => disposed++; } });
    const late = deferred();
    const fetcher = new env.Fetch({ url: '/data', render: data => data === 'old' ? late.promise : shared });
    const root = new env.Div({ children: [fetcher] });
    if (typeof root.mount === 'function') root.mount(env.document.getElementById('app'));
    else env.document.getElementById('app').append(root.render());
    await settle(); idle[0]();
    env.requests[0].resolve(response('old')); await settle();
    const refresh = fetcher.refresh(); env.requests[1].resolve(response('new')); await refresh;
    late.resolve(shared); await settle();
    state.set('text', 'still alive');
    assert.equal(env.document.getElementById('app').textContent, 'still alive');
    assert.equal(disposed, 0);
    root.dispose(); assert.equal(disposed, 1);
});

test('Fetch output hooks wait for the parent mounting boundary after detached rendering', async t => {
    const idle = [];
    const env = dataEnvironment(t, { requestIdleCallback: callback => { idle.push(callback); return idle.length; }, cancelIdleCallback() {} });
    let hooks = 0;
    const fetcher = new env.Fetch({ url: '/data', render: data => new env.P({ plainText: data, onmount() { hooks++; } }) });
    const root = new env.Div({ children: [fetcher] });
    const detached = root.render();
    await settle(); idle[0](); env.requests[0].resolve(response('detached')); await settle();
    assert.equal(detached.textContent, 'detached'); assert.equal(hooks, 0);
    env.document.getElementById('app').append(detached);
    // Raw DOM insertion remains outside the public mount boundary.
    assert.equal(hooks, 0);
    root.mount(env.document.getElementById('app'));
    await settle(); idle[1](); env.requests[1].resolve(response('mounted')); await settle();
    assert.equal(hooks, 1);
    root.dispose();
});

test('offline cache applies only to GET, isolates text from legacy JSON, and never substitutes blob bodies', async t => {
    const env = dataEnvironment(t);
    env.window.localStorage.setItem('/same', '{"from":"json"}');
    env.window.localStorage.setItem('/same::text', '"text body"');
    Object.defineProperty(env.window.navigator, 'onLine', { configurable: true, value: false });
    assert.equal((await env.request('/same', { cache: true })).from, 'json');
    assert.equal(await env.request('/same', { cache: true, responseType: 'text' }), 'text body');
    assert.equal(env.requests.length, 0);
    const post = env.request('/same', { cache: true, method: 'POST', body: 'mutation' });
    assert.equal(env.requests.length, 1);
    env.requests[0].resolve(response({ from: 'post' }));
    assert.equal((await post).from, 'post');
    assert.equal(JSON.parse(env.window.localStorage.getItem('/same')).from, 'json');
    const blob = env.request('/same', { cache: true, responseType: 'blob' });
    assert.equal(env.requests.length, 2);
    const contents = new env.window.Blob(['actual blob']); env.requests[1].resolve(response(contents));
    assert.equal(await blob, contents);
});
