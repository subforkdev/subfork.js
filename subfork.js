/*
Copyright (c) Subfork. All rights reserved.

TODO:
- replace post-request with non-jquery function
- refactor to immediately-invoked function expression (IIFE)

    const Subfork = (() => {
        ...
        return {
            subfork: Subfork
        }
    })();

Instantiate client:

    const subfork = Subfork();

or pass in some config values:

    const subfork = Subfork({
        host: "test.fork.io",
        on: {
            "message": function(msg) {
                console.log(msg);
            },
        }
    });

Connect "test" task "done" event callback:

    subfork.task("test").on("done", function(e) {
        console.log(e.message + ": " + e.task.results);
    });

Create a "test" task with some data:

    subfork.task("test").create({t:2});

Set on "done" callback when creating task:

    subfork.task("test").create({
        "t": 3
    }).on("done", function(event) {
        console.log(event);
    });
*/

// define some constants
const version = "0.1.1";
const api_version = "api";
const hostname = window.location.hostname;
const port = window.location.port;
const protocol = window.location.protocol;
const socket_script = "https://code.subfork.com/socket.io.min.js";
const wait_time = 100;

// init some variables
var message;
var server;
var socket;
var socket_loaded = false;

// async returns a sha256 string (only works with https)
async function sha256(message) {
    const msgBuffer = new TextEncoder("utf-8").encode(message);
    // hash the message
    const hashBuffer = await window.crypto.subtle.digest("SHA-256", msgBuffer);
    // convert ArrayBuffer to Array
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    // convert bytes to hex string
    const hashHex = hashArray.map(b => ("00" + b.toString(16)).slice(-2)).join("");
    return hashHex;
};

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
// function _request(url, data={}) {
//     fetch(url, {
//         method: "POST",
//         headers: {
//             "Accept": "application/json",
//             "Content-Type': 'application/json"
//         },
//         body: JSON.stringify(data)
//     })
//     .then(response => response.json())
//     .then(response => console.log(JSON.stringify(response)))
// };
function post_request(url, data={}, func=null, async=true) {
    $.ajax({
        type: "POST",
        contentType: "application/json; charset=utf-8",
        url: url,
        async: async,
        data: JSON.stringify(data),
        success: function (resp) {
            if (func) {
                func(resp);
            } else {
                console.debug("no callback");
            };
        },
        dataType: "json"
    });
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
    constructor(event_name, event_data) {
        this.name = event_name;
        this.type = event_data.type;
        this.message = event_data.message;
        this.event_data = event_data;
    }
    data() {
        if (this.type == "data") {
            return new Datatype(this.name);
        }
    }
    task() {
        if (this.type == "task") {
            let queue = new SubforkTaskQueue(this.event_data.queue);
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
    // TODO: hash the event signature
    on(event_name, callback) {
        let sig = this.conn.session.sessionid + ":task:" + this.name + ":" + event_name;
        socket.on(sig, function(event_data, cb) {
            let event = new SubforkEvent(event_name, event_data);
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
        console.debug("sessionid", this.session.sessionid);
        load_socket_library(this.config.host, function(host) {
            socket = io("https://events.fork.io");
            console.debug("connected to event server");
        });
    }
    // get session data from the server
    get_session_data() {
        let data = {"source": this.config.host, "version": api_version};
        let session_data = {};
        let url = build_url("get_session_data");
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
