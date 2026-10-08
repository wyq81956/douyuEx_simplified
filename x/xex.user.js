// ==UserScript==
// @name         X - 屏蔽悬浮用户资料卡
// @namespace    xex-simplified
// @version      1.0.0
// @description  隐藏 X / Twitter 上由头像、昵称、用户名及名字附近区域触发的悬浮用户资料卡，保留原有链接和点击操作。
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

    if (!enabled) return;

    // 沿用 B站的 CSS 屏蔽方式，定位弹出的资料卡，而非头像或名字的触发热区。
    // hoverCardParent 包含弹层外壳和加载状态；HoverCard 覆盖资料卡本体。
    // CSS 自动覆盖滚动追加、异步加载及站内导航后创建的卡片，无需拦截鼠标事件。
    GM_addStyle(`
        [data-testid="hoverCardParent"],
        [data-testid="HoverCard"] {
            display: none !important;
        }
    `);
})();
