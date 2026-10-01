// ==UserScript==
// @name         DouyuEx 精简版 - 播放器与简洁模式
// @namespace    douyuex-simplified
// @version      1.5.4
// @description  自动网页全屏、最高画质、简洁模式；屏蔽刀塔助手、拖动调整弹幕池、滚轮调音量、下播不跳转、关注页过滤。
// @author       原始功能：小淳；精简版：本地维护
// @match        *://www.douyu.com/*
// @run-at       document-end
// @noframes
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// ==/UserScript==

// 提取自 qianjiachun/douyuEx：
// src/packages/ExpandTool/ExpandTool_FullScreen.js
// src/packages/Refresh/Refresh_{Video,BarrageFrame,Barrage}.js
// src/packages/Shield/Remove{Enter,DanmakuBackground}.js
// src/packages/RemoveAD/RemoveAD.js
// src/packages/VolumeMouseScrolling/VolumeMouseScrolling.{js,css}
// src/packages/DisableCloseJump/DisableCloseJump.js
// 保留原版按钮选择逻辑；独立设置、有限重试，不依赖原版面板。
(function () {
    "use strict";

    const SETTINGS = {
        fullscreen: "autoPlayer.fullscreen",
        quality: "autoPlayer.highestQuality",
        simpleMode: "simpleMode.enabled",
        blockDotaHelper: "dotaHelper.blocked",
        resizeBarrage: "barrageResize.enabled",
        barrageWidth: "barrageResize.width",
        volumeWheel: "player.volumeWheel",
        noCloseJump: "player.noCloseJump",
        followFilter: "followPage.filter",
    };
    const RETRY_INTERVAL = 1000;
    const MAX_ATTEMPTS = 100;

    let settingsDialog = null;
    let resetBarrageWidth = () => GM_setValue(SETTINGS.barrageWidth, null);
    GM_registerMenuCommand("DouyuEx 设置", openSettings);
    if (GM_getValue(SETTINGS.followFilter, true) && isFollowPage()) startFollowFilter();
    if (GM_getValue(SETTINGS.resizeBarrage, true)) resetBarrageWidth = startBarrageResize();
    if (GM_getValue(SETTINGS.volumeWheel, true)) startVolumeWheel();
    if (GM_getValue(SETTINGS.noCloseJump, true)) startNoCloseJump();

    if (GM_getValue(SETTINGS.blockDotaHelper, true)) {
        waitForPlayerAction(blockDotaHelper);
    }

    // 合并后的开关默认开启，旧版六个分项设置不再参与判断。
    if (GM_getValue(SETTINGS.simpleMode, true)) {
        waitForPlayerAction(applySimpleMode);
    }

    // 同时支持数字房间号、房间别名和专题页；由播放器节点确认直播间。
    if (GM_getValue(SETTINGS.fullscreen, true)) {
        waitForPlayerAction(enterWebFullscreen);
    }
    if (GM_getValue(SETTINGS.quality, true)) {
        startHighestQuality();
    }

    function openSettings() {
        if (settingsDialog?.open) { settingsDialog.focus(); return; }
        // 按需创建，Shadow DOM 隔离网站样式；原生 dialog 负责置顶、焦点和 Esc。
        const host = document.createElement("div");
        host.id = "douyuex-settings-host";
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
                input:checked { background: #e95018; }
                input:checked::after { left: 19px; }
                :focus-visible { outline: 2px solid #d7440d; outline-offset: 3px; }
                .tools { padding: 14px 24px 0; flex-shrink: 0; }
                .reset { color: #b43d12; background: transparent; border: 0; padding: 0; }
                .status { min-height: 20px; margin-top: 4px; }
                footer {
                    display: flex; justify-content: flex-end; gap: 10px;
                    padding: 12px 24px 20px; flex-shrink: 0;
                }
                button { font: inherit; cursor: pointer; border-radius: 8px; padding: 8px 14px; }
                .cancel { border: 1px solid #d9dde1; color: #40454a; background: #fff; }
                .save { border: 1px solid #e95018; color: #fff; background: #e95018; }
            </style>
            <dialog aria-labelledby="settings-title" aria-describedby="settings-description">
                <div class="panel">
                    <header>
                        <h2 id="settings-title">DouyuEx 设置</h2>
                        <p id="settings-description">调整后点击“保存并刷新”，使开关生效。</p>
                    </header>
                    <div class="options"></div>
                    <div class="tools">
                        <button type="button" class="reset">恢复弹幕池默认宽度</button>
                        <p class="status" role="status" aria-live="polite"></p>
                    </div>
                    <footer>
                        <button type="button" class="cancel">取消</button>
                        <button type="button" class="save">保存并刷新</button>
                    </footer>
                </div>
            </dialog>
        `;
        const options = [
            ["自动网页全屏", SETTINGS.fullscreen, "进入直播间时铺满网页区域"],
            ["自动最高画质", SETTINGS.quality, "自动选择画质列表第一项"],
            ["简洁模式", SETTINGS.simpleMode, "隐藏礼物、广告与弹幕装饰"],
            ["屏蔽刀塔助手", SETTINGS.blockDotaHelper, "隐藏技能、物品的悬停描述"],
            ["拖动调整弹幕池", SETTINGS.resizeBarrage, "拖动分隔线，松手保存宽度"],
            ["滚轮调音量", SETTINGS.volumeWheel, "音量控件上滚动，每次增减 5%"],
            ["下播不跳转", SETTINGS.noCloseJump, "关闭下播推荐弹窗，留在当前房间"],
            ["关注页过滤", SETTINGS.followFilter, "隐藏顶部横幅及上次直播、预告、轮播卡片"],
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
        const status = shadow.querySelector(".status");
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
        shadow.querySelector(".reset").addEventListener("click", () => {
            resetBarrageWidth();
            status.textContent = "弹幕池宽度已恢复；开关仍需保存。";
        });
        shadow.querySelector(".save").addEventListener("click", () => {
            for (const [key, input] of inputs) GM_setValue(key, input.checked);
            window.location.reload();
        });
        window.addEventListener("pagehide", dismiss, { once: true });
        document.body.appendChild(host);
        dialog.showModal();
    }

    function isFollowPage() {
        return /^\/directory\/myFollow\/?$/.test(window.location?.pathname || "");
    }

    function startFollowFilter() {
        const cardSelector = "div.layout-Cover-card";
        const hiddenAttribute = "data-douyuex-follow-hidden";
        const style = document.createElement("style");
        style.id = "douyuex-follow-filter-style";
        style.textContent = `
            .layout-Banner,
            ${cardSelector}[${hiddenAttribute}] { display: none !important; }
        `;
        document.head.appendChild(style);
        let pending = null;

        function filterCards() {
            pending = null;
            if (!isFollowPage()) { stop(); return; }
            for (const card of document.querySelectorAll(cardSelector)) {
                // 对应用户原来的三条 Adblock 扩展规则，按指定的 p/span 匹配。
                // 不读取整张卡片文字，也不尝试通过接口推测主播状态。
                const offline = Array.from(card.querySelectorAll("p"))
                    .some(p => /上次直播|预告/.test(p.textContent));
                const replay = Array.from(card.querySelectorAll("span"))
                    .some(span => span.textContent.includes("轮播"));
                // 网站复用卡片、将状态改为直播时，撤销本脚本的隐藏标记。
                card.toggleAttribute(hiddenAttribute, offline || replay);
            }
        }

        const observer = new MutationObserver(() => {
            // 合并异步加载、翻页与状态文字更新；不观察自己的隐藏属性。
            if (pending === null) pending = setTimeout(filterCards, 100);
        });
        function stop() {
            observer.disconnect();
            if (pending !== null) clearTimeout(pending);
            document.querySelectorAll(`[${hiddenAttribute}]`)
                .forEach(card => card.removeAttribute(hiddenAttribute));
            style.remove();
            window.removeEventListener("pagehide", stop);
            window.removeEventListener("popstate", onRouteChange);
        }
        function onRouteChange() { if (!isFollowPage()) stop(); }
        observer.observe(document.body, {
            childList: true, subtree: true, characterData: true,
            attributes: true, attributeFilter: ["class"],
        });
        window.addEventListener("pagehide", stop, { once: true });
        window.addEventListener("popstate", onRouteChange);
        filterCards();
    }

    function waitForPlayerAction(action) {
        let attempts = 0;
        const timer = setInterval(() => {
            attempts++;
            if (document.querySelector(".layout-Player-videoEntity video") && action()) {
                clearInterval(timer);
                return;
            }
            if (attempts >= MAX_ATTEMPTS) clearInterval(timer);
        }, RETRY_INTERVAL);
        window.addEventListener("pagehide", () => clearInterval(timer), { once: true });
    }

    function enterWebFullscreen() {
        const originalButton = document.querySelector("div.wfs-2a8e83");
        const buttons = document.querySelectorAll(".icon-c8be96");
        const button = originalButton || (buttons.length >= 2 ? buttons[buttons.length - 2] : null);
        if (!button) return false;

        // 已经网页全屏时避免再次点击而退出。
        const description = [button.title, button.getAttribute("aria-label"), button.getAttribute("data-title"), button.textContent].filter(Boolean).join(" ");
        if (!/退出.*(网页|页面)全屏/.test(description)) button.click();
        return true;
    }

    function blockDotaHelper() {
        if (document.getElementById("douyuex-block-dota-helper-style")) return true;
        const style = document.createElement("style");
        style.id = "douyuex-block-dota-helper-style";
        // 9999 直播间 DOM 与播放器 gameHotArea/GameTips.js 核对的专用类名。
        // 隐藏整个技能/物品热区，避免鼠标进入后触发弹窗；CSS 覆盖后续重建。
        // 不隐藏播放器外壳、控制栏、DotaFirstPerson 或 Dota2AnchorGameData。
        style.textContent = `
            .tooltips-385829,
            .herosTooltips-16138a,
            .herosTooltipsPopover-93e2e9,
            .Dota2TipsDialog,
            .InteractItem[dataid="Dota2NewEntrance"] {
                display: none !important;
                pointer-events: none !important;
            }
        `;
        document.head.appendChild(style);
        return true;
    }

    function applySimpleMode() {
        // 持续生效的 CSS 同样覆盖稍后出现或被网站重建的节点。
        // 不覆写网站的 inline style/className，关闭并刷新即可恢复布局。
        if (document.getElementById("douyuex-simple-mode-style")) return true;
        const rules = [];
        rules.push(`
            .PlayerToolbar-ContentRow { visibility: hidden !important; }
            .layout-Player-video, .stream__T55I3 {
                bottom: 0 !important;
                z-index: 25 !important;
            }
            #js-player-toolbar { z-index: 30 !important; }
            /* 网页全屏时按原版降低礼物工具栏层级，保留视频控制栏。 */
            html:has(.wfs-2a8e83.removed-9d4c42, .toggle__P8TKM) #js-player-toolbar {
                z-index: 20 !important;
            }
            .live-next-body :has(> #js-player-toolbar) { z-index: 20 !important; }
            .case__f4yex { bottom: 0 !important; }
            html:has(:fullscreen) .case__f4yex,
            html:has(.wfs-2a8e83.removed-9d4c42, .toggle__P8TKM):has(.shrink__Sd0uK) .case__f4yex {
                bottom: -84px !important;
            }
            .PELact, .pushTower-wrapper-gf1HG, .PkView-9f6a2c, .MorePk,
            .RandomPKBar, .LiveRoomLoopVideo, .LiveRoomDianzan, .maiMaitView-68e80c, .PkView {
                display: none !important;
            }
        `);
        rules.push(`
            .layout-Player-rank, #js-room-activity { display: none !important; }
            .layout-Player-chat .Barrage { top: 0 !important; }
        `);
        // 将徽章选择器收窄到弹幕列表，隐藏用户等级图标，保留昵称和正文。
        rules.push(`
            .Barrage-listItem :is(
                .UserCsgoGameDataMedal, .Barrage-honor, .Barrage-icon, .js-user-level.UserLevel,
                .FansMedal.is-made, .RoomLevel, .Motor, .ChatAchievement,
                .Barrage-hiIcon, .Medal, .MatchSystemTeamMedal, .Baby, .FansMedalWrap
            ) { display: none !important; }
        `);
        // 原版开关设置 CSS 变量，实际隐藏规则却放在 RemoveAD 中。
        // 简洁模式直接隐藏进场信息区，无需原版模块之间的依赖。
        rules.push(`
            #js-barrage-extend-container {
                --enter-display: none !important;
                display: none !important;
            }
        `);
        // 沿用原版飘屏弹幕装饰选择器，不隐藏整条弹幕。
        rules.push(`
            .danmuItem-a8616a,
            .danmuItem-a8616a div,
            .super-text-f60bfa,
            .danmuItem-a8616a .noble-d35c82,
            .customBarrage,
            .customBarrage > div { background: none !important; }
            .danmuItem-a8616a > img,
            .danmuItem-a8616a div > img,
            .PlayerCustomBarrage-prefixPlugin--text { display: none !important; }
            .customBarrage { text-shadow: none !important; }
        `);
        // 提取原版的广告/推广隐藏规则，与其他简洁效果统一启用。
        // 不携带原版修改登录提示、分享入口、滚动条等无关样式。
        rules.push(`
            .ScreenBannerAd, .XinghaiAd, .CustomGroupGuide, .FudaiGiftToolBarTips,
            .UserInfo-tryEnterHiddenLead, .BargainingKit, .AnchorPocketTips,
            .FishShopTip, .FollowGuide, .FollowGuide-FadeOut,
            #js-bottom-right-cloudGame, .CloudGameLink, .Search-ad,
            .RedEnvelopAd, .noHandlerAd-0566b9, .PcDiversion,
            .DropMenuList-ad, .DropPane-ad, .WXTipsBox, .VideoAboveVivoAd,
            .GameLauncher, .recommendAD-54569e, .recommendApp-0e23eb,
            .Title-ad, .Bottom-ad, .SignBarrage, .corner-ad-495ade,
            .SignBaseComponent-sign-ad, .SuperFansBubble, .PlayerToolbar-signCont,
            .HeaderGif-right, .HeaderGif-left, .BattleShipTips,
            .TurntableLottery-actTips, .PlayerToolbar-couponInfo,
            .AroundStarsActTips-actTips, .AroundStarsMoonBoxTips, .AroundStarsPlanetTips,
            .InteractPlayWithEnter-enterTips1, .IconCardAdCard, .IconCardAd,
            .CloseVideoPlayerAd, .IconCardAdBoundsBox, .room-top-banner-box,
            .LadderNav, #js-bottom-right-recommendAd, .aside-top-uspension-box,
            .werbungContainer__2sv7h, #js-player-asideTopSuspension,
            .Search-Panel-Advert, .DiamondThanksgivingPushGameDialog,
            .RechangeJulyPopups { display: none !important; }
            /* 填补弹幕区顶部广告隐藏后的空位。 */
            #js-player-asideMain { top: 0 !important; }
        `);
        const style = document.createElement("style");
        style.id = "douyuex-simple-mode-style";
        style.textContent = rules.join("\n");
        document.head.appendChild(style);
        // 与原版一致，通知播放器在礼物栏隐藏后重新计算尺寸。
        window.dispatchEvent(new Event("resize"));
        return true;
    }


    function startVolumeWheel() {
        // 委托给 document，不保存旧控件/视频引用，覆盖延迟加载和播放器重建。
        const controlSelector = ".volume-07c230";
        const playerSelector = "#js-player-main, .room-Player-Box";
        const videoSelector = "video#__video2, .layout-Player-videoEntity video";
        const style = document.createElement("style");
        style.id = "douyuex-volume-wheel-style";
        const speaker = 'M5 10h5.5L16 6v20l-5.5-4H5V10z';
        const normal = 'M21.736 23.517a8 8 0 00-.527-15.206M19.687 19.867a3.925 3.925 0 00-.258-7.46';
        const muted = 'M20 19l6-6M20 13l6 6';
        const icon = (path, color = "white") => `url('data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" fill="none"><path d="${speaker}" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="${path}" stroke="${color}" stroke-width="2" stroke-linecap="round"/></svg>`).replace(/'/g, "%27")}')`;
        style.textContent = `
            :is(${playerSelector}) ${controlSelector}.douyuex-volume-synced .icon-c8be96 svg { display: none !important; }
            :is(${playerSelector}) ${controlSelector}.douyuex-volume-synced .icon-c8be96::after {
                content: ''; display: block; width: 32px; height: 32px;
                background: center / contain no-repeat ${icon(normal)};
            }
            :is(${playerSelector}) ${controlSelector}.douyuex-volume-muted .icon-c8be96::after {
                background-image: ${icon(muted)};
            }
            :is(${playerSelector}) ${controlSelector}.douyuex-volume-synced:hover .icon-c8be96::after {
                background-image: ${icon(normal, "#ff5d23")};
            }
            :is(${playerSelector}) ${controlSelector}.douyuex-volume-muted:hover .icon-c8be96::after {
                background-image: ${icon(muted, "#ff5d23")};
            }
        `;
        document.head.appendChild(style);

        function syncUI(control, video) {
            const percent = Math.round((video.muted ? 0 : video.volume) * 100);
            const front = control.querySelector(".volume-bar-93f0b0 .front-99e2aa");
            const point = control.querySelector(".volume-bar-93f0b0 .point-6ef744");
            const tips = control.querySelector(".volume-bar-93f0b0 .tips2-9bb064");
            if (front) front.style.height = `${percent}px`;
            if (point) point.style.bottom = `${percent + 7}px`;
            if (tips) tips.textContent = `音量${percent}%`;
            control.classList.add("douyuex-volume-synced");
            control.classList.toggle("douyuex-volume-muted", percent === 0);
        }

        function saveVolume(volume) {
            // 只更新网站已有的存储项，保留有效期等字段；坏数据不影响另一项。
            for (const key of ["volume_muted_before_key", "player_storage_volume_h5p_room"]) {
                try {
                    const raw = localStorage.getItem(key);
                    if (!raw) continue;
                    const data = JSON.parse(raw);
                    if (!data || typeof data !== "object" || Array.isArray(data) || !("v" in data)) continue;
                    data.v = volume;
                    localStorage.setItem(key, JSON.stringify(data));
                } catch (_) { /* 存储被禁用或数据损坏时，当前音量仍然生效。 */ }
            }
        }

        function onWheel(event) {
            // Ctrl/Meta + 滚轮保留给浏览器缩放；横向滚动不调音量。
            if (!event.deltaY || event.ctrlKey || event.metaKey) return;
            const control = event.target.closest?.(controlSelector);
            const player = control?.closest(playerSelector);
            const video = player?.querySelector(videoSelector);
            if (!video || !Number.isFinite(video.volume)) return;
            event.preventDefault();
            event.stopPropagation();
            const volume = Math.max(0, Math.min(100, Math.round(video.volume * 100) + (event.deltaY < 0 ? 5 : -5))) / 100;
            // 沿用原版：基于播放器记住的音量增减，非零时取消静音。
            video.volume = volume;
            video.muted = volume === 0;
            syncUI(control, video);
            saveVolume(volume);
        }

        function onVolumeChange(event) {
            const video = event.target;
            if (!video.matches?.(videoSelector) || !Number.isFinite(video.volume)) return;
            const player = video.closest(playerSelector);
            const control = player?.querySelector(controlSelector);
            if (control && player.querySelector(videoSelector) === video) syncUI(control, video);
        }

        document.addEventListener("wheel", onWheel, { capture: true, passive: false });
        document.addEventListener("volumechange", onVolumeChange, true);
        window.addEventListener("pagehide", () => {
            document.removeEventListener("wheel", onWheel, true);
            document.removeEventListener("volumechange", onVolumeChange, true);
            document.querySelectorAll(`${controlSelector}.douyuex-volume-synced`).forEach(control => {
                control.classList.remove("douyuex-volume-synced", "douyuex-volume-muted");
            });
            style.remove();
        }, { once: true });
    }

    function startNoCloseJump() {
        function closeRecommendation() {
            // 沿用原版的专用下播推荐弹窗，不触碰其他弹窗或普通导航。
            const button = document.querySelector(".ClosingRecommend .dy-ModalRadius-close-x");
            if (button && !button.disabled && button.getClientRects().length) button.click();
        }
        closeRecommendation();
        // 观看期间持续检查，以便数小时后下播或再次弹出时仍能处理。
        const timer = setInterval(closeRecommendation, RETRY_INTERVAL);
        window.addEventListener("pagehide", () => clearInterval(timer), { once: true });
    }

    function startBarrageResize() {
        const WIDTH_VAR = "--stage-sidebar-width";
        const MIN_WIDTH = 220;
        const MAX_WIDTH = 600;
        const stored = GM_getValue(SETTINGS.barrageWidth, null);
        let wanted = typeof stored === "number" && Number.isFinite(stored) && stored > 0 ? stored : null;
        let binding = null;
        let drag = null;
        let frame = null;
        let attempts = 0;
        let initialized = false;
        let stopped = false;
        const style = document.createElement("style");
        style.id = "douyuex-barrage-resize-style";
        style.textContent = `
            #douyuex-barrage-resize-handle {
                position: absolute; width: 10px; padding: 0; margin: 0;
                border: 0; background: transparent; z-index: 200;
                transform: translateX(-50%); cursor: col-resize;
                touch-action: none; user-select: none; outline-offset: -2px;
            }
            #douyuex-barrage-resize-handle::after {
                content: ""; position: absolute; top: 0; bottom: 0;
                left: 4px; width: 2px; background: rgba(128,128,128,.3);
            }
            #douyuex-barrage-resize-handle:hover::after,
            #douyuex-barrage-resize-handle:focus-visible::after,
            #douyuex-barrage-resize-handle[data-dragging]::after {
                background: #ff5d23;
            }
            html.douyuex-barrage-dragging,
            html.douyuex-barrage-dragging * {
                cursor: col-resize !important; user-select: none !important;
            }
        `;
        document.head.appendChild(style);

        // 沿用网站统一宽度变量，视频、工具栏和弹幕区跟随原布局计算。
        // 仅接入已核对的新版结构，不对未知旧布局强制写入宽度。
        function findLayout() {
            const main = document.getElementById("js-player-main");
            const aside = document.getElementById("js-player-asideMain");
            const sidebar = aside?.parentElement;
            const stage = main?.parentElement;
            if (!stage || sidebar?.parentElement !== stage
                || !getComputedStyle(stage).getPropertyValue(WIDTH_VAR).trim()) return null;
            return { main, aside, sidebar, stage };
        }

        function limits() {
            const css = getComputedStyle(binding.stage);
            const videoMin = parseFloat(css.getPropertyValue("--stage-player-min-width")) || 658;
            const gap = parseFloat(getComputedStyle(binding.sidebar).marginLeft) || 0;
            const max = Math.floor(Math.min(MAX_WIDTH, binding.stage.clientWidth - videoMin - gap));
            return { min: MIN_WIDTH, max };
        }

        function restoreWidth() {
            if (binding.original.value) {
                binding.stage.style.setProperty(WIDTH_VAR, binding.original.value, binding.original.priority);
            } else {
                binding.stage.style.removeProperty(WIDTH_VAR);
            }
        }

        function notifyPlayer() {
            if (frame !== null || stopped) return;
            frame = requestAnimationFrame(() => {
                frame = null;
                if (!stopped) window.dispatchEvent(new Event("resize"));
            });
        }

        function update() {
            if (!binding) return;
            const { stage, aside, sidebar, handle } = binding;
            const { min, max } = limits();
            const before = stage.style.getPropertyValue(WIDTH_VAR);
            // 窄窗口优先保留网站响应式布局，宽窗口恢复用户之前的偏好。
            if (wanted === null || max < min) restoreWidth();
            else stage.style.setProperty(WIDTH_VAR, Math.round(Math.max(min, Math.min(max, wanted))) + "px", "important");
            if (before !== stage.style.getPropertyValue(WIDTH_VAR)) notifyPlayer();
            const sr = stage.getBoundingClientRect();
            const ar = aside.getBoundingClientRect();
            const br = sidebar.getBoundingClientRect();
            handle.hidden = max < min || ar.width === 0 || ar.height === 0 || br.width === 0;
            handle.style.left = (br.left - sr.left + stage.scrollLeft) + "px";
            handle.style.top = (ar.top - sr.top + stage.scrollTop) + "px";
            handle.style.height = ar.height + "px";
            handle.setAttribute("aria-valuemin", min);
            handle.setAttribute("aria-valuemax", Math.max(min, max));
            handle.setAttribute("aria-valuenow", Math.round(ar.width));
            handle.setAttribute("aria-valuetext", Math.round(ar.width) + " 像素");
        }

        function finishDrag(commit) {
            if (!drag || !binding) return;
            const current = drag;
            drag = null;
            document.documentElement.classList.remove("douyuex-barrage-dragging");
            binding.handle.removeAttribute("data-dragging");
            if (binding.handle.hasPointerCapture(current.id)) binding.handle.releasePointerCapture(current.id);
            if (commit) {
                wanted = Math.round(binding.aside.getBoundingClientRect().width);
                GM_setValue(SETTINGS.barrageWidth, wanted);
            } else {
                wanted = current.previous;
            }
            update();
            notifyPlayer();
        }

        function reset() {
            finishDrag(false);
            wanted = null;
            GM_setValue(SETTINGS.barrageWidth, null);
            update();
            notifyPlayer();
        }

        function detach() {
            if (!binding) return;
            finishDrag(false);
            binding.observer.disconnect();
            restoreWidth();
            binding.handle.remove();
            binding = null;
        }

        function bind(layout) {
            detach();
            const handle = document.createElement("div");
            handle.id = "douyuex-barrage-resize-handle";
            handle.tabIndex = 0;
            handle.title = "拖动调整弹幕池宽度；双击恢复默认；方向键微调";
            handle.setAttribute("role", "separator");
            handle.setAttribute("aria-label", "调整弹幕池宽度");
            handle.setAttribute("aria-orientation", "vertical");
            handle.setAttribute("aria-controls", "js-player-asideMain");
            binding = { ...layout, handle, original: {
                value: layout.stage.style.getPropertyValue(WIDTH_VAR),
                priority: layout.stage.style.getPropertyPriority(WIDTH_VAR)
            }, observer: new ResizeObserver(update) };
            layout.stage.appendChild(handle);
            for (const node of [layout.stage, layout.sidebar, layout.aside]) binding.observer.observe(node);
            handle.addEventListener("pointerdown", event => {
                if (event.button !== 0 || !event.isPrimary || drag || handle.hidden) return;
                event.preventDefault();
                event.stopPropagation();
                drag = { id: event.pointerId, x: event.clientX,
                    width: binding.aside.getBoundingClientRect().width, previous: wanted };
                handle.setPointerCapture(event.pointerId);
                handle.setAttribute("data-dragging", "");
                document.documentElement.classList.add("douyuex-barrage-dragging");
            });
            handle.addEventListener("pointermove", event => {
                if (!drag || event.pointerId !== drag.id) return;
                const { min, max } = limits();
                wanted = Math.max(min, Math.min(max, drag.width + drag.x - event.clientX));
                update();
            });
            handle.addEventListener("pointerup", event => {
                if (drag?.id === event.pointerId) finishDrag(true);
            });
            for (const type of ["pointercancel", "lostpointercapture"]) {
                handle.addEventListener(type, event => {
                    if (drag?.id === event.pointerId) finishDrag(false);
                });
            }
            handle.addEventListener("dblclick", reset);
            handle.addEventListener("keydown", event => {
                if (event.key === "Home") { event.preventDefault(); reset(); return; }
                if (!["ArrowLeft", "ArrowRight"].includes(event.key) || drag) return;
                event.preventDefault();
                const { min, max } = limits();
                const step = (event.shiftKey ? 50 : 10) * (event.key === "ArrowLeft" ? 1 : -1);
                wanted = Math.max(min, Math.min(max, binding.aside.getBoundingClientRect().width + step));
                update();
                GM_setValue(SETTINGS.barrageWidth, wanted);
            });
            update();
        }

        function check() {
            const layout = findLayout();
            if (!layout) {
                detach();
                if (!initialized && ++attempts >= MAX_ATTEMPTS) stop();
                return;
            }
            initialized = true;
            if (!binding || binding.stage !== layout.stage || binding.aside !== layout.aside
                || binding.sidebar !== layout.sidebar || !binding.handle.isConnected) bind(layout);
            else update();
        }

        function onBlur() { finishDrag(false); }
        function stop() {
            stopped = true;
            clearInterval(poll);
            if (frame !== null) cancelAnimationFrame(frame);
            detach();
            style.remove();
            window.removeEventListener("resize", update);
            window.removeEventListener("blur", onBlur);
            window.removeEventListener("pagehide", stop);
            document.removeEventListener("fullscreenchange", update);
        }
        window.addEventListener("resize", update);
        window.addEventListener("blur", onBlur);
        window.addEventListener("pagehide", stop, { once: true });
        document.addEventListener("fullscreenchange", update);
        const poll = setInterval(check, RETRY_INTERVAL);
        check();
        return reset;
    }

    function startHighestQuality() {
        const started = performance.now();
        const RETRY_GAP = 2000;
        const CONFIRM_TIME = 2000;
        const MAX_CLICKS = 5;
        let stopped = false;
        let clicks = 0;
        let lastClick = -Infinity;
        let selectedSince = null;
        let currentOption = null;
        let menuSeen = false;
        let pending = null;
        let observedRoot = null;

        function log(message) {
            console.info(`[DouyuEx 画质 +${((performance.now() - started) / 1000).toFixed(2)}s] ${message}`);
        }

        function findOption() {
            // 保留稳定版对最高画质的约定：画质菜单第一项。
            const containers = document.querySelectorAll('[class^="tipItem-"], [class^="tip-"]');
            for (const container of containers) {
                if (!container.querySelector('[value^="画质"]')) continue;
                const option = container.querySelector("ul > li:first-child");
                if (option) return option;
            }
            return null;
        }

        function stop(reason) {
            if (stopped) return;
            stopped = true;
            observer.disconnect();
            clearInterval(poll);
            clearTimeout(deadline);
            clearTimeout(pending);
            document.removeEventListener("click", onUserClick, true);
            window.removeEventListener("pagehide", onPageHide);
            log(reason);
        }

        function onPageHide() { stop("页面离开，停止检测"); }

        function onUserClick(event) {
            // 尊重用户手动选择，不把用户刚选择的低画质再次改回去。
            if (!event.isTrusted || !(event.target instanceof Element)) return;
            const item = event.target.closest("li");
            const first = findOption();
            if (item && first && item.parentElement === first.parentElement) {
                stop("检测到手动选择画质，停止自动切换");
            }
        }

        function check() {
            if (stopped) return;
            // 页面建立播放器后缩小监听范围；轮询负责发现播放器整体替换。
            const root = document.querySelector(".room-Player-Box")
                || document.querySelector(".layout-Player-video") || document.body;
            if (root && root !== observedRoot) {
                observer.disconnect();
                observer.observe(root, {
                    childList: true, subtree: true, attributes: true,
                    attributeFilter: ["class", "value", "aria-selected", "aria-disabled", "disabled"]
                });
                observedRoot = root;
            }
            // 菜单出现即可操作，不再额外等待 video 节点。
            const option = findOption();
            if (option !== currentOption) {
                currentOption = option;
                selectedSince = null;
            }
            if (!option) return;
            if (!menuSeen) {
                menuSeen = true;
                log("发现画质菜单");
            }
            const now = performance.now();
            const selected = Array.from(option.classList).some(name => name.startsWith("selected-"))
                || option.getAttribute("aria-selected") === "true";
            if (selected) {
                if (selectedSince === null) selectedSince = now;
                if (now - selectedSince >= CONFIRM_TIME) {
                    stop("最高画质选中状态已保持 2 秒，停止检测（不代表视频已缓冲完成）");
                }
                return;
            }
            selectedSince = null;
            if (clicks >= MAX_CLICKS) {
                if (now - lastClick >= 5000) stop("已达到 5 次点击上限，未确认选中，请手动检查");
                return;
            }
            if (option.matches('[disabled], [aria-disabled="true"]') || now - lastClick < RETRY_GAP) return;
            lastClick = now;
            clicks++;
            log(`点击最高画质：${option.textContent.trim()}（第 ${clicks} 次）`);
            option.click();
        }

        const observer = new MutationObserver(() => {
            // 合并高频 DOM 变化，避免每条弹幕都触发一次全页查询。
            if (stopped || pending !== null) return;
            pending = setTimeout(() => { pending = null; check(); }, 100);
        });
        const poll = setInterval(check, 250);
        const deadline = setTimeout(() => stop("等待超过 100 秒，停止检测"), 100000);
        document.addEventListener("click", onUserClick, true);
        window.addEventListener("pagehide", onPageHide, { once: true });
        log("开始检测");
        check();
    }
})();
