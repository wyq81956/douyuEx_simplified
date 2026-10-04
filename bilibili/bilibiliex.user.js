// ==UserScript==
// @name         B站动态 - 屏蔽悬浮用户资料卡
// @namespace    bilibiliex-simplified
// @version      1.1.0
// @description  动态页屏蔽悬浮用户资料卡；视频页自动网页全屏，手动退出后不再干预。
// @author       本地维护
// @match        https://t.bilibili.com/*
// @match        https://www.bilibili.com/video/*
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

    if (window.location.hostname === "t.bilibili.com" && blockProfile) blockUserProfile();
    if (window.location.hostname === "www.bilibili.com"
        && window.location.pathname.startsWith("/video/") && autoFullscreen) startWebFullscreen();

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
