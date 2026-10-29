// Local browser fixture: node tests/fixtures/bilibili-sidebar-preview.cjs
// Uses the actual userscript with only host/API destinations adapted to localhost.
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

function integer(value) {
    const bytes = [];
    do { const byte = value % 128; value = Math.floor(value / 128); bytes.push(byte | (value ? 128 : 0)); } while (value);
    return Buffer.from(bytes);
}
function message(time, text, mode = 1) {
    const content = Buffer.from(text);
    const body = Buffer.concat([integer(16), integer(time * 1000), integer(24), integer(mode), integer(58), integer(content.length), content]);
    return Buffer.concat([integer(10), integer(body.length), body]);
}
const lines = ["弹幕池已和播放进度同步", "右侧显示的是已经播放到的弹幕", "暂停时，弹幕也会停在当前进度", "原来的飘屏弹幕开关保持独立", "可以向上翻看刚才的弹幕", "跳转进度后会重新对齐", "只显示弹幕正文，更简洁", "退出网页全屏会恢复原布局", "这里是本地浏览器测试页", "也支持稍后观看播放页", "长视频按分段读取弹幕", "试试看 T 键切换", "画面和弹幕各自占用空间", "不会遮挡播放器控制栏", "播放进度就是弹幕的时间轴", "拖动进度条可以验证跳转", "向上翻看时停止自动滚动", "回到最新按钮会恢复跟随", "播放器输入框仍然可以使用", "分P切换后不会混入旧弹幕", "同步弹幕测试进行中", "所有文本都按普通文字显示", "桌面宽屏下使用双栏布局", "普通模式下恢复网站原来的样子", "每个分段只读取一次"];

function createPreviewServer() {
    const wav = Buffer.alloc(44 + 8000 * 780, 128);
    wav.write("RIFF", 0); wav.writeUInt32LE(wav.length - 8, 4); wav.write("WAVEfmt ", 8);
    wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
    wav.writeUInt32LE(8000, 24); wav.writeUInt32LE(8000, 28); wav.writeUInt16LE(1, 32);
    wav.writeUInt16LE(8, 34); wav.write("data", 36); wav.writeUInt32LE(wav.length - 44, 40);
    let fail = false;
    return http.createServer((req, res) => {
        const url = new URL(req.url, "http://localhost");
        const port = req.socket.localPort;
        if (url.pathname === "/script.js") {
            const source = (url.searchParams.has("baseline")
                ? execFileSync("git", ["show", "bilibili-v1.6.0:bilibili/bilibiliex.user.js"], { cwd: path.join(__dirname, "../.."), encoding: "utf8" })
                : fs.readFileSync(path.join(__dirname, "../../bilibili/bilibiliex.user.js"), "utf8"))
                .replaceAll("window.location.hostname", '"www.bilibili.com"')
                .replace('url.hostname !== "www.bilibili.com"', 'url.hostname !== "127.0.0.1"')
                .replaceAll("https://api.bilibili.com", `http://127.0.0.1:${port}/api`);
            res.setHeader("Content-Type", "text/javascript; charset=utf-8"); return res.end(source);
        }
        if (url.pathname === "/fixture/fail" || url.pathname === "/fixture/recover") {
            fail = url.pathname.endsWith("/fail"); res.writeHead(204); return res.end();
        }
        if (url.pathname.startsWith("/api/")) {
            if (fail) { res.writeHead(503); return res.end("Fixture unavailable"); }
            if (url.pathname.endsWith("/view")) {
                res.setHeader("Content-Type", "application/json");
                return res.end(JSON.stringify({ code: 0, data: { pages: url.searchParams.get("bvid") === "BVnext"
                    ? [{ page: 1, cid: 13, duration: 780 }] : [{ page: 1, cid: 11, duration: 780 }, { page: 2, cid: 12, duration: 780 }] } }));
            }
            res.setHeader("Content-Type", "application/octet-stream");
            if (url.searchParams.get("oid") === "12") return res.end(message(2, "第二P的独立弹幕"));
            if (url.searchParams.get("oid") === "13") return res.end(message(2, "另一个视频的独立弹幕"));
            if (url.searchParams.get("segment_index") === "2") return res.end(message(400, "跳到6分40秒后的弹幕"));
            return res.end(Buffer.concat([...lines.map((text, i) => message(i / 3, text)), message(10, "第10秒的弹幕"), message(90, "未来弹幕不应提前出现"),
                ...(req.headers.referer?.includes("/BVfixture/") ? [message(5, '<img src=x onerror="alert(1)">')] : []), message(4, "高级弹幕不应显示", 7)]));
        }
        if (url.pathname === "/silence.wav") {
            const range = req.headers.range?.match(/bytes=(\d+)-(\d*)/);
            const first = range ? Number(range[1]) : 0, last = range?.[2] ? Number(range[2]) : wav.length - 1;
            res.writeHead(range ? 206 : 200, { "Content-Type": "audio/wav", "Accept-Ranges": "bytes", "Content-Length": last - first + 1, ...(range ? { "Content-Range": `bytes ${first}-${last}/${wav.length}` } : {}) });
            return res.end(wav.subarray(first, last + 1));
        }
        res.setHeader("Content-Type", "text/html; charset=utf-8");
        res.end(`<!doctype html><html lang="zh-CN"><meta charset="UTF-8"><title>BilibiliEx 右侧弹幕池 · 本地测试</title>
            <style>body{margin:0;background:#e9edf4;font:14px system-ui}.original-page{position:fixed;inset:0;background:#6a2536;color:white;display:grid;place-items:center}#bilibili-player{position:relative;width:min(800px,100vw);height:500px}#bilibili-player.mode-webscreen{position:fixed;left:0;top:0;width:100%;height:100%;z-index:100000}.bpx-docker-major{position:relative;width:100%;height:100%}.bpx-player-container{position:relative;width:100%;height:100%;background:#101823;color:white}.bpx-player-primary-area{height:100%;display:flex;flex-direction:column}.bpx-player-video-area{flex:1;min-height:0;position:relative;background:radial-gradient(ellipse at 25% 35%,#233c61,#101823 70%)}video{height:100%;width:100%;position:absolute;opacity:.1}.caption{position:absolute;left:10%;top:30%;pointer-events:none}.caption small{color:#8d9caf;letter-spacing:3px}.caption h1{font-size:36px;margin:16px 0}.caption p{color:#a6b2c3}.controls{padding:12px;display:flex;gap:8px;flex-wrap:wrap;background:#172030}button,input{font:inherit;padding:6px;border:1px solid #58616c;border-radius:5px;background:#222e40;color:#eee}input{width:130px}output{display:block;width:100%;font-size:11px}</style>
            <div class="original-page">原网页推荐区：网页全屏时不应露出</div>
            <div id="bilibili-player"><div class="bpx-docker bpx-docker-major"><div class="bpx-player-container" data-screen="normal"><div class="bpx-player-primary-area"><div class="bpx-player-video-area"><video muted preload="auto" src="/silence.wav"></video><div class="caption"><small>BILIBILiEX · LOCAL PREVIEW</small><h1>视频在左，弹幕在右</h1><p>本地同步测试 · 使用 B站外层固定、内层相对定位结构</p></div></div>
            <div class="controls"><button id="full" class="bpx-player-ctrl-web">网页全屏 / T</button><button id="at5">跳到 0:05</button><button id="at10">跳到 0:10</button><button id="at401">跳到 6:41</button><button id="part2">切换第二P</button><button id="nextvideo">切换视频</button><button id="fail">模拟失败</button><button id="recover">恢复接口</button><input id="draft" placeholder="弹幕输入框（测试）"><output id="geometry"></output></div></div></div></div></div>
            <script>const player=document.querySelector('.bpx-player-container'),video=document.querySelector('video');
            video.addEventListener('loadedmetadata',()=>document.body.dataset.ready='true');
            document.querySelector('#full').onclick=()=>{const web=player.getAttribute('data-screen')!=='web';player.setAttribute('data-screen',web?'web':'normal');document.querySelector('#bilibili-player').classList.toggle('mode-webscreen',web)};
            setInterval(()=>{const panel=document.querySelector('#bilibiliex-danmaku-host'),a=player.getBoundingClientRect();if(!panel||panel.hidden){const normal=player.getAttribute('data-screen')==='normal';const width=normal?Math.min(800,innerWidth):innerWidth,height=normal?500:innerHeight;const restored=Math.abs(a.left)<1&&Math.abs(a.top)<1&&Math.abs(a.width-width)<1&&Math.abs(a.height-height)<1;document.body.dataset.layout=restored?(normal?'ordinary':'native-full'):'bad-restoration';document.querySelector('#geometry').textContent='原生布局：左边界 '+a.left.toFixed(1)+' · 宽度 '+a.width.toFixed(1)+' · 高度 '+a.height.toFixed(1);return}const b=panel.getBoundingClientRect(),gap=b.left-a.right;const joined=Math.abs(a.left)<1&&Math.abs(a.top)<1&&Math.abs(a.bottom-innerHeight)<1&&Math.abs(gap)<1&&Math.abs(b.right-innerWidth)<1;document.body.dataset.layout=joined?'joined':'gap';document.querySelector('#geometry').textContent='视频左边界 '+a.left.toFixed(1)+' · 视频宽度 '+a.width.toFixed(1)+' · 弹幕左边界 '+b.left.toFixed(1)+' · 间隙 '+gap.toFixed(1)},100);
            for(const time of [5,10,401])document.querySelector('#at'+time).onclick=()=>{video.pause();video.currentTime=time};
            document.querySelector('#part2').onclick=()=>{history.pushState({},'', '?p=2');video.currentTime=5};
            document.querySelector('#nextvideo').onclick=()=>{history.pushState({},'', '/video/BVnext/');video.currentTime=5};
            for(const action of ['fail','recover'])document.querySelector('#'+action).onclick=async()=>{await fetch('/fixture/'+action);document.body.dataset.api=action};
            window.GM_getValue=(key,fallback)=>{const saved=localStorage.getItem(key);return saved!==null?JSON.parse(saved):key==='video.danmakuPanelWidth'?fallback:['video.danmakuPanel','keyboard.webFullscreen'].includes(key)};
            window.GM_setValue=(key,value)=>{localStorage.setItem(key,JSON.stringify(value));document.body.dataset.savedWidth=String(value)};window.GM_registerMenuCommand=()=>{};window.GM_addStyle=css=>{const style=document.createElement('style');style.textContent=css;document.head.appendChild(style)};
            </script><script src="/script.js${url.searchParams.has("baseline") ? "?baseline=1" : ""}"></script></html>`);
    });
}
if (require.main === module) createPreviewServer().listen(8766, "127.0.0.1", () => console.log(`Preview PID ${process.pid}: http://127.0.0.1:8766/video/BVfixture/`));
module.exports = { integer, message, createPreviewServer };
