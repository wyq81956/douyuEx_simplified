// node tests/bilibili-live.test.cjs
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const source = fs.readFileSync(path.join(__dirname, "../bilibili/bilibiliex.user.js"), "utf8");

function boot(options = {}) {
    let now = 0;
    const timers = new Map(), listeners = new Map(), menus = new Map(), styles = [];
    const values = { ...options.values };
    const state = {
        present: true, entered: false, full: false, succeeds: true,
        pathname: "/544618", hostname: "live.bilibili.com", ...options,
    };
    const clicks = [];
    function events(prefix) {
        return {
            addEventListener(type, fn) { listeners.set(prefix + type, fn); },
            removeEventListener(type) { listeners.delete(prefix + type); },
        };
    }
    function wrap(label, hovered = false) {
        let tip = null;
        const icon = {
            isConnected: true, disabled: false, getAttribute: () => null,
            click() {
                clicks.push(label);
                if (label === "网页模式" && state.succeeds) state.entered = true;
            },
        };
        const node = {
            icon, hovered, showing: false,
            matches: () => node.hovered,
            querySelector: selector => selector === ".tip" ? tip : icon,
            dispatchEvent(event) {
                // Svelte 在下一微任务渲染提示，不在事件中同步生成。
                if (event.type === "mouseenter") {
                    node.showing = true;
                    queueMicrotask(() => { tip = { textContent: label }; });
                } else {
                    node.showing = false;
                    tip = null;
                }
            },
        };
        return node;
    }
    // 故意打乱顺序并插入无关控件，防止退回到 nth-child 定位。
    const wraps = [wrap("镜像模式"), wrap("全屏"), wrap("网页模式"), wrap("关闭弹幕")];
    const player = {
        getClientRects: () => [1], querySelectorAll: () => wraps,
        getAttribute: () => state.entered ? "web" : "normal",
        querySelector: selector => selector === "video" ? { readyState: 1 } : {
            getAttribute: () => null,
            click() { clicks.push("视频网页全屏"); state.entered = true; },
        },
    };
    const document = {
        ...events("doc:"),
        body: { classList: { contains: name => name === "player-full-win" && state.entered } },
        get fullscreenElement() { return state.full ? {} : null; },
        querySelector: () => state.present ? player : null,
    };
    vm.runInNewContext(source, {
        document,
        window: {
            ...events("win:"),
            location: { hostname: state.hostname, pathname: state.pathname, reload() {} },
        },
        Date: { now: () => now }, MouseEvent: class { constructor(type) { this.type = type; } },
        GM_getValue: (key, fallback) => values[key] ?? fallback,
        GM_setValue: (key, value) => { values[key] = value; },
        GM_registerMenuCommand: (label, fn) => menus.set(label, fn),
        GM_addStyle: css => styles.push(css),
        setInterval: fn => { timers.set(1, fn); return 1; },
        clearInterval: id => timers.delete(id),
    });
    const flush = () => new Promise(resolve => setImmediate(resolve));
    return {
        state, wraps, timers, listeners, menus, styles, values, clicks, wrap, flush,
        async tick(ms = 500) {
            now += ms;
            for (const fn of [...timers.values()]) await fn();
            await flush();
        },
        emit(key, event) { listeners.get(key)?.(event); },
    };
}

(async () => {
    let t = boot();
    await t.flush();
    assert.deepEqual(t.clicks, ["网页模式"]);
    assert.equal(t.menus.size, 5);
    assert.equal(t.styles.length, 2);
    assert.ok(t.wraps.every(w => !w.showing));
    await t.tick();
    assert.equal(t.timers.size, 0);
    assert.equal(t.listeners.size, 0);
    t.state.entered = false;
    await t.tick();
    assert.equal(t.clicks.length, 1); // 用户退出后不强制恢复。

    t = boot({ present: false, pathname: "/blanc/544618/" });
    await t.flush();
    assert.equal(t.clicks.length, 0);
    t.state.present = true;
    await t.tick();
    assert.deepEqual(t.clicks, ["网页模式"]);

    for (const flag of ["entered", "full"]) {
        t = boot({ [flag]: true });
        await t.flush();
        assert.equal(t.clicks.length, 0);
        assert.equal(t.timers.size, 0);
    }

    t = boot({ present: false });
    t.wraps.splice(0, t.wraps.length, t.wrap("退出网页模式"));
    t.state.present = true;
    await t.tick();
    assert.equal(t.clicks.length, 0);
    assert.equal(t.timers.size, 0);

    t = boot({ succeeds: false });
    await t.flush();
    for (let i = 0; i < 12; i++) await t.tick();
    assert.equal(t.clicks.length, 3);
    assert.equal(t.timers.size, 0);

    t = boot({ present: false });
    await t.tick(100000);
    assert.equal(t.clicks.length, 0);
    assert.equal(t.listeners.size, 0);

    t = boot({ present: false });
    t.emit("doc:click", { isTrusted: true, target: { closest: () => true } });
    t.state.present = true;
    await t.tick();
    assert.equal(t.clicks.length, 0);

    t = boot({ present: false });
    t.emit("doc:keydown", { isTrusted: true, key: "w", target: { closest: () => true } });
    assert.equal(t.timers.size, 1); // 输入框中的 W 不取消自动操作。
    t.emit("doc:keydown", { isTrusted: true, key: "Escape", target: { closest: () => null } });
    assert.equal(t.timers.size, 0);

    t = boot();
    t.emit("win:pagehide"); // 提示识别尚在 await 中时离页，不点击残留按钮。
    await t.flush();
    assert.equal(t.clicks.length, 0);
    assert.equal(t.timers.size, 0);
    assert.ok(t.wraps.every(w => !w.showing));

    t = boot({ present: false });
    t.wraps[2].icon.isConnected = false;
    t.state.present = true;
    await t.tick();
    assert.equal(t.clicks.length, 0);

    for (const key of ["live.autoWebMode", "live.hideChatBadges", "live.hideChatTop"]) {
        t = boot({ values: { [key]: false } });
        await t.flush();
        assert.equal(t.clicks.length, key === "live.autoWebMode" ? 0 : 1);
        assert.equal(t.styles.length, key === "live.autoWebMode" ? 2 : 1);
    }
    t = boot({ values: { "live.autoWebMode": false, "live.hideChatBadges": false, "live.hideChatTop": false } });
    assert.equal(t.styles.length, 0);
    assert.equal(t.timers.size, 0);
    t.menus.get("开启直播自动网页模式并刷新")();
    assert.equal(t.values["live.autoWebMode"], true);
    assert.equal(t.values["live.hideChatBadges"], false);

    for (const pathname of ["/", "/p/html/activity.html", "/544618/other"]) {
        t = boot({ pathname });
        await t.flush();
        assert.equal(t.clicks.length, 0);
        assert.equal(t.styles.length, 0);
        assert.equal(t.timers.size, 0);
    }
    t = boot({ hostname: "t.bilibili.com", pathname: "/" });
    assert.equal(t.styles.length, 1);
    assert.equal(t.timers.size, 0);
    for (const pathname of ["/video/BVtest/", "/list/watchlater/"]) {
        t = boot({ hostname: "www.bilibili.com", pathname });
        assert.deepEqual(t.clicks, ["视频网页全屏"]);
        assert.equal(t.styles.length, 0);
        await t.tick();
        assert.equal(t.timers.size, 0);
    }
    console.log("Passed: Bilibili live routing, tooltip identification, settings, delayed controls, fullscreen states, retries, manual actions, stale nodes and cleanup.");
})().catch(error => { console.error(error); process.exitCode = 1; });
