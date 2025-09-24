/*
Copyright (c) 2022-2025 Subfork. All rights reserved.

TODO:
- use vite/rollup to bundle client side dependencies
- refactor to immediately-invoked function expression (IIFE)
*/

// define some constants
const version = "0.2.0";
const api_version = "api";
const hostname = window.location.hostname;
const port = window.location.port;
const protocol = window.location.protocol;
const event_url = "https://events.subfork.dev";
const socket_script = "https://cdn.jsdelivr.net/npm/socket.io@4.5.4/client-dist/socket.io.min.js";
const wait_time = 100;

// init some variables
var message;
var server;
var socket;
var socket_loaded = false;

// load socket library (required for events)
function load_socket_library(host, callback) {
    if (socket_loaded) {
        callback(host);
    } else {
        var script = document.createElement("script");
        script.src = socket_script;
        document.head.appendChild(script);
        script.onload = function () {
            socket_loaded = true;
            callback(host);
        };
    };
};

// waits for condition to be true
function wait_for(condition, callback) {
    if(!condition()) {
        window.setTimeout(wait_for.bind(null, condition, callback), wait_time);
    } else {
        callback();
    };
};

// returns a local api url, e.g.: /api/task/create
function build_url(endpoint) {
    return "/" + api_version + "/" + endpoint;
};

// returns true if is running locally
function is_local() {
    return (
        (protocol === "http:") &&
        (hostname === "localhost" || hostname === "0.0.0.0" || hostname === "127.0.0.1") &&
        (port === "8000" || port === "8080")
    );
};

// post request to server
function post_request(url, data = {}, func = null, async = true) {
  try {
    var xhr = new XMLHttpRequest();
    xhr.open("POST", url, async);
    xhr.withCredentials = true;
    xhr.setRequestHeader("Content-Type", "application/json; charset=utf-8");
    xhr.setRequestHeader("Accept", "application/json");
    xhr.setRequestHeader("X-Subfork-Request", "1");  // your CSRF-lite marker

    if (async) {
      xhr.onreadystatechange = function () {
        if (xhr.readyState === 4) {
          var resp;
          try { resp = JSON.parse(xhr.responseText || "{}"); }
          catch (e) { resp = { success: false, error: "bad json" }; }
          if (func) func(resp);
        }
      };
      xhr.send(JSON.stringify(data));
    } else {
      xhr.send(JSON.stringify(data));  // blocks until done
      var resp;
      try { resp = JSON.parse(xhr.responseText || "{}"); }
      catch (e) { resp = { success: false, error: "bad json" }; }
      if (func) func(resp);
    }
  } catch (e) {
    console.error("post_request error:", e);
    if (func) func({ success: false, error: String(e) });
  }
};

// datatype class
class Datatype {
    constructor(name) {
        this.name = name;
    }
    create(data, callback=null) {
        let row_data = {
            "collection": this.name,
            "data": data,
            "version": version,
        };
        let success = false;
        let url = build_url("data/create");
        post_request(url, data=row_data, function(resp) {
            if (callback) {
                callback(resp);
            };
        })
        return success;
    }
    delete(params, callback=null) {
        let data = {
            "collection": this.name,
            "params": params,
            "version": version,
        };
        let success = false;
        let url = build_url("data/delete");
        post_request(url, data=data, function(resp) {
            if (callback) {
                callback(resp);
            };
        })
        return success;
    }
    find(params, callback=null, expand=false, async=true) {
        let data = {
            "collection": this.name,
            "expand": expand,
            "params": params,
            "version": version,
        };
        let success = false;
        let url = build_url("data/get");
        post_request(url, data=data, function(resp) {
            if (callback) {
                callback(resp);
            };
        }, async=async)
        return success;
    }
    update(id, data, callback=null) {
        let row_data = {
            "collection": this.name,
            "id": id,
            "data": data,
            "version": version,
        };
        let success = false;
        let url = build_url("data/update");
        post_request(url, data=row_data, function(resp) {
            if (callback) {
                callback(resp);
            };
        })
        return success;
    }
};

// event class
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
            return new Datatype(this.name);
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
            return new SubforkUser(queue, this.event_data.task);
        }
    }
};

// task class
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

// task queue class
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
    enqueue(task) {
        let data = {
            "queue": this.name,
            "data": task.data,
            "version": version,
        };
        let success = false;
        let url = build_url("task/create");
        post_request(url, data=data, function(resp) {
            if (resp.success) {
                success = true;
            };
        })
        return success;
    }
    // find and return a task by id
    get(taskid) {
        let data = {
            "queue": this.name,
            "taskid": taskid,
            "version": version,
        };
        let url = build_url("task/get");
        var task;
        post_request(url, data=data, function(resp) {
            if (resp.success) {
                task = new SubforkTask(this, resp.data);
            } else {
                console.error(resp.error);
            };
        }, async=false);
        return task;
    }
    // listen for task events
    on(event_name, callback) {
        let sig = "task" + ":" + this.name + ":" + event_name;
        console.debug("listening for event " + sig);
        socket.on(sig, (event_data) => {
            const event = new SubforkEvent(event_name, event_data, this.conn);
            callback(event);
        });
        return true;
    }
};

// user class
class SubforkUser {
    constructor(data) {
        this.data = data;
    }
};

// in-memory only data cache class
class SubforkCache {
    constructor(parent) {
        this.parent = parent;
        this._cache = {};
    }
    add(type, name, value) {
        if (!(type in this._cache)) {
            this._cache[type] = {};
        };
        this._cache[type][name] = value;
    }
    clear() {
        Object.keys(this._cache).forEach(key => {
            delete this._cache[key];
        });
    }
    del(type, name) {
        if (type in this._cache && name in this._cache[type]) {
            delete this._cache[type][name];
        }
    }
    get(type, name) {
        if (type in this._cache && name in this._cache[type]) {
            return this._cache[type][name];
        };
    }
    update(type, other) {
        if (!(type in this._cache)) {
            this._cache[type] = {};
        };
        Object.assign(this._cache[type], other);
    }
}

// subfork client class
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
        this.config.host = this.config["host"] ?? window.location.hostname;
        this.config.port = this.config["port"] ?? window.location.port;
    }
    // connect to event server
    connect() {
        this.session = this.get_session_data();
        console.debug("session", this.session);
    
        load_socket_library(this.config.host, () => {
            const token = this.session.token;
            if (!token) {
                console.error("No token was found in session");
            };
            socket = window.io(event_url, {
                transports: ["websocket"],
                path: "/socket.io",
                auth: { token: token },
                withCredentials: true
            });
            socket.on("connect", () => console.debug("WS connected", socket.id));
            socket.on("connect_error", (err) => console.error("WS connect_error:", err && err.message || err));
        });
    }
    // get session data from the server
    get_session_data() {
        let data = {"source": this.config.host, "version": api_version};
        let session_data = {};
        let url = build_url("session");
        post_request(url, data, function(resp) {
            if (resp.success && resp.data) {
                session_data = resp.data;
            } else {
                console.error(resp.error);
            };
        }, false);
        return session_data;
    };
    // datatype accessor
    data(name) {
        if (!(this.cache.get("data", name))) {
            var dt = new Datatype(name);
            this.cache.add("data", name, dt);
        };
        return this.cache.get("data", name);
    }
    // return true if connected to event server
    is_connected() {
        return (socket_loaded && socket.connected);
    }
    // on ready wait for socket connection
    ready(callback) {
        wait_for(() => window.socket, () => callback());
    }
    // task queue accessor
    task(name) {
        if (!(this.cache.get("task", name))) {
            var q = new SubforkTaskQueue(this, name);
            this.cache.add("task", name, q);
        };
        return this.cache.get("task", name);
    }
    // user accessor
    user(username) {
        if (!(this.cache.get("user", username))) {
            let data = {
                "username": username,
                "version": version,
            };
            let url = build_url("user/get");
            var user;
            post_request(url, data=data, function(resp) {
                if (resp.success) {
                    user = new SubforkUser(resp.data);
                };
            }, false);
            this.cache.add("user", username, user);
        };
        return this.cache.get("user", username);
    }
};
