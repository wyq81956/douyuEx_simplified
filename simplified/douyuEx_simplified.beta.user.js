// ==UserScript==
// @name         DouyuEx 精简版 Beta - 快速最高画质
// @namespace    douyuex-simplified-beta
// @version      1.4.0-beta.1
// @description  自动网页全屏、最高画质、简洁模式；屏蔽进场弹幕、弹幕背景和前缀，隐藏广告。
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
// 保留原版按钮选择逻辑；独立设置、有限重试，不依赖原版面板。
(function () {
    "use strict";

    const SETTINGS = {
        fullscreen: "autoPlayer.fullscreen",
        quality: "autoPlayer.highestQuality",
        simpleMode: "simpleMode.enabled",
    };
    const RETRY_INTERVAL = 1000;
    const MAX_ATTEMPTS = 100;

    registerToggle("自动网页全屏", SETTINGS.fullscreen);
    registerToggle("自动最高画质", SETTINGS.quality);
    registerToggle("简洁模式", SETTINGS.simpleMode);

    // 合并后的开关默认开启，旧版六个分项设置不再参与判断。
    if (GM_getValue(SETTINGS.simpleMode, true)) {
        waitForPlayerAction(applySimpleMode);
    }

    // 同时支持数字房间号、房间别名和专题页；由播放器节点确认直播间。
    if (GM_getValue(SETTINGS.fullscreen, true)) {
        waitForPlayerAction(enterWebFullscreen);
    }
    if (GM_getValue(SETTINGS.quality, true)) {
        startHighestQualityBeta();
    }

    function registerToggle(label, key) {
        const enabled = GM_getValue(key, true);
        GM_registerMenuCommand(`${enabled ? "✓" : "✗"} ${label}（切换后刷新生效）`, () => {
            GM_setValue(key, !GM_getValue(key, true));
            // 不自动刷新，以免打断当前观看；刷新后菜单同步新状态。
        });
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
            .Search-Panel-Advert { display: none !important; }
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

    function startHighestQualityBeta() {
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
            console.info(`[DouyuEx Beta 画质 +${((performance.now() - started) / 1000).toFixed(2)}s] ${message}`);
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
