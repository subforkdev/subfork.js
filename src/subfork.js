/*
Copyright (c) 2022-2025 Subfork. All rights reserved.
*/

import { io } from "socket.io-client";

// define some constants
const version = "0.2.0";
const api_version = "api";
const event_url = "https://events.subfork.com";
const wait_time = 100;

// define some variables
// TODO: support multiple connections
var socket;

// waits for condition to be true
function wait_for(condition, callback) {
    if(!condition()) {
        window.setTimeout(wait_for.bind(null, condition, callback), wait_time);
    } else {
        callback();
    };
};

// returns a full api url
function _build_url(endpoint, apiBase) {
    const base = (apiBase || window.location.origin).replace(/\/+$/, "");
    const api = String(api_version).replace(/^\/+|\/+$/g, "");
    const tail = String(endpoint).replace(/^\/+/, "");
    let url = `${base}/${api}/${tail}`;
    return url;
};

/*
post request to server:
if a callback is provided, it will be invoked with the parsed JSON response.
always returns a Promise that resolves to the response object.
*/
function post_request(url, data = {}, callback = null) {
    return fetch(url, {
        method: "POST",
        credentials: "include",
        headers: {
            "Content-Type": "application/json; charset=utf-8",
            "Accept": "application/json",
        },
        body: JSON.stringify(data ?? {}),
    })
    .then(async (resp) => {
        let json;
        try {
            json = await resp.json();
        } catch (e) {
            json = { success: false, error: "bad json", status: resp.status };
        }

        // If server returned non-2xx, keep it visible to callers.
        if (!resp.ok && (json && typeof json.success === "undefined")) {
            json.success = false;
            json.status = resp.status;
        }

        if (callback) callback(json);
        return json;
    })
    .catch((e) => {
        const err = { success: false, error: String(e) };
        if (callback) callback(err);
        return err;
    });
};

/*
datatype class - represents a data collection
*/
class Datatype {
    constructor(name, conn) {
        this.name = name;
        this.conn = conn;
    }
    // create a new data row
    create(data, callback=null) {
        let row_data = {
            "collection": this.name,
            "data": data,
            "version": version,
        };
        let url = this.conn.build_url("data/create");
        return post_request(url, row_data, callback);
    }
    // delete data rows matching params
    delete(params, callback=null) {
        let data = {
            "collection": this.name,
            "params": params,
            "version": version,
        };
        let url = this.conn.build_url("data/delete");
        return post_request(url, data, callback);
    }
    // find data rows matching params
    find(params, callback=null, expand=false) {
        let data = {
            "collection": this.name,
            "expand": expand,
            "params": params,
            "version": version,
        };
        let url = this.conn.build_url("data/get");
        return post_request(url, data, callback);
    }
    // update a data row by id
    update(id, data, callback=null) {
        let row_data = {
            "collection": this.name,
            "id": id,
            "data": data,
            "version": version,
        };
        let url = this.conn.build_url("data/update");
        return post_request(url, row_data, callback);
    }
};

/*
event class - used in event callbacks
*/
class SubforkEvent {
    constructor(event_name, event_data, conn) {
        this.name = event_name;
        this.type = event_data.type;
        this.message = event_data.message;
        this.event_data = event_data;
        this.conn = conn;
    }
    data() {
        if (this.type == "data") {
            return new Datatype(this.name, this.conn);
        }
    }
    task() {
        if (this.type == "task") {
            let queue = new SubforkTaskQueue(this.conn, this.event_data.queue);
            return new SubforkTask(queue, this.event_data.task);
        }
    }
    user() {
        if (this.type == "user") {
            return new SubforkUser(this.event_data.user);
        }
    }
};

/*
task class - represents a task in a task queue
*/
class SubforkTask {
    constructor(queue, data) {
        this.queue = queue;
        this.data = data;
    }
    get_error() {
        return this.data.error;
    }
    get_results() {
        try {
            return JSON.parse(this.data.results);
        } catch {
            return this.data.results;
        };
    }
    // TODO: hash the event signature
    on(event_name, callback) {
        return this.queue.on(event_name, callback);
    }
};

/*
task queue class - represents a task queue
*/
class SubforkTaskQueue {
    constructor(conn, name) {
        this.conn = conn;
        this.name = name;
    }
    // create and enqueue new task
    create(data) {
        var t = new SubforkTask(this, data);
        if (this.enqueue(t)) {
            return t;
        }
    }
    // enqueue a task
    enqueue(task, callback=null) {
        let data = {
            "queue": this.name,
            "data": task.data,
            "version": version,
        };
        let url = this.conn.build_url("task/create");
        return post_request(url, data, callback);
    }
    // find and return a task by id
    get(taskid, callback=null) {
        let data = {
            "queue": this.name,
            "taskid": taskid,
            "version": version,
        };
        let url = this.conn.build_url("task/get");
        return post_request(url, data, (resp) => {
            if (!resp || !resp.success) {
                if (callback) callback(null, resp);
                return;
            }
            const task = new SubforkTask(this, resp.data);
            if (callback) callback(task, resp);
        }).then((resp) => {
            if (resp && resp.success) return new SubforkTask(this, resp.data);
            return null;
        });
    }
    // listen for task events
    on(event_name, callback) {
        if (!socket) { console.error("Socket is not initialized"); return false; }
        const sig = `task:${this.name}:${event_name}`;
        console.debug("listening for event", sig);
        socket.on(sig, (event_data) => {
            const event = new SubforkEvent(event_name, event_data, this.conn);
            callback(event);
        });
        return true;
    }
};

/*
user class - represents a user
*/
class SubforkUser {
    constructor(data) {
        this.data = data;
    }
    get(key) {
        return this.data[key];
    }
};

/*
simple cache for datatypes, users, and task queues
*/
class SubforkCache {
    constructor(parent) {
        this.parent = parent;
        this._cache = {};
    }
    // type is one of: data, user, task
    add(type, name, value) {
        if (!(type in this._cache)) {
            this._cache[type] = {};
        };
        this._cache[type][name] = value;
    }
    // clear all cached items
    clear() {
        Object.keys(this._cache).forEach(key => {
            delete this._cache[key];
        });
    }
    // remove a cached item
    del(type, name) {
        if (type in this._cache && name in this._cache[type]) {
            delete this._cache[type][name];
        }
    }
    // get a cached item
    get(type, name) {
        if (type in this._cache && name in this._cache[type]) {
            return this._cache[type][name];
        };
    }
    // update a cached item
    update(type, other) {
        if (!(type in this._cache)) {
            this._cache[type] = {};
        };
        Object.assign(this._cache[type], other);
    }
};

/*
main Subfork client class
*/
class Subfork {
    constructor(config={}) {
        this.cache = new SubforkCache(this);
        this.session = {};
        this.set_config(config);
        this.connect();
    }
    // checks config values for default overrides
    set_config(config) {
        this.config = config;
        this.config.host = this.config.host ?? window.location.hostname;
        this.config.port = this.config.port ?? window.location.port;
        this.config.apiBase = this.config.apiBase ?? window.location.origin;
        this.config.eventsUrl = this.config.eventsUrl ?? event_url;
    }
    // build a full api url
    build_url(endpoint) {
        return _build_url(endpoint, this.config.apiBase);
    }
    // connect to event server with session token
    async connect() {
        this.session = await this.get_session_data();
        console.debug("session", this.session);

        const token = this.session && this.session.token;
        if (!token) {
            console.warn("No token was found in session; skipping WS connect");
            return false;
        }

        socket = io(this.config.eventsUrl, {
            transports: ["websocket"],
            path: "/socket.io",
            auth: { token },
            withCredentials: true
        });

        socket.on("connect", () => console.debug("WS connected", socket.id));
        socket.on("connect_error", (err) =>
            console.error("WS connect_error:", (err && err.message) || err)
        );
        return true;
    }
    // get session data from the server (synchronous)
    async get_session_data(callback=null) {
        let data = {"source": this.config.host, "version": api_version};
        let url = this.build_url("session");
        return post_request(url, data, (resp) => {
            if (resp && resp.success && resp.data) {
                if (callback) callback(resp.data, resp);
            } else {
                console.error(resp && resp.error);
                if (callback) callback(null, resp);
            }
        }).then((resp) => (resp && resp.success && resp.data) ? resp.data : {});
    };
    // datatype accessor - get or create a datatype
    data(name) {
        if (!(this.cache.get("data", name))) {
            this.cache.add("data", name, new Datatype(name, this));
        };
        return this.cache.get("data", name);
    }
    // return true if connected to event server
    is_connected() {
        return !!(socket && socket.connected);
    }
    // on ready wait for socket connection
    ready(callback) {
        wait_for(() => socket && socket.connected, () => callback());
    }
    // task queue accessor - get or create a task queue
    task(name) {
        if (!(this.cache.get("task", name))) {
            var q = new SubforkTaskQueue(this, name);
            this.cache.add("task", name, q);
        };
        return this.cache.get("task", name);
    }
    // user accessor - get user data by username (synchronous)
    user(username, callback=null) {
        // If cached, return it (and callback immediately if provided).
        const cached = this.cache.get("user", username);
        if (cached) {
            if (callback) callback(cached, { success: true, data: cached.data });
            return Promise.resolve(cached);
        }

        let data = {
            "username": username,
            "version": version,
        };
        let url = this.build_url("user/get");

        return post_request(url, data, (resp) => {
            if (resp && resp.success) {
                const user = new SubforkUser(resp.data);
                this.cache.add("user", username, user);
                if (callback) callback(user, resp);
            } else {
                if (callback) callback(null, resp);
            }
        }).then((resp) => {
            if (resp && resp.success) {
                const user = new SubforkUser(resp.data);
                this.cache.add("user", username, user);
                return user;
            }
            return null;
        });
    }
};

export default Subfork;
