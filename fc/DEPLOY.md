# 阿里云函数计算 FC 自动登录截图 — 部署文档

> 每月 1 日北京时间 06:00 自动登录考勤系统（`kqapp.centaline.com.cn`）截图并发送到 QQ 邮箱，同时支持手机浏览器手动触发。

## 一、背景：为什么从 GitHub Actions 迁移到 FC

原方案使用 GitHub Actions（`.github/workflows/screenshot.yml`）定时执行，但排查发现：

- 目标站点服务器**屏蔽境外 IP**（TCP 连接直接被丢弃，报 `net::ERR_CONNECTION_TIMED_OUT`）；
- GitHub 托管 runner 全部位于境外（美国 Azure），无论怎么调超时/重试都无法连通；
- 阿里云 FC 国内 region 的公网出口是国内 IP，可正常访问目标站点（公网解析 `120.133.140.169`）。

FC 方案成本：新用户每月 15 万 CU 免费额度（3 个月）；之后按量付费，本任务每月执行 1 次、约 3 分钟，**月费用不足 1 分钱**。

## 二、目录结构

```
autoLogin/
└── fc/
    ├── s.yaml              # Serverless Devs 部署配置（函数 + 定时/HTTP 触发器）
    ├── setup-fonts.sh      # 中文字体下载脚本（部署前执行一次）
    └── code/
        ├── index.js        # 函数代码（登录 + 截图 + 发邮件，双触发入口）
        ├── package.json    # 依赖：仅 nodemailer（puppeteer 由官方层提供）
        └── fonts/
            ├── fonts.conf      # fontconfig 配置（解决截图中文方框）
            └── wqy-microhei.ttc # 文泉驿微米黑（由 setup-fonts.sh 下载）
```

## 三、核心配置说明

| 配置项 | 值 | 说明 |
| --- | --- | --- |
| 运行时 | `nodejs16` | 配合官方 Puppeteer 层 |
| 层 | `acs:fc:cn-hangzhou:official:layers/Nodejs-Puppeteer17x/versions/3` | 内置 puppeteer + Chromium，代码包无需打包浏览器 |
| 规格 | 1 vCPU / 1024MB / 磁盘 512MB | FC3 要求 cpu 与 memorySize 搭配指定（配比 1:1~1:4） |
| 超时 | 600 秒 | 脚本含大量页面等待逻辑 |
| 定时触发 | `CRON_TZ=Asia/Shanghai 0 0 6 1 * *` | 每月 1 日北京时间 06:00（CRON_TZ 免 UTC 换算） |
| HTTP 触发 | GET / anonymous | 鉴权由代码内校验 `TRIGGER_TOKEN` 实现 |
| 可写目录 | 仅 `/tmp` | 截图、字体缓存均写入 /tmp |

### 环境变量（部署时从本机 shell 注入，不落盘）

| 变量 | 用途 |
| --- | --- |
| `LOGIN_USER` / `LOGIN_PASS` | 考勤系统登录账号/密码 |
| `SMTP_USER` / `SMTP_PASS` | QQ 邮箱地址 / SMTP 授权码（非邮箱密码） |
| `TRIGGER_TOKEN` | HTTP 手动触发的鉴权 token（≥20 位随机字符串） |
| `TARGET_URL` | 目标页面（已写死默认值，可不设） |

## 四、前置准备

### 1. 创建 RAM 程序用户（最小权限原则）

1. 主账号登录 [RAM 控制台](https://ram.console.aliyun.com/users) → 身份管理 → 用户 → 创建用户；
2. 访问方式只勾选 **"使用永久 AccessKey 访问"**（不开控制台登录）；
3. **立刻保存** AccessKey ID / Secret（Secret 只显示一次）；
4. 用户 → 权限管理 → 新增授权 → 授权范围选 **"整个云账号"** → 添加 `AliyunFCFullAccess`。

> ⚠️ 不要使用"用于程序访问的超级用户"模板（权限过大）；
> ⚠️ 授权范围不要误选某个资源组，否则部署时报 403 AccessDenied。

### 2. 安装 Serverless Devs CLI

```bash
npm install -g @serverless-devs/s
s config add   # 选 Alibaba Cloud，粘贴 AK，别名填 default（对应 s.yaml 的 access: default）
```

> 💡 本机踩坑：若终端里的 npm 是 DevEco-Studio 自带的（全局目录指向应用包内部，报
> `EPERM ... DevEco-Studio.app`），用系统 Node 安装即可，**不要 sudo**：
> `PATH=/usr/local/bin:$PATH npm install -g @serverless-devs/s`

## 五、部署步骤

全部在**本机终端**执行（部署完成后云端独立运行，本机可离线）：

```bash
# 1. 下载中文字体到代码包（仅首次）
bash fc/setup-fonts.sh

# 2. 安装函数依赖（仅首次或依赖变更时）
cd fc/code && npm install --omit=dev && cd ../..

# 3. 注入凭据（每次新开终端都要重新 export）
export LOGIN_USER='考勤账号'
export LOGIN_PASS='考勤密码'
export SMTP_USER='xxx@qq.com'
export SMTP_PASS='QQ邮箱SMTP授权码'
export TRIGGER_TOKEN='openssl rand -hex 20 生成的随机串'

# 4. 部署（函数 + 两个触发器一次建齐）
cd fc && s deploy

# 5. 手动触发一次验证，然后去邮箱收截图
s invoke
```

`s deploy` 成功后会输出 HTTP 触发器的访问地址（`system_url`），形如：

```
https://auto-login-screenshot-xxxxx.cn-hangzhou.fcapp.run
```

## 六、手机手动触发

手机浏览器收藏以下链接（token 拼在后面），点开等 1~3 分钟即完成一次"登录 → 截图 → 发邮件"：

```
https://<system_url>/?token=<TRIGGER_TOKEN>
```

- 返回 `✅ 执行成功` → 去邮箱收截图；token 错误返回 403；执行失败返回 500 并已发告警邮件。
- FC 系统域名（fcapp.run）会强制加下载头，浏览器可能把结果文本当文件下载，**不影响任务执行**。
- token 是唯一安全屏障：不要分享完整链接；若泄露，换一个新 token 重新 `s deploy` 即可作废旧链接。
- 也可以不走 URL：手机浏览器登录 FC 控制台 → 函数 → 测试函数，效果相同。

## 七、部署踩坑记录

| 报错 | 原因 | 解决 |
| --- | --- | --- |
| `EPERM: mkdir .../DevEco-Studio.app/...` | npm 全局目录指向 DevEco 应用包（只读） | `PATH=/usr/local/bin:$PATH npm install -g ...`，不用 sudo |
| `AccessDenied: fc:CreateFunction ... 403` | RAM 用户未授权 `AliyunFCFullAccess`，或授权范围误选了资源组 | 重新授权，范围选"整个云账号" |
| `InvalidArgument: CPU is required` | FC3 显式指定 diskSize 等规格时必须同时给 cpu | s.yaml 增加 `cpu: 1` |
| 截图中文显示方框 | FC 环境无中文字体 | 代码包携带 wqy-microhei.ttc + fonts.conf，运行时设置 `FONTCONFIG_PATH` |

## 八、日常维护

- **改代码后重新发布**：重新 `export` 5 个环境变量 → `cd fc && s deploy`；
- **改执行时间**：改 `s.yaml` 中 `cronExpression`（`CRON_TZ=Asia/Shanghai` 前缀 = 北京时间，6 位 cron 含秒）→ `s deploy`；
- **查执行日志**：FC 控制台 → 函数 → 调用日志；定时任务失败时也会收到告警邮件；
- **停用**：FC 控制台删除函数或禁用触发器；原 GitHub Actions 的 `screenshot.yml` 已可停用（注释掉 `schedule` 即可）。
