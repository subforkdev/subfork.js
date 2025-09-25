/*
Copyright (c) 2022-2025 Subfork. All rights reserved.
*/

import { io } from "socket.io-client";

// define some constants
const version = "0.2.0";
const api_version = "api";
const event_url = "https://events.subfork.dev";
const wait_time = 100;

// define some variables
var socket;

// waits for condition to be true
function wait_for(condition, callback) {
    if(!condition()) {
        window.setTimeout(wait_for.bind(null, condition, callback), wait_time);
    } else {
        callback();
    };
};

// returns a local api url, e.g.: /api/task/create
function _build_url(endpoint, apiBase) {
    const base = (apiBase || window.location.origin).replace(/\/+$/, "");
    const api = String(api_version).replace(/^\/+|\/+$/g, "");
    const tail = String(endpoint).replace(/^\/+/, "");
    let url = `${base}/${api}/${tail}`;
    return url;
};

// post request to server
function post_request(url, data = {}, func = null, async = true) {
  try {
    var xhr = new XMLHttpRequest();
    xhr.open("POST", url, async);
    xhr.withCredentials = true;
    xhr.setRequestHeader("Content-Type", "application/json; charset=utf-8");
    xhr.setRequestHeader("Accept", "application/json");

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
    constructor(name, conn) {
        this.name = name;
        this.conn = conn;
    }
    create(data, callback=null) {
        let row_data = {
            "collection": this.name,
            "data": data,
            "version": version,
        };
        let success = false;
        let url = this.conn.build_url("data/create");
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
        let url = this.conn.build_url("data/delete");
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
        let url = this.conn.build_url("data/get");
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
        let url = this.conn.build_url("data/update");
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
        let url = this.conn.build_url("task/create");
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
        let url = this.conn.build_url("task/get");
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
        if (socket.connected) {
            let sig = "task" + ":" + this.name + ":" + event_name;
            console.debug("listening for event " + sig);
            socket.on(sig, (event_data) => {
                const event = new SubforkEvent(event_name, event_data, this.conn);
                callback(event);
            });
            return true;
        } else {
            console.error("Socket is not connected");
            return false;
        };
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
        this.config.host = this.config.host ?? window.location.hostname;
        this.config.port = this.config.port ?? window.location.port;
        this.config.apiBase = this.config.apiBase ?? window.location.origin;
        this.config.eventsUrl = this.config.eventsUrl ?? event_url;
    }
    // build a full api url
    build_url(endpoint) {
        return _build_url(endpoint, this.config.apiBase);
    }
    // connect to event server
    connect() {
        this.session = this.get_session_data();
        console.debug("session", this.session);
        const token = this.session.token;
        if (!token) {
            console.error("No token was found in session");
        };
      
        socket = io(event_url, {
            transports: ["websocket"],
            path: "/socket.io",
            auth: { token },
            withCredentials: true
        });
      
        socket.on("connect", () => console.debug("WS connected", socket.id));
        socket.on("connect_error", (err) =>
            console.error("WS connect_error:", (err && err.message) || err)
        );
    }
    // get session data from the server
    get_session_data() {
        let data = {"source": this.config.host, "version": api_version};
        let session_data = {};
        let url = this.build_url("session");
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
        return !!(socket && socket.connected);
    }
    // on ready wait for socket connection
    ready(callback) {
        wait_for(() => socket && socket.connected, () => callback());
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
            let url = this.build_url("user/get");
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

export { Subfork };
