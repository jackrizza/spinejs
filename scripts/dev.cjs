const path = require('node:path');
const { parseArgs } = require('node:util');
const { createServer } = require('http-server');

function createDevServer() {
    return createServer({
        root: path.resolve(__dirname, '..'),
        cache: -1,
        showDir: 'false',
        before: [(request, response) => {
            // Serve the demo at / while leaving its ../src/ imports reachable.
            // Keep /Example/ URLs working for existing bookmarks as well.
            const pathname = request.url.split('?')[0];
            if (!/^\/(?:src|Example)(?:\/|$)/.test(pathname)) {
                request.url = `/Example${request.url}`;
            }
            response.emit('next');
        }],
    });
}

if (require.main === module) {
    const { values } = parseArgs({ options: {
        port: { type: 'string', short: 'p', default: process.env.PORT || '8080' },
        address: { type: 'string', short: 'a', default: '127.0.0.1' },
    } });
    const port = Number(values.port);
    if (!Number.isInteger(port) || port < 0 || port > 65535) {
        throw new RangeError('Port must be an integer between 0 and 65535');
    }
    const server = createDevServer();
    server.server.on('error', error => {
        console.error(`Could not start the example server: ${error.message}`);
        process.exitCode = 1;
    });
    server.listen(port, values.address, () => {
        console.log(`SpineJS example: http://${values.address}:${server.server.address().port}/`);
        console.log('Refresh the browser after edits. Press Ctrl+C to stop.');
    });
}

module.exports = { createDevServer };
