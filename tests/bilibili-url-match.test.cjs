// node tests/bilibili-url-match.test.cjs
// Metadata simulation with path+query matching, not an installed Tampermonkey test.
// https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/Match_patterns#path
const assert = require("node:assert/strict");
const fs = require("node:fs"), path = require("node:path");
const source = fs.readFileSync(path.join(__dirname, "../bilibili/bilibiliex.user.js"), "utf8");
const patterns = [...source.matchAll(/^\/\/ @match\s+(\S+)\s*$/gm)].map(match => match[1]);
const reported = "https://www.bilibili.com/list/watchlater?oid=117523827725893&bvid=BV1Gqsf6JELS&spm_id_from=333.1365.top_right_bar_window_view_later.content.click&vd_source=0004b96e5a1ffeb80fe14526d7fb8280";
function matches(pattern, href) {
    // This script uses exact HTTPS hosts; only the path contains wildcards.
    const [, host, patternPath] = /^https:\/\/([^/]+)(\/.*)$/.exec(pattern);
    const url = new URL(href);
    const expression = patternPath.split("*").map(part => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join(".*");
    return url.protocol === "https:" && url.host === host && new RegExp(`^${expression}$`).test(url.pathname + url.search);
}
const included = href => patterns.some(pattern => matches(pattern, href));
assert.equal(patterns.filter(pattern => !pattern.endsWith("/watchlater?*")).some(pattern => matches(pattern, reported)), false);
for (const href of [
    reported, reported + "#player",
    "https://www.bilibili.com/list/watchlater?bvid=BV1Gqsf6JELS&oid=117523827725893",
    "https://www.bilibili.com/list/watchlater/?bvid=BV1Gqsf6JELS",
    "https://www.bilibili.com/list/watchlater", "https://www.bilibili.com/list/watchlater/",
    "https://www.bilibili.com/list/watchlater#player",
    "https://www.bilibili.com/video/BV1Gqsf6JELS/?p=2",
    "https://live.bilibili.com/544618", "https://t.bilibili.com/",
]) assert.equal(included(href), true, href);
for (const href of [
    "https://www.bilibili.com/list/watchlater-other?bvid=BV1Gqsf6JELS",
    "https://www.bilibili.com/list/watchlater2?bvid=BV1Gqsf6JELS",
    "https://www.bilibili.com/", "https://example.com/list/watchlater?bvid=BV1Gqsf6JELS",
    "http://www.bilibili.com/list/watchlater?bvid=BV1Gqsf6JELS",
]) assert.equal(included(href), false, href);
console.log("Passed: reported watchlater URL, query order, trailing slash, fragments, old routes and unrelated URL exclusions (metadata simulation).");
