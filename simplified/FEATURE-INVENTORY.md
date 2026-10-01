# 原版 DouyuEx 功能拆分清单

## 分析范围与读法

依据本地原版 `src/main.js`、`src/routers/router.js`、`src/packages` 和 `src/require` 的静态代码分析。原始文件没有修改；“已提取”标注已加入精简版的功能。本清单用于选择下一步保留项，不代表这些旧接口、网页选择器或外部服务目前仍可用；没有登录斗鱼或执行签到、发送、送礼等操作。

原版并非真正隔离的插件系统：构建会拼接源码，模块共享变量和函数。因此“可以拆分”表示可以提取其业务逻辑并补齐依赖，不表示直接复制单个文件即可运行。

- **接入**：启动链或相关页面/交互链存在调用；不等于功能默认开启。
- **未接入**：没有找到功能初始化的有效调用，或上层调用被注释；部分辅助函数仍可能被其他模块使用。
- **空配置**：入口存在，但当前配置不产生实际任务。
- **外部**：本地主要是链接或另一个脚本的控制入口。
- **低/中/高**：拆出独立功能的相对复杂度，不是当前网站兼容性评级。低通常只需 DOM/CSS；中涉及共享状态、界面或接口；高涉及协议、播放器、跨域或大量 Hook。

下文源码位置以 `src/packages/` 为根，同名目录中的 CSS 也应按需一起提取。A、B 等编号可直接用于后续指定保留功能。

## A. 播放器和观看体验

| 编号 | 可拆分功能 | 源码位置 | 状态 / 难度 | 提取边界与依赖 |
|---|---|---|---|---|
| A01 | 自动网页全屏 | ExpandTool/ExpandTool_FullScreen.js | 接入 / 低；已提取 | 等待按钮后点击；不需要完整扩展面板 |
| A02 | 自动最高画质 | ExpandTool/ExpandTool_FullScreen.js | 接入 / 低；已提取 | 点击画质列表第一项；不等于提高源视频分辨率 |
| A03 | 防止直播自动暂停 | ExpandTool/ExpandTool_TabSwitch.js → enableIgnoreAutoPause | 接入 / 低 | 原实现仅写入 localStorage 的 freetimed=1；与下面的可见性改写可分开 |
| A04 | 后台页签保持“可见” | ExpandTool/ExpandTool_TabSwitch.js → enableTabSwitch | 接入 / 中 | 改写 hidden、visibilityState、hasFocus 并拦截事件；画中画也使用其设置。不能保证阻止浏览器系统级冻结 |
| A05 | 阻止 P2P 上传 | ExpandTool/ExpandTool_P2P.js | 接入 / 中 | 替换页面 RTCPeerConnection 等构造器；依赖 unsafeWindow 和执行时机，会影响页面其他 WebRTC 用途 |
| A06 | 阻止下播自动跳转 | DisableCloseJump/DisableCloseJump.js | 接入 / 低；1.5.2 已提取 | 每秒关闭下播推荐弹窗，不是拦截所有导航；个人实际试用正常 |
| A07 | 未登录观看相关调整 | NoLogin/NoLogin.js、NoLogin.css | 接入 / 低 | 设置 rateRecordTime_h5p_room 中的 v 字段并配合样式；不是完整账号登录替代方案 |
| A08 | 鼠标滚轮调音量 | VolumeMouseScrolling/VolumeMouseScrolling.js | 接入 / 低；1.5.2 已提取 | 音量区域每次增减 5%，同步 UI 和播放器存储；已适配新版播放器容器 |
| A09 | 播放倍速 | VideoTools/VideoSpeed/VideoSpeed.js | 接入 / 低 | HTMLVideoElement.playbackRate 与菜单；替换原工具栏入口即可 |
| A10 | 左右键快退/快进 3 秒 | VideoTools/VideoRecall/VideoRecall.js | 接入 / 低 | 修改 currentTime，跳过输入场景；只在已有可寻址缓存范围内有效 |
| A11 | 同步到直播缓存尾端 | VideoTools/VideoSync/VideoSync.js | 接入 / 低 | 修改 currentTime 到 buffered.end(0)，不是向服务端获取历史直播 |
| A12 | 影院模式 | VideoTools/Cinema/Cinema.js | 接入 / 低 | 页面 CSS 和入口按钮；需要 StyleHook 或等价样式注入 |
| A13 | 亮度、对比度、饱和度 | VideoTools/VideoFilter/VideoFilter.js | 接入 / 低 | 三项可分别开关，建议共用一套 CSS filter 状态 |
| A14 | 预设画面滤镜 | VideoTools/VideoFilter/VideoFilter.js | 接入 / 中 | CSS filter、伪元素和混合效果，依赖 StyleHook |
| A15 | 镜像画面 | VideoTools/VideoFilter/VideoFilter.js | 1.5.5 已提取 | 播放器右键菜单切换水平镜像；与旋转统一管理，仅变换视频，刷新复位 |
| A16 | 90 度旋转画面 | VideoTools/VideoFilter/VideoFilter.js | 1.5.5 已提取 | 右键每次顺时针旋转 90°，四次复位；90°/270° 自动适配缩放，可与镜像组合 |
| A17 | Edge“画质增强”入口 | VideoTools/VideoFilter/VideoFilter.js | 接入 / 低 | 实际修改 imageRendering 并显示浏览器增强提示；不是本地超分算法，也不同于 A02 |
| A18 | 全景播放 | VideoTools/VideoFilter/VideoFilter.js | 接入 / 高 | require/PanoramaVideo + 外部 THREE；可独立于普通滤镜移除 |
| A19 | 直播画面局部缩放 | VideoTools/VideoZoom/VideoZoom.js | 接入 / 中 | 选区与视频变换；与镜像、旋转、画中画的布局需协调 |
| A20 | 视频截图 | VideoTools/Camera/Main/Camera.js、Video/Camera.js | 接入 / 中 | canvas、下载工具；直播和点播各有入口，不必保留 GIF 库 |
| A21 | 录制 GIF | VideoTools/Camera/Main/Camera.js、Video/Camera.js、index.js | 接入 / 中 | 外部 GIF 库、编码 worker、连续采帧；原版不是通用 MP4 录屏 |
| A22 | 复制真实直播流 | CopyRealLive/CopyRealLive.js | 接入 / 中 | require/RealLive/Douyu、MD5、跨域请求、GM_setClipboard |
| A23 | 纯音频播放 | AudioLine/AudioLine.js | 接入 / 中 | 暂停主视频，再调用 PopupPlayer 的 createNewAudio_Douyu；不能只复制 AudioLine 文件 |
| A24 | 同屏多直播间/悬浮小窗 | PopupPlayer/PopupPlayer.js | 接入 / 高 | 可按斗鱼、虎牙、B站、iframe、任意直播流进一步拆分；FLV 播放路径需要 flv.js，对应平台各有流地址解析器 |
| A25 | 主播推流设备/编码信息 | VideoTools/MetaData/MetaData.js | 接入 / 中 | 获取直播流，通过 flv.js 的 media_info 读取流中实际存在的元数据；不保证每个主播都有完整配置 |
| A26 | Joysound 音效增强控制 | VideoTools/Joysound/Joysound.js | 外部，入口接入 / 中 | 检测另一个脚本的 hasInstalledJoysound，调用其 enable/disable；仓库没有完整音效实现 |

## B. 画中画增强：建议作为独立功能包

源码集中在 `VideoTools/PictureInPictureControl/`。它与 A24 的页面内多窗口播放器是两套实现。入口已接入，整体拆分复杂度高。

| 编号 | 可选部分 | 主要文件 | 依赖与边界 |
|---|---|---|---|
| B01 | 独立画中画窗口与原生画中画回退 | PictureInPictureControl.js | documentPictureInPicture、captureStream，或原生 video.requestPictureInPicture；必须从用户操作触发 |
| B02 | 画中画显示直播弹幕 | PictureInPictureControlCore.js、Template.js | 自建弹幕 WebSocket、协议解析、轨道分配；可以只保留视频而去掉这一部分 |
| B03 | 重复弹幕隐藏/合并与高能提示 | PictureInPictureControlCore.js、SetPanel.js | 依赖 B02 的消息处理和渲染；与 C06 的主页面去重不是同一套实现 |
| B04 | 过滤无用户标识的弹幕 | PictureInPictureControlCore.js、SetPanel.js | 原 UI 称“屏蔽机器人”，实际按消息字段过滤，不能当成可靠机器人识别 |
| B05 | 字号、轨道高度、速度、透明度、显示区域 | PictureInPictureControlSetPanel.js | 依赖 B02；这些参数适合保留为同一设置面板 |
| B06 | 在画中画发送弹幕 | PictureInPictureControlSendDanmu.js | 依赖主页面输入/发送流程及画中画 UI；可与只读弹幕分开 |
| B07 | 原页面低功耗显示模式 | PictureInPictureControl.js | 隐藏源页面的视频区、飘屏弹幕和礼物动画，保留右侧列表；需在退出时恢复 |
| B08 | 后台解码保活与卡屏恢复 | PictureInPictureControl.js、SetPanel.js | 与 A04 共用设置，涉及源视频与窗口生命周期；不宜原封不动单独复制 |

## C. 弹幕显示、输入和工具

| 编号 | 可拆分功能 | 源码位置 | 状态 / 难度 | 提取边界与依赖 |
|---|---|---|---|---|
| C01 | 弹幕输入历史，上下键取回 | ChatTools/ChatMemory/ChatMemory.js | 接入 / 低 | 内存最多 200 条；依赖光标位置辅助函数，不是持久化聊天记录 |
| C02 | 弹幕小尾巴 | DanmakuTail/DanmakuTail.js | 接入 / 中 | 输入事件、文本读写、设置；可替换原右侧设置面板 |
| C03 | 进入房间自动最高粉丝弹幕色 | ExpandTool/ExpandTool_AutoBarrageColor.js | 接入 / 低 | 在当前已解锁颜色中自动选择；与循环发送的自动换色分开 |
| C04 | 调整输入框长度限制 | RemoveChatLengthLimit/ChangeDanmakuLengthLimit.js | 接入 / 低 | 实际是 maxLength 加 20 并调整按钮 class，不是取消服务端限制 |
| C05 | 恢复房间弹幕显示配置 | ShowDanmaku/ShowDanmaku.js | 接入 / 中 | ScriptHook + ResponseHook，将 player_barrage 从 0 改为 1；启动时机关键 |
| C06 | 主页面重复弹幕去重/计数 | Shield/RemoveRepeatedDanmaku.js | 接入 / 中至高 | ScriptHook、DomHook、缓存与清理定时器；拆分时同时检查飘屏和聊天列表 |
| C07 | 屏蔽进场弹幕 | Shield/RemoveEnter.js | 接入 / 低 | 设置弹幕区域 CSS 变量；可脱离原过滤面板 |
| C08 | 屏蔽弹幕背景 | Shield/RemoveDanmakuBackground.js | 接入 / 低 | CSS 与设置 |
| C09 | 隐藏粉丝牌、贵族等弹幕前缀 | Refresh/Refresh_Barrage.js | 接入 / 低 | CSS；需解除 Refresh 三个子功能共用保存函数的关系 |
| C10 | 本地弹幕收藏与搜索 | DanmakuCollect/DanmakuCollect.js | 接入 / 中 | XHR 响应修改、本地数据、DOM 监听；原版宣传“无限收藏”，实际仍受浏览器存储限制 |
| C11 | 弹幕 +1 复读 | BarragePanel/BarragePanel_Tip.js | 接入 / 低至中 | DomHook + sendBarrage；图片分支还调用 ImageDanmaku 辅助函数，可只留纯文本 |
| C12 | 弹幕右键用户信息、粉丝牌展示 | BarragePanel/BarragePanel.js | 接入 / 中 | 从现有 DOM 提取并扩展菜单 |
| C13 | 右键引用/回复弹幕 | BarragePanel/BarragePanel.js | 接入 / 低至中 | 填入输入框，随后由用户发送；可与其他右键项分离 |
| C14 | 右键指定时长禁言 | BarragePanel/BarragePanel.js | 接入 / 中 | 借用 LiveTool/Mute 的 addMuteUser；需要账号权限，不必保留自动关键词禁言 |
| C15 | 查询用户历史弹幕入口 | BarragePanel/BarragePanel.js | 接入 / 中，外部数据 | 调用 doseeing 查询用户，再打开其页面；文件中的旧 fz996 查询函数不能当作当前主路径 |
| C16 | 循环/随机发送、间隔与限时 | BarrageLoop/BarrageLoop.js | 接入 / 中 | 本地列表、计时器、sendBarrage；可以进一步去掉模板、换色、网络文案功能 |
| C17 | 保存多套待发送弹幕模板 | BarrageLoop/BarrageLoop.js | 接入 / 低至中 | 可以仅保留模板选择/填入，不保留自动发送 |
| C18 | 循环发送时自动变色 | BarrageLoop/BarrageLoop.js | 接入 / 中 | 调用页面颜色选项；依赖循环发送流程或另设触发方式 |
| C19 | 网络文案模式 | BarrageLoop/BarrageLoop.js | 接入 / 中，外部数据 | 原 UI 称“舔狗模式”，从 shadiao 接口取文案；可删除而保留手动列表 |
| C20 | 图片弹幕显示和发送 | ImageDanmaku/ImageDanmaku.js | 初始化未接入 / 高 | 图片编码、上传、DOMPurify、跨域；部分转换函数仍被 +1 使用 |
| C21 | 屏蔽图片弹幕 | Shield/RemoveDanmakuImage.js | 未接入 / 低 | CSS 与过滤开关；原 Shield 初始化没有调用它 |
| C22 | 自定义弹幕大小 | ExpandTool/ExpandTool_BarrageSize.js | 上层调用注释 / 低 | CSS 与设置；目前不能算已接入功能 |

## D. 页面整理与信息显示

| 编号 | 可拆分功能 | 源码位置 | 状态 / 难度 | 提取边界与依赖 |
|---|---|---|---|---|
| D01 | 隐藏广告、推广、引导和干扰浮层 | RemoveAD/RemoveAD.js | 接入 / 低 | 主要是选择器 CSS 黑名单；可按广告、推荐、活动、二维码等逐条选择，不是通用网络广告拦截器 |
| D02 | 页面细节样式优化 | RemoveAD/RemoveAD.js | 接入 / 低 | 弹幕滚动条、布局、关注列表高度等夹杂在广告样式中，可分离 |
| D03 | 关闭私信角标提醒 | RemoveAD/RemoveMsgNotice.js | 接入 / 低 | CSS + 本地开关 |
| D04 | 夜间模式 | Night/Night.js | 接入 / 中 | 大量页面和 iframe 样式、GM 存储、DomHook；精简时可只保留直播间样式 |
| D05 | 隐藏礼物栏 | Refresh/Refresh_Video.js | 接入 / 中 | 与 ExPanel 浮动位置、播放器工具栏菜单有联动；核心隐藏样式可以单独提取 |
| D06 | 拉高弹幕框、隐藏日榜周榜和活动区 | Refresh/Refresh_BarrageFrame.js | 接入 / 低 | DOM 布局修改与状态保存 |
| D07 | 关注列表增强 | FollowList/FollowList.js | 接入 / 中 | 获取关注列表、开播信息、新页/当前页打开；长按同屏播放另依赖 PopupPlayer，可去掉 |
| D08 | 今日活跃/弹幕/送礼人数及礼物金额 | RealAudience/RealAudience.js | 接入 / 中，外部数据 | 数据来自 doseeing 聚合；不能将“今日累计活跃人数”解释成实时在线人数 |
| D09 | 贵宾数显示 | RealAudience/RealAudience.js | 接入 / 中 | 由 LiveTool 的 WebSocket 分发更新，可只提取此处理器 |
| D10 | 已播时长、开播时间、今日观看时长 | RealAudience/RealAudience.js | 接入 / 中 | 斗鱼房间/观看接口和日期函数；可与 D08 第三方数据拆开 |
| D11 | 主播头像处回看、投稿、鱼吧入口 | RealAudience/RealAudience.js | 接入 / 中 | 房间与绑定鱼吧信息、DOM；同文件中独立于人数统计的一组功能 |
| D12 | 未开播时显示上次开播时间 | LastLiveTime/LastLiveTime.js | 接入 / 低 | 从页面中的 show_status/show_time 提取，格式化并展示 |
| D13 | 背包礼物到期、总价值和亲密度 | BagInfo/BagInfo.js | 接入 / 中 | 背包接口 + DomHook；界面还混入“清空背包”，可移除该按钮只保留只读信息 |
| D14 | 粉丝牌获得日期和持有天数 | FansBadgeList/FansBadgeList.js | 特定页面接入 / 低 | 在粉丝牌列表页读取 data-fans-gbdgts，无需直播间主流程 |
| D15 | 月消费与粉丝牌日志统计 | MonthCost/MonthCost.js | 接入 / 中 | 登录态接口、时间区间与统计 UI |
| D16 | 房间 VIP 到期提示 | RoomVip/RoomVip.js | 接入 / 中 | 获取用户权益页面并解析 |
| D17 | 主播口袋权益信息 | CheckAnchorPocket/CheckAnchorPocket.js | 接入 / 中 | pocket/effective 接口，将项目图标与信息插入粉丝牌面板 |
| D18 | 全站抽奖信息列表 | Lottery/Lottery.js | 接入 / 中 | 抽奖大厅、详情、粉丝牌接口与轮询；此模块重点是信息查看 |
| D19 | 恢复已关闭鱼吧的访问入口/页面 | RestoreYuba/RestoreYuba.js | 接入 / 高 | 主站响应 Hook、鱼吧路由、请求改写和 DOM 监听，需要跨页面配合 |

## E. 直播间消息驱动的自动化

这些模块通过 `LiveTool/LiveTool.js` 创建的一条 `Ex_WebSocket_UnLogin` 接收消息，再逐项分发。每个业务可以独立拆，但建议共用一个连接，不要每保留一个小功能就建一个连接。

| 编号 | 可拆分功能 | 源码位置 | 状态 / 难度 | 提取边界与依赖 |
|---|---|---|---|---|
| E01 | 当前连接房间的开播提醒 | LiveTool/LiveNotice/LiveNotice.js | 消息处理已接入 / 中 | rss 消息 + 桌面通知；点击通知还会调用 signRoom，可去掉签到动作。不是全关注列表后台监控 |
| E02 | 自动欢迎进入用户 | LiveTool/Enter/Enter.js | 接入 / 中 | 进场消息、规则、sendBarrage |
| E03 | 关键词/正则自动回复 | LiveTool/Reply/Reply.js | 接入 / 中 | 弹幕消息、规则、sendBarrage |
| E04 | 关键词/正则自动禁言 | LiveTool/Mute/Mute.js | 接入 / 中 | 弹幕消息、房管权限查询、禁言接口 |
| E05 | 自动感谢礼物 | LiveTool/Gift/Gift.js | 接入 / 中 | 礼物消息、礼物配置、sendBarrage |
| E06 | 宝箱消息触发领取 | LiveTool/Treasure/Treasure.js | 接入 / 中至高 | 与 ExpandTool/Treasure 共用开关、延时与领取流程；遇验证仍需人工处理 |
| E07 | 弹幕投票 | LiveTool/Vote/Vote.js | 接入 / 中 | 消息统计、选项、计时、结果面板 |
| E08 | 弹幕时速统计 | LiveTool/BarrageSpeed/BarrageSpeed.js | 接入 / 中 | 消息计数与时间窗口 |
| E09 | 贡献榜贡献值显示 | LiveTool/RankList/RankList.js | 接入 / 中 | 榜单消息 + DOM 更新 |
| E10 | 检查自己弹幕是否收到回显 | LiveTool/BarrageSendCheck/BarrageSendCheck.js | 接入 / 中 | 本地发送记录、DOM 监听与独立 WS 消息匹配；结果应理解为回显检查 |

## F. 礼物、背包、活动与签到

这些功能可以拆，但必须区分“查看信息”和“改变账号状态”。例如“清空背包”实际是赠送礼物，签到组合里也包含关注/取消关注操作。

| 编号 | 可拆分功能 | 源码位置 | 状态 / 难度 | 提取边界与依赖 |
|---|---|---|---|---|
| F01 | 一键续粉丝牌 | FansContinue/FansContinue.js | 接入 / 中 | 粉丝牌列表 + 赠送背包礼物接口；会实际送出礼物 |
| F02 | 赠送指定数量的礼物 | ExpandTool/ExpandTool_SendGift.js | 接入 / 中 | 礼物接口、账号 Cookie/Token、房间信息 |
| F03 | 清空背包 | ExpandTool/ExpandTool_ClearBag.js、BagInfo/BagInfo.js | 接入 / 中 | getBagGifts、clearBagGifts 及赠送辅助函数分散在多个文件；实际赠送背包内礼物 |
| F04 | 半自动抢宝箱 | ExpandTool/ExpandTool_Treasure.js | 接入 / 中至高 | 页面 socketProxy 的现有宝箱 + E06 新消息；设置、验证容器和领取逻辑应一起梳理 |
| F05 | 抢直播间礼物红包 | ExpandTool/ExpandTool_RedPacket_Room.js | 接入 / 中 | 红包列表、领取接口、计时器 |
| F06 | 自动钓鱼 | ExpandTool/ExpandTool_AutoFish.js | 接入 / 中 | 钓鱼活动状态、抛竿/收杆接口与时间控制 |
| F07 | 领取用户等级任务奖励 | LevelTask/LevelTask.js | 定时入口接入 / 中 | 查询已完成任务并领取，不等于自动完成所有任务 |
| F08 | 关注直播间签到 | Sign/Sign_Room.js | 签到按钮接入 / 中 | 关注列表、房间签到；支持开播房间/全部房间 |
| F09 | 鱼吧签到 | Sign/Sign_Yuba.js | 签到按钮接入 / 中 | 鱼吧关注、签到等接口和跨域请求 |
| F10 | 客户端签到 | Sign/Sign_Client.js | 签到按钮接入 / 中 | 客户端接口与 Token |
| F11 | 月度活动签到 | Sign/Sign_ActqzsUserTask.js | 签到按钮接入 / 中 | 月度配置 + actqzs/cardArena 接口，内置固定房间列表；维护时应改成自己的配置 |
| F12 | 阅读鱼吧帖子任务 | Sign/Sign_ReadPosts.js | 签到按钮接入 / 低至中 | 请求固定帖子详情，不是一般阅读器 |
| F13 | 关注任务 | Sign/Sign_Follow.js | 签到按钮接入 / 中 | 对固定房间先关注再取消；不能当成纯签到 |
| F14 | 粉丝家园/粉丝树签到 | Sign/Sign_FansTree.js | 签到按钮接入 / 中 | fanshome/sign 接口 |
| F15 | 超级粉丝签到 | Sign/Sign_SuperFans.js | 签到按钮接入 / 中 | dfansact/userSign 接口 |
| F16 | 积分活动签到 | Sign/Sign_OPFOY.js | 签到按钮接入 / 中 | 内置 20250521OPFOY 活动标识；需要 CSRF 和活动有效性适配 |
| F17 | 定时领取观看积分 | Sign/Sign_OPFOY.js | 定时入口接入 / 中 | 每 5 分钟查询领取，独立于 F16 的签到按钮 |
| F18 | 星推荐签到/关注任务 | Sign/Sign_AnchorStar.js | 签到按钮接入 / 中 | 排名房间、任务上报、关注/取消关注组合，与外站代抢入口不同 |
| F19 | 配置驱动的活动任务执行器 | Sign/Sign_Act.js、require/Activity/Activity.js | 空配置 / 中至高 | actList={}，当前不执行任务；需明确活动配置才有功能 |
| F20 | 车队签到 | Sign/Sign_Motorcade.js | 主签到调用注释，专用路由仍在 / 高 | msg.douyu.com 路由、登录签名、腾讯群组接口，不是单文件独立功能 |
| F21 | TV 端签到 | Sign/Sign_TV.js | 主签到调用注释 / 中 | 专用接口与 Token |
| F22 | 鱼吧点赞任务 | Sign/Sign_Yuba_Like.js | 主签到调用注释 / 中 | 点赞接口与帖子数据 |
| F23 | 广告签到奖励 | Sign/Sign_Ad_Sign.js | 调用注释且注释标记失效 / 中 | 历史广告奖励接口，不能直接认为可恢复使用 |
| F24 | 广告观看/鱼塘等任务链 | AdVideo/ 下所有文件 | 顶层入口注释 / 高 | FishPond、Yuba、Search、Guess、Xiaoxiaole；依赖 DyWatchAd、旧接口及链式调用，其中存在旧函数引用，需逐项核验 |

## G. 其他本地功能、外部入口和项目自身功能

| 编号 | 功能 | 源码位置 | 状态 / 难度 | 判断 |
|---|---|---|---|---|
| G01 | 多账号保存、切换、删除 | AccountList/AccountList.js | 接入 / 高 | GM_cookie、GM 存储、多个子域 iframe 与 postMessage、router 配合；应该整包拆分 |
| G02 | 幻神外观模式 | ExpandTool/ExpandTool_Gold.js | 接入 / 中 | 修改自己弹幕、等级牌等本地外观；不是获得真实贵族权益 |
| G03 | 荧光棒显示为超火动画 | ExpandTool/ExpandTool_Gold.js | 接入 / 中 | 本地 DOM + SVGA 动画 + 用户信息；可独立删除，不能改变真实礼物价值 |
| G04 | 随机火力全开房间跳转 | FirePower/FirePower.js | 未接入 / 中 | 房间推荐接口 + 导航 |
| G05 | 星推荐红包代抢外站 | AutoAnchorStar/AutoAnchorStar.js | 外部，入口接入 / 低 | 打开 xtj.douyuex.com，没有本地完整代抢实现 |
| G06 | 在线弹幕助手外站 | Monitor/Monitor.js | 外部，入口接入 / 低 | 打开项目网站，不是本地监控引擎 |
| G07 | CS 饰品工具入口 | Fkbuff/Fkbuff.js | 外部，入口接入 / 低 | 打开 fkbuff.com |
| G08 | SyncJoy 入口 | SyncJoy/SyncJoy.js | 外部，入口注释 / 低 | 打开 sb.douyuex.com |
| G09 | 移动端二维码入口 | MiniProgram/MiniProgram.js | 入口注释 / 低 | 展示外部二维码资源 |
| G10 | 自动检查原版更新、更新入口 | Update/Update.js | 接入 / 低至中 | 原作者服务与 GreasyFork；个人维护版应单独决定更新来源，不能原样沿用 |
| G11 | 每周项目求星弹窗 | WeeklyPanel/WeeklyPanel.js | 接入 / 低 | 每周显示项目推广，不是直播统计周报 |
| G12 | 百度访问统计 | Statistics/Statistics.js | 接入 / 低 | 注入 hm.baidu.com 脚本，与观看功能无关 |
| G13 | 控制台项目信息 | Console/Console.js | 接入 / 低 | 日志展示 |
| G14 | 油猴菜单与重置设置 | Menu/Menu.js、Reset/Reset.js | 接入 / 低 | 服务于原版设置；精简版应只重置自己的键，不直接搬用原重置逻辑 |
| G15 | 精灵球入口、主面板、扩展面板、播放器菜单 | ExIcon/、ExPanel/、ExpandTool/ExpandTool.js、VideoTools/VideoToolbarMenu/ | 接入 / 中 | 是功能承载 UI，可用油猴菜单或小面板替换，无需随所有功能迁移 |

## H. 点播/回放页面专用功能

这些由 `router.js → initRouter_Video()` 载入，运行在 v.douyu.com，不是普通直播间。

| 编号 | 可拆分功能 | 源码位置 | 难度 | 依赖 |
|---|---|---|---|---|
| H01 | 进度预览显示实际日期时间 | VideoTime/VideoTime.js | 中 | 视频信息接口、预览图时间解析、多个 Shadow DOM 层级与 MutationObserver |
| H02 | 视频流链接复制 | DyVideoDownload/DyVideoDownload.js、apis.js | 中 | DyVideoSign、流地址接口、剪贴板；可去掉本地下载逻辑 |
| H03 | 视频分片下载 | DyVideoDownload/DyVideoDownload.js、apis.js | 高 | M3U8、签名与分片合并；大文件内存占用需要单独处理 |
| H04 | 弹幕导出为 ASS 字幕 | DyVideoDownload/DyVideoDownload.js、apis.js | 中 | 弹幕分页接口、require/ASS、下载函数；不必带 XLSX |
| H05 | 弹幕导出为 Excel | DyVideoDownload/DyVideoDownload.js、apis.js | 中 | 同一弹幕数据源 + XLSX；不必带 ASS |
| H06 | 弹幕高能进度条 | DyVideoDownload/DyVideoBarrageLine.js、apis.js | 中 | 弹幕分页数据、密度统计和播放器 DOM |
| H07 | 点播截图/GIF | VideoTools/Camera/Video/Camera.js | 中 | 与 A20/A21 属同类能力，但视频节点与按钮适配单独实现 |

## 不能按文件名直接删除的依赖

| 看起来独立的功能 | 实际关联 | 精简时怎么处理 |
|---|---|---|
| 自动欢迎、回复、谢礼物、+1 | sendBarrage 放在 BarrageLoop.js | 提取纯发送适配器，不用保留自动循环发送 |
| 弹幕小尾巴、输入历史、其他填入操作 | ChatMemory 中的 getBarrageValue/setBarrageValue 以及 common 光标函数 | 提取统一输入框访问函数，适配 textarea/contenteditable |
| 右键禁言 | LiveTool/Mute 的禁言接口函数 | 只保留接口，不保留自动禁言规则引擎 |
| 背包只读信息 | getBagGifts 在 ExpandTool_ClearBag，赠送流程在 BagInfo 等文件 | 分离“读取背包”和“赠送礼物”服务，避免为了查看信息携带送礼按钮 |
| 音频播放、关注列表长按 | PopupPlayer 的播放器创建与数组状态 | 提取音频播放器，或删除长按联动 |
| 隐藏礼物栏 | ExPanel 浮动定位、播放器工具菜单、Refresh 共用状态 | 替换入口与保存函数，保留必要布局恢复 |
| 画中画 | TabSwitch 设置/保活、WS、模板、渲染、发送、样式 | 作为单独功能包维护，按子功能删减 |
| 人数/贵宾数 | 第三方接口与 LiveTool WS 混在一个模块 | 拆成第三方统计、斗鱼时长、贵宾消息三个数据源 |
| 同屏播放/流地址/推流信息 | RealLive + MD5 + flv.js | 只复制流地址无需播放器库；仅看原视频无需流解析 |
| 弹幕恢复/去重 | ScriptHook、ResponseHook 的全局注册和执行顺序 | 先登记拦截规则，再启动拦截；不能套用“等播放器出现后再初始化” |
| 点播下载与高能条 | apis.js 的签名/弹幕查询函数 | 共享数据访问层，避免重复抓取整段弹幕 |
| 多账号 | passport/msg/yuba/v/cz 等路由 | 连同匹配域、Cookie 权限、消息通信一起评估 |

## 应按需保留的基础组件

- `common.js`：不要全量带入。按需提取房间识别、DOM 查找、Cookie/Token、日期格式化、下载、输入光标、提示等函数；文件顶层还会读取页面与账号数据。
- `DomHook`：MutationObserver 封装，适合保留小型公共版本并补充清理生命周期。
- `StyleHook`：样式插入/删除，可由简短 CSS 管理器替代。
- `ScriptHook`、`ResponseHook`：只有修改网页脚本或接口的功能才需要；后者目前主要处理 XHR responseText，不能视为所有网络请求的通用拦截器。
- `WebSocket`、`WebSocket_UnLogin`：消息驱动功能的协议封包、解包、连接与心跳；应统一消息订阅和清理。
- `STT`：协议辅助代码，是否需要应沿实际调用链核查，不按目录名自动纳入。
- `RealLive`：斗鱼/虎牙/B站流地址解析可分别选取；斗鱼签名还依赖 MD5。
- `PanoramaVideo` + THREE：只随全景播放保留。
- `M3u8`、`DyVideoSign`、`ASS`：分别用于视频分片、点播签名、字幕导出。
- `DyWatchAd`、`Activity`：只随对应活动任务提取。
- `CClick`：区分点击/长按；若改成两个菜单项可以省去。
- `Notice`、`PostBirdAlertBox`、Switch/TimeLine 样式：提示和界面基础，不是独立直播功能，可统一替换。
- 外部 `flv.js`、`svgaplayerweb`、`gif.js`、`three`、`xlsx`、`DOMPurify` 分别对应流播放、SVGA 动画、GIF、全景、表格导出、图片 HTML 清理；没有相关功能时无需携带原版全部 @require。

## 适合个人维护的拆分顺序

1. **小型观看工具**：A01/A02 已完成；可继续选择 A03、A06、A08、A09、A10、A11。这些不需要活动接口和弹幕连接。
2. **页面整理**：D01/D03/D05/D06、C07/C08/C09。先确定每个选择器要隐藏什么，避免整包广告样式带入不想改变的布局。
3. **输入与显示**：C01/C02/C03/C11、D12/D14。建立小型 DOM/存储/输入适配层即可。
4. **进阶播放器**：A13–A21 与 B 组。画中画、GIF、全景应按需独立维护依赖。
5. **接口与消息工具**：D08–D19、E/F/G01/H 组。每项单独验证网页结构、接口返回、登录要求、清理流程，再决定是否迁移。

建议继续保持原版作为参考；新功能在 `simplified/` 下维护。功能变多后再拆成小模块并添加独立构建入口，最终输出一个可选功能的油猴脚本。这样能够共享基础代码，又不用引入原版所有功能。此清单没有执行任何上述迁移或删除。
