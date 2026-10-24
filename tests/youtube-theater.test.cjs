// node tests/youtube-theater.test.cjs
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const source = fs.readFileSync(path.join(__dirname, "../youtube/youtubeex.user.js"), "utf8");

function boot(options = {}) {
    const listeners = new Map(), observers = [], frames = new Map(), menus = [];
    const state = { scrolls: 0, resizes: 0, css: "", reloads: 0 };
    let serial = 0;
    function events(prefix) {
        return {
            addEventListener(type, fn) {
                const key = prefix + type;
                if (!listeners.has(key)) listeners.set(key, []);
                listeners.get(key).push(fn);
            },
            dispatchEvent(event) {
                for (const fn of listeners.get(prefix + event.type) || []) fn(event);
            },
        };
    }
    function mutate(target, attributeName) {
        for (const observer of observers) {
            if (observer.targets.some(([node, config]) => attributeName
                ? node === target && config.attributes && config.attributeFilter.includes(attributeName)
                : config.childList)) observer.callback();
        }
    }
    function node() {
        const attributes = new Set(), classes = new Set();
        const element = {
            isConnected: true,
            hasAttribute: name => attributes.has(name),
            set(name, value) {
                if (value) attributes.add(name); else attributes.delete(name);
                mutate(element, name);
            },
            classList: {
                contains: name => classes.has(name),
                toggle(name, value) {
                    if (value) classes.add(name); else classes.delete(name);
                    mutate(element, "class");
                },
            },
        };
        return element;
    }
    const root = node(), app = node();
    let watch = options.delayed ? null : makeWatch();
    function makeWatch() {
        const element = node();
        element.player = node();
        element.querySelector = selector => selector === "#movie_player" ? element.player : null;
        return element;
    }
    const document = {
        ...events("doc:"), documentElement: root, fullscreenElement: null,
        querySelector: selector => selector === "ytd-app" ? app
            : watch && !watch.hasAttribute("hidden") ? watch : null,
    };
    const location = {
        pathname: "/watch", search: "?v=example",
        reload: () => state.reloads++, ...options.location,
    };
    const window = {
        ...events("win:"), location,
        requestAnimationFrame: fn => { frames.set(++serial, fn); return serial; },
        cancelAnimationFrame: id => frames.delete(id),
        scrollTo: () => state.scrolls++,
    };
    window.addEventListener("resize", () => state.resizes++);
    vm.runInNewContext(source, {
        document, window, URLSearchParams, Event: class { constructor(type) { this.type = type; } },
        MutationObserver: class {
            constructor(callback) { this.callback = callback; this.targets = []; observers.push(this); }
            observe(target, config) { this.targets.push([target, config]); }
            disconnect() { this.targets = []; }
        },
        GM_getValue: (_, fallback) => options.enabled ?? fallback,
        GM_setValue: (key, value) => { state.saved = [key, value]; },
        GM_addStyle: css => { state.css = css; },
        GM_registerMenuCommand: (name, fn) => menus.push({ name, fn }),
    });
    function flush() {
        for (let limit = 0; frames.size && limit < 20; limit++) {
            const pending = [...frames.values()]; frames.clear(); pending.forEach(fn => fn());
        }
        assert.equal(frames.size, 0, "observers must settle without a resize loop");
    }
    flush();
    return {
        document, window, app, state, menus, observers, flush,
        get watch() { return watch; },
        get active() { return root.classList.contains("youtubeex-theater"); },
        emit(type, target = document) { target.dispatchEvent({ type }); flush(); },
        replace() {
            if (watch) { watch.isConnected = false; watch.player.isConnected = false; }
            watch = makeWatch(); mutate(root); flush();
        },
    };
}

const page = boot();
assert.equal(page.active, false, "normal mode stays unchanged");
page.watch.set("theater", true); page.flush();
assert.equal(page.active, true);
assert.equal(page.state.scrolls, 1, "entering theater scrolls the player into view");
page.emit("yt-page-data-updated");
assert.equal(page.state.scrolls, 1, "ordinary updates must not interrupt scrolling to comments");
page.watch.set("theater", false); page.flush();
assert.equal(page.active, false, "native exit restores the original layout");
page.watch.set("theater", true); page.flush();
page.document.fullscreenElement = {}; page.emit("fullscreenchange");
assert.equal(page.active, false, "native fullscreen has no overrides");
page.document.fullscreenElement = null; page.emit("fullscreenchange");
assert.equal(page.active, true);
page.watch.set("fullscreen", true); page.flush();
assert.equal(page.active, false);
page.watch.set("fullscreen", false); page.flush();
page.app.set("miniplayer-is-active", true); page.flush();
assert.equal(page.active, false, "app miniplayer restores the masthead");
page.app.set("miniplayer-is-active", false); page.flush();
page.watch.player.classList.toggle("ytp-player-minimized", true); page.flush();
assert.equal(page.active, false, "player miniplayer is also excluded");
page.watch.player.classList.toggle("ytp-player-minimized", false); page.flush();
assert.equal(page.active, true);

page.emit("yt-navigate-start");
assert.equal(page.active, false, "release the layout before SPA navigation");
page.emit("yt-page-data-updated");
assert.equal(page.active, false, "intermediate page updates must not re-enable overrides");
page.window.location.pathname = "/"; page.emit("yt-navigate-finish");
assert.equal(page.active, false, "a retained watch node cannot affect the homepage");
page.window.location.pathname = "/watch"; page.emit("yt-navigate-finish");
assert.equal(page.active, true);
page.window.location.search = ""; page.emit("popstate", page.window);
assert.equal(page.active, false, "watch routes without a video are excluded");
page.window.location.search = "?v=next"; page.emit("popstate", page.window);
assert.equal(page.active, true);
page.replace();
assert.equal(page.active, false, "replacement player mode is read again");
page.watch.set("theater", true); page.flush();
assert.equal(page.active, true, "replacement nodes are observed");
page.emit("pagehide", page.window);
assert.equal(page.active, false);
assert.ok(page.observers.every(observer => observer.targets.length === 0));
page.emit("pageshow", page.window);
assert.equal(page.active, true, "bfcache restoration rebinds observers");

const delayed = boot({ delayed: true });
assert.equal(delayed.active, false);
delayed.replace(); delayed.watch.set("theater", true); delayed.flush();
assert.equal(delayed.active, true, "late-loaded player is discovered");
const shorts = boot({ location: { pathname: "/shorts/example" } });
shorts.watch.set("theater", true); shorts.flush();
assert.equal(shorts.active, false);
const disabled = boot({ enabled: false });
assert.equal(disabled.state.css, "");
assert.equal(disabled.observers.length, 0);
disabled.menus[0].fn();
assert.deepEqual(disabled.state.saved, ["video.expandTheater", true]);
assert.equal(disabled.state.reloads, 1);
console.log("YouTube theater mode checks passed.");
