// ==UserScript==
// @name         B站动态 - 屏蔽悬浮用户资料卡
// @namespace    bilibiliex-simplified
// @version      1.0.0
// @description  隐藏 B 站动态页的悬浮用户资料卡，保留头像和昵称的正常点击。
// @author       本地维护
// @match        https://t.bilibili.com/*
// @run-at       document-start
// @noframes
// @grant        GM_addStyle
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// ==/UserScript==

(function () {
    "use strict";

    const SETTING = "dynamic.blockUserProfile";
    const enabled = GM_getValue(SETTING, true);

    GM_registerMenuCommand(
        enabled ? "关闭资料卡屏蔽并刷新" : "开启资料卡屏蔽并刷新",
        () => {
            GM_setValue(SETTING, !enabled);
            window.location.reload();
        }
    );

    if (!enabled) return;

    // 沿用斗鱼精简版的 CSS 屏蔽思路，只隐藏资料卡，不处理头像热区。
    // 类名对应动态页资料卡；自定义元素对应另一种用户资料卡实现。
    // CSS 自动覆盖异步加载、滚动追加和复用的弹层，无需轮询或观察整页。
    GM_addStyle(`
        .bili-user-profile,
        bili-user-profile {
            display: none !important;
        }
    `);
})();
