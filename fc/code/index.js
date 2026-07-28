'use strict';

// 阿里云函数计算 FC 版本：自动登录考勤系统并截图发邮件
// 运行时: nodejs16 + 官方公共层 Nodejs-Puppeteer17x（层内自带 puppeteer + Chromium）
const puppeteer = require('puppeteer');
const nodemailer = require('nodemailer');
const fs = require('fs');
const path = require('path');

// 兼容函数：处理不同版本的waitForTimeout
async function waitForTimeout(page, ms) {
    if (typeof page.waitForTimeout === 'function') {
        return await page.waitForTimeout(ms);
    } else {
        return await new Promise(resolve => setTimeout(resolve, ms));
    }
}

// 注册代码包内的中文字体（FC 环境默认无中文字体）
function setupChineseFonts() {
    const fontDir = path.join(__dirname, 'fonts');
    if (fs.existsSync(path.join(fontDir, 'fonts.conf'))) {
        process.env.FONTCONFIG_PATH = fontDir;
        console.log('Chinese fonts registered from:', fontDir);
    } else {
        console.log('Warning: fonts dir not found, Chinese may render as boxes');
    }
}

function createTransporter() {
    return nodemailer.createTransport({
        host: 'smtp.qq.com',
        port: 465,
        secure: true,
        auth: {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS
        }
    });
}

// 主任务：登录、截图、发邮件（定时触发和 HTTP 手动触发共用）
async function runTask() {
    let browser = null;
    try {
        // 检查环境变量（在 FC 函数配置中设置）
        if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
            throw new Error('SMTP 邮箱配置未设置');
        }
        if (!process.env.LOGIN_USER || !process.env.LOGIN_PASS) {
            throw new Error('登录账号密码未设置');
        }
        const targetUrl = process.env.TARGET_URL || 'https://kqapp.centaline.com.cn/onecard/m/home';

        setupChineseFonts();

        console.log('Launching browser...');
        browser = await puppeteer.launch({
            headless: true,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-gpu',
                '--no-first-run',
                '--no-zygote',
                '--window-size=1920,1080',
                '--force-device-scale-factor=1',
                '--font-render-hinting=medium'
            ],
            defaultViewport: { width: 1920, height: 1080 },
            timeout: 120000
        });

        const page = await browser.newPage();
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36');
        await page.emulateTimezone('Asia/Shanghai');

        console.log('Goto page:', targetUrl);

        // 添加重试机制，最多重试3次
        let retries = 3;
        let lastError;
        while (retries > 0) {
            try {
                await page.goto(targetUrl, {
                    waitUntil: 'domcontentloaded',
                    timeout: 120000
                });
                console.log('Page loaded successfully');
                break;
            } catch (error) {
                retries--;
                lastError = error;
                console.log(`Page load failed, retries remaining: ${retries}`);
                console.log('Error:', error.message);
                if (retries > 0) {
                    await waitForTimeout(page, 5000);
                }
            }
        }

        if (retries === 0) {
            throw lastError;
        }

        // 等待页面加载完成
        await waitForTimeout(page, 5000);

        // 尝试查找登录表单元素 - 首先检查是否有iframe
        console.log('Checking if login form is in iframe...');
        const iframes = await page.$$('iframe');
        let loginFrame = null;

        for (let i = 0; i < iframes.length; i++) {
            try {
                const frameContent = await iframes[i].contentFrame();
                if (frameContent) {
                    const hasUsername = await frameContent.$('#username').catch(() => null);
                    const hasPassword = await frameContent.$('#password').catch(() => null);
                    if (hasUsername || hasPassword) {
                        loginFrame = frameContent;
                        console.log('Found login form in iframe');
                        break;
                    }
                }
            } catch (err) {
                console.log('Error accessing iframe:', err.message);
            }
        }

        // 确定操作的上下文（主页面或iframe）
        const ctx = loginFrame || page;

        // 尝试不同的用户名选择器
        console.log('Finding username field...');
        const usernameSelectors = ['#username', '[name="username"]', '[placeholder*="账号"]', '[placeholder*="用户名"]', '.el-input__inner[placeholder*="账号"]', '#el-id-1154-2', '[id*="el-id-"]'];
        let usernameField = null;

        for (const selector of usernameSelectors) {
            try {
                usernameField = await ctx.waitForSelector(selector, { timeout: 5000 });
                if (usernameField) {
                    console.log('Found username field with selector:', selector);
                    break;
                }
            } catch (err) {
                console.log('Selector not found:', selector);
            }
        }

        if (!usernameField) {
            throw new Error('未找到用户名输入框');
        }

        // 尝试不同的密码选择器
        console.log('Finding password field...');
        const passwordSelectors = ['#password', '[name="password"]', '[placeholder*="密码"]', '.el-input__inner[placeholder*="密码"]', '#el-id-1154-3', '[id*="el-id-"]'];
        let passwordField = null;

        for (const selector of passwordSelectors) {
            try {
                passwordField = await ctx.waitForSelector(selector, { timeout: 5000 });
                if (passwordField) {
                    console.log('Found password field with selector:', selector);
                    break;
                }
            } catch (err) {
                console.log('Selector not found:', selector);
            }
        }

        if (!passwordField) {
            throw new Error('未找到密码输入框');
        }

        // 填充登录信息
        console.log('Filling login credentials...');
        await usernameField.focus();
        await usernameField.type(process.env.LOGIN_USER, { delay: 80 });
        await passwordField.focus();
        await passwordField.type(process.env.LOGIN_PASS, { delay: 80 });

        // 尝试不同的登录按钮选择器
        console.log('Finding login button...');
        const loginButtonSelectors = ['#login-button', '#submit', '[type="submit"]', '[name="submit"]', '.login-btn', '.submit-btn', '.el-button--primary', '.h40', '.el-button.el-button--primary.el-button--small.h40'];
        let loginButton = null;

        for (const selector of loginButtonSelectors) {
            try {
                loginButton = await ctx.waitForSelector(selector, { timeout: 5000 });
                if (loginButton) {
                    console.log('Found login button with selector:', selector);
                    break;
                }
            } catch (err) {
                console.log('Selector not found:', selector);
            }
        }

        if (!loginButton) {
            // 尝试点击所有按钮，看是否有登录功能
            console.log('Trying to find login button by text...');
            const buttons = await ctx.$$('button');
            for (let i = 0; i < buttons.length; i++) {
                const buttonText = await buttons[i].evaluate(el => el.textContent || el.innerText || '');
                const buttonClasses = await buttons[i].evaluate(el => el.className || '');
                if (buttonText.includes('登录') || buttonText.includes('Login')) {
                    loginButton = buttons[i];
                    console.log('Found login button by text:', buttonText);
                    break;
                } else if (buttonClasses.includes('el-button--primary') || buttonClasses.includes('h40')) {
                    loginButton = buttons[i];
                    console.log('Found login button by class:', buttonClasses);
                    break;
                }
            }
        }

        if (!loginButton) {
            throw new Error('未找到登录按钮');
        }

        // 执行登录
        console.log('Clicking login button...');
        const navigationPromise = ctx.waitForNavigation({
            waitUntil: ['networkidle2', 'domcontentloaded'],
            timeout: 30000
        }).catch(() => {
            console.log('Navigation did not happen - maybe SPA');
        });

        await loginButton.click();
        await navigationPromise;

        // 等待页面加载完成
        await waitForTimeout(page, 3000);

        // 检查是否登录成功（尝试查找登录后才会出现的元素）
        console.log('Checking if login was successful...');
        const loggedInSelectors = [
            '.user-info', '.avatar', '.logout-btn', '[href*="logout"]',
            '.home-page', '.dashboard', '.welcome-message'
        ];

        let isLoggedIn = false;
        for (const selector of loggedInSelectors) {
            try {
                await page.waitForSelector(selector, { timeout: 3000 });
                isLoggedIn = true;
                console.log('Login successful! Found logged-in element:', selector);
                break;
            } catch (err) {
                // 忽略选择器未找到的错误
            }
        }

        if (!isLoggedIn) {
            console.log('Warning: Could not confirm login success, but proceeding with screenshot');
        }

        // 等待动态内容加载并滚动触发渲染
        await waitForTimeout(page, 8000);
        console.log('Interacting with page to load all content...');
        await page.evaluate(async () => {
            window.scrollTo(0, document.body.scrollHeight);
            await new Promise(resolve => setTimeout(resolve, 2000));
            window.scrollTo(0, 0);
            await new Promise(resolve => setTimeout(resolve, 1500));
            if (document.fonts && document.fonts.ready) {
                await document.fonts.ready;
            }
            await new Promise(resolve => setTimeout(resolve, 2000));
        });

        // 截图（FC 只有 /tmp 可写）
        const shotPath = '/tmp/login_screenshot.png';
        console.log('Taking final screenshot...');
        await page.screenshot({
            path: shotPath,
            fullPage: true,
            type: 'png',
            captureBeyondViewport: true
        });
        console.log('Screenshot taken successfully!');

        // 发送邮件
        console.log('Sending email...');
        const transporter = createTransporter();
        await transporter.sendMail({
            from: `FC自动化机器人 <${process.env.SMTP_USER}>`,
            to: process.env.SMTP_USER,
            subject: `【FC自动化】${isLoggedIn ? '登录成功' : '登录未知状态'} - 页面截图`,
            text: `自动登录截图已生成\n\n目标网址: ${targetUrl}\n登录账号: ${process.env.LOGIN_USER}\n截图时间: ${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}\n登录状态: ${isLoggedIn ? '成功' : '未知'}\n\n详情请查看附件`,
            html: `<p>自动登录截图已生成</p><p>目标网址: ${targetUrl}</p><p>登录账号: ${process.env.LOGIN_USER}</p><p>截图时间: ${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}</p><p>登录状态: ${isLoggedIn ? '成功' : '未知'}</p><p>详情请查看附件</p>`,
            attachments: [
                {
                    filename: `login_screenshot_${new Date().toISOString().slice(0, 10)}.png`,
                    path: shotPath
                }
            ]
        });
        console.log('Email sent successfully!');

        return { statusCode: 200, body: 'Process completed successfully! loggedIn=' + isLoggedIn };
    } catch (err) {
        console.error('Script failed with error:', err);
        console.error('Error stack:', err.stack);

        // 失败时尝试截错误图并发告警邮件
        if (process.env.SMTP_USER && process.env.SMTP_PASS) {
            try {
                const errorShotPath = '/tmp/error_screenshot.png';
                let hasShot = false;
                if (browser) {
                    const pages = await browser.pages();
                    const page = pages[pages.length - 1];
                    if (page) {
                        await page.screenshot({ path: errorShotPath, fullPage: true });
                        hasShot = true;
                        console.log('Error screenshot saved:', errorShotPath);
                    }
                }

                const transporter = createTransporter();
                await transporter.sendMail({
                    from: `FC自动化机器人 <${process.env.SMTP_USER}>`,
                    to: process.env.SMTP_USER,
                    subject: '【FC自动化】登录失败通知',
                    text: `自动登录过程中发生错误\n\n目标网址: ${process.env.TARGET_URL}\n错误时间: ${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}\n错误信息: ${err.message}`,
                    html: `<p>自动登录过程中发生错误</p><p>目标网址: ${process.env.TARGET_URL}</p><p>错误时间: ${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}</p><p>错误信息: ${err.message}</p>`,
                    attachments: hasShot ? [{ filename: 'error_screenshot.png', path: errorShotPath }] : []
                });
                console.log('Error email sent successfully!');
            } catch (emailErr) {
                console.error('Failed to send error email:', emailErr);
            }
        }

        // 抛出错误让 FC 标记本次调用失败（便于在控制台监控里看到）
        throw err;
    } finally {
        if (browser) {
            await browser.close();
            console.log('Browser closed');
        }
    }
}

// 统一入口：兼容定时触发器（event）与 HTTP 触发器（req/resp）
exports.handler = async (...args) => {
    const isHttp = args.length >= 2 && args[1] && typeof args[1].setStatusCode === 'function';

    if (isHttp) {
        const [req, resp] = args;
        // HTTP 手动触发必须校验 token，防止 URL 泄露后被任意调用
        const token = (req.queries && req.queries.token) || '';
        if (!process.env.TRIGGER_TOKEN || token !== process.env.TRIGGER_TOKEN) {
            resp.setStatusCode(403);
            resp.setHeader('Content-Type', 'text/plain; charset=utf-8');
            resp.send('Forbidden: token 无效');
            return;
        }
        try {
            const result = await runTask();
            resp.setStatusCode(200);
            resp.setHeader('Content-Type', 'text/plain; charset=utf-8');
            resp.send('✅ 执行成功，请查收邮件。' + (result && result.body ? ' ' + result.body : ''));
        } catch (e) {
            resp.setStatusCode(500);
            resp.setHeader('Content-Type', 'text/plain; charset=utf-8');
            resp.send('❌ 执行失败: ' + e.message + '（失败告警邮件已尝试发送）');
        }
        return;
    }

    // 定时触发器入口：直接执行，失败抛错让 FC 标记调用失败
    return await runTask();
};
