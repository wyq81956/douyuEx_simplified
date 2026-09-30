// node tests/barrage-resize.test.cjs
// 覆盖拖动/取消/保存/缩放/节点替换，不依赖斗鱼网络或外部测试库。
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require('node:path').join(__dirname,
    '../simplified/douyuEx_simplified.user.js'), 'utf8');

class Style {
    constructor() { this.values = new Map(); }
    getPropertyValue(k) { return this.values.get(k)?.[0] || ''; }
    getPropertyPriority(k) { return this.values.get(k)?.[1] || ''; }
    setProperty(k, v, p = '') { this.values.set(k, [String(v), p]); }
    removeProperty(k) { this.values.delete(k); }
}
class Node {
    constructor() {
        this.style = new Style(); this.attributes = new Map(); this.events = new Map();
        this.children = []; this.isConnected = true; this.scrollLeft = this.scrollTop = 0;
        this.classList = new Set(); this.classList.remove = this.classList.delete;
    }
    addEventListener(k, fn) { const list = this.events.get(k) || []; list.push(fn); this.events.set(k, list); }
    removeEventListener(k, fn) { this.events.set(k, (this.events.get(k) || []).filter(f => f !== fn)); }
    emit(k, e = {}) {
        (this.events.get(k) || []).forEach(fn => fn({ preventDefault() {}, stopPropagation() {},
            button: 0, isPrimary: true, pointerId: 1, ...e }));
    }
    setAttribute(k, v) { this.attributes.set(k, String(v)); }
    removeAttribute(k) { this.attributes.delete(k); }
    appendChild(e) { this.children.push(e); e.parentElement = this; }
    remove() { this.isConnected = false; this.parentElement.children = this.parentElement.children.filter(e => e !== this); }
    setPointerCapture(id) { this.capture = id; }
    hasPointerCapture(id) { return this.capture === id; }
    releasePointerCapture() { this.capture = null; }
}
function boot({ saved = null, enabled = true, missing = false, original = '' } = {}) {
    const values = { 'autoPlayer.fullscreen': false, 'autoPlayer.highestQuality': false,
        'simpleMode.enabled': false, 'dotaHelper.blocked': false,
        'barrageResize.enabled': enabled, 'barrageResize.width': saved };
    const timers = new Map(), frames = new Map(), menus = new Map(), observers = [];
    let serial = 0, size = 1200, visible = true, layout;
    const doc = new Node(), win = new Node(); doc.head = new Node(); doc.documentElement = new Node();
    function replaceLayout() {
        const stage = new Node(), main = new Node(), sidebar = new Node(), aside = new Node();
        stage.appendChild(main); stage.appendChild(sidebar); sidebar.appendChild(aside);
        if (original) stage.style.setProperty('--stage-sidebar-width', original);
        Object.defineProperty(stage, 'clientWidth', { get: () => size });
        const width = () => parseFloat(stage.style.getPropertyValue('--stage-sidebar-width')) || 380;
        stage.getBoundingClientRect = () => ({ left: 32, top: 100, width: size, height: 600 });
        sidebar.getBoundingClientRect = () => ({ left: 32 + size - width(), top: 100, width: visible ? width() : 0 });
        aside.getBoundingClientRect = () => ({ left: 32 + size - width(), top: 116, width: visible ? width() : 0, height: visible ? 584 : 0 });
        layout = { stage, main, sidebar, aside };
        return layout;
    }
    replaceLayout();
    doc.getElementById = id => missing ? null : id === 'js-player-main' ? layout.main : id === 'js-player-asideMain' ? layout.aside : null;
    doc.createElement = () => new Node();
    const css = e => ({ marginLeft: '8px', getPropertyValue: k => e.style.getPropertyValue(k)
        || (k === '--stage-sidebar-width' ? '380px' : k === '--stage-player-min-width' ? '658px' : '') });
    vm.runInNewContext(source, { document: doc, window: win, getComputedStyle: css,
        GM_getValue: (k, d) => k in values ? values[k] : d, GM_setValue: (k, v) => { values[k] = v; },
        GM_registerMenuCommand: (k, fn) => menus.set(k, fn),
        setInterval: fn => { const id = ++serial; timers.set(id, fn); return id; }, clearInterval: id => timers.delete(id),
        requestAnimationFrame: fn => { const id = ++serial; frames.set(id, fn); return id; }, cancelAnimationFrame: id => frames.delete(id),
        ResizeObserver: class { constructor(fn) { this.fn = fn; observers.push(this); } observe() {} disconnect() { this.disconnected = true; } },
        Event: class { constructor(type) { this.type = type; } }
    });
    win.dispatchEvent = () => {};
    return { values, doc, win, timers, observers, menus, replaceLayout,
        layout: () => layout, handle: () => layout.stage.children.find(e => e.id === 'douyuex-barrage-resize-handle'),
        width: () => layout.aside.getBoundingClientRect().width,
        tick: () => [...timers.values()].forEach(fn => fn()),
        resize: width => { size = width; win.emit('resize'); }, hide: () => { visible = false; win.emit('resize'); },
        show: () => { visible = true; win.emit('resize'); },
        flush: () => { const pending = [...frames.values()]; frames.clear(); pending.forEach(fn => fn()); }
    };
}
function drag(h, delta, finish = 'pointerup') {
    h.emit('pointerdown', { clientX: 800 });
    h.emit('pointermove', { clientX: 800 - delta });
    h.emit(finish);
}
const t = boot(), h = t.handle();
assert.equal(t.width(), 380); assert.equal(h.hidden, false);
drag(h, 100); assert.equal(t.width(), 480); assert.equal(t.values['barrageResize.width'], 480);
drag(h, -1000); assert.equal(t.width(), 220);
drag(h, 1000); assert.equal(t.width(), 534); // 留足 658px 视频区和 8px 间距。
drag(h, -100, 'pointercancel'); assert.equal(t.width(), 534); assert.equal(t.values['barrageResize.width'], 534);
assert.ok(!t.doc.documentElement.classList.has('douyuex-barrage-dragging'));
t.resize(1000); assert.equal(t.width(), 334); assert.equal(t.values['barrageResize.width'], 534);
t.resize(1400); assert.equal(t.width(), 534);
t.resize(800); assert.equal(t.width(), 380); assert.equal(h.hidden, true);
t.resize(1400); assert.equal(h.hidden, false); assert.equal(t.width(), 534);
t.hide(); assert.equal(h.hidden, true); t.show(); assert.equal(h.hidden, false);
h.emit('dblclick'); assert.equal(t.width(), 380); assert.equal(t.values['barrageResize.width'], null);
h.emit('keydown', { key: 'ArrowLeft' }); assert.equal(t.width(), 390);
h.emit('keydown', { key: 'ArrowRight', shiftKey: true }); assert.equal(t.width(), 340);
h.emit('keydown', { key: 'Home' }); assert.equal(t.width(), 380);
drag(h, 80); t.replaceLayout(); t.tick(); assert.equal(t.width(), 460); assert.equal(h.isConnected, false);
assert.equal(t.observers[0].disconnected, true);
t.win.emit('pagehide'); assert.equal(t.timers.size, 0); assert.equal(t.width(), 380); assert.equal(t.doc.head.children.length, 0);
assert.equal(boot({ enabled: false }).handle(), undefined);
assert.equal(boot({ saved: 500 }).width(), 500);
assert.equal(boot({ saved: 'bad' }).width(), 380);
const original = boot({ original: '360px', saved: 450 });
original.handle().emit('dblclick'); assert.equal(original.width(), 360);
const missing = boot({ missing: true }); for (let i = 0; i < 100; i++) missing.tick();
assert.equal(missing.timers.size, 0); assert.equal(missing.doc.head.children.length, 0);
console.log('PASS: 拖动方向/限宽/保存/取消/自适应/隐藏/复位/键盘/节点替换/关闭/清理');
