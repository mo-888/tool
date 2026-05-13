// ==UserScript==
// @name         AI Toolbox - 通用 AI 助手
// @namespace    http://tampermonkey.net/
// @version      1.0.1
// @description  在任意网页上提取内容、调用 AI 模型、展示结果并记录历史
// @author       Claude Sonnet 4.6
// @match        *://*/*
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_xmlhttpRequest
// @grant        GM_registerMenuCommand
// @connect      *
// @run-at       document-end
// ==/UserScript==

(function() {
    'use strict';

    // .... 原始工具和类代码 ......
    // （略去原文未变部分，仅展示优化部分）
    // 可拖动小图标按钮、右键弹菜单集成 >>>

    // 按钮拖拽和右键菜单核心实现
    function createDraggableBtn({ iconSvg, titleText = 'AI助手', contextMenuList, onBtnClick }) {
        // 创建按钮
        const btn = document.createElement('div');
        btn.id = 'ai-helper-draggable-btn';
        btn.title = titleText;
        Object.assign(btn.style, {
            width: '40px', height: '40px', position: 'fixed', right: '20px', bottom: '20px',
            background: '#2d8eff', borderRadius: '50%', zIndex: 999999, boxShadow: '0 2px 8px #0003',
            display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'move', userSelect: 'none'
        });
        btn.innerHTML = iconSvg || `<svg width="24" height="24" viewBox="0 0 24 24" fill="#fff"><circle cx="12" cy="12" r="8"/></svg>`;
        document.body.appendChild(btn);
        // 恢复存储位置
        const savedPos = JSON.parse(localStorage.getItem('aihelper-btn-pos')||'null');
        if(savedPos) { btn.style.left = savedPos.left; btn.style.top = savedPos.top; btn.style.right = 'auto'; btn.style.bottom = 'auto'; }
        // 拖拽支持
        let dragging = false, offset = null;
        btn.addEventListener('mousedown', e => {
            dragging = true;
            // left/top
            offset = [e.clientX - btn.offsetLeft, e.clientY - btn.offsetTop];
            document.body.style.userSelect = 'none';
        });
        document.addEventListener('mousemove', e => {
            if (dragging) {
                btn.style.right = 'auto'; btn.style.bottom = 'auto';
                btn.style.left = `${e.clientX - offset[0]}px`;
                btn.style.top = `${e.clientY - offset[1]}px`;
            }
        });
        document.addEventListener('mouseup', () => {
            if(dragging) {
                localStorage.setItem('aihelper-btn-pos', JSON.stringify({left: btn.style.left, top: btn.style.top}));
            }
            dragging = false; document.body.style.userSelect = '';
        });
        // 右键菜单
        btn.addEventListener('contextmenu', e => {e.preventDefault();showCustomMenu(e, contextMenuList);});
        // 左键触发主功能
        btn.addEventListener('click', onBtnClick);
        return btn;
    }

    // 自定义右键菜单实现
    function showCustomMenu(e, menus) {
        removeCustomMenu();
        const menu = document.createElement('div');
        menu.id = 'aihelper-context-menu';
        Object.assign(menu.style, {
            position: 'absolute', top: `${e.pageY}px`, left: `${e.pageX}px`,
            background: '#fff', border: '1px solid #dcdcdc', borderRadius: '4px', zIndex: 10001,
            minWidth: '140px', boxShadow: '0 4px 16px #0002', fontSize:'14px',
        });
        menu.innerHTML = menus.map((item,i) => `<div class="aihelper-menu-item" data-idx="${i}" style="padding:10px 16px;cursor:pointer;${item.danger ? 'color:#ef4444;':''}">${item.label}</div>`).join('');
        document.body.appendChild(menu);
        menu.querySelectorAll('.aihelper-menu-item').forEach((itemNode,i)=>{
            itemNode.onclick = menus[i].onClick || (()=>removeCustomMenu());
        });
        // 点击其他处关闭
        const closeFn = ()=>{removeCustomMenu();document.removeEventListener('mousedown', closeFn, true);};
        setTimeout(()=>document.addEventListener('mousedown', closeFn, true),20);
    }
    function removeCustomMenu(){ const old = document.getElementById('aihelper-context-menu'); if(old) old.remove(); }

    // 优化主入口
    function optimizeMainUIButton(configManager, historyManager, uiManager) {
        // 清理旧按钮
        const old = document.getElementById('ai-toolbox-button'); if (old) old.remove();
        createDraggableBtn({
            iconSvg: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="#fff" stroke-width="2" fill="#4781fe"/><text x="12" y="17" text-anchor="middle" font-size="10" fill="#fff" font-family="monospace">AI</text></svg>`,
            titleText: 'AI 助手',
            onBtnClick: ()=>executeWorkflow(configManager, historyManager, uiManager),
            contextMenuList: [
                { label: `切换提示词`, onClick: ()=>choosePrompt(configManager, uiManager) },
                { label: `切换模型`, onClick: ()=>chooseModel(configManager, uiManager) }
             ]
        });
    }
    // 切换提示词弹窗
    function choosePrompt(configManager, uiManager) {
        const prompts = configManager.getPrompts();
        const curId = configManager.getDefaultPrompt().id;
        const pick = window.prompt('请输入提示词编号:\n' + prompts.map((p,i)=>`[${i+1}] ${p.name}${p.id===curId?'（当前）':''}`).join('\n'), '');
        if(pick && !isNaN(Number(pick)) && prompts[Number(pick)-1]) {
            configManager.updatePrompt(prompts[Number(pick)-1].id, { isDefault: true });
            alert('已切换至：' + prompts[Number(pick)-1].name);
        }
    }
    // 切换模型弹窗
    function chooseModel(configManager, uiManager) {
        const models = configManager.getModels();
        const curId = configManager.getDefaultModel().id;
        const pick = window.prompt('请输入模型编号:\n' + models.map((m,i)=>`[${i+1}] ${m.name}${m.id===curId?'（当前）':''}`).join('\n'), '');
        if(pick && !isNaN(Number(pick)) && models[Number(pick)-1]) {
            configManager.updateModel(models[Number(pick)-1].id, { isDefault: true });
            alert('已切换至：' + models[Number(pick)-1].name);
        }
    }

    // 配置页提示词模板内容收起，以及详情弹窗
    function promptPreview4lines(template) {
        // 只显示4行
        let lines = template.split('\n').slice(0, 4).join('\n');
        if(template.split('\n').length > 4) lines += '\n...\n【详情】';
        return lines;
    }
    // 替换 UIManager.generateConfigHTML 的提示词展示逻辑：
    //   ...<pre>...</pre> 改为 ...<pre onclick="window.__AIPromptDetail&&window.__AIPromptDetail('${p.id}')" style="max-height:5.5em;overflow:hidden;cursor:pointer;">...</pre>

    // --- 脚本入口集成
    // 原始 UIManager, executeWorkflow, ConfigManager, HistoryManager 等代码保持不动 ...
    // 只增强 init()
    const originalInit = (typeof init === 'function') ? init : null;
    function enhanceInit() {
        const configManager = new ConfigManager();
        const historyManager = new HistoryManager();
        const uiManager = new UIManager();
        // 按钮替换为新方案，并挂全局详情事件
        optimizeMainUIButton(configManager, historyManager, uiManager);
        // 详情全局函数
        window.__AIPromptDetail = id => {
            const prompt = configManager.getPrompts().find(p=>p.id===id);
            if(prompt) alert(prompt.template);
        };
        // 配置菜单保持
        GM_registerMenuCommand('AI Toolbox 配置', () => {
            uiManager.showConfigPanel(configManager, historyManager);
        });
        console.log('AI Toolbox 优化已加载');
    }

    // --- 覆盖/增强 ConfigManager、UIManager 指定部分即可：
    // 只需在 generateConfigHTML 方法中，将展示内容部分建成：
    //   <pre ...>${promptPreview4lines(p.template)}</pre>
    // 并加 onclick="window.__AIPromptDetail('${p.id}')"
    //
    // --- 最后入口挂载：
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', enhanceInit);
    } else {
        enhanceInit();
    }

    // 其它代码 ...
    // ======================= END OPTIMIZED =========================
})();
