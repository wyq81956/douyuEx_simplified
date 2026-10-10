// node tests/bilibili-hotkey.test.cjs
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const source = fs.readFileSync(path.join(__dirname, "../bilibili/bilibiliex.user.js"), "utf8");

function boot(options = {}) {
    let now = 0, serial = 0;
    const listeners = new Map(), timers = new Map(), clicks = [];
    const state = {
        hostname: "www.bilibili.com", pathname: "/video/BVtest/", mode: "normal",
        present: true, ready: 1, full: false, disabled: false, ariaDisabled: false, connected: true,
        ...options,
    };
    const values = {
        "video.autoWebFullscreen": false, "live.autoWebMode": false,
        "live.hideChatBadges": false, "live.hideChatTop": false, "live.highestQuality": false,
        ...options.values,
    };
    function events(prefix) {
        return {
            addEventListener(type, fn) {
                const key = prefix + type;
                if (!listeners.has(key)) listeners.set(key, new Set());
                listeners.get(key).add(fn);
            },
            removeEventListener(type, fn) { listeners.get(prefix + type)?.delete(fn); },
        };
    }
    function emit(key, event = {}) {
        const pending = [];
        for (const fn of [...(listeners.get(key) || [])]) {
            if (!listeners.get(key).has(fn) || event.propagationStopped) continue;
            pending.push(fn(event));
        }
        return Promise.all(pending);
    }
    const button = {
        get isConnected() { return state.connected; },
        get disabled() { return state.disabled; },
        getAttribute: () => state.ariaDisabled ? "true" : null,
        click() { clicks.push(state.mode); state.mode = state.mode === "web" ? "normal" : "web"; },
    };
    function wrap(label) {
        let tip = null;
        const node = {
            showing: false, matches: () => false,
            querySelector: selector => selector === ".tip" ? tip : label === "网页模式" ? button : null,
            dispatchEvent(event) {
                if (event.type === "mouseenter") {
                    node.showing = true;
                    queueMicrotask(() => { tip = { textContent: label === "网页模式" && state.mode === "web" ? "退出网页模式" : label }; });
                } else { tip = null; node.showing = false; }
            },
        };
        return node;
    }
    const wraps = [wrap("镜像模式"), wrap("网页模式"), wrap("全屏")];
    const video = { get readyState() { return state.ready; } };
    const player = {
        getClientRects: () => [1], getAttribute: () => state.mode,
        querySelector: selector => selector === "video" ? video : button,
        querySelectorAll: () => wraps,
    };
    const document = {
        ...events("doc:"), readyState: "complete",
        body: { classList: { contains: () => state.mode === "web" } },
        get fullscreenElement() { return state.full ? {} : null; },
        querySelector: selector => selector === "#fullscreen-container" ? {
            getBoundingClientRect: () => ({ top: 0, bottom: 900, width: 1200 }),
        } : state.present ? player : null,
    };
    vm.runInNewContext(source, {
        document, window: { ...events("win:"), innerHeight: 900, location: state },
        Date: { now: () => now }, getComputedStyle: () => ({ position: "fixed" }),
        MouseEvent: class { constructor(type) { this.type = type; } },
        GM_getValue: (key, fallback) => values[key] ?? fallback,
        GM_setValue() {}, GM_registerMenuCommand() {}, GM_addStyle() {},
        setInterval: fn => { timers.set(++serial, fn); return serial; },
        clearInterval: id => timers.delete(id),
    });
    const flush = () => new Promise(resolve => setImmediate(resolve));
    return {
        state, timers, clicks, wraps, flush,
        async press(extra = {}) {
            const event = {
                isTrusted: true, key: "t", target: { closest: () => null },
                preventDefault() { this.defaultPrevented = true; },
                stopImmediatePropagation() { this.propagationStopped = true; },
                ...extra,
            };
            await emit("doc:keydown", event); await flush(); return event;
        },
        async tick(ms = 500) { now += ms; await Promise.all([...timers.values()].map(fn => fn())); await flush(); },
        hide: () => emit("win:pagehide"),
        listenerCount: () => [...listeners.values()].reduce((n, set) => n + set.size, 0),
    };
}

(async () => {
    let t;
    for (const pathname of ["/video/BVtest/", "/list/watchlater/", "/list/watchlater"]) {
        t = boot({ pathname });
        assert.ok((await t.press()).defaultPrevented);
        assert.equal(t.state.mode, "web");
        await t.tick(400); await t.press({ key: "T" });
        assert.equal(t.state.mode, "normal");
    }
    t = boot({ hostname: "live.bilibili.com", pathname: "/blanc/544618/" });
    await t.press(); assert.equal(t.state.mode, "web");
    await t.tick(400); await t.press(); assert.equal(t.state.mode, "normal");
    assert.ok(t.wraps.every(w => !w.showing));

    t = boot(); await t.press();
    await t.press(); await t.press({ repeat: true });
    assert.equal(t.clicks.length, 1); // 长按及紧接着的重复按键只切换一次。
    await t.tick(400); await t.press({ repeat: true });
    assert.equal(t.clicks.length, 1);

    for (const extra of [
        { key: "f" }, { isTrusted: false }, { ctrlKey: true }, { altKey: true },
        { metaKey: true }, { shiftKey: true }, { isComposing: true }, { keyCode: 229 },
        { defaultPrevented: true }, { target: { isContentEditable: true } },
        { target: { closest: () => ({}) } },
        { composedPath: () => [{ closest: () => null }, { closest: () => ({}) }] },
    ]) {
        t = boot(); await t.press(extra); assert.equal(t.clicks.length, 0);
    }
    for (const state of [
        { present: false }, { ready: 0 }, { full: true }, { mode: "mini" }, { mode: "full" },
        { disabled: true }, { ariaDisabled: true }, { connected: false },
        { hostname: "t.bilibili.com", pathname: "/" },
        { hostname: "live.bilibili.com", pathname: "/" },
        { values: { "keyboard.webFullscreen": false } },
    ]) {
        t = boot(state); const event = await t.press();
        assert.equal(t.clicks.length, 0); assert.equal(!!event.defaultPrevented, false);
    }
    t = boot({ values: { "video.autoWebFullscreen": true } });
    assert.equal(t.state.mode, "web"); // 自动进入尚未确认时，T 手动退出。
    await t.press(); await t.tick(10000);
    assert.equal(t.state.mode, "normal"); assert.equal(t.clicks.length, 2);
    assert.equal(t.timers.size, 0);

    t = boot({ hostname: "live.bilibili.com", pathname: "/544618", values: { "live.autoWebMode": true } });
    const pending = t.tick(2000); // 自动识别正在 await 提示渲染时按 T。
    await t.press(); await pending;
    assert.equal(t.clicks.length, 1); assert.equal(t.state.mode, "web");
    await t.tick(400); await t.press(); await t.tick(10000);
    assert.equal(t.state.mode, "normal"); assert.equal(t.timers.size, 0);

    t = boot({ hostname: "live.bilibili.com", pathname: "/544618" });
    const pressing = t.press(); await t.hide(); await pressing;
    assert.equal(t.clicks.length, 0); assert.ok(t.wraps.every(w => !w.showing));
    assert.equal(t.listenerCount(), 0);
    t = boot(); await t.hide(); await t.press(); assert.equal(t.clicks.length, 0);
    console.log("Passed: T toggle on video/watchlater/live, input and IME guards, modifiers, repeat suppression, auto-mode cancellation and page cleanup.");
})().catch(error => { console.error(error); process.exitCode = 1; });
