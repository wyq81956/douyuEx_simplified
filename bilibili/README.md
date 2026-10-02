# B站动态：屏蔽悬浮用户资料卡

本仓库的附属油猴脚本，版本 **1.0.0**，独立安装，无需编译。参考本项目斗鱼精简版的 CSS 屏蔽思路，在 `https://t.bilibili.com/*` 隐藏悬浮用户资料卡，默认开启。

## 安装

1. 安装并启用 Tampermonkey，打开 [脚本安装链接](https://raw.githubusercontent.com/wyq81956/douyuEx_simplified/master/bilibili/bilibili_dynamic_no_profile.user.js)。
2. 点击安装。如果没有弹出安装页，在 Tampermonkey 中新建脚本，用同目录 [bilibili_dynamic_no_profile.user.js](bilibili_dynamic_no_profile.user.js) 的完整内容覆盖编辑器并保存。
3. 刷新 [B站动态页](https://t.bilibili.com/)，把鼠标移到动态作者、转发作者等用户的头像上检查效果。

点击 Tampermonkey 图标 → 本脚本 → **关闭资料卡屏蔽并刷新**，即可恢复资料卡；再次选择 **开启资料卡屏蔽并刷新** 可以恢复屏蔽。设置使用独立的油猴存储，刷新和重启浏览器后保留。

## 实现与范围

- 注入 CSS，隐藏 `.bili-user-profile` 和 `bili-user-profile`；不改动头像、昵称和它们的链接，也不拦截鼠标事件。
- 页面加载初期注入，规则自动作用于后续异步加载、滚动追加及重建的资料卡。
- 仅在 `t.bilibili.com` 顶层页面生效，不影响视频页或个人空间页。
- 无外部依赖、网络请求或账号设置修改。页面自身可能仍请求资料卡数据，本脚本只隐藏展示。

选择器参考 [B站共同关注快速查看的作者源码](https://greasyfork.org/zh-CN/scripts/428453-b%E7%AB%99%E5%85%B1%E5%90%8C%E5%85%B3%E6%B3%A8%E5%BF%AB%E9%80%9F%E6%9F%A5%E7%9C%8B/code) 的 `initDynamic()` 和 `initBiliUserProfile()`。已通过 JavaScript 语法和启用/停用逻辑检查，真实页面效果仍待试用；B站改版后可能需要调整选择器。
