// ==UserScript==
// @name         招聘网站快捷键批量打开详情页 (2026 51job DOM锁定版)
// @namespace    http://tampermonkey.net/
// @version      3.7
// @description  Ctrl+Shift+Alt+O 批量打开详情页 (彻底解决51job空白页、误开底部推荐职位问题)
// @author       魔
// @match        *://*.zhipin.com/*
// @match        *://*.zhaopin.com/*
// @match        *://*.51job.com/*
// @match        *://*.liepin.com/*
// @grant        GM_openInTab
// @run-at       document-start
// ==/UserScript==

(function() {
    'use strict';

    const MAX_TABS = 50;
    const STORAGE_KEY = 'tm_opened_jobs_v3';
    const collectedApiUrls = new Set();

    // 核心 URL 清洗：处理缺失协议头、转义字符
    function cleanUrlStr(str) {
        if (!str) return '';
        let clean = str.replace(/\\u002F/g, '/').replace(/\\/g, '');
        // 51job 专属修复：自动补全缺失的 https://
        if (clean.includes('51job.com') && !clean.startsWith('http')) {
            clean = 'https:' + (clean.startsWith('//') ? '' : '//') + clean;
        }
        return clean;
    }

    // 核心路由校验：彻底杜绝公司页，保留 req 参数
    function isJobUrl(urlStr, host) {
        try {
            const cleanStr = cleanUrlStr(urlStr);
            const u = new URL(cleanStr, window.location.href);
            const href = u.href.toLowerCase();

            if (host.includes('zhipin.com')) {
                if (href.includes('/gongsi/') || href.includes('/company/')) return false;
                return href.includes('/job_detail/');
            }
            if (host.includes('zhaopin.com')) {
                if (href.includes('company.zhaopin.com') || href.includes('/company/') || href.includes('/companydetail') || href.includes('/com/') || href.includes('/ccid=')) return false;
                return href.includes('/jobdetail/') || href.includes('/jobs/') || href.includes('jobs.zhaopin.com') || href.includes('sou.zhaopin.com');
            }
            if (host.includes('51job.com')) {
                // 拦截 51job 公司库路由 (如 jobs.51job.com/all/co12345.html)
                if (href.includes('/all/co') || href.includes('company.51job') || href.includes('/cmp/')) return false;
                // 放行真实的职位详情页 (必须包含 .html 或特定的 pc/job 路由)
                if (href.includes('jobs.51job.com') && href.includes('.html')) return true;
                if (href.includes('we.51job.com/pc/job')) return true;
                return false;
            }
            if (host.includes('liepin.com')) {
                if (href.includes('/company/') || href.includes('/companydetail') || href.includes('/cmp/')) return false;
                return href.includes('/job/') || href.includes('/showjob/');
            }
            return false;
        } catch(e) {
            return false;
        }
    }

    // 深度遍历 JSON (仅作为辅助，不再作为 51job 的主力，防止丢失 req 参数)
    function deepExtractUrls(obj) {
        if (!obj || typeof obj !== 'object') return;
        const host = window.location.hostname;
        // 51job 禁用 API 盲拼 ID，只提取 API 中明确返回的完整 URL
        for (const key in obj) {
            const val = obj[key];
            if (typeof val === 'string') {
                const cleanVal = cleanUrlStr(val);
                if (isJobUrl(cleanVal, host)) {
                    try { collectedApiUrls.add(new URL(cleanVal, window.location.href).href); } catch(e) {}
                }
            } else if (typeof val === 'object' && val !== null) {
                deepExtractUrls(val);
            }
        }
    }

    // Hook Fetch (严格过滤：只拦截搜索 API，忽略推荐/猜你喜欢 API)
    const originalFetch = window.fetch;
    window.fetch = async function(...args) {
        const response = await originalFetch.apply(this, args);
        const url = typeof args[0] === 'string' ? args[0] : (args[0]?.url || '');
        // 必须包含 search 或 joblist，且明确排除 recommend/guess/hot
        if (url && (url.includes('search') || url.includes('joblist.json')) && !url.includes('recommend') && !url.includes('guess')) {
            response.clone().json().then(data => deepExtractUrls(data)).catch(() => {});
        }
        return response;
    };

    // Hook XHR
    const originalXhrOpen = XMLHttpRequest.prototype.open;
    const originalXhrSend = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.open = function(method, url) {
        this._tmUrl = url;
        return originalXhrOpen.apply(this, arguments);
    };
    XMLHttpRequest.prototype.send = function() {
        this.addEventListener('load', function() {
            if (this._tmUrl && (this._tmUrl.includes('search') || this._tmUrl.includes('joblist.json')) && !this._tmUrl.includes('recommend') && !this._tmUrl.includes('guess')) {
                try { deepExtractUrls(JSON.parse(this.responseText)); } catch(e) {}
            }
        });
        return originalXhrSend.apply(this, arguments);
    };

    function normalizeUrl(urlStr) {
        try { return new URL(urlStr).origin + new URL(urlStr).pathname; }
        catch(e) { return urlStr; }
    }

    function getOpenedUrls() {
        try { return JSON.parse(sessionStorage.getItem(STORAGE_KEY) || '[]'); }
        catch(e) { return []; }
    }

    function saveOpenedUrl(normUrl) {
        const opened = getOpenedUrls();
        if (!opened.includes(normUrl)) {
            opened.push(normUrl);
            sessionStorage.setItem(STORAGE_KEY, JSON.stringify(opened));
        }
    }

    function extractLinks() {
        const links = new Set(collectedApiUrls);
        const host = window.location.hostname;

        if (host.includes('51job.com')) {
            // 51job 专属逻辑：DOM 作用域锁定 + 截断法
            // 1. 优先在核心搜索列表容器内提取
            const listSelectors = [
                '.joblist', '.joblist-box', '[class*="joblist-item"]',
                '[class*="job-list"]', '.search-result-list', '.joblist-main'
            ];
            const containers = document.querySelectorAll(listSelectors.join(','));

            if (containers.length > 0) {
                containers.forEach(c => {
                    c.querySelectorAll('a[href]').forEach(a => {
                        let href = a.getAttribute('href');
                        if (href && href !== '#' && !href.startsWith('javascript:') && isJobUrl(href, host)) {
                            try { links.add(new URL(cleanUrlStr(href), window.location.href).href); } catch(e) {}
                        }
                    });
                });
            } else {
                // 2. 截断法兜底：按 DOM 顺序遍历，一旦遇到底部的"推荐职位"、"互联网技术"等板块，立即停止提取
                const allLinks = Array.from(document.querySelectorAll('a[href]'));
                for (let a of allLinks) {
                    let isBottomSection = false;
                    let el = a;
                    while(el && el !== document.body) {
                        const text = el.textContent.trim().substring(0, 20);
                        const cls = (el.className || '').toLowerCase();
                        // 识别 51job 底部推荐区特征
                        if (cls.includes('recommend') || cls.includes('guess') || cls.includes('hot') || cls.includes('footer') ||
                            text.includes('推荐职位') || text.includes('热门职位') || text.includes('互联网技术') || text.includes('神仙外企') || text.includes('猜你喜欢')) {
                            isBottomSection = true;
                            break;
                        }
                        el = el.parentElement;
                    }

                    if (isBottomSection) continue; // 跳过底部推荐区的链接

                    let href = a.getAttribute('href');
                    if (href && href !== '#' && !href.startsWith('javascript:') && isJobUrl(href, host)) {
                        try { links.add(new URL(cleanUrlStr(href), window.location.href).href); } catch(e) {}
                    }
                }
            }
        } else {
            // 其他平台正常全局提取
            document.querySelectorAll('a[href]').forEach(a => {
                let href = a.getAttribute('href');
                if (!href || href === '#' || href.startsWith('javascript:')) return;
                if (isJobUrl(href, host)) {
                    try { links.add(new URL(cleanUrlStr(href), window.location.href).href); } catch(e) {}
                }
            });
        }

        return Array.from(links).slice(0, MAX_TABS);
    }

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
        const openedSet = new Set(getOpenedUrls());
        const newUrls = urls.filter(u => !openedSet.has(normalizeUrl(u)));

        if (urls.length === 0) {
            showToast('未提取到岗位链接，请确认当前为【列表页】', 'error');
            return;
        }

        if (newUrls.length === 0) {
            showToast(`提取到 ${urls.length} 个链接，但均已打开过，已跳过`, 'info');
            return;
        }

        const skippedCount = urls.length - newUrls.length;
        showToast(`跳过 ${skippedCount} 个已打开，准备打开 ${newUrls.length} 个新详情页`, 'info');

        newUrls.forEach((url, index) => {
            setTimeout(() => {
                saveOpenedUrl(normalizeUrl(url));
                if (typeof GM_openInTab === 'function') {
                    GM_openInTab(url, { active: false, insert: true });
                } else {
                    window.open(url, '_blank');
                }
            }, index * 150);
        });
    }

    document.addEventListener('keydown', (e) => {
        if (e.ctrlKey && e.shiftKey && e.altKey && e.code === 'KeyO') {
            const tag = document.activeElement.tagName.toLowerCase();
            if (tag === 'input' || tag === 'textarea' || document.activeElement.isContentEditable) return;

            e.preventDefault();
            openLinks(extractLinks());
        }
    });
})();