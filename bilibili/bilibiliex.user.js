// ==UserScript==
// @name         B站动态 - 屏蔽悬浮用户资料卡
// @namespace    bilibiliex-simplified
// @version      1.8.0
// @updateURL    https://github.com/wyq81956/douyuEx_simplified/releases/latest/download/bilibiliex.user.js
// @downloadURL  https://github.com/wyq81956/douyuEx_simplified/releases/latest/download/bilibiliex.user.js
// @description  动态页屏蔽资料卡；视频网页全屏右侧同步弹幕池；T键切换网页全屏；直播间自动网页模式和最高画质、隐藏弹幕等级和粉丝牌及特殊称号、隐藏弹幕池顶部。
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
        videoDanmakuPanel: "video.danmakuPanel",
        videoDanmakuWidth: "video.danmakuPanelWidth",
        videoDanmakuFont: "video.danmakuFont",
        videoDanmakuFontSize: "video.danmakuFontSize",
    };
    const DANMAKU_FONTS = {
        system: ["系统默认", 'system-ui, "Microsoft YaHei", sans-serif'],
        yahei: ["微软雅黑", '"Microsoft YaHei", sans-serif'],
        heiti: ["黑体", 'SimHei, sans-serif'],
        songti: ["宋体", 'SimSun, serif'],
        kaiti: ["楷体", 'KaiTi, serif'],
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
    const videoDanmakuPanel = GM_getValue(SETTINGS.videoDanmakuPanel, true);
    const isVideoPage = window.location.hostname === "www.bilibili.com"
        && (window.location.pathname.startsWith("/video/")
            || /^\/list\/watchlater\/?$/.test(window.location.pathname));
    const isLivePage = window.location.hostname === "live.bilibili.com"
        && /^\/(?:blanc\/)?\d+\/?$/.test(window.location.pathname);

    if (window.location.hostname === "t.bilibili.com" && blockProfile) blockUserProfile();
    if (isVideoPage && autoFullscreen) startWebFullscreen();
    if (isVideoPage && videoDanmakuPanel) startVideoDanmakuPanel();
    if (isLivePage) {
        if (liveBadges) hideLiveChatBadges();
        if (liveChatTop) hideLiveChatTop();
        if (liveWebMode) startLiveWebMode();
        if (liveQuality) startLiveHighestQuality();
    }
    if (webFullscreenHotkey && (isVideoPage || isLivePage)) startWebFullscreenHotkey();

    function danmakuAppearance() {
        const font = GM_getValue(SETTINGS.videoDanmakuFont, "system");
        const size = GM_getValue(SETTINGS.videoDanmakuFontSize, 14);
        return {
            font: Object.hasOwn(DANMAKU_FONTS, font) ? font : "system",
            size: typeof size === "number" && Number.isFinite(size) ? Math.max(12, Math.min(32, Math.round(size))) : 14,
        };
    }

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
                input[type="checkbox"] {
                    appearance: none; flex: 0 0 38px; width: 38px; height: 22px;
                    margin: 0; border: 0; border-radius: 12px; background: #c6cbd0;
                    position: relative; cursor: pointer;
                }
                input[type="checkbox"]::after {
                    content: ''; position: absolute; width: 16px; height: 16px;
                    top: 3px; left: 3px; border-radius: 50%; background: #fff;
                }
                input[type="checkbox"]:checked { background: #e84b83; }
                input[type="checkbox"]:checked::after { left: 19px; }
                select { max-width: 160px; padding: 5px 8px; border: 1px solid #d9dde1;
                    border-radius: 6px; background: #fff; color: #202124; font: inherit; }
                .font-preview { padding: 12px 0; color: #202124; line-height: 1.65; overflow-wrap: anywhere; }
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
                        <p id="settings-description">调整后点击“保存并刷新”生效。</p>
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
            ["视频右侧弹幕池", SETTINGS.videoDanmakuPanel, "网页全屏时随进度滚动，保留画面飘屏弹幕"],
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
        const appearance = danmakuAppearance();
        function appearanceSelect(label, choices, value) {
            const row = document.createElement("label");
            row.className = "option";
            const name = document.createElement("span");
            name.className = "name";
            name.textContent = label;
            const select = document.createElement("select");
            select.setAttribute("aria-label", label);
            for (const [id, text] of choices) {
                const option = document.createElement("option");
                option.value = id;
                option.textContent = text;
                select.appendChild(option);
            }
            select.value = String(value);
            row.append(name, select);
            list.appendChild(row);
            return select;
        }
        const fontSelect = appearanceSelect("视频弹幕池字体",
            Object.entries(DANMAKU_FONTS).map(([id, [label]]) => [id, label]), appearance.font);
        const sizeSelect = appearanceSelect("视频弹幕池字号",
            Array.from({ length: 21 }, (_, i) => [String(i + 12), `${i + 12}px`]), appearance.size);
        const preview = document.createElement("p");
        preview.className = "font-preview";
        preview.textContent = "弹幕预览：这是一条视频弹幕 ABC 123";
        function updatePreview() {
            preview.style.fontFamily = DANMAKU_FONTS[fontSelect.value][1];
            preview.style.fontSize = `${sizeSelect.value}px`;
        }
        fontSelect.addEventListener("change", updatePreview);
        sizeSelect.addEventListener("change", updatePreview);
        updatePreview();
        list.appendChild(preview);
        const fontHint = document.createElement("p");
        fontHint.textContent = "仅调整视频右侧弹幕池正文；字体未安装时使用系统替代字体。";
        list.appendChild(fontHint);
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
            GM_setValue(SETTINGS.videoDanmakuFont, fontSelect.value);
            GM_setValue(SETTINGS.videoDanmakuFontSize, Number(sizeSelect.value));
            window.location.reload();
        });
        window.addEventListener("pagehide", dismiss, { once: true });
        document.body.appendChild(host);
        dialog.showModal();
    }

    function readDanmakuSegment(buffer) {
        const bytes = new Uint8Array(buffer);
        const decoder = new TextDecoder();
        let cursor = 0;
        function integer(end) {
            let value = 0;
            for (let shift = 0; shift < 70 && cursor < end; shift += 7) {
                const byte = bytes[cursor++];
                value += (byte & 127) * 2 ** shift;
                if (!(byte & 128)) return value;
            }
            throw new Error("Invalid danmaku varint");
        }
        function field(end) {
            const tag = integer(end), type = tag % 8;
            if (!tag) throw new Error("Invalid danmaku tag");
            if (type === 0) return { id: Math.floor(tag / 8), value: integer(end) };
            const length = type === 2 ? integer(end) : type === 1 ? 8 : type === 5 ? 4 : -1;
            if (length < 0 || !Number.isSafeInteger(length) || cursor + length > end) {
                throw new Error("Invalid danmaku field");
            }
            const start = cursor;
            cursor += length;
            return { id: Math.floor(tag / 8), start, end: cursor, type };
        }
        const result = [];
        while (cursor < bytes.length) {
            const outer = field(bytes.length);
            if (outer.id !== 1 || outer.type !== 2) continue;
            cursor = outer.start;
            let time = 0, mode = 0, text = "";
            while (cursor < outer.end) {
                const item = field(outer.end);
                if (item.id === 2 && item.value !== undefined) time = item.value / 1000;
                if (item.id === 3 && item.value !== undefined) mode = item.value;
                if (item.id === 7 && item.type === 2) text = decoder.decode(bytes.subarray(item.start, item.end));
            }
            // 只显示普通滚动/顶部/底部弹幕，不把高级弹幕的脚本或 JSON 当成正文。
            if (Number.isFinite(time) && time >= 0 && mode >= 1 && mode <= 6 && text.trim()) {
                result.push({ time, text });
            }
        }
        return result.sort((a, b) => a.time - b.time);
    }

    function danmakuBetween(segments, after, until, limit = 250) {
        const result = [];
        function upperBound(items, time) {
            let low = 0, high = items.length;
            while (low < high) {
                const middle = (low + high) >>> 1;
                if (items[middle].time <= time) low = middle + 1;
                else high = middle;
            }
            return low;
        }
        for (const items of segments) {
            const end = upperBound(items, until);
            const start = Math.max(upperBound(items, after), end - limit);
            result.push(...items.slice(start, end));
        }
        return result.sort((a, b) => a.time - b.time).slice(-limit);
    }

    function danmakuPanelWidth(viewport, preferred) {
        const maximum = Math.max(240, Math.min(600, viewport - 640));
        const wanted = typeof preferred === "number" && Number.isFinite(preferred)
            ? preferred : Math.max(260, Math.min(360, viewport * 0.24));
        return Math.round(Math.max(240, Math.min(maximum, wanted)));
    }

    function startVideoDanmakuPanel() {
        const SEGMENT_SECONDS = 360, HISTORY_SECONDS = 60, MAX_ROWS = 250;
        let stopped = false, player = null, video = null, host = null, shadow = null;
        let session = null, lastTime = null, following = true;
        let preferredWidth = GM_getValue(SETTINGS.videoDanmakuWidth, null), resizeDrag = null;
        const WIDTH_VAR = "--bilibiliex-danmaku-width";
        GM_addStyle(`
            .bpx-player-container[data-screen="web"][data-bilibiliex-chat] {
                /* 原生网页全屏固定的是外层，内层仍是 relative，right 会把视频左移。 */
                position: fixed !important;
                left: 0 !important;
                top: 0 !important;
                right: auto !important;
                bottom: auto !important;
                width: calc(100vw - var(--bilibiliex-danmaku-width, clamp(260px, 24vw, 360px))) !important;
                height: 100dvh !important;
                min-width: 0 !important;
                max-width: none !important;
                max-height: none !important;
                margin: 0 !important;
                box-sizing: border-box !important;
            }
            html[data-bilibiliex-danmaku-resizing], html[data-bilibiliex-danmaku-resizing] * {
                cursor: col-resize !important;
                user-select: none !important;
            }
        `);

        function videoKey() {
            const url = new URL(window.location.href);
            if (url.hostname !== "www.bilibili.com") return null;
            const match = url.pathname.match(/^\/video\/(BV[\da-z]+|av\d+)\/?$/i);
            const id = match?.[1] || (/^\/list\/watchlater\/?$/.test(url.pathname) ? url.searchParams.get("bvid") : null);
            if (!id || !/^(?:BV[\da-z]+|av\d+)$/i.test(id)) return null;
            const part = Math.max(1, Math.trunc(Number(url.searchParams.get("p")) || 1));
            return { id, part, key: `${id}:${part}` };
        }

        function updateWidth() {
            const width = danmakuPanelWidth(window.innerWidth, resizeDrag?.value ?? preferredWidth);
            player?.style.setProperty(WIDTH_VAR, `${width}px`);
            host?.style.setProperty(WIDTH_VAR, `${width}px`);
            const handle = shadow?.querySelector(".resize-handle");
            if (handle) {
                handle.setAttribute("aria-valuemin", "240");
                handle.setAttribute("aria-valuemax", String(danmakuPanelWidth(window.innerWidth, 600)));
                handle.setAttribute("aria-valuenow", String(width));
                handle.setAttribute("aria-valuetext", `${width} 像素`);
            }
        }

        function endResize(commit = false) {
            if (!resizeDrag) return;
            const drag = resizeDrag;
            resizeDrag = null;
            const handle = shadow?.querySelector(".resize-handle");
            handle?.removeAttribute("data-dragging");
            document.documentElement.removeAttribute("data-bilibiliex-danmaku-resizing");
            if (handle?.hasPointerCapture(drag.id)) handle.releasePointerCapture(drag.id);
            if (commit) {
                preferredWidth = danmakuPanelWidth(window.innerWidth, drag.value);
                GM_setValue(SETTINGS.videoDanmakuWidth, preferredWidth);
            }
            updateWidth();
        }

        function cancelResize() { endResize(false); }
        function resetWidth() {
            cancelResize();
            preferredWidth = null;
            GM_setValue(SETTINGS.videoDanmakuWidth, null);
            updateWidth();
        }

        function bindResize() {
            const handle = shadow.querySelector(".resize-handle");
            handle.addEventListener("pointerdown", event => {
                if (event.button !== 0 || !event.isPrimary || resizeDrag || host.hidden) return;
                event.preventDefault();
                event.stopPropagation();
                handle.focus({ preventScroll: true });
                const width = host.getBoundingClientRect().width;
                resizeDrag = { id: event.pointerId, x: event.clientX, width, value: width };
                handle.setAttribute("data-dragging", "");
                document.documentElement.setAttribute("data-bilibiliex-danmaku-resizing", "");
                handle.setPointerCapture(event.pointerId);
            });
            handle.addEventListener("pointermove", event => {
                if (resizeDrag?.id !== event.pointerId) return;
                resizeDrag.value = danmakuPanelWidth(window.innerWidth, resizeDrag.width + resizeDrag.x - event.clientX);
                updateWidth();
            });
            handle.addEventListener("pointerup", event => {
                if (resizeDrag?.id === event.pointerId) endResize(true);
            });
            for (const type of ["pointercancel", "lostpointercapture"]) {
                handle.addEventListener(type, event => {
                    if (resizeDrag?.id === event.pointerId) cancelResize();
                });
            }
            handle.addEventListener("dblclick", resetWidth);
            handle.addEventListener("keydown", event => {
                if (event.ctrlKey || event.metaKey || event.altKey) return;
                if (!["ArrowLeft", "ArrowRight", "Home", "Escape"].includes(event.key)) return;
                event.preventDefault();
                event.stopPropagation();
                if (event.key === "Escape") { cancelResize(); return; }
                if (event.key === "Home") { resetWidth(); return; }
                cancelResize();
                const step = (event.shiftKey ? 50 : 10) * (event.key === "ArrowLeft" ? 1 : -1);
                preferredWidth = danmakuPanelWidth(window.innerWidth, host.getBoundingClientRect().width + step);
                GM_setValue(SETTINGS.videoDanmakuWidth, preferredWidth);
                updateWidth();
            });
        }

        function createPanel() {
            host = document.createElement("div");
            host.id = "bilibiliex-danmaku-host";
            host.hidden = true;
            const appearance = danmakuAppearance();
            host.style.setProperty("--bilibiliex-danmaku-font", DANMAKU_FONTS[appearance.font][1]);
            host.style.setProperty("--bilibiliex-danmaku-font-size", `${appearance.size}px`);
            shadow = host.attachShadow({ mode: "open" });
            shadow.innerHTML = `
                <style>
                    :host { all: initial; position: fixed !important; top: 0; right: 0;
                        width: var(--bilibiliex-danmaku-width, clamp(260px, 24vw, 360px)); height: 100dvh; z-index: 100001;
                        background: #18191c; color: #d5d8df; font: 14px/1.65 system-ui,"Microsoft YaHei",sans-serif;
                        color-scheme: dark; display: block; }
                    :host([hidden]) { display: none !important; }
                    * { box-sizing: border-box; }
                    .panel { display: flex; flex-direction: column; height: 100%; border-left: 1px solid #30323a; }
                    .resize-handle { position: absolute; top: 0; bottom: 0; left: -5px; width: 10px;
                        cursor: col-resize; touch-action: none; outline-offset: -2px; z-index: 1; }
                    .resize-handle::after { content: ''; position: absolute; left: 4px; top: 0; bottom: 0;
                        width: 2px; background: #34363e; }
                    .resize-handle:hover::after, .resize-handle:focus-visible::after,
                    .resize-handle[data-dragging]::after { background: #e84b83; }
                    header { display: flex; align-items: center; justify-content: space-between;
                        gap: 8px; padding: 4px 8px; border-bottom: 1px solid #30323a; flex-shrink: 0; background: #202126; }
                    h2 { margin: 0; font-size: 14px; font-weight: 650; }
                    button { font: inherit; cursor: pointer; border: 1px solid #3b3d46;
                        border-radius: 6px; background: #27282e; color: #d5d8df; padding: 1px 6px; font-size: 12px; }
                    button:hover { background: #34363e; }
                    button:focus-visible { outline: 2px solid #e84b83; outline-offset: 2px; }
                    .scroll { flex: 1 1 0; min-height: 0; overflow: auto; overscroll-behavior: contain; padding: 6px 8px;
                        scrollbar-width: none; font-family: var(--bilibiliex-danmaku-font, system-ui, sans-serif);
                        font-size: var(--bilibiliex-danmaku-font-size, 14px); }
                    .scroll::-webkit-scrollbar { display: none; width: 0; height: 0; }
                    .empty { padding: 24px 4px; text-align: center; color: #959aa5; font-size: 13px; }
                    ol { list-style: none; padding: 0; margin: 0; }
                    li { padding: 3.5px 0; overflow-wrap: anywhere; }
                    .latest { margin: 6px 8px; padding: 4px; flex-shrink: 0; color: #e84b83; }
                    [hidden] { display: none !important; }
                </style>
                <div class="resize-handle" role="separator" tabindex="0" aria-orientation="vertical"
                    aria-label="调整弹幕池宽度" title="拖动调整宽度；双击或 Home 恢复默认；左右方向键微调"></div>
                <section class="panel" aria-label="右侧同步弹幕池">
                    <header><h2 title="独立读取普通弹幕，不继承播放器的智能屏蔽和屏蔽词">同步弹幕</h2>
                        <button class="retry" type="button">重载</button></header>
                    <div class="scroll" tabindex="0" aria-label="弹幕滚动区域"><div class="empty" role="status">正在读取弹幕…</div>
                        <ol aria-label="已播放的弹幕" aria-live="off"></ol></div>
                    <button class="latest" type="button" hidden>回到最新弹幕</button>
                </section>`;
            shadow.querySelector(".scroll").addEventListener("scroll", () => {
                const box = shadow.querySelector(".scroll");
                following = box.scrollHeight - box.scrollTop - box.clientHeight < 40;
                shadow.querySelector(".latest").hidden = following;
            }, { passive: true });
            shadow.querySelector(".latest").addEventListener("click", () => {
                following = true;
                render(true);
                followLatest();
            });
            shadow.querySelector(".retry").addEventListener("click", () => {
                session?.controller.abort();
                session = null;
                monitor();
            });
            document.body.appendChild(host);
            bindResize();
            updateWidth();
        }

        function followLatest() {
            if (!following || !shadow) return;
            const box = shadow.querySelector(".scroll");
            box.scrollTop = box.scrollHeight;
            shadow.querySelector(".latest").hidden = true;
        }

        function emptyMessage(text) {
            if (!shadow) return;
            const empty = shadow.querySelector(".empty");
            empty.textContent = text;
            empty.hidden = !!shadow.querySelector("ol").children.length;
        }

        async function request(url, kind, current) {
            const controller = new AbortController();
            const abort = () => controller.abort();
            current.controller.signal.addEventListener("abort", abort, { once: true });
            const timeout = setTimeout(abort, 15000);
            try {
                if (current.controller.signal.aborted) controller.abort();
                const response = await fetch(url, { credentials: "include", signal: controller.signal });
                if (!response.ok) throw new Error("Danmaku request failed");
                if (kind === "json") return await response.json();
                if ((response.headers.get("content-type") || "").includes("json")) throw new Error("Danmaku unavailable");
                return await response.arrayBuffer();
            } finally {
                clearTimeout(timeout);
                current.controller.signal.removeEventListener("abort", abort);
            }
        }

        function loadSegment(index, current) {
            if (index < 1 || (current.duration && (index - 1) * SEGMENT_SECONDS >= current.duration)) return;
            if (current.segments.has(index) || current.pending >= 3) return;
            const entry = { data: null, failed: false };
            current.segments.set(index, entry);
            current.pending++;
            const url = `https://api.bilibili.com/x/v2/dm/web/seg.so?type=1&oid=${current.cid}&segment_index=${index}`;
            void request(url, "buffer", current).then(buffer => {
                if (session !== current || stopped) return;
                entry.data = readDanmakuSegment(buffer);
                const at = Math.floor((video?.currentTime || 0) / SEGMENT_SECONDS) + 1;
                // 预取的未来段不重建列表，避免用户翻看历史时发生跳动。
                if (index === at || index === at - 1) render(following);
            }).catch(() => {
                if (session !== current || stopped) return;
                entry.failed = true;
                render(false);
            }).finally(() => { current.pending--; });
        }

        async function loadVideo(route) {
            const current = { ...route, controller: new AbortController(), segments: new Map(), cid: null, duration: 0, failed: false, pending: 0 };
            session?.controller.abort();
            session = current;
            lastTime = null;
            following = true;
            shadow.querySelector("ol").replaceChildren();
            emptyMessage("正在读取弹幕…");
            try {
                const query = /^av/i.test(route.id) ? `aid=${route.id.slice(2)}` : `bvid=${route.id}`;
                const result = await request(`https://api.bilibili.com/x/web-interface/view?${query}`, "json", current);
                if (stopped || session !== current) return;
                if (result.code !== 0) throw new Error("Video metadata unavailable");
                const part = result.data?.pages?.find(item => item.page === route.part);
                if (!part || !/^\d+$/.test(String(part.cid)) || Number(part.cid) <= 0) throw new Error("Video part unavailable");
                current.cid = part.cid;
                current.duration = Number(part.duration) || 0;
                render(true);
            } catch {
                if (!stopped && session === current) {
                    current.failed = true;
                    emptyMessage("弹幕暂时无法加载，点击右上角重载");
                }
            }
        }

        function render(rebuild = false) {
            if (stopped || document.visibilityState === "hidden" || !host || host.hidden || !video || !session?.cid) return;
            if (videoKey()?.key !== session.key) return;
            const time = Math.max(0, video.currentTime || 0), current = session;
            const index = Math.floor(time / SEGMENT_SECONDS) + 1;
            loadSegment(index, current);
            if (time % SEGMENT_SECONDS < HISTORY_SECONDS) loadSegment(index - 1, current);
            // 接近分段末尾时预取下一段，跳转时直接请求目标段，不逐段追赶。
            if (time % SEGMENT_SECONDS > SEGMENT_SECONDS - 30) loadSegment(index + 1, current);
            for (const key of current.segments.keys()) if (Math.abs(key - index) > 2) current.segments.delete(key);
            rebuild ||= lastTime === null || time < lastTime || time - lastTime > 2;
            const after = rebuild ? Math.max(-1, time - HISTORY_SECONDS) : lastTime;
            const messages = danmakuBetween([...current.segments.values()].map(entry => entry.data || []), after, time, MAX_ROWS);
            const list = shadow.querySelector("ol");
            if (rebuild) list.replaceChildren();
            const fragment = document.createDocumentFragment();
            for (const item of messages) {
                const row = document.createElement("li"), text = document.createElement("span");
                text.textContent = item.text;
                row.append(text);
                fragment.appendChild(row);
            }
            list.appendChild(fragment);
            while (list.children.length > MAX_ROWS) list.firstElementChild.remove();
            lastTime = time;
            const segment = current.segments.get(index);
            emptyMessage(segment?.failed ? "弹幕暂时无法加载，点击右上角重载" : segment?.data
                ? "当前进度暂无弹幕，播放后将随进度显示" : "正在读取弹幕…");
            followLatest();
        }

        function onProgress() { render(false); }
        function onSeek() { following = true; render(true); }
        function detach() {
            cancelResize();
            player?.removeAttribute("data-bilibiliex-chat");
            player?.style.removeProperty(WIDTH_VAR);
            for (const type of ["timeupdate", "seeking", "seeked", "loadedmetadata", "emptied"]) {
                video?.removeEventListener(type, type === "timeupdate" ? onProgress : onSeek);
            }
            video = null;
            player = null;
        }

        function monitor() {
            if (stopped || !document.body) return;
            if (document.visibilityState === "hidden") { cancelResize(); return; }
            const nextPlayer = document.querySelector(".bpx-player-container"), nextVideo = nextPlayer?.querySelector("video");
            if (player !== nextPlayer || video !== nextVideo) {
                detach();
                player = nextPlayer;
                video = nextVideo;
                for (const type of ["timeupdate", "seeking", "seeked", "loadedmetadata", "emptied"]) {
                    video?.addEventListener(type, type === "timeupdate" ? onProgress : onSeek);
                }
                lastTime = null;
            }
            const route = videoKey();
            const active = !!(route && video && player?.getAttribute("data-screen") === "web"
                && !document.fullscreenElement && window.innerWidth >= 900);
            if (!host && active) createPanel();
            if (host) host.hidden = !active;
            if (active) {
                updateWidth();
                player.setAttribute("data-bilibiliex-chat", "");
                if (session?.key !== route.key) void loadVideo(route);
                else render(false);
            } else {
                cancelResize();
                player?.removeAttribute("data-bilibiliex-chat");
                player?.style.removeProperty(WIDTH_VAR);
                if (!route || (session && route.key !== session.key)) {
                    session?.controller.abort();
                    session = null;
                }
            }
        }

        function stop() {
            stopped = true;
            clearInterval(timer);
            session?.controller.abort();
            detach();
            host?.remove();
            document.removeEventListener("visibilitychange", monitor);
            window.removeEventListener("resize", monitor);
            window.removeEventListener("blur", cancelResize);
            window.removeEventListener("pagehide", stop);
        }
        const timer = setInterval(monitor, 500);
        document.addEventListener("visibilitychange", monitor);
        window.addEventListener("resize", monitor);
        window.addEventListener("blur", cancelResize);
        window.addEventListener("pagehide", stop);
        monitor();
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
