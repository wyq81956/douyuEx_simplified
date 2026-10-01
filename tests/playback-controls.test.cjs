// node tests/playback-controls.test.cjs
// 运行正式脚本，验证事件范围、重建、音量持久化和下播弹窗处理。
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../simplified/douyuEx_simplified.user.js'), 'utf8');
const CONTROL = '.volume-07c230';
const PLAYER = '#js-player-main, .room-Player-Box';
const VIDEO = 'video#__video2, .layout-Player-videoEntity video';
const CLOSE = '.ClosingRecommend .dy-ModalRadius-close-x';
class Target {
    constructor() { this.events = new Map(); }
    addEventListener(type, fn, options) {
        const list = this.events.get(type) || [];
        list.push({ fn, options }); this.events.set(type, list);
    }
    removeEventListener(type, fn) {
        this.events.set(type, (this.events.get(type) || []).filter(e => e.fn !== fn));
    }
    emit(type, event) { for (const { fn } of [...(this.events.get(type) || [])]) fn(event); }
}
function boot({ wheel = true, noJump = true, missing = false, storageFails = false } = {}) {
    const doc = new Target(), win = new Target(), timers = new Map(), menus = new Map();
    const values = { 'autoPlayer.fullscreen': false, 'autoPlayer.highestQuality': false,
        'simpleMode.enabled': false, 'dotaHelper.blocked': false, 'barrageResize.enabled': false };
    // 缺省值也要测试：两项新功能默认开启。
    if (!wheel) values['player.volumeWheel'] = false;
    if (!noJump) values['player.noCloseJump'] = false;
    const storage = new Map(), styles = [];
    let layout, closeButton = null, serial = 0;
    doc.head = { appendChild: el => styles.push(el) };
    doc.createElement = () => ({ remove() { styles.splice(styles.indexOf(this), 1); } });
    function replacePlayer() {
        const classes = new Set();
        const classList = {
            add: c => classes.add(c), remove: (...cs) => cs.forEach(c => classes.delete(c)),
            toggle: (c, on) => on ? classes.add(c) : classes.delete(c), contains: c => classes.has(c),
        };
        const front = { style: {} }, point = { style: {} }, tips = {};
        const control = { classList, closest: s => s === CONTROL ? control : s === PLAYER ? player : null,
            querySelector: s => s.endsWith('.front-99e2aa') ? front : s.endsWith('.point-6ef744') ? point : s.endsWith('.tips2-9bb064') ? tips : null };
        const video = { volume: 0.5, muted: false, matches: s => s === VIDEO, closest: s => s === PLAYER ? player : null };
        const player = { querySelector: s => s === VIDEO ? (missing ? null : video) : s === CONTROL ? control : null };
        layout = { control, video, front, point, tips };
        return layout;
    }
    replacePlayer();
    doc.querySelector = s => s === CLOSE ? closeButton : null;
    doc.querySelectorAll = s => s === `${CONTROL}.douyuex-volume-synced` && layout.control.classList.contains('douyuex-volume-synced') ? [layout.control] : [];
    vm.runInNewContext(source, { document: doc, window: win,
        GM_getValue: (k, d) => k in values ? values[k] : d,
        GM_setValue: (k, v) => { values[k] = v; }, GM_registerMenuCommand: (label, fn) => menus.set(label, fn),
        setInterval: fn => { const id = ++serial; timers.set(id, fn); return id; }, clearInterval: id => timers.delete(id),
        localStorage: { getItem: k => { if (storageFails) throw Error('blocked'); return storage.get(k) || null; }, setItem: (k, v) => storage.set(k, v) },
    });
    return { doc, win, values, menus, storage, styles, timers, replacePlayer, layout: () => layout,
        setMissing: v => { missing = v; }, setClose: b => { closeButton = b; },
        tick: () => [...timers.values()].forEach(fn => fn()),
        wheel(deltaY, extra = {}) {
            const event = { target: layout.control, deltaY, prevented: false, stopped: false,
                preventDefault() { this.prevented = true; }, stopPropagation() { this.stopped = true; }, ...extra };
            doc.emit('wheel', event); return event;
        },
    };
}
const t = boot();
assert.equal(t.menus.size, 1); assert.ok(t.menus.has('DouyuEx 设置')); assert.equal(t.timers.size, 1);
assert.equal(t.doc.events.get('wheel')[0].options.passive, false);
assert.equal(t.doc.events.get('wheel')[0].options.capture, true);
const envelope = { v: 0.5, expire: 12345, other: 'keep' };
t.storage.set('volume_muted_before_key', JSON.stringify(envelope));
t.storage.set('player_storage_volume_h5p_room', JSON.stringify(envelope));
const e = t.wheel(-1);
assert.ok(e.prevented && e.stopped);
assert.equal(t.layout().video.volume, 0.55); assert.equal(t.layout().video.muted, false);
assert.equal(t.layout().front.style.height, '55px'); assert.equal(t.layout().point.style.bottom, '62px');
assert.equal(t.layout().tips.textContent, '音量55%');
assert.deepEqual(JSON.parse(t.storage.get('player_storage_volume_h5p_room')), { ...envelope, v: 0.55 });
for (let i = 0; i < 30; i++) t.wheel(-100);
assert.equal(t.layout().video.volume, 1);
for (let i = 0; i < 30; i++) t.wheel(100);
assert.equal(t.layout().video.volume, 0); assert.equal(t.layout().video.muted, true);
assert.ok(t.layout().control.classList.contains('douyuex-volume-muted'));
t.wheel(-1); assert.equal(t.layout().video.volume, 0.05); assert.equal(t.layout().video.muted, false);
// 静音但保留音量时沿用原版逻辑，从记住的音量继续增减。
t.layout().video.volume = 0.5; t.layout().video.muted = true;
t.wheel(-1); assert.equal(t.layout().video.volume, 0.55); assert.equal(t.layout().video.muted, false);
for (const extra of [{ ctrlKey: true }, { metaKey: true }, { target: { closest: () => null } }]) {
    assert.equal(t.wheel(-1, extra).prevented, false);
}
assert.equal(t.wheel(0).prevented, false); assert.equal(t.layout().video.volume, 0.55);
t.setMissing(true); assert.equal(t.wheel(-1).prevented, false); t.setMissing(false);
const oldVideo = t.layout().video; t.replacePlayer(); t.wheel(1);
assert.equal(t.layout().video.volume, 0.45); assert.equal(oldVideo.volume, 0.55);
// 手动静音/滑条调节时，捕获 volumechange，同步显示而不改动网站存储。
t.layout().video.muted = true; t.doc.emit('volumechange', { target: t.layout().video });
assert.equal(t.layout().tips.textContent, '音量0%');
t.layout().video.muted = false; t.layout().video.volume = 0.37;
t.doc.emit('volumechange', { target: t.layout().video }); assert.equal(t.layout().tips.textContent, '音量37%');
t.doc.emit('volumechange', { target: { matches: () => false } });
t.storage.set('volume_muted_before_key', '{bad'); t.wheel(-1);
assert.equal(t.storage.get('volume_muted_before_key'), '{bad');
assert.equal(JSON.parse(t.storage.get('player_storage_volume_h5p_room')).v, 0.42);
t.storage.set('volume_muted_before_key', JSON.stringify({ unexpected: true })); t.wheel(-1);
assert.deepEqual(JSON.parse(t.storage.get('volume_muted_before_key')), { unexpected: true });
const emptyStorage = boot(); emptyStorage.wheel(-1); assert.equal(emptyStorage.storage.size, 0);
const blockedStorage = boot({ storageFails: true }); blockedStorage.wheel(-1); assert.equal(blockedStorage.layout().video.volume, 0.55);
// 100 秒初始化期限之后甚至数小时后下播，仍要处理；隐藏或禁用按钮不点击。
for (let i = 0; i < 10000; i++) t.tick();
let clicks = 0, visible = true;
const close = { disabled: false, getClientRects: () => visible ? [{}] : [], click: () => { clicks++; visible = false; } };
t.setClose(close); t.tick(); assert.equal(clicks, 1);
t.tick(); assert.equal(clicks, 1); visible = true; close.disabled = true;
t.tick(); assert.equal(clicks, 1); close.disabled = false; t.tick(); assert.equal(clicks, 2);
t.setClose(null); t.tick(); assert.equal(clicks, 2);
t.win.emit('pagehide', {});
assert.equal(t.timers.size, 0); assert.equal(t.styles.length, 0);
assert.equal(t.doc.events.get('wheel').length, 0); assert.equal(t.doc.events.get('volumechange').length, 0);
assert.ok(!t.layout().control.classList.contains('douyuex-volume-synced'));
assert.equal(t.wheel(-1).prevented, false);
const disabled = boot({ wheel: false, noJump: false });
assert.equal(disabled.styles.length, 0); assert.equal(disabled.timers.size, 0); assert.equal(disabled.doc.events.size, 0);
assert.equal(boot({ wheel: false }).timers.size, 1);
assert.equal(boot({ noJump: false }).doc.events.get('wheel').length, 1);
console.log('PASS: 滚轮范围/5%步进/上下限/静音/UI/存储/延迟加载/重建/下播推荐/开关/清理');
