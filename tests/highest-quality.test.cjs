// node tests/highest-quality.test.cjs
// 执行正式脚本中的画质模块，模拟斗鱼点击/悬停后才生成选项的菜单。
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require('node:path').join(__dirname,
    '../simplified/douyuEx_simplified.user.js'), 'utf8');
const moduleSource = source.slice(source.indexOf('    function startHighestQuality()'), source.lastIndexOf('})();'));
const VIDEO = 'video#__video2, .layout-Player-videoEntity video';
class Node {
    constructor() { this.events = new Map(); this.classList = new Set(); this.isConnected = true; this.style = {}; this.textContent = ''; }
    addEventListener(type, fn) { this.events.set(type, [...(this.events.get(type) || []), fn]); }
    removeEventListener(type, fn) { this.events.set(type, (this.events.get(type) || []).filter(f => f !== fn)); }
    emit(type, event = {}) { for (const fn of [...(this.events.get(type) || [])]) fn(event); }
    getAttribute(key) { return this.attrs?.[key] || null; }
    matches(selector) {
        if (selector === ':hover') return !!this.hovered;
        if (selector === VIDEO) return !!this.isVideo;
        return !!this.disabled;
    }
}
function boot({ ready = 4, highest = '原画', initial = '高清', fail = false, missing = false } = {}) {
    const doc = new Node(), win = new Node(), timers = new Map(), observers = [], logs = [];
    let serial = 0, now = 0, ctx;
    const counts = { opens: 0, clicks: 0, manualClicks: 0 };
    function makePlayer() {
        const root = new Node(), video = new Node(), control = new Node(), panel = new Node(), opener = new Node();
        const marker = new Node(), row = new Node(), text = new Node(), ul = new Node();
        const next = { root, video, control, panel, opener, row, text, ul, options: [], shown: initial };
        video.isVideo = true; video.readyState = ready;
        panel.style.display = 'none';
        Object.defineProperty(text, 'textContent', { get: () => next.shown });
        marker.closest = s => s === '[class*="tipItem-"]' ? row : s === '.rate-ec9440' ? control : null;
        marker.parentElement = row;
        root.querySelectorAll = s => s === '[value^="画质"]' ? [marker] : [];
        root.querySelector = s => s === VIDEO ? video : null;
        row.querySelector = s => s === 'ul > li:first-child' ? next.options[0] || null : null;
        control.querySelector = s => s === '.tip-cd016b' ? panel : s === '.text-6e175a' ? opener : s === '.textLabel-429176' ? text : null;
        function close() { panel.style.display = 'none'; next.options = []; mutate(); }
        function open() {
            panel.style.display = 'block';
            next.options = [highest, '高清'].map(name => {
                const item = new Node(); item.textContent = name; item.parentElement = ul;
                if (name === next.shown) item.classList.add('selected-ab049e');
                item.closest = s => s === 'li' ? item : null;
                item.click = () => {
                    doc.emit('click', { isTrusted: false, target: item });
                    counts.clicks++;
                    if (!fail) next.shown = name;
                    close();
                };
                return item;
            });
            mutate();
        }
        opener.click = () => {
            doc.emit('click', { isTrusted: false, target: opener });
            if (panel.style.display === 'none') { counts.opens++; open(); } else close();
        };
        opener.closest = () => null;
        next.open = open; next.close = close;
        return next;
    }
    function mutate() { for (const o of observers) if (o.active) o.fn([]); }
    ctx = makePlayer();
    const body = new Node(); body.querySelector = () => null; body.querySelectorAll = () => [];
    doc.body = body;
    doc.querySelector = s => s === '#js-player-main' && !missing ? ctx.root : null;
    doc.querySelectorAll = () => [];
    function addTimer(fn, delay, repeat) {
        const id = ++serial; timers.set(id, { fn, at: now + delay, delay, repeat }); return id;
    }
    vm.runInNewContext(`(${moduleSource.trim()})();`, {
        document: doc, window: win, Element: Node, performance: { now: () => now },
        console: { info: s => logs.push(s) },
        setInterval: (fn, delay) => addTimer(fn, delay, true), clearInterval: id => timers.delete(id),
        setTimeout: (fn, delay) => addTimer(fn, delay, false), clearTimeout: id => timers.delete(id),
        MutationObserver: class {
            constructor(fn) { this.fn = fn; observers.push(this); }
            observe(target, options) { this.target = target; this.options = options; this.active = true; }
            disconnect() { this.active = false; }
        },
    });
    return { doc, win, timers, observers, counts, logs, mutate, ctx: () => ctx,
        advance(ms) {
            const end = now + ms;
            for (;;) {
                const next = [...timers].filter(([, t]) => t.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
                if (!next) break;
                const [id, timer] = next; now = timer.at;
                if (timer.repeat) timer.at += timer.delay; else timers.delete(id);
                timer.fn();
            }
            now = end;
        },
        replace() { ctx.root.isConnected = ctx.control.isConnected = ctx.video.isConnected = false; ctx = makePlayer(); missing = false; },
        setMissing(on) { missing = on; },
        manual(name) {
            ctx.open(); const item = ctx.options.find(i => i.textContent === name);
            doc.emit('click', { isTrusted: true, target: item }); counts.manualClicks++;
            ctx.shown = name; ctx.close();
        },
        ready(type = 'playing') { ctx.video.readyState = 4; doc.emit(type, { target: ctx.video }); },
    };
}
const t = boot();
assert.equal(t.counts.opens, 1); // 没有鼠标悬停，脚本主动打开空列表。
t.advance(5000); assert.equal(t.ctx().shown, '原画'); assert.equal(t.counts.clicks, 1);
assert.equal(t.ctx().options.length, 0); // 网站点击后删除 li，仍能用控制栏文字确认。
assert.ok(t.logs.some(s => s.includes('最高画质已确认')));
assert.equal([...t.timers.values()].filter(t => t.repeat).length, 1); // 成功后仅每秒轻量核对。
t.advance(60000); assert.equal(t.counts.opens, 1); assert.equal(t.counts.clicks, 1);
t.ctx().shown = '高清'; t.mutate(); t.advance(5000);
assert.equal(t.ctx().shown, '原画'); assert.equal(t.counts.clicks, 2);
t.replace(); t.advance(5000); assert.equal(t.ctx().shown, '原画'); assert.equal(t.counts.clicks, 3);
t.manual('高清'); t.advance(10000); assert.equal(t.ctx().shown, '高清');
t.replace(); t.ready(); t.advance(10000); assert.equal(t.ctx().shown, '高清');
assert.equal(t.timers.size, 0); assert.ok(t.observers.every(o => !o.active));
const loading = boot({ ready: 0 }); loading.advance(30000);
assert.equal(loading.counts.clicks, 0); // 未就绪时不浪费五次预算。
loading.ready('loadeddata'); loading.advance(5000);
assert.equal(loading.counts.clicks, 1); assert.equal(loading.ctx().shown, '原画');
const late = boot({ missing: true }); late.advance(110000); assert.equal(late.counts.clicks, 0);
late.setMissing(false); late.ready('loadedmetadata'); late.advance(5000);
assert.equal(late.ctx().shown, '原画');
const failed = boot({ fail: true }); failed.advance(40000);
assert.equal(failed.counts.clicks, 5); assert.ok(failed.logs.some(s => s.includes('5 次点击上限')));
for (let i = 0; i < 10; i++) failed.ready(); failed.advance(120000); assert.equal(failed.counts.clicks, 5);
const selected = boot({ initial: '原画' }); selected.advance(4000);
assert.equal(selected.counts.clicks, 0); assert.equal(selected.ctx().panel.style.display, 'none');
const hovered = boot({ initial: '原画' }); hovered.ctx().control.hovered = true; hovered.advance(4000);
assert.equal(hovered.ctx().panel.style.display, 'block'); // 不收起用户正在操作的菜单。
const mismatch = boot({ initial: '高清', fail: true });
mismatch.ctx().options[0].classList.add('selected-ab049e');
mismatch.advance(4000); assert.ok(!mismatch.logs.some(s => s.includes('最高画质已确认')));
for (const instance of [loading, late, failed, selected, hovered, mismatch]) {
    instance.win.emit('pagehide'); assert.equal(instance.timers.size, 0);
    assert.ok(instance.observers.every(o => !o.active));
    assert.ok([...instance.doc.events.values()].every(list => list.length === 0));
}
console.log('PASS: 无悬停主动加载/选项移除后确认/播放就绪/回退补切/播放器重建/五次上限/手动优先/空列表/用户悬停保护/离页清理');
