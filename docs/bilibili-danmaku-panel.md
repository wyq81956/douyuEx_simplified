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
