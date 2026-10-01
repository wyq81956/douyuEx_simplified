// node tests/video-transform.test.cjs
// 运行完整脚本，检查原生右键菜单、视频变换、节点重建与清理。
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../simplified/douyuEx_simplified.user.js'), 'utf8');
const PLAYER = '#js-player-main, .room-Player-Box';
const VIDEO = 'video#__video2, .layout-Player-videoEntity video';
const MENU = '.menu-da2a9e:not(.subMenu-de1c61)';
class Target {
    constructor() { this.events = new Map(); }
    addEventListener(type, fn) { this.events.set(type, [...(this.events.get(type) || []), fn]); }
    removeEventListener(type, fn) { this.events.set(type, (this.events.get(type) || []).filter(f => f !== fn)); }
    emit(type, event = {}) { for (const fn of [...(this.events.get(type) || [])]) fn(event); }
}
class Style {
    constructor() { this.values = new Map(); }
    getPropertyValue(key) { return this.values.get(key)?.[0] || ''; }
    getPropertyPriority(key) { return this.values.get(key)?.[1] || ''; }
    setProperty(key, value, priority = '') { this.values.set(key, [value, priority]); }
    removeProperty(key) { this.values.delete(key); }
}
class Node extends Target {
    constructor() { super(); this.style = new Style(); this.children = []; this.attrs = {}; this.isConnected = true; }
    setAttribute(k, v) { this.attrs[k] = v; }
    insertBefore(n, anchor) {
        n.parent = this; n.isConnected = true;
        this.children.splice(anchor ? this.children.indexOf(anchor) : this.children.length, 0, n);
    }
    remove() {
        this.isConnected = false;
        if (this.parent) this.parent.children.splice(this.parent.children.indexOf(this), 1);
    }
    click() { const event = { preventDefault() {}, stopPropagation() {} }; this.emit('click', event); }
}
function boot({ missing = false, styles = [] } = {}) {
    const doc = new Target(), win = new Target(), frames = new Map(), observers = [], resizers = [], timers = new Map();
    let serial = 0;
    doc.createElement = () => new Node();
    function player() {
        const p = new Node(), entity = new Node(), video = new Node(), menu = new Node(), subMenu = new Node();
        entity.clientWidth = video.clientWidth = 800; entity.clientHeight = video.clientHeight = 450;
        video.closest = s => s === '.layout-Player-videoEntity' ? entity : s === PLAYER ? p : null;
        p.closest = s => s === PLAYER ? p : null;
        menu.children = [new Node(), new Node(), new Node()];
        p.video = video; p.menu = menu; p.subMenu = subMenu;
        p.querySelector = s => s === VIDEO ? p.video : s === MENU ? p.menu : null;
        return { p, video, menu, entity, subMenu };
    }
    const initial = player();
    let activePlayer = missing ? null : initial.p, externalMenu = null;
    doc.querySelector = s => s === VIDEO ? activePlayer?.video || null : s === MENU ? externalMenu : null;
    for (const args of styles) initial.video.style.setProperty(...args);
    vm.runInNewContext(source, {
        document: doc, window: win, GM_getValue: () => false,
        GM_registerMenuCommand() {}, GM_setValue() { throw Error('Transform must not save settings'); },
        requestAnimationFrame(fn) { const id = ++serial; frames.set(id, fn); return id; },
        cancelAnimationFrame(id) { frames.delete(id); },
        setInterval(fn) { const id = ++serial; timers.set(id, fn); return id; },
        clearInterval(id) { timers.delete(id); },
        MutationObserver: class {
            constructor(fn) { this.fn = fn; observers.push(this); }
            observe(target, options) { this.target = target; this.options = options; this.active = true; }
            disconnect() { this.active = false; }
        },
        ResizeObserver: class {
            constructor(fn) { this.fn = fn; this.targets = new Set(); resizers.push(this); }
            observe(target) { this.targets.add(target); }
            disconnect() { this.targets.clear(); }
        },
    });
    return { ...initial, doc, win, frames, observers, resizers, timers, player,
        context(p = initial.p) { activePlayer = p; doc.emit('contextmenu', { target: p }); },
        tick() { [...timers.values()].forEach(fn => fn()); },
        setPlayer(p) { activePlayer = p; },
        setExternalMenu(menu) { externalMenu = menu; },
        flush() { const batch = [...frames.values()]; frames.clear(); batch.forEach(fn => fn()); },
        mutate() { observers.filter(o => o.active).forEach(o => o.fn()); },
        resize() { resizers.filter(o => o.targets.size).forEach(o => o.fn()); },
    };
}
const getItem = (menu, id) => menu.children.find(n => n.id === `douyuex-video-${id}`);
const rotate = t => getItem(t.p.menu, 'rotate').click();
const mirror = t => getItem(t.p.menu, 'mirror').click();
const prop = (v, k) => v.style.getPropertyValue(k);
const original = [['rotate', '3deg', ''], ['scale', '0.9', 'important'], ['transform-origin', '20% 30%', '']];
const t = boot({ styles: [...original, ['transform', 'translateX(2px)', 'important']] });
assert.equal(t.menu.children.length, 5); // 不依赖用户右键事件，启动时即加入。
assert.equal(t.observers.length, 1);
t.doc.emit('contextmenu', { target: { closest: () => null } });
assert.equal(t.observers.length, 1);
t.context(); t.flush();
assert.equal(t.menu.children.length, 5); assert.equal(t.subMenu.children.length, 0);
assert.equal(t.menu.children[1].id, 'douyuex-video-mirror');
assert.equal(t.menu.children[2].id, 'douyuex-video-rotate');
assert.equal(getItem(t.menu, 'mirror').attrs['aria-checked'], 'false');
mirror(t); assert.equal(prop(t.video, 'scale'), '-1 1');
assert.equal(t.menu.style.visibility, 'hidden');
assert.equal(getItem(t.menu, 'mirror').attrs['aria-checked'], 'true');
assert.equal(prop(t.video, 'transform'), 'translateX(2px)');
rotate(t); assert.equal(prop(t.video, 'rotate'), '90deg');
assert.equal(prop(t.video, 'scale'), '-0.5625 0.5625');
for (let i = 0; i < 10; i++) t.resize();
assert.equal(prop(t.video, 'scale'), '-0.5625 0.5625'); // 缩放不能逐次减小。
rotate(t); assert.equal(prop(t.video, 'rotate'), '180deg'); assert.equal(prop(t.video, 'scale'), '-1 1');
rotate(t); assert.equal(prop(t.video, 'rotate'), '270deg');
rotate(t); assert.equal(prop(t.video, 'rotate'), '0deg');
mirror(t);
for (const [k, v, priority] of original) {
    assert.equal(prop(t.video, k), v); assert.equal(t.video.style.getPropertyPriority(k), priority);
}
// 键盘操作、横屏/竖屏适配，以及 fullscreenchange 的同步。
getItem(t.menu, 'rotate').emit('keydown', { key: 'Enter', preventDefault() {}, stopPropagation() {} });
assert.equal(prop(t.video, 'rotate'), '90deg');
t.entity.clientHeight = t.video.clientHeight = 800;
t.entity.clientWidth = t.video.clientWidth = 450;
t.win.emit('resize'); assert.equal(prop(t.video, 'scale'), '0.5625 0.5625');
t.entity.clientWidth = t.entity.clientHeight = 1000;
t.doc.emit('fullscreenchange'); t.flush(); assert.equal(prop(t.video, 'scale'), '1 1');
t.context(); t.context(); t.flush(); assert.equal(t.menu.children.length, 5);
// 菜单重建不留重复条目；旋转状态沿用。
const oldMenu = t.p.menu, nextMenu = new Node(); nextMenu.children = [new Node()];
t.p.menu = nextMenu; oldMenu.isConnected = false;
t.mutate(); t.flush(); assert.equal(oldMenu.children.length, 3); assert.equal(nextMenu.children.length, 3);
assert.equal(getItem(nextMenu, 'rotate').textContent, '旋转画面（当前 90°）');
// 视频重建恢复旧样式，将本次观看的状态应用到新视频。
const replacement = t.player(); t.p.video = replacement.video; t.video.isConnected = false;
replacement.video.closest = s => s === PLAYER ? t.p : s === '.layout-Player-videoEntity' ? replacement.entity : null;
t.mutate(); t.flush();
for (const [k, v, priority] of original) {
    assert.equal(prop(t.video, k), v); assert.equal(t.video.style.getPropertyPriority(k), priority);
}
assert.equal(prop(replacement.video, 'rotate'), '90deg');
assert.equal((t.video.events.get('resize') || []).length, 0);
assert.ok(t.resizers[0].targets.has(replacement.video));
// 临时消失再出现，以及整个播放器替换。
t.p.video = null; t.mutate(); t.flush(); assert.equal(prop(replacement.video, 'rotate'), '');
t.p.video = replacement.video; t.tick(); t.flush(); rotate(t);
assert.equal(prop(replacement.video, 'rotate'), '180deg');
const second = t.player(); t.context(second.p); t.flush();
assert.equal(prop(replacement.video, 'rotate'), ''); assert.equal(prop(second.video, 'rotate'), '180deg');
assert.equal(t.observers[0].active, false); assert.equal(nextMenu.children.length, 1);
t.context(second.p); assert.equal(t.frames.size, 1); // 离页取消待执行任务。
t.win.emit('pagehide');
assert.equal(t.frames.size, 0); assert.equal(second.menu.children.length, 3);
assert.equal(t.timers.size, 0);
assert.equal(prop(second.video, 'rotate'), ''); assert.equal(prop(second.video, 'scale'), '');
assert.ok(t.observers.every(o => !o.active)); assert.ok(t.resizers.every(o => !o.targets.size));
for (const target of [t.doc, t.win]) assert.ok([...target.events.values()].every(list => list.length === 0));
// 原生菜单延迟创建，视频不存在时不介入；刷新（重新启动）复位状态。
const delayed = boot({ missing: true }); delayed.p.menu = null;
delayed.setPlayer(delayed.p); delayed.tick(); // 不发 contextmenu，也能接入延迟播放器。
assert.equal(delayed.observers.length, 1);
delayed.p.menu = delayed.menu; delayed.mutate(); delayed.flush();
assert.equal(getItem(delayed.menu, 'mirror').attrs['aria-checked'], 'false');
assert.equal(getItem(delayed.menu, 'rotate').textContent, '旋转画面（当前 0°）');
const absent = boot({ missing: true }); absent.p.video = null; absent.context(); assert.equal(absent.observers.length, 0);
for (let i = 0; i < 100; i++) absent.tick(); assert.equal(absent.timers.size, 0);
const latePlayer = absent.player(); absent.context(latePlayer.p); absent.flush();
assert.equal(latePlayer.menu.children.length, 5); assert.equal(absent.timers.size, 1);
absent.win.emit('pagehide'); assert.equal(absent.timers.size, 0);
// 右键被网站拦截，或菜单挂在播放器外层，仍要自动加入。
const external = boot({ missing: true }); external.p.menu = null;
external.setPlayer(external.p); external.setExternalMenu(external.menu); external.tick();
assert.equal(external.menu.children.length, 5); getItem(external.menu, 'mirror').click();
// 播放器整体被替换，不需要再次右键就恢复菜单及本次观看的镜像状态。
const fresh = external.player(); external.p.isConnected = false; external.setPlayer(fresh.p); external.tick();
assert.equal(fresh.menu.children.length, 5); assert.equal(prop(fresh.video, 'scale'), '-1 1');
assert.equal(external.menu.children.length, 3); external.win.emit('pagehide');
console.log('PASS: 自动菜单/右键被拦截/镜像/四向旋转/组合/缩放稳定/全屏/键盘/样式恢复/延迟及外层菜单/播放器整体重建/离页清理');
