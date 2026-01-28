# GitHub自动登录截图工具

这是一个基于GitHub Actions的自动登录截图工具，可以定期访问指定网站，自动完成登录操作并截图，最后将截图发送到指定邮箱。

## 功能特性

- 自动登录指定网站
-  支持多种登录表单元素选择器
- 自动检测登录成功状态
- 全屏截图功能
-  通过SMTP发送邮件通知
-  失败时自动发送错误截图
-  详细的日志记录
-  环境变量配置，安全可靠

## 支持的目标网站

当前配置用于：`https://kqapp.centaline.com.cn/onecard/m/home`

## 配置说明

### 1. GitHub Secrets 配置

在GitHub仓库的`Settings > Secrets and variables > Actions`中添加以下Secrets：

| Secret名称 | 说明 | 示例值 |
|------------|------|--------|
| SMTP_USER | SMTP邮箱用户名（发件人邮箱） | `your-email@qq.com` |
| SMTP_PASSWORD | SMTP邮箱密码（授权码） | `your-smtp-password` |
| LOGIN_USERNAME | 目标网站登录用户名 | `your-username` |
| LOGIN_PASSWORD | 目标网站登录密码 | `your-password` |

### 2. SMTP邮箱设置

当前配置使用QQ邮箱SMTP服务：
- SMTP服务器：`smtp.qq.com`
- SMTP端口：`465`（SSL加密）

如果需要使用其他邮箱服务，请修改`.github/workflows/screenshot.yml`中的SMTP配置：

```javascript
let transporter = nodemailer.createTransport({
  host: 'smtp.qq.com',  // 修改为其他SMTP服务器
  port: 465,           // 修改为对应端口
  secure: true,        // 是否使用SSL
  // ...
});
```

### 3. 定时任务配置

当前配置为每月1号上午10点执行：

```yaml
on:
  schedule:
    - cron: "0 10 1 * *"  # 每月1号10点执行
  workflow_dispatch:     # 支持手动触发
```

修改`cron`表达式可以调整执行频率：
- 每天执行：`0 0 * * *`
- 每周一执行：`0 0 * * 1`
- 每小时执行：`0 * * * *`

## 使用方法

### 1. 手动触发

在GitHub仓库的`Actions > Monthly Login Screenshot > Run workflow`中点击`Run workflow`按钮即可手动触发执行。

### 2. 查看执行结果

在`Actions`页面可以查看每次执行的详细日志，包括：
- 浏览器启动日志
- 页面访问日志
- 登录操作日志
- 截图生成日志
- 邮件发送日志

### 3. 接收邮件

执行完成后，会收到一封包含截图的邮件，邮件内容包括：
- 登录状态（成功/未知）
- 目标网址
- 登录账号
- 截图时间
- 截图附件

## 本地测试

### 使用HTML测试页面

项目提供了`auto_login.html`文件，可以在本地浏览器中测试登录功能：

1. 打开`auto_login.html`文件
2. 在代码中填写登录账号密码
3. 点击"执行自动登录"按钮
4. 观察登录过程

### 使用Node.js脚本测试

```bash
# 安装依赖
npm install puppeteer nodemailer

# 设置环境变量
export SMTP_USER="your-email@qq.com"
export SMTP_PASS="your-smtp-password"
export LOGIN_USER="your-username"
export LOGIN_PASS="your-password"
export TARGET_URL="https://kqapp.centaline.com.cn/onecard/m/home"

# 执行脚本
node -e "$(cat .github/workflows/screenshot.yml | grep -A 300 'node <<'EOF'' | grep -v 'node <<'EOF'')"
```

## 注意事项

1. **账号安全**：确保GitHub Secrets的安全性，不要在代码中明文存储账号密码
2. **SMTP授权码**：使用QQ邮箱时，需要开启SMTP服务并获取授权码，而不是使用登录密码
3. **登录表单变化**：如果目标网站的登录表单结构发生变化，可能需要更新选择器
4. **网络问题**：如果执行失败，可能是网络问题导致，请查看日志确认
5. **频率限制**：避免设置过高的执行频率，以免被目标网站视为恶意访问

## 故障排查

### 常见错误及解决方案

1. **未找到用户名/密码输入框**
   - 检查目标网站的登录表单结构是否变化
   - 尝试更新选择器配置

2. **邮件发送失败**
   - 检查SMTP配置是否正确
   - 确保SMTP授权码有效
   - 检查邮箱是否开启了SMTP服务

3. **登录失败**
   - 检查账号密码是否正确
   - 检查目标网站是否有验证码或其他验证机制
   - 检查网络连接是否正常

## 技术栈

- **GitHub Actions**：自动化工作流
- **Puppeteer**：无头浏览器，用于模拟登录和截图
- **Nodemailer**：邮件发送库
- **Node.js**：脚本运行环境

## 许可证

MIT License

## 更新日志

### v2.0 (最新)
- 增强了选择器的鲁棒性，支持多种可能的表单元素
- 增加了iframe检测和处理
- 改进了登录状态检测
- 增加了错误处理和失败邮件通知
- 优化了邮件内容和格式
- 增加了详细的日志记录

### v1.0
- 基本的自动登录功能
- 简单的截图功能
- 邮件发送功能



Run node <<'EOF'
Launching browser...
Goto page: https://kqapp.centaline.com.cn/onecard/m/home
Script failed with error: TypeError: page.waitForTimeout is not a function
    at [stdin]:38:16
Error stack: TypeError: page.waitForTimeout is not a function
    at [stdin]:38:16
Error screenshot saved: error_screenshot.png
Error email sent successfully!