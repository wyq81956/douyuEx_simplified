// node tests/follow-filter.test.cjs
// 验证原 Adblock 三条规则的匹配范围，以及动态卡片/状态更新/页面范围。
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../simplified/douyuEx_simplified.user.js'), 'utf8');
const marker = 'data-douyuex-follow-hidden';
function card(p = [], span = [], title = '') {
    const attributes = new Set();
    return { p, span, title, isCard: true, attributes,
        querySelectorAll(tag) { return this[tag].map(textContent => ({ textContent })); },
        toggleAttribute(name, enabled) { if (enabled) attributes.add(name); else attributes.delete(name); },
        removeAttribute(name) { attributes.delete(name); },
    };
}
function boot({ pathname = '/directory/myFollow', enabled, cards = [] } = {}) {
    const prefs = { 'autoPlayer.fullscreen': false, 'autoPlayer.highestQuality': false,
        'simpleMode.enabled': false, 'dotaHelper.blocked': false, 'barrageResize.enabled': false,
        'player.volumeWheel': false, 'player.noCloseJump': false };
    if (enabled !== undefined) prefs['followPage.filter'] = enabled;
    const styles = [], observers = [], timers = new Map(), intervals = new Map(), events = new Map(), menus = new Map();
    let serial = 0;
    const document = {
        addEventListener() {},
        removeEventListener() {},
        querySelector: () => null,
        body: {}, head: { appendChild: node => styles.push(node) },
        createElement: () => ({ remove() { const i = styles.indexOf(this); if (i >= 0) styles.splice(i, 1); } }),
        querySelectorAll: selector => selector === 'div.layout-Cover-card' ? cards.filter(c => c.isCard)
            : selector === `[${marker}]` ? cards.filter(c => c.attributes.has(marker)) : [],
    };
    const window = { location: { pathname, search: '?sort=live' },
        addEventListener(type, fn) {
            const callbacks = events.get(type)?.callbacks || [];
            callbacks.push(fn);
            const dispatch = () => [...callbacks].forEach(callback => callback());
            dispatch.callbacks = callbacks; events.set(type, dispatch);
        },
        removeEventListener(type, fn) {
            const dispatch = events.get(type); if (!dispatch) return;
            const at = dispatch.callbacks.indexOf(fn); if (at >= 0) dispatch.callbacks.splice(at, 1);
            if (!dispatch.callbacks.length) events.delete(type);
        } };
    vm.runInNewContext(source, { document, window,
        GM_getValue: (key, fallback) => key in prefs ? prefs[key] : fallback,
        GM_registerMenuCommand: (name, fn) => menus.set(name, fn),
        MutationObserver: class {
            constructor(fn) { this.fn = fn; observers.push(this); }
            observe(target, options) { this.target = target; this.options = options; }
            disconnect() { this.disconnected = true; }
        },
        setTimeout: (fn, delay) => { assert.equal(delay, 100); timers.set(++serial, fn); return serial; },
        clearTimeout: id => timers.delete(id),
        setInterval: fn => { intervals.set(++serial, fn); return serial; }, clearInterval: id => intervals.delete(id),
    });
    return { cards, styles, observers, timers, intervals, events, menus, window,
        mutate: () => observers.filter(o => !o.disconnected).forEach(o => o.fn()),
        flush() { const batch = [...timers.values()]; timers.clear(); batch.forEach(fn => fn()); },
    };
}
const offline = card(['上次直播：昨天']), upcoming = card(['今晚 8 点预告']), replay = card([], ['正在轮播']);
const live = card(['正在直播']), unrelatedTitle = card([], [], '预告新游戏，分享上次直播体验');
const wrongTags = card(['今日轮播介绍'], ['上次直播', '预告']);
const t = boot({ cards: [offline, upcoming, replay, live, unrelatedTitle, wrongTags] });
assert.deepEqual([...t.menus.keys()], ['DouyuEx 设置']);
assert.equal(t.styles.length, 1); assert.match(t.styles[0].textContent, /\.layout-Banner/);
assert.match(t.styles[0].textContent, /div\.layout-Cover-card\[data-douyuex-follow-hidden\]/);
assert.ok([offline, upcoming, replay].every(c => c.attributes.has(marker)));
assert.ok([live, unrelatedTitle, wrongTags].every(c => !c.attributes.has(marker)));
assert.equal(t.observers[0].options.characterData, true);
assert.deepEqual(Array.from(t.observers[0].options.attributeFilter), ['class']);
const later = card(['开播预告']); t.cards.push(later);
for (let i = 0; i < 100; i++) t.mutate();
assert.equal(t.timers.size, 1); assert.ok(!later.attributes.has(marker));
t.flush(); assert.ok(later.attributes.has(marker));
// 复用原卡片改成直播状态，应移除隐藏标记。
offline.p = ['正在直播']; replay.span = ['直播中']; t.mutate(); t.flush();
assert.ok(!offline.attributes.has(marker)); assert.ok(!replay.attributes.has(marker));
live.span = ['轮播']; t.mutate(); t.flush(); assert.ok(live.attributes.has(marker));
// 先出现非卡片元素，后补 class，也要重新匹配。
const lateClass = card(['上次直播：前天']); lateClass.isCard = false;
t.cards.push(lateClass); t.mutate(); t.flush(); assert.ok(!lateClass.attributes.has(marker));
lateClass.isCard = true; t.mutate(); t.flush(); assert.ok(lateClass.attributes.has(marker));
t.mutate(); assert.equal(t.timers.size, 1); t.events.get('pagehide')();
assert.equal(t.styles.length, 0); assert.equal(t.timers.size, 0); assert.equal(t.events.size, 0);
assert.equal(t.intervals.size, 0);
assert.ok(t.observers[0].disconnected); assert.ok(t.cards.every(c => !c.attributes.has(marker)));
for (const pathname of ['/9999', '/', '/directory/all', '/directory/myFollowers', '/directory/myFollow/other']) {
    const other = boot({ pathname, cards: [card(['上次直播'])] });
    assert.equal(other.styles.length, 0); assert.equal(other.observers.length, 0); assert.equal(other.events.has('popstate'), false);
}
assert.equal(boot({ pathname: '/directory/myFollow/' }).styles.length, 1);
assert.equal(boot({ enabled: false }).observers.length, 0);
// 页面内导航离开关注页时，清理样式/标记，避免影响其他页面的横幅。
const route = boot({ cards: [card(['预告'])] });
route.window.location.pathname = '/directory/all'; route.events.get('popstate')();
assert.equal(route.styles.length, 0); assert.ok(!route.cards[0].attributes.has(marker));
const mutationRoute = boot({ cards: [card(['预告'])] });
mutationRoute.window.location.pathname = '/9999'; mutationRoute.mutate(); mutationRoute.flush();
assert.equal(mutationRoute.styles.length, 0); assert.equal(mutationRoute.events.has('popstate'), false);
console.log('PASS: 三条规则/标签范围/正常直播保留/动态加载/状态更新/合并扫描/路径限制/关闭/清理');
