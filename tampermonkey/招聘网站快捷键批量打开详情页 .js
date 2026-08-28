// ==UserScript==
// @name         招聘网站快捷键批量打开详情页 (防失效版)
// @namespace    http://tampermonkey.net/
// @version      2.0
// @description  Alt+O 一键在新标签页打开 Boss/智联/51Job/猎聘 岗位详情 (基于URL特征匹配，防DOM改版失效)
// @author       魔
// @match        *://*.zhipin.com/*
// @match        *://*.zhaopin.com/*
// @match        *://*.51job.com/*
// @match        *://*.liepin.com/*
// @grant        GM_openInTab
// @run-at       document-idle
// ==/UserScript==

(function() {
    'use strict';

    const SHORTCUT_KEY = 'o';
    const MAX_TABS = 15;

    // 核心：基于 URL 特征匹配详情页，无视 DOM class 改版
    const urlPatterns = {
        'zhipin.com': /\/job_detail\/|jobId=|\/web\/geek\/job\?/i,
        'zhaopin.com': /jobs\.zhaopin|\/job\/|ccid=|\/comply\//i,
        '51job.com': /jobs\.51job|\/jobinfo\/|\/job\//i,
        'liepin.com': /\/job\/|\/zhaopin\/|\/showjob\//i
    };

    // 黑名单：过滤掉公司页、登录页、首页等无关链接
    const blackList = [
        'javascript:', 'login', 'register', 'company', 'corp', 'about',
        'help', 'app', 'download', 'mobile', 'weixin', 'qq', 'weibo'
    ];

    function getDomainPattern() {
        const host = window.location.hostname;
        for (const domain in urlPatterns) {
            if (host.includes(domain)) return urlPatterns[domain];
        }
        return null;
    }

    function extractLinks() {
        const pattern = getDomainPattern();
        if (!pattern) return [];

        const links = new Set();
        const anchors = document.querySelectorAll('a[href]');

        // 1. 优先使用 URL 特征正则匹配
        anchors.forEach(a => {
            const href = a.getAttribute('href');
            if (!href) return;

            try {
                const url = new URL(href, window.location.href);
                // 必须匹配详情页特征，且不在黑名单中
                if (pattern.test(url.href) && !blackList.some(bl => url.href.toLowerCase().includes(bl))) {
                    links.add(url.href);
                }
            } catch (e) {}
        });

        // 2. 兜底方案：如果 URL 匹配失败，尝试提取页面中带有 "job" 或 "position" 相关 class 的容器内的链接
        if (links.size === 0) {
            const fallbackSelectors = [
                '[class*="job"]', '[class*="position"]', '[class*="list"]',
                '[ka*="job"]', '[data*="job"]'
            ];
            for (const sel of fallbackSelectors) {
                document.querySelectorAll(sel).forEach(container => {
                    container.querySelectorAll('a[href]').forEach(a => {
                        const href = a.getAttribute('href');
                        if (!href || href.startsWith('javascript:')) return;
                        try {
                            const url = new URL(href, window.location.href);
                            if (url.hostname.includes(window.location.hostname) &&
                                !blackList.some(bl => url.href.toLowerCase().includes(bl)) &&
                                url.href !== window.location.href) {
                                links.add(url.href);
                            }
                        } catch (e) {}
                    });
                });
                if (links.size > 0) break;
            }
        }

        return Array.from(links).slice(0, MAX_TABS);
    }

    // 简易 Toast 提示
    function showToast(msg, type = 'info') {
        const toast = document.createElement('div');
        toast.textContent = msg;
        toast.style.cssText = `
            position: fixed; top: 20px; right: 20px; z-index: 999999;
            padding: 12px 20px; border-radius: 6px; font-size: 14px;
            color: #fff; background: ${type === 'error' ? '#f56c6c' : '#409eff'};
            box-shadow: 0 4px 12px rgba(0,0,0,0.15); transition: opacity 0.3s;
        `;
        document.body.appendChild(toast);
        setTimeout(() => { toast.style.opacity = '0'; }, 2500);
        setTimeout(() => toast.remove(), 3000);
    }

    function openLinks(urls) {
        if (urls.length === 0) {
            showToast('未提取到岗位链接，请确认当前为【列表页】且已加载出岗位', 'error');
            return;
        }

        showToast(`准备打开 ${urls.length} 个详情页，请留意浏览器弹窗拦截提示`, 'info');

        urls.forEach((url, index) => {
            setTimeout(() => {
                if (typeof GM_openInTab === 'function') {
                    GM_openInTab(url, { active: false, insert: true });
                } else {
                    window.open(url, '_blank');
                }
            }, index * 150); // 稍微拉长间隔，降低拦截概率
        });
    }

    document.addEventListener('keydown', (e) => {
        if (e.altKey && e.key.toLowerCase() === SHORTCUT_KEY) {
            const tag = document.activeElement.tagName.toLowerCase();
            if (tag === 'input' || tag === 'textarea' || document.activeElement.isContentEditable) return;

            e.preventDefault();
            openLinks(extractLinks());
        }
    });
})();