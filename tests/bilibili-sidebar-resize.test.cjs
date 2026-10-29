// node tests/bilibili-sidebar-resize.test.cjs
// DOM/pointer simulation for persistence and cancellation; not a native mouse test.
const assert = require("node:assert/strict");
const fs = require("node:fs"), path = require("node:path"), vm = require("node:vm");
const source = fs.readFileSync(path.join(__dirname, "../bilibili/bilibiliex.user.js"), "utf8");

function boot(saved = {}) {
    let viewport = 1280;
    const intervals = new Map(), writes = [], keys = "video.danmakuPanelWidth";
    const values = { ...saved };
    class Element {
        constructor(tag = "div") {
            this.tag = tag; this.children = []; this.attributes = new Map(); this.events = new Map(); this.props = new Map();
            this.style = { setProperty: (key, value) => this.props.set(key, value), removeProperty: key => this.props.delete(key) };
            this.scrollHeight = 400; this.scrollTop = 0; this.clientHeight = 400;
        }
        addEventListener(type, fn) { if (!this.events.has(type)) this.events.set(type, new Set()); this.events.get(type).add(fn); }
        removeEventListener(type, fn) { this.events.get(type)?.delete(fn); }
        emit(type, event = {}) {
            for (const fn of [...(this.events.get(type) || [])]) fn({ preventDefault() {}, stopPropagation() {}, ...event });
        }
        setAttribute(key, value) { this.attributes.set(key, value); }
        getAttribute(key) { return this.attributes.get(key) ?? null; }
        removeAttribute(key) { this.attributes.delete(key); }
        appendChild(node) { if (node.tag === "fragment") this.append(...node.children); else this.append(node); }
        append(...nodes) { for (const node of nodes) { node.parent = this; this.children.push(node); } }
        replaceChildren() { this.children = []; }
        remove() { if (this.parent) this.parent.children = this.parent.children.filter(node => node !== this); }
        get firstElementChild() { return this.children[0]; }
        attachShadow() {
            const nodes = new Map([".resize-handle", ".scroll", ".latest", ".retry", ".empty", "ol"].map(key => [key, new Element()]));
            return this.shadow = { querySelector: selector => nodes.get(selector) };
        }
        getBoundingClientRect() { return { width: parseFloat(this.props.get("--bilibiliex-danmaku-width")) || 307 }; }
        getClientRects() { return [1]; }
        focus() {}
        setPointerCapture(id) { this.captured = id; }
        hasPointerCapture(id) { return this.captured === id; }
        releasePointerCapture(id) { this.captured = null; this.emit("lostpointercapture", { pointerId: id }); }
    }
    const player = new Element(), video = new Element();
    video.currentTime = 0; video.readyState = 1;
    player.setAttribute("data-screen", "web"); player.querySelector = () => video;
    const document = new Element(), window = new Element();
    document.body = new Element(); document.documentElement = new Element();
    document.visibilityState = "visible"; document.fullscreenElement = null;
    document.querySelector = () => player;
    document.createElement = tag => new Element(tag);
    document.createDocumentFragment = () => new Element("fragment");
    window.location = { hostname: "www.bilibili.com", pathname: "/video/BVfixture/", href: "https://www.bilibili.com/video/BVfixture/" };
    Object.defineProperty(window, "innerWidth", { get: () => viewport });
    vm.runInNewContext(source, {
        document, window, URL, AbortController, TextDecoder, setTimeout, clearTimeout,
        GM_getValue: (key, fallback) => key === keys ? (key in values ? values[key] : fallback) : key === "video.danmakuPanel",
        GM_setValue: (key, value) => { values[key] = value; writes.push([key, value]); },
        GM_registerMenuCommand() {}, GM_addStyle() {},
        setInterval: fn => { intervals.set(1, fn); return 1; }, clearInterval: id => intervals.delete(id),
        fetch: async () => ({ ok: true, headers: { get: () => "application/octet-stream" },
            json: async () => ({ code: 0, data: { pages: [{ page: 1, cid: 11, duration: 780 }] } }),
            arrayBuffer: async () => new ArrayBuffer(0) }),
    });
    const host = document.body.children[0], handle = host.shadow.querySelector(".resize-handle");
    return {
        values, writes, intervals, host, player, handle, document, window,
        flush: () => new Promise(resolve => setImmediate(resolve)),
        width: () => Number(handle.getAttribute("aria-valuenow")),
        dragStart(x = 973) { handle.emit("pointerdown", { button: 0, isPrimary: true, pointerId: 1, clientX: x }); },
        dragMove(x) { handle.emit("pointermove", { pointerId: 1, clientX: x }); },
        dragEnd() { handle.emit("pointerup", { pointerId: 1 }); },
        key(key, extra = {}) { handle.emit("keydown", { key, ...extra }); },
        resize(width) { viewport = width; window.emit("resize"); },
        hide() { window.emit("pagehide"); },
    };
}

(async () => {
    const key = "video.danmakuPanelWidth";
    let t = boot(); await t.flush();
    assert.equal(t.width(), 307);
    t.dragStart(); t.dragMove(800);
    assert.equal(t.width(), 480);
    assert.equal(t.writes.length, 0); // 移动中不反复写存储。
    assert.equal(t.player.props.get("--bilibiliex-danmaku-width"), t.host.props.get("--bilibiliex-danmaku-width"));
    t.dragEnd(); assert.equal(t.values[key], 480);
    assert.equal(t.document.documentElement.getAttribute("data-bilibiliex-danmaku-resizing"), null);

    for (const cancel of [t => t.handle.emit("pointercancel", { pointerId: 1 }), t => t.handle.emit("lostpointercapture", { pointerId: 1 }), t => t.window.emit("blur"), t => t.key("Escape")]) {
        const before = t.writes.length;
        t.dragStart(); t.dragMove(900); assert.notEqual(t.width(), 480);
        cancel(t); assert.equal(t.width(), 480); assert.equal(t.writes.length, before);
    }
    t.key("ArrowLeft", { shiftKey: true }); assert.equal(t.values[key], 530);
    t.key("ArrowRight"); assert.equal(t.values[key], 520);
    t.dragStart(); t.dragMove(0); t.dragEnd(); assert.equal(t.values[key], 600);
    t.resize(960); assert.equal(t.width(), 320); assert.equal(t.values[key], 600);
    t.resize(1280); assert.equal(t.width(), 600);

    const saved = { ...t.values }; t.hide();
    assert.equal(t.intervals.size, 0); assert.equal(t.document.body.children.length, 0);
    assert.equal(t.player.props.has("--bilibiliex-danmaku-width"), false);
    t = boot(saved); await t.flush(); assert.equal(t.width(), 600); // 重新加载保留偏好。
    t.handle.emit("dblclick"); assert.equal(t.values[key], null); assert.equal(t.width(), 307);
    t.key("ArrowLeft"); t.key("Home"); assert.equal(t.width(), 307);
    t.dragStart(); t.dragMove(800); t.resize(800);
    assert.equal(t.values[key], null); assert.equal(t.host.hidden, true);
    assert.equal(t.document.documentElement.getAttribute("data-bilibiliex-danmaku-resizing"), null);
    t.resize(1280); assert.equal(t.width(), 307); t.hide();
    console.log("Passed: simulated pointer resize, save-on-release, cancellation, keyboard/reset, reload persistence, viewport clamps and cleanup.");
})().catch(error => { console.error(error); process.exitCode = 1; });
