// node tests/bilibili-live-quality.test.cjs
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const source = fs.readFileSync(path.join(__dirname, "../bilibili/bilibiliex.user.js"), "utf8");

function boot(options = {}) {
    let now = 0, serial = 0;
    const timers = new Map(), events = new Map(), menus = new Map(), clicks = [];
    const state = {
        present: true, ready: 1, panel: false, hovered: false, line: false,
        selected: "超清", effect: "select", cookie: "DedeUserID=123; other=test",
        opens: 0, closes: 0, due: Infinity, ...options,
    };
    const values = {
        "live.autoWebMode": false, "live.hideChatBadges": false, "live.hideChatTop": false,
        ...options.values,
    };
    function item(label, extra = {}) {
        const node = {
            textContent: label, isConnected: true, disabled: false, ...extra,
            classList: { contains: name => name === "selected" ? state.selected === label : name === "disabled" && !!extra.blocked },
            getAttribute: name => name === "aria-disabled" && extra.ariaDisabled ? "true" : null,
            querySelector: () => extra.enhance ? {} : null,
            closest: () => wrap,
            click() {
                events.get("doc:click")?.({ isTrusted: false, target: { closest: () => node } });
                clicks.push(label);
                if (state.effect === "select") state.selected = label;
                if (state.effect === "remove") { state.selected = label; state.panel = false; }
            },
        };
        return node;
    }
    // 自动和画质增强都使用 list-it，不能当作最高画质。
    const items = [item("自动（原画）"), item("画质增强", { enhance: true }), item("原画"), item("超清")];
    const panel = {
        querySelector: () => state.line ? {} : null,
        querySelectorAll: () => items,
    };
    const wrap = {
        isConnected: true,
        getClientRects: () => [1], matches: () => state.hovered,
        querySelector: selector => selector === ":scope > .panel" ? (state.panel ? panel : null) : state.line ? {} : null,
        dispatchEvent(event) {
            if (event.type === "mouseenter") { state.opens++; state.due = now + 100; }
            else { state.closes++; state.panel = false; state.due = Infinity; }
        },
    };
    const player = { querySelector: selector => selector === "video" ? { readyState: state.ready } : wrap };
    function target(prefix) {
        return {
            addEventListener(type, fn) { events.set(prefix + type, fn); },
            removeEventListener(type) { events.delete(prefix + type); },
        };
    }
    vm.runInNewContext(source, {
        document: { ...target("doc:"), get cookie() { return state.cookie; }, querySelector: () => state.present ? player : null },
        window: { ...target("win:"), location: { hostname: "live.bilibili.com", pathname: "/544618", reload() {} } },
        Date: { now: () => now }, MouseEvent: class { constructor(type) { this.type = type; } },
        GM_getValue: (key, fallback) => values[key] ?? fallback,
        GM_setValue: (key, value) => { values[key] = value; },
        GM_registerMenuCommand: (label, callback) => menus.set(label, callback),
        GM_addStyle() {},
        setInterval: fn => { timers.set(++serial, fn); return serial; },
        clearInterval: id => timers.delete(id),
    });
    return {
        state, timers, events, items, item, wrap, menus, values, clicks,
        tick(ms = 500) {
            now += ms;
            if (now >= state.due) { state.panel = true; state.due = Infinity; }
            for (const fn of [...timers.values()]) fn();
        },
        manual(node) { events.get("doc:click")?.({ isTrusted: true, target: { closest: () => node } }); },
    };
}

let t = boot();
assert.equal(t.state.opens, 1);
assert.equal(t.clicks.length, 0); // mouseenter 不会同步渲染菜单。
t.tick();
assert.deepEqual(t.clicks, ["原画"]);
t.tick();
assert.equal(t.timers.size, 0);
assert.equal(t.events.size, 0);
assert.equal(t.state.closes, 1);
t.state.selected = "超清";
t.tick();
assert.equal(t.clicks.length, 1); // 本轮成功后不把手动降画质强制改回去。

t = boot({ selected: "原画" });
t.tick();
assert.equal(t.clicks.length, 0);
assert.equal(t.timers.size, 0);

t = boot({ ready: 0, present: false });
t.tick(); assert.equal(t.state.opens, 0);
t.state.present = true; t.tick(); assert.equal(t.state.opens, 0);
t.state.ready = 1; t.tick(); assert.equal(t.state.opens, 1);
t.tick(); assert.deepEqual(t.clicks, ["原画"]);

t = boot({ panel: true, line: true });
t.tick(); assert.equal(t.clicks.length, 0);
t.state.line = false; t.tick(); assert.deepEqual(t.clicks, ["原画"]);

t = boot();
t.items.splice(0, t.items.length, t.item("4K", { blocked: true }), t.item("原画", { ariaDisabled: true }), t.item("超清"));
t.tick(); assert.equal(t.clicks.length, 0); assert.equal(t.timers.size, 0);

t = boot({ effect: "never" });
for (let i = 0; i < 15; i++) t.tick();
assert.equal(t.clicks.length, 3);
assert.equal(t.timers.size, 0);
assert.equal(t.state.closes, 1);

t = boot({ cookie: "" });
t.tick(); assert.equal(t.clicks.length, 0); assert.equal(t.timers.size, 0);
t = boot({ cookie: "DedeUserID=0" });
t.tick(); assert.equal(t.clicks.length, 0);

t = boot({ effect: "remove" });
t.tick(); assert.equal(t.clicks.length, 1);
for (let i = 0; i < 5; i++) t.tick();
assert.equal(t.clicks.length, 1); assert.equal(t.timers.size, 0); // 切换后菜单消失可补检。

t = boot();
t.manual(t.items[3]);
t.tick(); assert.equal(t.clicks.length, 0); assert.equal(t.events.size, 0);
t = boot();
t.manual(t.items[1]); assert.equal(t.timers.size, 1); // 画质增强开关不算手选清晰度。
t = boot({ panel: true, line: true });
t.manual(t.items[3]); assert.equal(t.timers.size, 1); // 线路菜单的条目不算画质。

t = boot();
t.state.hovered = true;
t.tick(); t.tick(); assert.equal(t.state.closes, 0); // 用户仍悬停时保留菜单。

t = boot();
t.items[2].isConnected = false;
t.tick(); assert.equal(t.clicks.length, 0);
t = boot({ present: false });
t.tick(100000); assert.equal(t.timers.size, 0); assert.equal(t.events.size, 0);
t = boot();
t.events.get("win:pagehide")();
t.tick(); assert.equal(t.clicks.length, 0); assert.equal(t.state.closes, 1);

t = boot({ values: { "live.highestQuality": false } });
assert.equal(t.timers.size, 0); assert.equal(t.state.opens, 0);
t.menus.get("开启直播自动最高画质并刷新")();
assert.equal(t.values["live.highestQuality"], true);
assert.equal(t.values["live.autoWebMode"], false);
console.log("Passed: live highest quality, delayed menu, excluded entries, selection confirmation, bounded retries, login state, manual choice and cleanup.");
