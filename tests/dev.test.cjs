const test = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');
const { JSDOM } = require('jsdom');
const { createDevServer } = require('../scripts/dev.cjs');

test('dev serves the source demo at the root with framework imports and fixtures', async t => {
    const server = createDevServer();
    server.listen(0, '127.0.0.1');
    await once(server.server, 'listening');
    t.after(() => new Promise((resolve, reject) => {
        server.server.close(error => error ? reject(error) : resolve());
        server.server.closeAllConnections();
    }));
    const origin = `http://127.0.0.1:${server.server.address().port}`;
    for (const pathname of ['/', '/Example/']) {
        const response = await fetch(`${origin}${pathname}?test=1`);
        assert.equal(response.status, 200);
        assert.match(response.headers.get('cache-control'), /no-cache/);
        const dom = new JSDOM(await response.text(), { url: `${origin}${pathname}` });
        try {
            assert.equal(dom.window.document.title, 'SpineJS examples');
            for (const element of dom.window.document.querySelectorAll('script[src], link[href]')) {
                const url = element.src || element.href;
                const asset = await fetch(url);
                assert.equal(asset.status, 200, url);
                assert.match(asset.headers.get('content-type'), element.src ? /javascript/ : /css/, url);
                await asset.text();
            }
            const fixture = await fetch(new URL('./example_table.json', `${origin}${pathname}`));
            assert.equal(fixture.status, 200);
            assert.ok((await fixture.json()).table.length > 1);
        } finally { dom.window.close(); }
    }
    const missing = await fetch(`${origin}/missing.js`);
    assert.equal(missing.status, 404);
    await missing.text();
});
