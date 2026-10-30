// node tests/bilibili-appearance.test.cjs
// Settings DOM simulation: preview, cancel/save, persistence and old preferences.
const assert = require("node:assert/strict");
const fs = require("node:fs"), path = require("node:path"), vm = require("node:vm");
const source = fs.readFileSync(path.join(__dirname, "../bilibili/bilibiliex.user.js"), "utf8");
const fontKey = "video.danmakuFont", sizeKey = "video.danmakuFontSize";
function boot(saved = {}) {
    const values = { ...saved }, writes = [], menus = new Map();
    let reloads = 0;
    class Element {
        constructor(tag) { this.tag = tag; this.children = []; this.events = new Map(); this.style = {}; this.attributes = {}; }
        append(...nodes) { for (const node of nodes) { this.children.push(node); node.parent = this; } }
        appendChild(node) { this.append(node); }
        setAttribute(key, value) { this.attributes[key] = value; }
        addEventListener(key, fn) { this.events.set(key, fn); }
        removeEventListener(key) { this.events.delete(key); }
        emit(key, event = {}) { this.events.get(key)?.(event); }
        attachShadow() {
            const nodes = new Map([".options", ".save", ".cancel", "dialog"].map(key => [key, new Element(key)]));
            return this.shadow = { querySelector: key => nodes.get(key) };
        }
        showModal() { this.open = true; }
        close() { this.open = false; this.emit("close"); }
        remove() { this.parent.children = this.parent.children.filter(node => node !== this); }
        focus() {}
    }
    const body = new Element("body"), window = new Element("window");
    window.location = { hostname: "t.bilibili.com", pathname: "/", reload() { reloads++; } };
    const document = { body, createElement: tag => new Element(tag) };
    const context = {
        document, window,
        GM_getValue: (key, fallback) => key in values ? values[key] : fallback === true ? false : fallback,
        GM_setValue: (key, value) => { values[key] = value; writes.push([key, value]); },
        GM_registerMenuCommand: (label, fn) => menus.set(label, fn),
    };
    vm.runInNewContext(source.replace(/\}\)\(\);\s*$/, "globalThis.appearance = danmakuAppearance; })();"), context);
    function open() {
        menus.get("BilibiliEx 设置")();
        const host = body.children[0], shadow = host.shadow;
        const list = shadow.querySelector(".options");
        const controls = list.children.flatMap(row => row.children).filter(node => node.tag === "select");
        return { host, shadow, font: controls[0], size: controls[1], preview: list.children.find(node => node.className === "font-preview") };
    }
    return { open, values, writes, body, appearance: context.appearance, reloads: () => reloads };
}
let t = boot({ "video.autoWebFullscreen": false, "video.danmakuPanelWidth": 450 });
let ui = t.open();
assert.equal(ui.font.value, "system"); assert.equal(ui.size.value, "14");
assert.equal(ui.font.children.length, 5); assert.equal(ui.size.children.length, 21);
ui.font.value = "songti"; ui.font.emit("change");
ui.size.value = "20"; ui.size.emit("change");
assert.match(ui.preview.style.fontFamily, /SimSun/); assert.equal(ui.preview.style.fontSize, "20px");
assert.equal(t.writes.length, 0);
ui.shadow.querySelector(".cancel").emit("click");
assert.equal(t.body.children.length, 0); assert.equal(t.writes.length, 0); assert.equal(t.reloads(), 0);
ui = t.open(); assert.equal(ui.size.value, "14");
ui.font.value = "yahei"; ui.size.value = "24";
ui.shadow.querySelector(".save").emit("click");
assert.equal(t.values[fontKey], "yahei"); assert.equal(t.values[sizeKey], 24);
assert.equal(t.values["video.autoWebFullscreen"], false); assert.equal(t.values["video.danmakuPanelWidth"], 450);
assert.equal(t.reloads(), 1);
t = boot(t.values); ui = t.open(); assert.equal(ui.font.value, "yahei"); assert.equal(ui.size.value, "24");
ui.shadow.querySelector("dialog").close(); assert.equal(t.writes.length, 0);
for (const [value, expected] of [[null, 14], ["22", 14], [NaN, 14], [Infinity, 14], [5, 12], [90, 32], [18.4, 18]]) {
    const test = boot({ [fontKey]: "__proto__", [sizeKey]: value });
    assert.equal(test.appearance().font, "system"); assert.equal(test.appearance().size, expected);
}
console.log("Passed: appearance preview without writes, cancel/close, save/reload persistence, existing preferences and invalid stored values.");
