// ==UserScript==
// @name         youtubeEX
// @namespace    youtubeex-simplified
// @version      1.0.0
// @description  将 YouTube 影院模式扩展至整个浏览器内容区，隐藏顶部导航，保留原生控制栏和向下滚动查看评论。
// @author       本地维护
// @match        https://www.youtube.com/*
// @match        https://youtube.com/*
// @run-at       document-start
// @noframes
// @grant        GM_addStyle
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// ==/UserScript==

(function () {
    "use strict";

    const SETTING = "video.expandTheater";
    const ACTIVE = "youtubeex-theater";
    const enabled = GM_getValue(SETTING, true);
    GM_registerMenuCommand(
        enabled ? "youtubeEX：关闭影院模式增强" : "youtubeEX：开启影院模式增强",
        () => {
            GM_setValue(SETTING, !enabled);
            window.location.reload();
        }
    );
    if (!enabled) return;

    // 所有覆盖都限定于当前影院模式，退出、全屏或站内离开视频页即失效。
    GM_addStyle(`
        html.${ACTIVE} {
            --ytd-masthead-height: 0px !important;
            --ytd-toolbar-height: 0px !important;
        }
        html.${ACTIVE} ytd-app > #masthead-container,
        html.${ACTIVE} ytd-masthead {
            display: none !important;
        }
        html.${ACTIVE} ytd-page-manager {
            margin-top: 0 !important;
        }
        html.${ACTIVE} ytd-watch-flexy[theater] {
            --ytd-watch-flexy-theater-height: 100vh !important;
            --ytd-watch-flexy-theater-height: 100dvh !important;
            --ytd-watch-flexy-theater-max-height: 100vh !important;
            --ytd-watch-flexy-theater-max-height: 100dvh !important;
            margin-top: 0 !important;
            padding-top: 0 !important;
        }
        html.${ACTIVE} ytd-watch-flexy[theater] #full-bleed-container {
            height: 100vh !important;
            height: 100dvh !important;
            min-height: 0 !important;
            max-height: none !important;
            width: 100% !important;
            margin: 0 !important;
            padding: 0 !important;
            background: #000 !important;
        }
        html.${ACTIVE} ytd-watch-flexy[theater] #player-full-bleed-container,
        html.${ACTIVE} ytd-watch-flexy[theater] #full-bleed-container #player-container,
        html.${ACTIVE} ytd-watch-flexy[theater] #full-bleed-container ytd-player,
        html.${ACTIVE} ytd-watch-flexy[theater] #full-bleed-container #container,
        html.${ACTIVE} ytd-watch-flexy[theater] #full-bleed-container #movie_player {
            width: 100% !important;
            height: 100% !important;
            min-height: 0 !important;
            max-height: none !important;
        }
        html.${ACTIVE} #full-bleed-container .html5-video-container {
            width: 100% !important;
            height: 100% !important;
        }
        html.${ACTIVE} #full-bleed-container video.html5-main-video {
            width: 100% !important;
            height: 100% !important;
            left: 0 !important;
            top: 0 !important;
            object-fit: contain !important;
        }
    `);

    let watch = null;
    let player = null;
    let app = null;
    let frame = null;
    let navigating = false;
    let stopped = false;
    const modeObserver = new MutationObserver(schedule);
    // 仅在播放器尚未出现或节点被替换时重新查找，不轮询整个 DOM。
    const discoveryObserver = new MutationObserver(() => {
        if (!watch?.isConnected || !player?.isConnected || !app?.isConnected) schedule();
    });

    function schedule() {
        if (!stopped && frame === null) frame = window.requestAnimationFrame(sync);
    }

    function sync() {
        frame = null;
        if (stopped) return;
        const nextWatch = document.querySelector("ytd-watch-flexy:not([hidden])");
        const nextPlayer = nextWatch?.querySelector("#movie_player") || null;
        const nextApp = document.querySelector("ytd-app");
        if (nextWatch !== watch || nextPlayer !== player || nextApp !== app) {
            modeObserver.disconnect();
            watch = nextWatch;
            player = nextPlayer;
            app = nextApp;
            if (watch) modeObserver.observe(watch, {
                attributes: true, attributeFilter: ["theater", "fullscreen", "hidden"],
            });
            if (player) modeObserver.observe(player, {
                attributes: true, attributeFilter: ["class"],
            });
            if (app) modeObserver.observe(app, {
                attributes: true, attributeFilter: ["miniplayer-is-active"],
            });
        }
        const active = !navigating && window.location.pathname === "/watch"
            && !!new URLSearchParams(window.location.search).get("v")
            && !!watch && !!player && watch.hasAttribute("theater")
            && !watch.hasAttribute("fullscreen") && !document.fullscreenElement
            && !player.classList.contains("ytp-player-minimized")
            && !app?.hasAttribute("miniplayer-is-active");
        setActive(active);
    }

    function setActive(active) {
        const root = document.documentElement;
        if (!root || root.classList.contains(ACTIVE) === active) return;
        root.classList.toggle(ACTIVE, active);
        if (active) window.scrollTo({ top: 0, left: 0, behavior: "instant" });
        // 让原生控制栏、字幕及进度条同步使用新的播放器尺寸。
        window.dispatchEvent(new Event("resize"));
    }

    function onNavigateStart() {
        navigating = true;
        setActive(false);
    }

    function onNavigateFinish() {
        navigating = false;
        schedule();
    }

    function start() {
        stopped = false;
        if (document.documentElement) discoveryObserver.observe(document.documentElement, {
            childList: true, subtree: true,
        });
        schedule();
    }

    function stop() {
        stopped = true;
        discoveryObserver.disconnect();
        modeObserver.disconnect();
        if (frame !== null) window.cancelAnimationFrame(frame);
        frame = null;
        watch = player = app = null;
        setActive(false);
    }

    document.addEventListener("yt-navigate-start", onNavigateStart);
    document.addEventListener("yt-navigate-finish", onNavigateFinish);
    document.addEventListener("yt-page-data-updated", schedule);
    document.addEventListener("fullscreenchange", schedule);
    window.addEventListener("popstate", onNavigateFinish);
    window.addEventListener("pagehide", stop);
    window.addEventListener("pageshow", start);
    if (document.documentElement) start();
    else document.addEventListener("DOMContentLoaded", start, { once: true });
})();
