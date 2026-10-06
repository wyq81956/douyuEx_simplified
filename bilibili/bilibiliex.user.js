// ==UserScript==
// @name         B站动态 - 屏蔽悬浮用户资料卡
// @namespace    bilibiliex-simplified
// @version      1.2.0
// @description  动态页屏蔽资料卡；视频页自动网页全屏；直播间自动网页模式、隐藏弹幕等级和粉丝牌、隐藏弹幕池顶部。
// @author       本地维护
// @match        https://t.bilibili.com/*
// @match        https://www.bilibili.com/video/*
// @match        https://www.bilibili.com/list/watchlater/*
// @match        https://www.bilibili.com/list/watchlater
// @match        https://live.bilibili.com/*
// @run-at       document-start
// @noframes
// @grant        GM_addStyle
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// ==/UserScript==

(function () {
    "use strict";

    const blockProfile = registerToggle("dynamic.blockUserProfile", "资料卡屏蔽");
    const autoFullscreen = registerToggle("video.autoWebFullscreen", "自动网页全屏");
    const liveWebMode = registerToggle("live.autoWebMode", "直播自动网页模式");
    const liveBadges = registerToggle("live.hideChatBadges", "直播弹幕等级和粉丝牌屏蔽");
    const liveChatTop = registerToggle("live.hideChatTop", "直播弹幕池顶部屏蔽");

    if (window.location.hostname === "t.bilibili.com" && blockProfile) blockUserProfile();
    if (window.location.hostname === "www.bilibili.com" && autoFullscreen
        && (window.location.pathname.startsWith("/video/")
            || /^\/list\/watchlater\/?$/.test(window.location.pathname))) startWebFullscreen();
    if (window.location.hostname === "live.bilibili.com"
        && /^\/(?:blanc\/)?\d+\/?$/.test(window.location.pathname)) {
        if (liveBadges) hideLiveChatBadges();
        if (liveChatTop) hideLiveChatTop();
        if (liveWebMode) startLiveWebMode();
    }

    function registerToggle(key, label) {
        const enabled = GM_getValue(key, true);
        GM_registerMenuCommand(`${enabled ? "关闭" : "开启"}${label}并刷新`, () => {
            GM_setValue(key, !enabled);
            window.location.reload();
        });
        return enabled;
    }

    function blockUserProfile() {
        // 沿用斗鱼精简版的 CSS 屏蔽思路，只隐藏资料卡，不处理头像热区。
        // 类名对应动态页资料卡；自定义元素对应另一种用户资料卡实现。
        // CSS 自动覆盖异步加载、滚动追加和复用的弹层，无需轮询或观察整页。
        GM_addStyle(`
            .bili-user-profile,
            bili-user-profile {
                display: none !important;
            }
        `);
    }

    function hideLiveChatBadges() {
        // 只处理弹幕列表内的徽章，不隐藏昵称、正文或发送框自己的佩戴按钮。
        GM_addStyle(`
            #chat-history-list .chat-item :is(
                .wealth-medal-ctnr, .user-level, .user-level-icon, .level-icon,
                .fans-medal-item-ctnr, .fans-medal-item, .group-medal-ctnr
            ) { display: none !important; }
        `);
    }

    function hideLiveChatTop() {
        // 544618 官方 HTML/CSS：aside 是纵向 flex，列表和发送框是独立子节点。
        // 沿用斗鱼隐藏排行/活动、让聊天区向上扩展的思路，覆盖延迟加载组件。
        GM_addStyle(`
            #aside-area-vm > #rank-list-vm,
            #aside-area-vm .rank-list-section,
            #aside-area-vm > #chat-msg-bubble-vm,
            #aside-area-vm > #activity-welcome-area-vm,
            #aside-area-vm > #pk-multiplier-card-selection,
            #aside-area-vm > #s14-player-selection,
            #aside-area-vm > #hyperlink-card,
            #aside-area-vm .chat-history-panel > .chat-overlay-layer {
                display: none !important;
            }
            #aside-area-vm .chat-history-panel {
                flex: 1 1 0 !important;
                height: auto !important;
                min-height: 0 !important;
            }
            #aside-area-vm .chat-history-panel #chat-history-list {
                padding-top: 5px !important;
            }
            #aside-area-vm > #chat-control-panel-vm {
                flex: 0 0 auto !important;
            }
        `);
    }

    function startLiveWebMode() {
        const deadline = Date.now() + 100000;
        const modeLabel = /^(退出)?网页(?:模式|全屏)(?:\s*\([^)]*\))?$/;
        let clicks = 0;
        let lastClick = -Infinity;
        let stopped = false;
        let busy = false;
        let timer = null;

        function stop() {
            if (stopped) return;
            stopped = true;
            clearInterval(timer);
            document.removeEventListener("click", onManualClick, true);
            document.removeEventListener("keydown", onManualKey, true);
            window.removeEventListener("pagehide", stop);
        }

        function onManualClick(event) {
            if (event.isTrusted && event.target?.closest?.(
                "#live-player .live-web-player-controller .right-area .icon"
            )) stop();
        }

        function onManualKey(event) {
            if (!event.isTrusted || event.ctrlKey || event.metaKey || event.altKey) return;
            if (event.target?.isContentEditable
                || event.target?.closest?.("input, textarea, select")) return;
            if (["escape", "w", "f"].includes(event.key.toLowerCase())) stop();
        }

        function alreadyEntered() {
            return document.body?.classList.contains("player-full-win")
                || !!document.fullscreenElement;
        }

        async function findButton(player) {
            // 官方播放器右侧的提示文字仅在 mouseenter 后通过 Svelte 渲染。
            // 按文案识别而非 nth-child，避免某个控件缺失时误点其他按钮。
            for (const wrap of player.querySelectorAll(
                ".live-web-player-controller .right-area > .tip-wrap"
            )) {
                if (stopped) return null;
                const wasHovered = wrap.matches(":hover");
                try {
                    if (!wrap.querySelector(".tip")) {
                        wrap.dispatchEvent(new MouseEvent("mouseenter"));
                        await Promise.resolve();
                    }
                    const label = wrap.querySelector(".tip")?.textContent.trim() || "";
                    if (!modeLabel.test(label)) continue;
                    if (label.startsWith("退出")) { stop(); return null; }
                    return wrap.querySelector(".icon");
                } finally {
                    if (!wasHovered && !wrap.matches(":hover")) {
                        wrap.dispatchEvent(new MouseEvent("mouseleave"));
                    }
                }
            }
            return null;
        }

        async function attempt() {
            if (stopped || busy) return;
            if (Date.now() >= deadline || clicks >= 3) { stop(); return; }
            if (alreadyEntered()) { stop(); return; }
            if (Date.now() - lastClick < 2000) return;
            const player = document.querySelector("#live-player");
            if (!player || !player.getClientRects().length) return;
            busy = true;
            try {
                const button = await findButton(player);
                if (stopped || !button || !button.isConnected || button.disabled
                    || button.getAttribute("aria-disabled") === "true") return;
                if (alreadyEntered()) { stop(); return; }
                clicks++;
                lastClick = Date.now();
                button.click();
            } finally {
                busy = false;
            }
        }

        document.addEventListener("click", onManualClick, true);
        document.addEventListener("keydown", onManualKey, true);
        window.addEventListener("pagehide", stop);
        timer = setInterval(attempt, 500);
        void attempt();
    }

    function startWebFullscreen() {
        const deadline = Date.now() + 100000;
        let clicks = 0;
        let lastClick = -Infinity;
        let stopped = false;
        let timer = null;

        function stop() {
            if (stopped) return;
            stopped = true;
            clearInterval(timer);
            document.removeEventListener("click", onManualClick, true);
            document.removeEventListener("keydown", onManualKey, true);
            window.removeEventListener("pagehide", stop);
        }

        function onManualClick(event) {
            if (event.isTrusted && event.target?.closest?.(
                ".bpx-player-ctrl-web, .bpx-player-ctrl-full, .bpx-player-ctrl-wide"
            )) stop();
        }

        function onManualKey(event) {
            if (!event.isTrusted || event.ctrlKey || event.metaKey || event.altKey) return;
            if (event.target?.isContentEditable
                || event.target?.closest?.("input, textarea, select")) return;
            if (["escape", "w", "f", "q"].includes(event.key.toLowerCase())) stop();
        }

        function attempt() {
            if (stopped) return;
            if (Date.now() >= deadline) { stop(); return; }
            const player = document.querySelector(".bpx-player-container");
            if (!player) return;
            const mode = player.getAttribute("data-screen");
            // 网站已进入网页全屏/浏览器全屏时不点击切换按钮。
            if (mode === "web" || mode === "full" || document.fullscreenElement) {
                stop(); return;
            }
            // 等待屏幕模式及视频初始化；不打断用户滚动后的小窗模式。
            if (mode !== "normal" && mode !== "wide") return;
            const video = player.querySelector("video");
            const button = player.querySelector(".bpx-player-ctrl-web");
            if (!video || video.readyState < 1 || !button || button.disabled
                || button.getAttribute("aria-disabled") === "true"
                || !player.getClientRects().length) return;
            if (clicks >= 3) { stop(); return; }
            if (Date.now() - lastClick < 2000) return;
            clicks++;
            lastClick = Date.now();
            // 使用网站原生按钮，不强改布局或访问播放器私有状态。
            button.click();
        }

        document.addEventListener("click", onManualClick, true);
        document.addEventListener("keydown", onManualKey, true);
        window.addEventListener("pagehide", stop);
        timer = setInterval(attempt, 500);
        attempt();
    }
})();
