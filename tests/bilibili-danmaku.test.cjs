// node tests/bilibili-danmaku.test.cjs
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { integer, message } = require("./fixtures/bilibili-sidebar-preview.cjs");
const source = fs.readFileSync(path.join(__dirname, "../bilibili/bilibiliex.user.js"), "utf8");
const context = {
    window: { location: { hostname: "www.bilibili.com", pathname: "/video/BVfixture/" } },
    GM_getValue: () => false, GM_registerMenuCommand() {}, TextDecoder,
};
vm.runInNewContext(source.replace(/\}\)\(\);\s*$/, "globalThis.danmakuTest = { readDanmakuSegment, danmakuBetween, danmakuPanelWidth }; })();"), context);
const { readDanmakuSegment, danmakuBetween, danmakuPanelWidth } = context.danmakuTest;
const decode = bytes => JSON.parse(JSON.stringify(readDanmakuSegment(bytes)));
const select = (...args) => JSON.parse(JSON.stringify(danmakuBetween(...args)));

const raw = Buffer.concat([
    message(5, "后出现"), message(0, "开始"), message(5, "同秒不同弹幕"),
    message(4, "高级 JSON 应排除", 7), message(4, "脚本应排除", 8), message(4, ""),
    message(6, "顶部", 5), message(7, "底部", 4),
    message(8, '<img src=x onerror="alert(1)">'),
    // 未知的顶层 varint、定长及字节字段仍能正确跳过。
    Buffer.concat([integer(16), integer(123), integer(29), Buffer.alloc(4), integer(33), Buffer.alloc(8), integer(42), integer(3), Buffer.from("new")]),
]);
assert.deepEqual(decode(raw), [
    { time: 0, text: "开始" }, { time: 5, text: "后出现" }, { time: 5, text: "同秒不同弹幕" },
    { time: 6, text: "顶部" }, { time: 7, text: "底部" }, { time: 8, text: '<img src=x onerror="alert(1)">' },
]);
assert.deepEqual(decode(Buffer.alloc(0)), []);
for (const malformed of [Buffer.from([0]), Buffer.from([10, 127]), Buffer.from([10, 1, 128]), Buffer.from([11]), Buffer.alloc(12, 128)]) {
    assert.throws(() => decode(malformed));
}

const first = decode(Buffer.concat([message(0, "零"), message(2, "二"), message(5, "五"), message(359.9, "前一段末尾")]));
const second = decode(Buffer.concat([message(360, "新一段"), message(361, "新一段之后"), message(700, "未来")]));
assert.deepEqual(select([first], -1, 0), [{ time: 0, text: "零" }]);
assert.deepEqual(select([first], -1, 2).map(item => item.text), ["零", "二"]);
assert.deepEqual(select([first], 2, 5), [{ time: 5, text: "五" }]);
assert.deepEqual(select([first], 5, 5), []); // 暂停或重复 timeupdate 不重复追加。
assert.deepEqual(select([first, second], 359, 360).map(item => item.text), ["前一段末尾", "新一段"]);
assert.deepEqual(select([first, second], 300, 361).map(item => item.text), ["前一段末尾", "新一段", "新一段之后"]);
assert.deepEqual(select([first, second], -1, 2).map(item => item.text), ["零", "二"]); // 回退不混入未来弹幕。
const busy = Array.from({ length: 1000 }, (_, i) => ({ time: i / 10, text: String(i) }));
assert.equal(select([busy], -1, 100).length, 250);
assert.equal(select([busy], -1, 100)[0].text, "750");
assert.equal(danmakuPanelWidth(1280, null), 307);
assert.equal(danmakuPanelWidth(1920, null), 360);
assert.equal(danmakuPanelWidth(1280, 480), 480);
assert.equal(danmakuPanelWidth(1280, 900), 600);
assert.equal(danmakuPanelWidth(1280, 10), 240);
assert.equal(danmakuPanelWidth(960, 600), 320); // 给视频保留至少 640px。
assert.equal(danmakuPanelWidth(900, null), 260);
assert.equal(danmakuPanelWidth(1280, "480"), 307);
assert.equal(danmakuPanelWidth(1280, NaN), 307);
assert.equal(danmakuPanelWidth(1280, Infinity), 307);
console.log("Passed: native danmaku protobuf fields, modes, unknown fields, malformed data, exact progress boundaries, pause deduplication, seeking and row limits.");
