// node tests/x-download.test.cjs
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const source = fs.readFileSync(path.join(__dirname, "../x/xex.user.js"), "utf8");

function boot(options = {}) {
    class Element {
        constructor(tag = "div") {
            this.tag = tag;
            this.tagName = tag.toUpperCase();
            this.children = [];
            this.dataset = {};
            this.listeners = {};
            this.attributes = {};
        }
        appendChild(node) { node.parentElement = this; this.children.push(node); return node; }
        remove() {
            if (this.parentElement) this.parentElement.children = this.parentElement.children.filter(node => node !== this);
            this.parentElement = null;
        }
        setAttribute(key, value) { this.attributes[key] = value; }
        getAttribute(key) { return this.attributes[key] ?? null; }
        addEventListener(type, listener) { this.listeners[type] = listener; }
        set innerHTML(value) {
            this.html = value;
            const label = new Element("span");
            label.textContent = value.match(/<span>(.*?)<\/span>/)?.[1];
            this.appendChild(label);
        }
        querySelector(selector) {
            if (selector === '[data-testid="reply"]' && this.toolbar) return {};
            for (const child of this.children) {
                if (child.matches(selector)) return child;
                const found = child.querySelector(selector);
                if (found) return found;
            }
            return null;
        }
        matches(selector) {
            if (selector === 'article[data-testid="tweet"]') return this.tag === "article";
            if (selector === '[role="link"]') return this.getAttribute("role") === "link";
            if (selector === 'a[href*="/status/"]') return this.tag === "a" && this.getAttribute("href")?.includes("/status/");
            return selector === this.tag;
        }
        closest(selector) {
            for (let node = this; node; node = node.parentElement) if (node.matches(selector)) return node;
            return null;
        }
    }
    const body = new Element("body");
    const articles = [];
    function article(id = "1234567890123456789", { video = true, quote = false, noTime = false, unplayed = false, thumbnail = null } = {}) {
        const node = new Element("article");
        node.id = id;
        node.video = video;
        node.quote = quote;
        node.noTime = noTime;
        const toolbar = new Element();
        toolbar.toolbar = true;
        toolbar.article = node;
        node.appendChild(toolbar);
        node.toolbar = toolbar;
        const videoNode = new Element("video");
        videoNode.article = node;
        const previewNode = new Element();
        previewNode.setAttribute("data-testid", "videoComponent");
        const posterNode = new Element("img");
        posterNode.setAttribute("src", thumbnail);
        const link = new Element("a");
        link.setAttribute("role", "link");
        link.getAttribute = key => key === "href" ? `/tester/status/${node.id}` : link.attributes[key] ?? null;
        const time = new Element("time");
        node.appendChild(link);
        link.appendChild(time);
        const quoteWrap = new Element();
        quoteWrap.setAttribute("role", "link");
        const quoteLink = new Element("a");
        quoteLink.setAttribute("href", "/quoted/status/777");
        quoteWrap.appendChild(quoteLink);
        node.appendChild(quoteWrap);
        node.querySelectorAll = selector => {
            if (selector === "time") return node.noTime ? [] : [time];
            if (selector === 'a[href*="/status/"]') return [quoteLink, link];
            if (selector === '[role="group"]') return [toolbar];
            if (selector === "img") {
                (node.quote ? quoteWrap : node).appendChild(posterNode);
                return thumbnail ? [posterNode] : [];
            }
            if (selector.startsWith("video,")) {
                const mediaNode = unplayed ? previewNode : videoNode;
                (node.quote ? quoteWrap : node).appendChild(mediaNode);
                if (!node.video) return [];
                return unplayed && !selector.includes('data-testid="videoComponent"') ? [] : [mediaNode];
            }
            return [];
        };
        articles.push(node);
        return node;
    }
    const first = article();
    const requests = [], downloads = [], styles = [], menus = [], timers = new Map();
    let timerId = 0, observer, fetchData, downloadError = null;
    class FakeXHR {
        constructor() { this.listeners = {}; this.responseType = ""; }
        open(method, url) { this.url = url; }
        addEventListener(type, fn) { this.listeners[type] = fn; }
        respond(data) {
            this.status = 200;
            this.responseText = JSON.stringify(data);
            this.listeners.load();
        }
    }
    const fetchResponse = { ok: true, clone: () => ({ json: async () => fetchData }) };
    const page = {
        location: { href: "https://x.com/home", origin: "https://x.com", reload() {} },
        fetch: () => Promise.resolve(fetchResponse),
        XMLHttpRequest: FakeXHR,
        addEventListener() {},
    };
    const document = {
        body,
        createElement: tag => new Element(tag),
        querySelector: selector => body.children.find(node => node.className === selector.slice(1)),
        querySelectorAll: () => articles,
        addEventListener() {},
    };
    vm.runInNewContext(source, {
        window: page, unsafeWindow: page, document, URL, console,
        MutationObserver: class { constructor(fn) { observer = fn; } observe() {} disconnect() {} },
        setTimeout(fn, delay) { timers.set(++timerId, { fn, delay }); return timerId; },
        clearTimeout: id => timers.delete(id),
        GM_getValue: (key, fallback) => options.values?.[key] ?? fallback,
        GM_setValue() {}, GM_registerMenuCommand: (label, fn) => menus.push({ label, fn }),
        GM_addStyle: css => styles.push(css),
        GM_xmlhttpRequest: details => requests.push(details),
        GM_download: details => {
            downloads.push(details);
            if (options.holdDownload) return;
            if (downloadError) details.onerror(downloadError);
            else { details.onprogress({ loaded: 50, total: 100 }); details.onload(); }
        },
    });
    function scan(notify = true) {
        if (notify) observer?.();
        for (const [id, timer] of timers) if (timer.delay === 100) {
            timers.delete(id); timer.fn();
        }
    }
    function button(node = first) { return node.toolbar.children[0]?.children[0]; }
    function click(node = first) {
        const event = { prevented: false, stopped: false,
            preventDefault() { this.prevented = true; }, stopPropagation() { this.stopped = true; } };
        const promise = button(node).listeners.click(event);
        assert.equal(event.prevented, true);
        assert.equal(event.stopped, true);
        return promise;
    }
    async function cache(data, url = "https://x.com/i/api/graphql/query/HomeTimeline") {
        fetchData = data;
        const response = await page.fetch(url);
        assert.equal(response, fetchResponse, "fetch 响应对象应保持原样");
        await Promise.resolve();
    }
    return { first, article, scan, button, click, cache, page, requests, downloads, styles, menus,
        body, setDownloadError: error => { downloadError = error; } };
}

const mp4 = (name, bitrate = 100, domain = "video.twimg.com") => ({
    content_type: "video/mp4", bitrate, url: `https://${domain}/ext_tw_video/1/pu/vid/1280x720/${name}.mp4`,
});
const video = variants => ({ type: "video", video_info: { variants } });
const tweet = (id, media) => ({ rest_id: id, legacy: { id_str: id, extended_entities: { media } } });

(async () => {
    const h = boot();
    assert.equal(h.first.toolbar.children.length, 1, "按钮应在工具栏末尾");
    assert.ok(h.button(), "时间链接带 role=link 时仍应显示按钮");
    h.scan(); h.scan();
    assert.equal(h.first.toolbar.children.length, 1, "重复扫描不能追加按钮");
    h.article("222", { video: false });
    const quoted = h.article("333", { quote: true });
    h.scan();
    assert.equal(h.button(quoted), undefined, "仅引用内有视频时不能给主帖加下载按钮");
    const withoutTime = h.article("444", { noTime: true });
    h.scan();
    assert.ok(h.button(withoutTime), "没有 time 元素时应通过主帖链接识别");

    const previews = boot();
    const unplayed = previews.article("555", { unplayed: true });
    const poster = previews.article("556", { video: false, thumbnail: "https://pbs.twimg.com/ext_tw_video_thumb/99/pu/img/poster.jpg" });
    const photo = previews.article("557", { video: false, thumbnail: "https://pbs.twimg.com/media/photo.jpg" });
    const quotePoster = previews.article("558", { video: false, quote: true, thumbnail: "https://pbs.twimg.com/amplify_video_thumb/99/img/poster.jpg" });
    previews.scan();
    assert.ok(previews.button(unplayed), "未播放的 videoComponent 预览应显示按钮");
    assert.ok(previews.button(poster), "只有原生视频缩略图时也应显示按钮");
    assert.equal(previews.button(photo), undefined, "普通图片不能误判成视频");
    assert.equal(previews.button(quotePoster), undefined, "引用的视频缩略图不能为主帖添加按钮");
    assert.equal(previews.requests.length, 0, "播放前显示按钮不能主动拉取视频数据");
    const metadataOnly = previews.article("559", { video: false });
    previews.scan();
    await previews.cache(tweet("559", [video([mp4("metadata")])]));
    previews.scan(false);
    assert.ok(previews.button(metadataOnly), "仅收到主帖视频资料时也应自动添加按钮，无需播放或 DOM 变化");
    await h.cache(tweet(h.first.id, [video([
        mp4("low", 100), mp4("high", 200), mp4("invalid", 999, "untrusted.example"),
        { content_type: "application/x-mpegURL", url: "https://video.twimg.com/stream.m3u8" },
    ])]));
    await h.click();
    assert.match(h.downloads[0].url, /high\.mp4$/);
    assert.equal(h.downloads[0].name, `x_${h.first.id}_1.mp4`);
    assert.equal(h.requests.length, 0, "页面已有地址时不应额外请求");
    assert.equal(h.button().dataset.state, "done");

    const fallback = boot();
    const action = fallback.click();
    assert.equal(fallback.button().disabled, true);
    await fallback.click();
    assert.equal(fallback.requests.length, 1, "重复点击不能发起重复下载");
    const query = new URL(fallback.requests[0].url);
    assert.equal(query.hostname, "cdn.syndication.twimg.com");
    assert.equal(query.searchParams.get("id"), fallback.first.id);
    assert.equal(fallback.requests[0].anonymous, true);
    fallback.requests[0].onload({ status: 200, responseText: JSON.stringify({
        id_str: fallback.first.id,
        mediaDetails: [video([mp4("one")]), video([mp4("two")])],
    }) });
    await action;
    assert.equal(fallback.downloads.length, 2);
    assert.match(fallback.downloads[1].name, /_2\.mp4$/);

    const xhr = boot();
    const request = new xhr.page.XMLHttpRequest();
    request.open("GET", "/i/api/graphql/id/TweetDetail");
    request.respond(tweet(xhr.first.id, [video([mp4("xhr")])]));
    await xhr.click();
    assert.match(xhr.downloads[0].url, /xhr\.mp4$/);
    assert.equal(xhr.requests.length, 0);

    const scoped = boot();
    await scoped.cache(tweet(scoped.first.id, [video([mp4("foreign")])]), "https://other.example/i/api/graphql/id");
    const scopedAction = scoped.click();
    assert.equal(scoped.requests.length, 1, "站外响应不能作为推文缓存");
    scoped.requests[0].ontimeout();
    await scopedAction;
    assert.equal(scoped.button().dataset.state, "error");

    const mixed = boot();
    await mixed.cache(tweet(mixed.first.id, [video([mp4("one")]), video([
        { url: "https://video.twimg.com/hls.m3u8" },
    ])]));
    await mixed.click();
    assert.equal(mixed.downloads.length, 0, "含不支持的视频时不能假称全部下载完成");
    assert.match(mixed.body.children[0].textContent, /分段流/);
    assert.equal(mixed.button().disabled, false);

    const identity = boot();
    const own = tweet(identity.first.id, []);
    own.quoted_status_result = { result: tweet("777", [video([mp4("quote")])]) };
    own.legacy.conversation_id_str = "777";
    await identity.cache(own);
    const identityAction = identity.click();
    identity.requests[0].onload({ status: 200, responseText: JSON.stringify({
        id_str: "777", mediaDetails: [video([mp4("wrong")])],
    }) });
    await identityAction;
    assert.equal(identity.downloads.length, 0, "不能下载引用或回复的错误媒体");

    const reused = boot({ holdDownload: true });
    await reused.cache(tweet(reused.first.id, [video([mp4("old")])]));
    const old = reused.button();
    const oldAction = reused.click();
    await Promise.resolve();
    reused.first.id = "888";
    reused.scan();
    const current = reused.button();
    assert.notEqual(current, old);
    reused.downloads[0].onload();
    await oldAction;
    assert.equal(current.querySelector("span").textContent, "下载", "旧任务不能更改新推文按钮");
    reused.first.video = false;
    reused.scan();
    assert.equal(reused.button(), undefined, "复用为无视频推文时应移除按钮");

    const failure = boot();
    await failure.cache(tweet(failure.first.id, [video([mp4("retry")])]));
    failure.setDownloadError({ error: "not_enabled" });
    await failure.click();
    assert.equal(failure.button().dataset.state, "error");
    assert.match(failure.body.children[0].textContent, /篡改猴/);
    failure.setDownloadError(null);
    await failure.click();
    assert.equal(failure.button().dataset.state, "done");

    const profileOff = boot({ values: { "profile.blockUserHoverCard": false } });
    assert.ok(profileOff.button(), "关闭资料卡屏蔽不能关闭下载功能");
    assert.equal(profileOff.styles.some(css => css.includes('data-testid="HoverCard"')), false);
    const downloadOff = boot({ values: { "video.oneClickDownload": false } });
    assert.equal(downloadOff.button(), undefined);
    assert.equal(downloadOff.styles.length, 1, "关闭下载不能关闭资料卡屏蔽");
    console.log("PASS: pre-play previews/posters/metadata, photo/quote filtering, toolbar placement, deduplication, MP4 selection, fetch/XHR cache, fallback, multi-video, identity, HLS, reuse, retry, independent settings");
})().catch(error => { console.error(error); process.exitCode = 1; });
