// ==UserScript==
// @name         B站动态 - 屏蔽悬浮用户资料卡
// @namespace    bilibiliex-simplified
// @version      1.5.0
// @updateURL    https://github.com/wyq81956/douyuEx_simplified/releases/latest/download/bilibiliex.user.js
// @downloadURL  https://github.com/wyq81956/douyuEx_simplified/releases/latest/download/bilibiliex.user.js
// @description  动态页屏蔽资料卡；视频页自动网页全屏；T键切换视频和直播网页全屏；直播间自动网页模式和最高画质、隐藏弹幕等级和粉丝牌及特殊称号、隐藏弹幕池顶部。
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

    const SETTINGS = {
        blockProfile: "dynamic.blockUserProfile",
        autoFullscreen: "video.autoWebFullscreen",
        liveWebMode: "live.autoWebMode",
        liveBadges: "live.hideChatBadges",
        liveChatTop: "live.hideChatTop",
        liveQuality: "live.highestQuality",
        webFullscreenHotkey: "keyboard.webFullscreen",
    };
    let settingsDialog = null;
    let cancelAutoWebMode = () => {};
    GM_registerMenuCommand("BilibiliEx 设置", openSettings);
    const blockProfile = GM_getValue(SETTINGS.blockProfile, true);
    const autoFullscreen = GM_getValue(SETTINGS.autoFullscreen, true);
    const liveWebMode = GM_getValue(SETTINGS.liveWebMode, true);
    const liveBadges = GM_getValue(SETTINGS.liveBadges, true);
    const liveChatTop = GM_getValue(SETTINGS.liveChatTop, true);
    const liveQuality = GM_getValue(SETTINGS.liveQuality, true);
    const webFullscreenHotkey = GM_getValue(SETTINGS.webFullscreenHotkey, true);
    const isVideoPage = window.location.hostname === "www.bilibili.com"
        && (window.location.pathname.startsWith("/video/")
            || /^\/list\/watchlater\/?$/.test(window.location.pathname));
    const isLivePage = window.location.hostname === "live.bilibili.com"
        && /^\/(?:blanc\/)?\d+\/?$/.test(window.location.pathname);

    if (window.location.hostname === "t.bilibili.com" && blockProfile) blockUserProfile();
    if (isVideoPage && autoFullscreen) startWebFullscreen();
    if (isLivePage) {
        if (liveBadges) hideLiveChatBadges();
        if (liveChatTop) hideLiveChatTop();
        if (liveWebMode) startLiveWebMode();
        if (liveQuality) startLiveHighestQuality();
    }
    if (webFullscreenHotkey && (isVideoPage || isLivePage)) startWebFullscreenHotkey();

    function openSettings() {
        if (!document.body) {
            document.addEventListener("DOMContentLoaded", openSettings, { once: true });
            return;
        }
        if (settingsDialog?.open) { settingsDialog.focus(); return; }
        // 按需创建，Shadow DOM 隔离网站样式；原生 dialog 负责置顶、焦点和 Esc。
        const host = document.createElement("div");
        host.id = "bilibiliex-settings-host";
        const shadow = host.attachShadow({ mode: "open" });
        shadow.innerHTML = `
            <style>
                :host { all: initial; }
                * { box-sizing: border-box; }
                dialog {
                    padding: 0; border: 1px solid #e5e7eb; border-radius: 16px;
                    width: min(440px, calc(100vw - 24px)); max-height: calc(100dvh - 32px);
                    margin: auto; background: #fff; color: #202124;
                    font: 14px/1.5 system-ui, "Microsoft YaHei", sans-serif;
                    box-shadow: 0 16px 60px #0004; color-scheme: light;
                }
                dialog::backdrop { background: #0007; }
                .panel { display: flex; flex-direction: column; max-height: calc(100dvh - 34px); }
                header { padding: 22px 24px 14px; flex-shrink: 0; }
                h2 { margin: 0 0 4px; font-size: 20px; font-weight: 650; }
                p { margin: 0; color: #687078; font-size: 12px; }
                .options { padding: 0 24px; overflow-y: auto; overscroll-behavior: contain; }
                .option {
                    display: flex; align-items: center; justify-content: space-between;
                    gap: 20px; padding: 12px 0; border-bottom: 1px solid #f0f1f2; cursor: pointer;
                }
                .name { display: block; font-weight: 550; }
                .hint { display: block; margin-top: 2px; color: #687078; font-size: 12px; }
                input {
                    appearance: none; flex: 0 0 38px; width: 38px; height: 22px;
                    margin: 0; border: 0; border-radius: 12px; background: #c6cbd0;
                    position: relative; cursor: pointer;
                }
                input::after {
                    content: ''; position: absolute; width: 16px; height: 16px;
                    top: 3px; left: 3px; border-radius: 50%; background: #fff;
                }
                input:checked { background: #e84b83; }
                input:checked::after { left: 19px; }
                :focus-visible { outline: 2px solid #cf356d; outline-offset: 3px; }
                footer {
                    display: flex; justify-content: flex-end; gap: 10px;
                    padding: 12px 24px 20px; flex-shrink: 0;
                }
                button { font: inherit; cursor: pointer; border-radius: 8px; padding: 8px 14px; }
                .cancel { border: 1px solid #d9dde1; color: #40454a; background: #fff; }
                .save { border: 1px solid #e84b83; color: #fff; background: #e84b83; }
            </style>
            <dialog aria-labelledby="settings-title" aria-describedby="settings-description">
                <div class="panel">
                    <header>
                        <h2 id="settings-title">BilibiliEx 设置</h2>
                        <p id="settings-description">调整后点击“保存并刷新”，使开关生效。</p>
                    </header>
                    <div class="options"></div>
                    <footer>
                        <button type="button" class="cancel">取消</button>
                        <button type="button" class="save">保存并刷新</button>
                    </footer>
                </div>
            </dialog>
        `;
        const options = [
            ["动态资料卡屏蔽", SETTINGS.blockProfile, "隐藏动态页头像悬停时的用户资料卡"],
            ["视频自动网页全屏", SETTINGS.autoFullscreen, "适用于普通视频和稍后观看播放页"],
            ["直播自动网页模式", SETTINGS.liveWebMode, "就绪后进入网页模式，保留弹幕池"],
            ["直播自动最高画质", SETTINGS.liveQuality, "选择最高可用画质，手动切换后不强制恢复"],
            ["直播弹幕装饰屏蔽", SETTINGS.liveBadges, "隐藏等级、粉丝牌和特殊称号"],
            ["直播弹幕池顶部屏蔽", SETTINGS.liveChatTop, "隐藏排行、活动及顶部覆盖层，扩展聊天区"],
            ["T 键切换网页全屏", SETTINGS.webFullscreenHotkey, "视频、稍后观看和直播；输入时不触发"],
        ];
        const inputs = new Map();
        const list = shadow.querySelector(".options");
        for (const [label, key, hint] of options) {
            const row = document.createElement("label");
            row.className = "option";
            const text = document.createElement("span");
            const name = document.createElement("span");
            name.className = "name";
            name.textContent = label;
            const detail = document.createElement("span");
            detail.className = "hint";
            detail.textContent = hint;
            text.append(name, detail);
            const input = document.createElement("input");
            input.type = "checkbox";
            input.setAttribute("role", "switch");
            input.setAttribute("aria-label", label);
            input.checked = !!GM_getValue(key, true);
            row.append(text, input);
            list.appendChild(row);
            inputs.set(key, input);
        }
        const dialog = shadow.querySelector("dialog");
        settingsDialog = dialog;
        function dismiss() { dialog.close(); }
        dialog.addEventListener("close", () => {
            settingsDialog = null;
            window.removeEventListener("pagehide", dismiss);
            host.remove();
        }, { once: true });
        dialog.addEventListener("click", event => {
            if (event.target !== dialog) return;
            const rect = dialog.getBoundingClientRect();
            if (event.clientX < rect.left || event.clientX > rect.right
                || event.clientY < rect.top || event.clientY > rect.bottom) dismiss();
        });
        shadow.querySelector(".cancel").addEventListener("click", dismiss);
        shadow.querySelector(".save").addEventListener("click", () => {
            for (const [key, input] of inputs) GM_setValue(key, input.checked);
            window.location.reload();
        });
        window.addEventListener("pagehide", dismiss, { once: true });
        document.body.appendChild(host);
        dialog.showModal();
    }

    function startWebFullscreenHotkey() {
        let stopped = false;
        let busy = false;
        let lastToggle = -Infinity;

        function stop() {
            stopped = true;
            document.removeEventListener("keydown", onKey, true);
            window.removeEventListener("pagehide", stop);
        }

        async function onKey(event) {
            if (!event.isTrusted || event.defaultPrevented || event.isComposing || event.keyCode === 229
                || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey
                || event.key?.toLowerCase() !== "t" || settingsDialog?.open) return;
            // composedPath 识别 Shadow DOM 内的输入框，避免事件被重定向到宿主后误触发。
            const path = event.composedPath?.() || [event.target];
            if (path.some(node => node?.isContentEditable || node?.closest?.(
                "input, textarea, select, [role='textbox'], dialog, [role='dialog']"
            ))) return;
            if (stopped || document.fullscreenElement) return;
            const player = document.querySelector(isLivePage ? "#live-player" : ".bpx-player-container");
            const video = player?.querySelector("video");
            if (!video || video.readyState < 1 || !player.getClientRects().length) return;
            let button = null;
            if (!isLivePage) {
                if (!["normal", "wide", "web"].includes(player.getAttribute("data-screen"))) return;
                button = player.querySelector(".bpx-player-ctrl-web");
                if (!canClick(button)) return;
            }
            // 在 await 前拦截按键，防止网站的同名快捷键再切换一次。
            event.preventDefault();
            event.stopImmediatePropagation();
            if (event.repeat || busy || Date.now() - lastToggle < 350) return;
            cancelAutoWebMode();
            busy = true;
            try {
                if (isLivePage) button = (await findLiveWebModeButton(player, () => stopped))?.button;
                if (stopped || !canClick(button) || document.fullscreenElement
                    || player.querySelector("video") !== video || video.readyState < 1) return;
                lastToggle = Date.now();
                button.click();
            } finally {
                busy = false;
            }
        }

        function canClick(button) {
            return button?.isConnected && !button.disabled
                && button.getAttribute("aria-disabled") !== "true";
        }

        document.addEventListener("keydown", onKey, true);
        window.addEventListener("pagehide", stop);
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
                .fans-medal-item-ctnr, .fans-medal-item, .group-medal-ctnr,
                .title-label
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

    function startLiveHighestQuality() {
        const deadline = Date.now() + 100000;
        let stopped = false;
        let timer = null;
        let ownedWrap = null;
        let lastOpen = -Infinity;
        let opens = 0;
        let clicks = 0;
        let lastClick = -Infinity;

        function releasePanel() {
            if (ownedWrap?.isConnected && !ownedWrap.matches(":hover")) {
                ownedWrap.dispatchEvent(new MouseEvent("mouseleave"));
            }
            ownedWrap = null;
        }

        function stop() {
            if (stopped) return;
            stopped = true;
            clearInterval(timer);
            document.removeEventListener("click", onManualClick, true);
            window.removeEventListener("pagehide", stop);
            releasePanel();
        }

        function onManualClick(event) {
            if (!event.isTrusted) return;
            const item = event.target?.closest?.(".list-it");
            const wrap = item?.closest("#live-player .quality-wrap");
            if (wrap && !item.querySelector(".video-enhance")
                && !wrap.querySelector(".line-wrap .arrow-icon.left")) stop();
        }

        function attempt() {
            if (stopped) return;
            if (Date.now() >= deadline) { stop(); return; }
            const player = document.querySelector("#live-player");
            const video = player?.querySelector("video");
            const wrap = player?.querySelector(".live-web-player-controller .quality-wrap");
            if (!video || video.readyState < 1 || !wrap || !wrap.getClientRects().length) return;
            if (ownedWrap && ownedWrap !== wrap) releasePanel();
            const panel = wrap.querySelector(":scope > .panel");
            if (!panel) {
                // 官方 hover 有 100ms 延迟，发出 mouseenter 后交给下次检查读取。
                if (opens >= 10 || clicks >= 3) { stop(); return; }
                if (wrap.matches(":hover") || Date.now() - lastOpen < 2000) return;
                ownedWrap = wrap;
                opens++;
                lastOpen = Date.now();
                wrap.dispatchEvent(new MouseEvent("mouseenter"));
                return;
            }
            // 线路子菜单也使用 list-it；不能把线路或画质增强误当成清晰度。
            if (panel.querySelector(".line-wrap .arrow-icon.left")) return;
            const options = [...panel.querySelectorAll(":scope > .list-it")].filter(item => {
                const label = item.textContent.trim();
                return label && !/^自动(?:[（(]|$)/.test(label)
                    && !item.querySelector(".video-enhance") && !item.disabled
                    && !item.classList.contains("disabled")
                    && item.getAttribute("aria-disabled") !== "true";
            });
            // 官方质量列表按 qn 降序排列，只选择实际菜单里的第一项。
            const best = options[0];
            if (!best) return;
            if (best.classList.contains("selected")) { stop(); return; }
            // 官方播放器拒绝未登录用户提升画质；避免反复打开登录提示。
            const uid = document.cookie.match(/(?:^|;\s*)DedeUserID=(\d+)/)?.[1];
            if (!uid || Number(uid) === 0 || clicks >= 3) { stop(); return; }
            if (Date.now() - lastClick < 2000) return;
            if (!best.isConnected) return;
            clicks++;
            lastClick = Date.now();
            best.click();
        }

        document.addEventListener("click", onManualClick, true);
        window.addEventListener("pagehide", stop);
        timer = setInterval(attempt, 500);
        attempt();
    }

    async function findLiveWebModeButton(player, isCancelled) {
        const modeLabel = /^(退出)?网页(?:模式|全屏)(?:\s*\([^)]*\))?$/;
        // 官方播放器右侧的提示文字仅在 mouseenter 后通过 Svelte 渲染。
        // 按文案识别而非 nth-child，避免某个控件缺失时误点其他按钮。
        for (const wrap of player.querySelectorAll(
            ".live-web-player-controller .right-area > .tip-wrap"
        )) {
            if (isCancelled()) return null;
            const wasHovered = wrap.matches(":hover");
            try {
                if (!wrap.querySelector(".tip")) {
                    wrap.dispatchEvent(new MouseEvent("mouseenter"));
                    await Promise.resolve();
                }
                const label = wrap.querySelector(".tip")?.textContent.trim() || "";
                if (!modeLabel.test(label)) continue;
                return { button: wrap.querySelector(".icon"), exiting: label.startsWith("退出") };
            } finally {
                if (!wasHovered && !wrap.matches(":hover")) {
                    wrap.dispatchEvent(new MouseEvent("mouseleave"));
                }
            }
        }
        return null;
    }

    function startLiveWebMode() {
        const deadline = Date.now() + 100000;
        let clicks = 0;
        let lastClick = -Infinity;
        let stopped = false;
        let busy = false;
        let timer = null;
        let readyPlayer = null;
        let readyVideo = null;
        let readySince = null;
        let enteredSince = null;

        function stop() {
            if (stopped) return;
            stopped = true;
            clearInterval(timer);
            document.removeEventListener("click", onManualClick, true);
            document.removeEventListener("keydown", onManualKey, true);
            window.removeEventListener("pagehide", stop);
        }
        cancelAutoWebMode = stop;

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
            if (!document.body?.classList.contains("player-full-win")) return false;
            const container = document.querySelector("#fullscreen-container");
            if (!container || getComputedStyle(container).position !== "fixed") return false;
            const rect = container.getBoundingClientRect();
            return rect.width > 0 && Math.abs(rect.top) <= 3
                && Math.abs(rect.bottom - window.innerHeight) <= 3;
        }

        async function attempt() {
            if (stopped || busy) return;
            if (Date.now() >= deadline || document.fullscreenElement) { stop(); return; }
            // 按钮状态先更新，页面监听和 CSS 后更新，不能仅凭“退出”文案判成功。
            if (alreadyEntered()) {
                enteredSince ??= Date.now();
                if (Date.now() - enteredSince >= 1000) stop();
                return;
            }
            enteredSince = null;
            if (Date.now() - lastClick < 2000) return;
            if (clicks >= 5) { stop(); return; }
            const player = document.querySelector("#live-player");
            const video = player?.querySelector("video");
            if (document.readyState !== "complete" || !video || video.readyState < 1
                || !player.getClientRects().length) {
                readySince = null;
                return;
            }
            // 等待页面及视频就绪后稳定 2 秒，节点重建或视频重新加载重新计时。
            if (readyPlayer !== player || readyVideo !== video || readySince === null) {
                readyPlayer = player;
                readyVideo = video;
                readySince = Date.now();
            }
            if (Date.now() - readySince < 2000) return;
            busy = true;
            try {
                const control = await findLiveWebModeButton(player, () => stopped);
                const button = control?.button;
                if (stopped || !button || !button.isConnected || button.disabled
                    || button.getAttribute("aria-disabled") === "true"
                    || document.readyState !== "complete"
                    || player.querySelector("video") !== readyVideo || readyVideo.readyState < 1) return;
                if (alreadyEntered() || document.fullscreenElement) return;
                clicks++;
                lastClick = Date.now();
                button.click();
                // 空切换：先退出播放器内部模式，等一轮稳定期后重新进入。
                if (control.exiting) readySince = Date.now();
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
        cancelAutoWebMode = stop;

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
