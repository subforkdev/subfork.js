# subfork.js

Javascript client library used to connect to [Subfork](https://subfork.com) sites.

Usage:

```html
<script src="https://cdn.jsdelivr.net/npm/subfork@latest/dist/subfork.min.js"></script>
```

To use the latest dev (unstable) release:

```html
<script src="https://code.fork.io/subfork.min.js"></script>
```

Instantiate [Subfork](https://subfork.com) client:

```javascript
const sf = new Subfork();
```

Subscribe to task events (requires user to be authenticated):

```javascript
sf.task("test").on("done", (e) => {
    console.log("done:", e);
});
```

Create a test task with some data:

```javascript
sf.task("test").create({ t: 2 }).then((resp) => {
    console.log("task created:", resp);
});
```

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
