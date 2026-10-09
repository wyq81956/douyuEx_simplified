// ==UserScript==
// @name         X - 屏蔽悬浮用户资料卡
// @namespace    xex-simplified
// @version      1.1.2
// @description  屏蔽 X / Twitter 悬浮用户资料卡，在视频推文右下角添加普通 MP4 视频一键下载按钮。
// @author       本地维护
// @match        https://x.com/*
// @match        https://www.x.com/*
// @match        https://mobile.x.com/*
// @match        https://twitter.com/*
// @match        https://www.twitter.com/*
// @match        https://mobile.twitter.com/*
// @run-at       document-start
// @noframes
// @grant        GM_addStyle
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @grant        GM_download
// @grant        GM_xmlhttpRequest
// @grant        unsafeWindow
// @connect      video.twimg.com
// @connect      cdn.syndication.twimg.com
// ==/UserScript==

(function () {
    "use strict";

    const SETTING = "profile.blockUserHoverCard";
    const enabled = GM_getValue(SETTING, true);

    GM_registerMenuCommand(
        enabled ? "XEx：关闭用户资料卡屏蔽" : "XEx：开启用户资料卡屏蔽",
        () => {
            GM_setValue(SETTING, !enabled);
            window.location.reload();
        }
    );

    // 沿用 B站的 CSS 屏蔽方式，定位弹出的资料卡，而非头像或名字的触发热区。
    // hoverCardParent 包含弹层外壳和加载状态；HoverCard 覆盖资料卡本体。
    // CSS 自动覆盖滚动追加、异步加载及站内导航后创建的卡片，无需拦截鼠标事件。
    if (enabled) GM_addStyle(`
        [data-testid="hoverCardParent"],
        [data-testid="HoverCard"] {
            display: none !important;
        }
    `);

    const DOWNLOAD_SETTING = "video.oneClickDownload";
    const downloadEnabled = GM_getValue(DOWNLOAD_SETTING, true);
    GM_registerMenuCommand(
        downloadEnabled ? "XEx：关闭视频下载按钮" : "XEx：开启视频下载按钮",
        () => {
            GM_setValue(DOWNLOAD_SETTING, !downloadEnabled);
            window.location.reload();
        }
    );
    if (!downloadEnabled) return;
    startVideoDownloads();

    function startVideoDownloads() {
        const tweets = new Map();
        const pending = new Map();
        const states = new WeakMap();
        const page = typeof unsafeWindow === "undefined" ? window : unsafeWindow;
        const TWEET = 'article[data-testid="tweet"]';
        let scanTimer = null;

        GM_addStyle(`
            .xex-download-slot { display: flex; flex: 0 0 auto; margin-left: 6px; }
            .xex-download-button {
                display: inline-flex; align-items: center; justify-content: center;
                gap: 3px; min-width: 52px; height: 32px; padding: 0 6px;
                border: 0; border-radius: 16px; background: transparent;
                color: rgb(113, 118, 123); font: 12px/1.2 system-ui, sans-serif;
                cursor: pointer; white-space: nowrap;
            }
            .xex-download-button:hover { color: #1d9bf0; background: #1d9bf01a; }
            .xex-download-button:focus-visible { outline: 2px solid #1d9bf0; outline-offset: 2px; }
            .xex-download-button:disabled { cursor: progress; opacity: .7; }
            .xex-download-button[data-state="error"] { color: #f91880; }
            .xex-download-button[data-state="done"] { color: #00ba7c; }
            .xex-download-button svg { width: 16px; height: 16px; fill: currentColor; }
            .xex-download-notice {
                position: fixed; bottom: 24px; left: 50%; transform: translateX(-50%);
                z-index: 2147483647; max-width: calc(100vw - 32px); padding: 12px 18px;
                border-radius: 12px; background: #202327; color: #fff;
                font: 14px/1.5 system-ui, sans-serif; box-shadow: 0 4px 24px #0004;
            }
        `);

        function validMp4(raw) {
            try {
                const url = new URL(raw);
                return url.protocol === "https:" && url.hostname === "video.twimg.com"
                    && /\.mp4$/i.test(url.pathname) ? url.href : null;
            } catch { return null; }
        }

        function bestMp4(variants) {
            return (variants || []).map(variant => {
                const url = validMp4(variant.url || variant.src);
                const size = url?.match(/\/(\d+)x(\d+)\//);
                return { url, bitrate: Number(variant.bitrate) || 0,
                    pixels: size ? Number(size[1]) * Number(size[2]) : 0 };
            }).filter(variant => variant.url)
                .sort((a, b) => b.bitrate - a.bitrate || b.pixels - a.pixels)[0]?.url;
        }

        function remember(id, media, fallbackVideo) {
            if (!/^\d+$/.test(id || "")) return;
            const videos = (media || []).filter(item => item.type === "video" || item.type === "animated_gif")
                .map(item => bestMp4(item.video_info?.variants));
            if (!videos.length && fallbackVideo) videos.push(bestMp4(fallbackVideo.variants));
            // null 保留没有 MP4 的视频位置，避免多视频帖子中静默漏下某个视频。
            if (!videos.length) return;
            tweets.delete(id);
            tweets.set(id, videos.map(url => url || null));
            if (tweets.size > 300) tweets.delete(tweets.keys().next().value);
            // 媒体资料可能早于播放器节点出现；收到视频资料后也要更新按钮。
            scheduleScan();
        }

        function collect(data) {
            if (!data || typeof data !== "object") return;
            // 只用这条推文的 ID；不能用 conversation_id，也不能把引用的媒体挂到外层推文。
            const legacy = data.legacy || data;
            remember(data.rest_id || legacy.id_str, legacy.extended_entities?.media || data.mediaDetails, data.video);
            for (const child of Object.values(data)) {
                if (child && typeof child === "object") collect(child);
            }
        }

        function isTweetApi(raw) {
            try {
                const url = new URL(raw, window.location.href);
                return url.origin === window.location.origin && /^\/i\/api\//.test(url.pathname);
            } catch { return false; }
        }

        // 只旁读页面已发出的推文 API 响应，不增加请求，也不修改响应或登录信息。
        // Firefox 的跨沙箱函数需要 exportFunction；Chrome 可直接赋值。
        function expose(fn) {
            return typeof exportFunction === "function" ? exportFunction(fn, page) : fn;
        }
        try {
            const originalFetch = page.fetch;
            if (originalFetch) page.fetch = expose(function (...args) {
                const response = Reflect.apply(originalFetch, this, args);
                if (isTweetApi(args[0]?.url || args[0])) response.then(result => {
                    if (result.ok) result.clone().json().then(collect).catch(() => {});
                }).catch(() => {});
                return response;
            });
            const prototype = page.XMLHttpRequest?.prototype;
            if (prototype) {
                const originalOpen = prototype.open;
                const urls = new WeakMap();
                const watched = new WeakSet();
                prototype.open = expose(function (...args) {
                    const result = Reflect.apply(originalOpen, this, args);
                    urls.set(this, args[1]);
                    if (!watched.has(this)) {
                        watched.add(this);
                        this.addEventListener("load", expose(() => {
                            if (!isTweetApi(urls.get(this)) || this.status < 200 || this.status >= 300) return;
                            try {
                                if (this.responseType === "json") collect(this.response);
                                else if (!this.responseType || this.responseType === "text") collect(JSON.parse(this.responseText));
                            } catch { /* 非 JSON 响应不处理。 */ }
                        }));
                    }
                    return result;
                });
            }
        } catch (error) {
            console.warn("[XEx] 页面视频缓存不可用，下载时将尝试公开接口。", error);
        }

        function getVideos(id) {
            if (tweets.has(id)) return Promise.resolve(tweets.get(id));
            if (pending.has(id)) return pending.get(id);
            // X 的公开嵌入接口；token 计算方式参考 Vercel react-tweet 的 fetch-tweet.ts。
            const url = new URL("https://cdn.syndication.twimg.com/tweet-result");
            url.searchParams.set("id", id);
            url.searchParams.set("lang", "en");
            url.searchParams.set("token", ((Number(id) / 1e15) * Math.PI).toString(36).replace(/(0+|\.)/g, ""));
            const request = new Promise((resolve, reject) => {
                GM_xmlhttpRequest({
                    method: "GET", url: url.href, timeout: 15000, anonymous: true,
                    onload: response => {
                        try {
                            if (response.status < 200 || response.status >= 300) throw new Error("未能获取视频资料，请刷新推文后重试。");
                            const data = JSON.parse(response.responseText);
                            // 接口返回的帖子必须与按钮对应，引用和回复不可串用。
                            if (String(data.id_str) !== id) throw new Error("未能获取这条推文的视频，请刷新后重试。");
                            collect(data);
                            resolve(tweets.get(id) || []);
                        } catch (error) { reject(error); }
                    },
                    onerror: () => reject(new Error("视频资料请求失败，请检查网络后重试。")),
                    ontimeout: () => reject(new Error("视频资料请求超时，请重试。")),
                });
            }).finally(() => pending.delete(id));
            pending.set(id, request);
            return request;
        }

        function download(url, name, progress) {
            return new Promise((resolve, reject) => {
                GM_download({
                    url, name, saveAs: false,
                    onload: resolve,
                    onprogress: event => {
                        if (event.total > 0) progress(Math.min(100, Math.round(event.loaded / event.total * 100)));
                    },
                    onerror: error => reject(new Error(
                        ["not_enabled", "not_permitted", "not_whitelisted", "not_supported"].includes(error?.error)
                            ? "请在篡改猴设置中启用下载、允许 .mp4 文件下载后重试。"
                            : "视频下载失败，请检查网络或浏览器下载权限后重试。"
                    )),
                    ontimeout: () => reject(new Error("视频下载超时，请重试。")),
                });
            });
        }

        function notice(message) {
            document.querySelector(".xex-download-notice")?.remove();
            const node = document.createElement("div");
            node.className = "xex-download-notice";
            node.setAttribute("role", "alert");
            node.textContent = message;
            document.body.appendChild(node);
            setTimeout(() => node.remove(), 6500);
        }

        function belongsToTweet(node, article) {
            if (node.closest(TWEET) !== article) return false;
            // a[role=link] 是正常链接，包括推文的时间链接，不能当作引用卡片。
            // 只排除当前 article 内的引用卡片外壳；不检查 article 外部的祖先。
            for (let parent = node.parentElement; parent && parent !== article; parent = parent.parentElement) {
                if (parent.getAttribute("data-testid") === "quoteTweet"
                    || (parent.tagName !== "A" && parent.getAttribute("role") === "link"
                        && parent.querySelector('a[href*="/status/"]'))) return false;
            }
            return true;
        }

        function statusId(link) {
            try {
                const url = new URL(link.getAttribute("href"), window.location.href);
                return url.pathname.match(/^\/(?:[\w]+|i\/web)\/status\/(\d+)(?:\/(?:photo|video)\/\d+)?\/?$/)?.[1] || null;
            } catch { return null; }
        }

        function tweetId(article) {
            // 主帖时间链接优先，避免拿到正文、回复或引用中的 status 链接。
            for (const time of article.querySelectorAll("time")) {
                if (!belongsToTweet(time, article)) continue;
                const link = time.closest('a[href*="/status/"]');
                const id = link && statusId(link);
                if (id) return id;
            }
            // 某些详情布局不提供 time 元素，改从主帖的永久链接获取 ID。
            for (const link of article.querySelectorAll('a[href*="/status/"]')) {
                if (!belongsToTweet(link, article) || link.closest('[data-testid="tweetText"]')) continue;
                const id = statusId(link);
                if (id) return id;
            }
            return null;
        }

        function hasOwnVideo(article, id) {
            if (tweets.has(id)) return true;
            // 未播放时通常只有 videoComponent 外壳，点击播放后才创建 video/videoPlayer。
            if ([...article.querySelectorAll('video, [data-testid="videoPlayer"], [data-testid="videoComponent"]')]
                .some(node => belongsToTweet(node, article))) return true;
            // 另一些预览只提供视频封面；按 X 原生视频缩略图地址识别，排除普通图片。
            return [...article.querySelectorAll("img")].some(node => {
                if (!belongsToTweet(node, article)) return false;
                try {
                    const url = new URL(node.getAttribute("src"), window.location.href);
                    return url.hostname === "pbs.twimg.com"
                        && /^\/(?:ext_tw_video_thumb|amplify_video_thumb|tweet_video_thumb)\//.test(url.pathname);
                } catch { return false; }
            });
        }

        function setButton(button, label, state = "") {
            button.querySelector("span").textContent = label;
            button.dataset.state = state;
            button.setAttribute("aria-label", state === "" ? "下载视频" : label);
        }

        async function onDownload(event, article, state) {
            event.preventDefault();
            event.stopPropagation();
            if (state.busy) return;
            const id = tweetId(article);
            if (!id || id !== state.id) { scheduleScan(); return; }
            const button = state.button;
            state.busy = true;
            button.disabled = true;
            setButton(button, "获取中");
            try {
                const videos = await getVideos(id);
                if (!videos.length) throw new Error("未找到这条推文的普通视频地址，请刷新后重试。");
                if (videos.some(url => !url)) throw new Error("这条推文的视频没有可用的 MP4 地址，暂不支持分段流下载。");
                for (let index = 0; index < videos.length; index++) {
                    setButton(button, videos.length > 1 ? `${index + 1}/${videos.length}` : "下载中");
                    await download(videos[index], `x_${id}_${index + 1}.mp4`, percent => {
                        setButton(button, `${percent}%`);
                    });
                }
                setButton(button, "已下载", "done");
            } catch (error) {
                setButton(button, "重试", "error");
                notice(error.message || "下载失败，请重试。");
            } finally {
                state.busy = false;
                button.disabled = false;
                // X 会复用列表节点。旧下载只更新旧按钮，不干扰新推文。
                scheduleScan();
            }
        }

        function scan() {
            scanTimer = null;
            for (const article of document.querySelectorAll(TWEET)) {
                const id = tweetId(article);
                const toolbar = [...article.querySelectorAll('[role="group"]')]
                    .find(group => belongsToTweet(group, article)
                        && group.querySelector('[data-testid="reply"]'));
                const state = states.get(article);
                if (!id || !toolbar || !hasOwnVideo(article, id)) {
                    state?.button.parentElement?.remove();
                    states.delete(article);
                    continue;
                }
                if (state?.id === id && state.button.parentElement?.parentElement === toolbar) continue;
                state?.button.parentElement?.remove();
                const slot = document.createElement("div");
                slot.className = "xex-download-slot";
                const button = document.createElement("button");
                button.type = "button";
                button.className = "xex-download-button";
                button.title = "下载最高画质 MP4 视频";
                button.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M11 3h2v10l3-3 1.4 1.4L12 17l-5.4-5.6L8 10l3 3V3zm-6 16h14v2H5z"/></svg><span>下载</span>';
                button.setAttribute("aria-label", "下载视频");
                const next = { id, button, busy: false };
                // 阻止点击下载按钮触发推文跳转，不影响原生操作按钮。
                button.addEventListener("click", event => onDownload(event, article, next));
                slot.appendChild(button);
                toolbar.appendChild(slot);
                states.set(article, next);
            }
        }

        function scheduleScan() {
            if (scanTimer === null) scanTimer = setTimeout(scan, 100);
        }
        const observer = new MutationObserver(scheduleScan);
        function start() {
            observer.observe(document.body, { childList: true, subtree: true, attributes: true,
                attributeFilter: ["href", "src", "data-testid"] });
            scan();
        }
        if (document.body) start();
        else document.addEventListener("DOMContentLoaded", start, { once: true });
        window.addEventListener("pagehide", event => {
            if (event.persisted) return;
            observer.disconnect();
            clearTimeout(scanTimer);
        });
    }
})();
