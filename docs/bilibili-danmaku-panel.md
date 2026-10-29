# B站右侧同步弹幕池：实现与验证

2026-10-29。用户选择：像直播一样随播放进度逐条出现；保留画面飘屏弹幕，由原生开关控制。

## 已观察的官方行为

- 对用户之前提供的 `BV1vnx6zHEui` 做了独立、未登录浏览器观察。REA Evidence `ev_2479209c115a74bb0b122f3f9f2d89970fc46164ff8aa1b5ad1aae19cbbb47c1` 记录了播放器、网页分段弹幕请求和辅助列表组件资源；自有浏览器进程已回收。
- 页面实际加载 `https://s1.hdslb.com/bfs/static/player/main/core.9c6ca999.js`。普通文件读取核对到播放器版本 `4.10.8-82b0378d`、网页全屏的 `.bpx-player-container[data-screen=web]`，以及分段消息中第 2 字段为毫秒时间、第 3 字段为模式、第 7 字段为正文。静态字段核对不等于运行了新增脚本。
- 独立 HTTP 请求核对了视频资料 `/x/web-interface/view` 与普通弹幕 `/x/v2/dm/web/seg.so`：两者返回 200，并允许 `https://www.bilibili.com` 携带凭据跨域读取。对实际第 1 段响应解码得到 26 条普通弹幕，时间范围 9.549–350.591 秒。此处属于普通请求/解码证据，不冒充 REA runtime Evidence。

## 设计

同一脚本新增独立开关 `video.danmakuPanel`，默认开启。仅在网页全屏且窗口宽度至少 900px 时为右边栏让出 260–360px；退出时删除布局标记。侧栏使用 Shadow DOM，与原生弹幕渲染和发送输入框独立。

按当前视频编号和分 P 解析 CID，分段读取普通弹幕，以原生 video 的 currentTime/timeupdate/seeking/seeked 为时间轴。初次进入或跳转时回看 60 秒，正常播放增量追加，最多 250 行。限制邻近分段缓存、最多 3 个分段请求并发；超时、路由改变和离页会取消请求。用户翻看时暂停跟随，主动回到最新或跳转时重新对齐。

独立列表不继承网站智能屏蔽、关键词和密度设置；不猜测用户名/头像，不把高级弹幕脚本作为文本，不改变画面飘屏开关。发送仍通过原生播放器。

## 可复查的验证

- `node tests/bilibili-danmaku.test.cjs`：字段解码、未知字段跳过、畸形数据、普通模式筛选、相同时间多条弹幕、暂停去重、未来弹幕排除、分段边界、回退和 250 行上限。
- 原有 `bilibili-hotkey`、`bilibili-live` 和 `bilibili-live-quality` 回归检查通过；这些检查分别验证旧功能，不代替侧栏浏览器验证。
- `node tests/fixtures/bilibili-sidebar-preview.cjs`：本机浏览器测试服务，用静音的有限时长媒体和确定的分段数据运行实际脚本。只将主机判断和 API 目的地适配到 localhost，测试页与真实 B站页面有明确边界。
- REA Evidence `ev_df5c5f89e8cf056da9516793847cfb02637d79de237c3d84b5f3c86fd3b0349b`：实际 Chromium 场景通过暂停不推进、未来/高级弹幕排除、恶意 HTML 按纯文本展示、跨段跳转、分 P 和视频切换、翻看历史与恢复跟随、503 后重载恢复、输入框 T 键不误触发、T 键退出恢复布局和重新进入。
- REA Evidence `ev_2a2ff3bbdfda1068b3143d0147bfd397037024cc7add36fd5a0bc2f80705c8e0`：稍后观看路由在本机浏览器场景显示侧栏。
- REA Evidence `ev_0a6b93b75ca76abde86e0a6b97760878680cc9745ce3d1bb994541582d1bbe32`：800px 窗口下不展示侧栏。
- REA Evidence `ev_e375b104768ef5a33bad50532ea24a78a2e23d153b1397f78f9c6679270045de`：本机宽屏预览。全部上述场景均回收自有浏览器进程。

## 尚待确认

新增脚本在用户真实 B站页面中的最终布局、登录态、网站灰度改版和账号过滤差异尚待实际试用。已验证公开数据和受控浏览器行为，不将本机 fixture 的结果表述成真实页面端到端验证。

## 1.6.1 网页全屏错位修复（2026-10-30）

用户截图显示视频左侧裁切、视频和弹幕池之间露出原网页。对截图中的 `BV1nesd69EVX` 观察原生网页全屏，REA Evidence `ev_a4bea5d57e55214cacccfd83b0796b2e95ff3a6bcf5699737271b4b945d95566` 确认模式放在外层 `#bilibili-player.mode-webscreen`；普通样式文件读取确认该外层固定定位，播放器内层 `.bpx-player-container` 保持 `position: relative`。1.6.0 对内层设置 `right` 使其相对原位左移。此前 fixture 错把内层设为 fixed，漏掉了此问题。

现将内层在功能开启且为网页全屏时明确设为 fixed，左上角为 0，`right/bottom: auto`，宽度按 `100vw` 减去弹幕池，使用视口高度并移除宽高上限。模式退出或收起弹幕池后选择器不再匹配，恢复原生样式。

fixture 已改成原生的“固定外层 + 相对内层”，保留原网页背景，并独立读取实际 DOM 矩形来检查边界。地址追加 `?baseline=1` 可读取本地 Git 标签 `bilibili-v1.6.0` 的旧脚本进行对照。

- 旧版复现：Evidence `ev_63d8d8d5acd7ea60ba968d3875ed35b04c80de7ee7bb194244589b5cd863568a`，1280px 视口下视频左边界 -307.2px，中间空隙 307.2px。
- 修复及 T 键往返：Evidence `ev_5acf3ecbf4569d7bc8805e510b61fceed53beaecf8ea16ac12f527079578284a`，左边界 0px，中间空隙 0px；退出后恢复 800×500 原生矩形，再进入仍贴合。
- 高分辨率：Evidence `ev_56c6f61b483202c82aaf25972517261a65ed4adebb2ccfd9cd7600ebdf6bbcbe`，1920px/DPR 2 视口下，视频 1560px 与侧栏起点 1560px 贴合。
- 稍后观看：Evidence `ev_bc81cbc9771be9c500cbaa36c5b1fc5921fa443fbb6ad3febb8ae718c3a4618f`，左右边界贴合。
- 窄窗口：Evidence `ev_2ea382d683047ed40b6ce88dfa49c76f52b61b10fcb24b43e9f66e02720a5e02`，侧栏收起，恢复 800×600 原生网页全屏矩形。

全部自有浏览器已回收。修复已通过原生结构回归，用户实际页面的最终效果仍需更新后确认。

## 1.7.0 暗色与可调宽度（2026-10-30）

用户已确认 1.6.1 的网页全屏修复正常，随后要求暗色背景、宽度可调和隐藏时间戳。

右侧背景、标题栏、按钮、边框和滚动区改为暗色；不再生成逐行 time 元素，顶部也不显示当前时间。时间戳仍用于内部同步。新增分隔线拖动与独立宽度存储 `video.danmakuPanelWidth`，松手保存，取消不写入，双击/Home 复位，左右键微调，Shift 加速。实际宽度约束为 240–600px 并保留 640px 视频空间；临时收窄不覆盖保存的偏好。视频和侧栏同步使用同一 CSS 变量，避免再次出现空隙。

- `bilibili-sidebar-resize.test.cjs` 使用 DOM/指针模拟验证拖动过程中不写存储、松手保存、pointercancel/lostpointercapture/失焦/Esc 取消、键盘与复位、重新加载保存值、窗口收窄后恢复偏好及离页清理。它不是原生鼠标测试。
- `bilibili-danmaku.test.cjs` 补充默认宽度、宽度上下限、视频保留宽度和非法存储值检查；原有回归检查通过。
- REA Evidence `ev_cd031c62f44ec28f25bf29b9d83c496e66aa5216e8d474aca8d80c26bfeb275e` 的已完成准备步骤和最终图像显示暗色、无时间戳及边界贴合（1280px 下视频 973px、侧栏 307px、间隙 0px）。等待原生拖动步骤超时，不能将整个场景视为通过。自有浏览器已回收。
- 原生鼠标操作尝试被 Computer Use 中止：无法可靠识别 Windows 测试窗口的当前浏览器 URL。此后未继续窗口操作；鼠标拖动的实际交互效果仍待用户试用确认。
