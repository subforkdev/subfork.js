# subfork.js

Javascript client library used to connect to [Subfork](https://subfork.com) sites.

Usage:

```html
<script src="https://cdn.jsdelivr.net/npm/subfork@latest/dist/subfork.min.js"></script>
```

To use the latest dev (unstable) release:

```html
<script src="https://code.fork.io/subfork.js"></script>
```

Instantiate [Subfork](https://subfork.com) client:

```javascript
const subfork = new Subfork();
```

or pass in some config values:

```javascript
const subfork = Subfork({
    host: "test.fork.io",
    on: {
        "message": function(msg) {
            console.log(msg);
        },
    }
});
```

Connect `test` task `done` event callback function:

```javascript
subfork.task("test").on("done", function(e) {
    console.log(e.message + ": " + e.task.results);
});
```

Create a `test` task with some data:

```javascript
subfork.task("test").create({t:2});
```

Set on `done` callback when creating task:

```javascript
subfork.task("test").create({
    "t": 3
}).on("done", function(event) {
    console.log(event);
});
```

See the [test.fork.io](https://github.com/subforkdev/test.fork.io) project for more
usage examples.

## badge.js

Used for displaying [Subfork](https://subfork.com) attribution badge on sites.

Usage:

```html
<script src="https://cdn.jsdelivr.net/npm/subfork@latest/dist/badge.min.js"></script>
```

## Development

For testing updates to `subfork.js`, use the vite dev server:

Dependencies:

```bash
$ npm i socket.io-client
$ npm i -D vite typescript
```

Building the targets:

```bash
$ npm run build
```

Running vite dev server:

```bash
$ npm run dev
```
