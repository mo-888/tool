// ==UserScript==
// @name         AI Toolbox - 通用 AI 助手
// @namespace    http://tampermonkey.net/
// @version      1.1.0
// @description  在任意网页上提取内容、调用 AI 模型、展示结果并记录历史；支持快捷键与 URL 自动执行
// @license      MIT
// @author       https://github.com/mo-888
// @match        *://*/*
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_xmlhttpRequest
// @grant        GM_registerMenuCommand
// @connect      *
// @run-at       document-end
// @noframes
// @downloadURL https://update.greasyfork.org/scripts/577512/AI%20Toolbox%20-%20%E9%80%9A%E7%94%A8%20AI%20%E5%8A%A9%E6%89%8B.user.js
// @updateURL https://update.greasyfork.org/scripts/577512/AI%20Toolbox%20-%20%E9%80%9A%E7%94%A8%20AI%20%E5%8A%A9%E6%89%8B.meta.js
// ==/UserScript==

(function () {
    'use strict';

    // ==================== 工具函数 ====================

    function generateUUID() {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
            const r = Math.random() * 16 | 0;
            const v = c === 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
    }

    function escapeHTML(text) {
        if (text === null || text === undefined) return '';

        return String(text).replace(/[&<>"']/g, (char) => {
            const map = {
                '&': '&amp;',
                '<': '&lt;',
                '>': '&gt;',
                '"': '&quot;',
                "'": '&#39;'
            };

            return map[char] || char;
        });
    }

    // ==================== 存储管理 ====================

    class StorageManager {
        static save(key, value) {
            GM_setValue(key, JSON.stringify(value));
        }

        static load(key, defaultValue = null) {
            const value = GM_getValue(key);
            return value ? JSON.parse(value) : defaultValue;
        }
    }

    // ==================== 快捷键管理 ====================

    class ShortcutManager {
        static get defaults() {
            return {
                openConfig: 'Ctrl+Shift+Alt+A',
                execute: 'Ctrl+Shift+Alt+E'
            };
        }

        static get() {
            return {
                ...this.defaults,
                ...(StorageManager.load('shortcuts', {}) || {})
            };
        }

        static save(shortcuts) {
            StorageManager.save('shortcuts', shortcuts);
        }

        static normalizeEvent(event) {
            const key = event.key;

            if (['Control', 'Shift', 'Alt', 'Meta'].includes(key)) {
                return null;
            }

            const parts = [];

            if (event.ctrlKey) parts.push('Ctrl');
            if (event.shiftKey) parts.push('Shift');
            if (event.altKey) parts.push('Alt');
            if (event.metaKey) parts.push('Meta');

            parts.push(key === ' ' ? 'Space' : key.length === 1 ? key.toUpperCase() : key);

            return parts.join('+');
        }

        static normalizeString(str) {
            return String(str)
                .toLowerCase()
                .split('+')
                .map(item => item.trim())
                .filter(Boolean)
                .sort()
                .join('+');
        }

        static matchEvent(event, shortcut) {
            const combo = this.normalizeEvent(event);
            return combo && this.normalizeString(combo) === this.normalizeString(shortcut);
        }
    }

    ShortcutManager.capturing = false;

    // ==================== 配置管理 ====================

    class ConfigManager {
        constructor() {
            this.prompts = StorageManager.load('prompts', []);
            this.models = StorageManager.load('models', []);
            this.autoRules = StorageManager.load('autoRules', []);
            this.initDefaults();
        }

        initDefaults() {
            if (this.prompts.length === 0) {
                this.addPrompt(
                    '网页内容总结',
                    '请总结以下网页内容：\n标题：{{title}}\nURL：{{url}}\n内容：{{content}}',
                    true
                );

                this.addPrompt(
                    '选中文本分析',
                    '请分析以下选中的文本：\n{{selection}}\n\n来源页面：{{title}} ({{url}})',
                    false
                );
            }

            if (this.models.length === 0) {
                this.addModel(
                    'GPT-4',
                    'https://api.openai.com/v1/chat/completions',
                    'YOUR_API_KEY_HERE',
                    'gpt-4',
                    true
                );
            }
        }

        addPrompt(name, template, isDefault = false) {
            if (isDefault) {
                this.prompts.forEach(p => p.isDefault = false);
            }

            const prompt = {
                id: generateUUID(),
                name,
                template,
                isDefault
            };

            this.prompts.push(prompt);
            this.savePrompts();

            return prompt;
        }

        getPrompts() {
            return this.prompts;
        }

        getDefaultPrompt() {
            return this.prompts.find(p => p.isDefault) || this.prompts[0];
        }

        getPromptById(id) {
            return this.prompts.find(p => p.id === id) || null;
        }

        updatePrompt(id, updates) {
            const prompt = this.prompts.find(p => p.id === id);
            if (!prompt) return null;

            if (updates.isDefault) {
                this.prompts.forEach(p => p.isDefault = false);
            }

            Object.assign(prompt, updates);
            this.savePrompts();

            return prompt;
        }

        deletePrompt(id) {
            this.prompts = this.prompts.filter(p => p.id !== id);
            this.savePrompts();
        }

        savePrompts() {
            StorageManager.save('prompts', this.prompts);
        }

        addModel(name, apiUrl, apiKey, modelName, isDefault = false, apiMode = 'openai-chat') {
            if (isDefault) {
                this.models.forEach(m => m.isDefault = false);
            }

            const model = {
                id: generateUUID(),
                name,
                apiUrl,
                apiKey,
                modelName,
                apiMode,
                isDefault
            };

            this.models.push(model);
            this.saveModels();

            return model;
        }

        getModels() {
            this.models.forEach(m => {
                if (!m.apiMode) {
                    m.apiMode = 'openai-chat';
                }
            });

            return this.models;
        }

        getDefaultModel() {
            const models = this.getModels();
            return models.find(m => m.isDefault) || models[0];
        }

        getModelById(id) {
            return this.getModels().find(m => m.id === id) || null;
        }

        updateModel(id, updates) {
            const model = this.models.find(m => m.id === id);
            if (!model) return null;

            if (updates.isDefault) {
                this.models.forEach(m => m.isDefault = false);
            }

            Object.assign(model, updates);
            this.saveModels();

            return model;
        }

        deleteModel(id) {
            this.models = this.models.filter(m => m.id !== id);
            this.saveModels();
        }

        saveModels() {
            StorageManager.save('models', this.models);
        }

        getAutoRules() {
            return this.autoRules;
        }

        getAutoRuleById(id) {
            return this.autoRules.find(r => r.id === id) || null;
        }

        addAutoRule(name, urlPattern, promptId = null, modelId = null, enabled = true) {
            const rule = {
                id: generateUUID(),
                name,
                urlPattern,
                promptId,
                modelId,
                enabled
            };

            this.autoRules.push(rule);
            this.saveAutoRules();

            return rule;
        }

        updateAutoRule(id, updates) {
            const rule = this.autoRules.find(r => r.id === id);
            if (!rule) return null;

            Object.assign(rule, updates);
            this.saveAutoRules();

            return rule;
        }

        deleteAutoRule(id) {
            this.autoRules = this.autoRules.filter(r => r.id !== id);
            this.saveAutoRules();
        }

        saveAutoRules() {
            StorageManager.save('autoRules', this.autoRules);
        }
    }

    // ==================== 历史管理 ====================

    class HistoryManager {
        constructor() {
            this.history = StorageManager.load('history', []);
        }

        addRecord(promptId, modelId, interpolatedPrompt, result, requestUrl, requestBody) {
            const record = {
                id: generateUUID(),
                timestamp: Date.now(),
                promptId,
                modelId,
                interpolatedPrompt,
                result,
                requestUrl,
                requestBody
            };

            this.history.unshift(record);
            this.save();

            return record;
        }

        getHistory(limit = null, offset = 0) {
            if (limit === null) {
                return this.history.slice(offset);
            }

            return this.history.slice(offset, offset + limit);
        }

        getRecordById(id) {
            return this.history.find(h => h.id === id);
        }

        deleteHistory(id) {
            this.history = this.history.filter(h => h.id !== id);
            this.save();
        }

        clearHistory() {
            this.history = [];
            this.save();
        }

        save() {
            StorageManager.save('history', this.history);
        }
    }

    // ==================== 插值引擎 ====================

    class InterpolationEngine {
        static replace(template, pageInfo) {
            return template
                .replace(/\{\{url\}\}/g, pageInfo.url || '')
                .replace(/\{\{title\}\}/g, pageInfo.title || '')
                .replace(/\{\{content\}\}/g, pageInfo.content || '')
                .replace(/\{\{selection\}\}/g, pageInfo.selection || '');
        }
    }

    // ==================== 页面信息提取 ====================

    function extractPageInfo() {
        return {
            url: window.location.href,
            title: document.title,
            content: document.body.innerText.trim(),
            selection: window.getSelection().toString().trim()
        };
    }

    // ==================== AI 模型调用 ====================

    function callAI(model, prompt) {
        return new Promise((resolve, reject) => {
            const apiMode = model.apiMode || 'openai-chat';

            let url = model.apiUrl;
            let headers = {
                'Content-Type': 'application/json'
            };
            let requestBody = {};

            switch (apiMode) {
                case 'openai-chat':
                    headers['Authorization'] = `Bearer ${model.apiKey}`;
                    requestBody = {
                        model: model.modelName,
                        messages: [{ role: 'user', content: prompt }]
                    };
                    break;

                case 'openai-responses':
                    headers['Authorization'] = `Bearer ${model.apiKey}`;
                    requestBody = {
                        model: model.modelName,
                        prompt: prompt
                    };
                    break;

                case 'anthropic-messages':
                    headers['x-api-key'] = model.apiKey;
                    headers['anthropic-version'] = '2023-06-01';
                    requestBody = {
                        model: model.modelName,
                        messages: [{ role: 'user', content: prompt }],
                        max_tokens: 4096
                    };
                    break;

                case 'gemini-native':
                    url = `${model.apiUrl}?key=${model.apiKey}`;
                    requestBody = {
                        contents: [{ parts: [{ text: prompt }] }]
                    };
                    break;

                default:
                    reject(new Error(`不支持的 API 模式: ${apiMode}`));
                    return;
            }

            const requestBodyStr = JSON.stringify(requestBody);

            GM_xmlhttpRequest({
                method: 'POST',
                url,
                headers,
                data: requestBodyStr,
                onload(response) {
                    try {
                        const data = JSON.parse(response.responseText);
                        let result = null;

                        switch (apiMode) {
                            case 'openai-chat':
                                if (data.choices && data.choices[0] && data.choices[0].message) {
                                    result = data.choices[0].message.content;
                                }
                                break;

                            case 'openai-responses':
                                if (data.choices && data.choices[0] && data.choices[0].text) {
                                    result = data.choices[0].text;
                                }
                                break;

                            case 'anthropic-messages':
                                if (data.content && data.content[0] && data.content[0].text) {
                                    result = data.content[0].text;
                                }
                                break;

                            case 'gemini-native':
                                if (
                                    data.candidates &&
                                    data.candidates[0] &&
                                    data.candidates[0].content &&
                                    data.candidates[0].content.parts &&
                                    data.candidates[0].content.parts[0]
                                ) {
                                    result = data.candidates[0].content.parts[0].text;
                                }
                                break;
                        }

                        if (result) {
                            resolve({
                                result,
                                requestUrl: url,
                                requestBody: requestBodyStr
                            });
                        } else {
                            reject(new Error(`无效的 API 响应格式 (${apiMode})`));
                        }
                    } catch (e) {
                        reject(new Error(`解析响应失败: ${e.message}`));
                    }
                },
                onerror(error) {
                    reject(new Error(`请求失败: ${error.statusText || '网络错误'}`));
                },
                ontimeout() {
                    reject(new Error('请求超时'));
                }
            });
        });
    }

    // ==================== UI 组件 ====================

    class UIManager {
        constructor() {
            this.resultPanel = null;
            this.configPanel = null;
            this.activePromptId = StorageManager.load('activePromptId', null);
            this.activeModelId = StorageManager.load('activeModelId', null);
        }

        getActivePrompt(configManager) {
            if (this.activePromptId) {
                const prompt = configManager.getPromptById(this.activePromptId);
                if (prompt) return prompt;
                this.setActivePrompt(null);
            }

            return configManager.getDefaultPrompt();
        }

        getActiveModel(configManager) {
            if (this.activeModelId) {
                const model = configManager.getModelById(this.activeModelId);
                if (model) return model;
                this.setActiveModel(null);
            }

            return configManager.getDefaultModel();
        }

        setActivePrompt(promptId) {
            this.activePromptId = promptId || null;
            StorageManager.save('activePromptId', this.activePromptId);
        }

        setActiveModel(modelId) {
            this.activeModelId = modelId || null;
            StorageManager.save('activeModelId', this.activeModelId);
        }

        showResultPanel(result, isError = false) {
            if (this.resultPanel) {
                this.resultPanel.remove();
            }

            this.resultPanel = document.createElement('div');
            this.resultPanel.style.cssText = `
                position: fixed;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
                z-index: 1000000;
                width: 80%;
                max-width: 800px;
                max-height: 80vh;
                background: white;
                border-radius: 12px;
                box-shadow: 0 10px 40px rgba(0, 0, 0, 0.3);
                overflow: hidden;
                display: flex;
                flex-direction: column;
            `;

            const header = document.createElement('div');
            header.style.cssText = `
                padding: 20px;
                background: ${isError ? '#ef4444' : '#667eea'};
                color: white;
                display: flex;
                justify-content: space-between;
                align-items: center;
            `;

            header.innerHTML = `
                <h3 style="margin: 0; font-size: 18px;">${isError ? '❌ 错误' : '✅ AI 结果'}</h3>
                <button id="ai-close-result" style="background: none; border: none; color: white; font-size: 24px; cursor: pointer; padding: 0; width: 30px; height: 30px;">×</button>
            `;

            const content = document.createElement('div');
            content.style.cssText = `
                padding: 20px;
                overflow-y: auto;
                flex: 1;
                white-space: pre-wrap;
                word-wrap: break-word;
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                line-height: 1.6;
                color: #333;
            `;
            content.textContent = result;

            this.resultPanel.appendChild(header);
            this.resultPanel.appendChild(content);
            document.body.appendChild(this.resultPanel);

            document.getElementById('ai-close-result').onclick = () => {
                this.resultPanel.remove();
                this.resultPanel = null;
            };
        }

        showLoading(message = '正在调用 AI 模型，请稍候...') {
            this.showResultPanel(message, false);
        }

        showConfigPanel(configManager, historyManager) {
            ShortcutManager.capturing = false;

            if (this.configPanel) {
                this.configPanel.remove();
            }

            this.configPanel = document.createElement('div');
            this.configPanel.style.cssText = `
                position: fixed;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
                z-index: 1000000;
                width: 90%;
                max-width: 1000px;
                max-height: 90vh;
                background: white;
                border-radius: 12px;
                box-shadow: 0 10px 40px rgba(0, 0, 0, 0.3);
                overflow: hidden;
                display: flex;
                flex-direction: column;
            `;

            const header = document.createElement('div');
            header.style.cssText = `
                padding: 20px;
                background: #667eea;
                color: white;
                display: flex;
                justify-content: space-between;
                align-items: center;
            `;

            header.innerHTML = `
                <h3 style="margin: 0; font-size: 18px;">⚙️ AI Toolbox 配置</h3>
                <button id="ai-close-config" style="background: none; border: none; color: white; font-size: 24px; cursor: pointer; padding: 0; width: 30px; height: 30px;">×</button>
            `;

            const content = document.createElement('div');
            content.style.cssText = `
                padding: 20px;
                overflow-y: auto;
                flex: 1;
            `;

            content.innerHTML = this.generateConfigHTML(configManager, historyManager);

            this.configPanel.appendChild(header);
            this.configPanel.appendChild(content);
            document.body.appendChild(this.configPanel);

            document.getElementById('ai-close-config').onclick = () => {
                this.configPanel.remove();
                this.configPanel = null;
            };

            this.attachConfigEventListeners(configManager, historyManager);
        }

        generateConfigHTML(configManager, historyManager) {
            const prompts = configManager.getPrompts();
            const models = configManager.getModels();
            const history = historyManager.getHistory(null);
            const autoRules = configManager.getAutoRules();
            const shortcuts = ShortcutManager.get();

            const defaultPrompt = configManager.getDefaultPrompt();
            const defaultModel = configManager.getDefaultModel();
            const currentPromptId = this.activePromptId || (defaultPrompt ? defaultPrompt.id : null);
            const currentModelId = this.activeModelId || (defaultModel ? defaultModel.id : null);

            const buttonStyle = `
                padding: 6px 12px;
                border: none;
                border-radius: 4px;
                cursor: pointer;
                font-size: 13px;
                font-weight: 500;
                transition: all 0.2s ease;
                margin-right: 6px;
            `;

            const apiModeLabels = {
                'openai-chat': 'OpenAI Chat',
                'openai-responses': 'OpenAI Responses',
                'anthropic-messages': 'Anthropic',
                'gemini-native': 'Gemini'
            };

            const getPromptName = (id) => {
                if (!id) return '跟随当前/默认';
                const prompt = prompts.find(p => p.id === id);
                return prompt ? prompt.name : '未知';
            };

            const getModelName = (id) => {
                if (!id) return '跟随当前/默认';
                const model = models.find(m => m.id === id);
                return model ? model.name : '未知';
            };

            return `
                <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
                    <h4 style="margin-top: 0;">快捷键</h4>
                    <div style="border: 1px solid #ddd; padding: 12px; margin-bottom: 24px; border-radius: 6px; background: #fafafa;">
                        <div style="margin-bottom: 10px;">
                            <strong>打开配置：</strong>
                            <code style="margin: 0 10px;">${escapeHTML(shortcuts.openConfig)}</code>
                            <button class="edit-shortcut" data-action="openConfig" style="${buttonStyle} background: #3b82f6; color: white;">修改</button>
                            <button class="reset-shortcut" data-action="openConfig" style="${buttonStyle} background: #6b7280; color: white;">恢复默认</button>
                        </div>

                        <div>
                            <strong>手动执行：</strong>
                            <code style="margin: 0 10px;">${escapeHTML(shortcuts.execute)}</code>
                            <button class="edit-shortcut" data-action="execute" style="${buttonStyle} background: #3b82f6; color: white;">修改</button>
                            <button class="reset-shortcut" data-action="execute" style="${buttonStyle} background: #6b7280; color: white;">恢复默认</button>
                        </div>
                    </div>

                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
                        <h4 style="margin: 0;">提示词模板</h4>
                        <button id="add-prompt" style="${buttonStyle} background: #10b981; color: white;">+ 新建提示词</button>
                    </div>

                    <div id="prompts-list">
                        ${prompts.map(p => `
                            <div style="border: 1px solid #ddd; padding: 12px; margin-bottom: 10px; border-radius: 6px; background: #fafafa;">
                                <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 8px;">
                                    <div>
                                        <strong style="font-size: 15px;">${escapeHTML(p.name)}</strong>
                                        ${p.isDefault ? '<span style="color: #667eea; font-size: 13px; margin-left: 8px;">默认</span>' : ''}
                                        ${currentPromptId === p.id ? '<span style="color: #10b981; font-size: 13px; margin-left: 8px;">当前</span>' : ''}
                                    </div>

                                    <div style="display: flex; gap: 6px;">
                                        ${currentPromptId !== p.id ? `
                                            <button class="set-active-prompt" data-id="${p.id}" style="${buttonStyle} background: #10b981; color: white; font-size: 12px; padding: 4px 10px;">
                                                设为当前
                                            </button>
                                        ` : ''}

                                        ${!p.isDefault ? `
                                            <button class="set-default-prompt" data-id="${p.id}" style="${buttonStyle} background: #f59e0b; color: white; font-size: 12px; padding: 4px 10px;">
                                                设为默认
                                            </button>
                                        ` : ''}

                                        <button class="edit-prompt" data-id="${p.id}" style="${buttonStyle} background: #3b82f6; color: white; font-size: 12px; padding: 4px 10px;">编辑</button>
                                        <button class="view-prompt-detail" data-id="${p.id}" style="${buttonStyle} background: #6366f1; color: white; font-size: 12px; padding: 4px 10px;">查看详情</button>
                                        <button class="delete-prompt" data-id="${p.id}" style="${buttonStyle} background: #ef4444; color: white; font-size: 12px; padding: 4px 10px;">删除</button>
                                    </div>
                                </div>

                                <div style="background: #f5f5f5; padding: 10px; border-radius: 4px; margin: 0; font-size: 13px; line-height: 1.5; white-space: pre-wrap; word-break: break-word; display: -webkit-box; -webkit-line-clamp: 4; -webkit-box-orient: vertical; overflow: hidden;">
                                    ${escapeHTML(p.template)}
                                </div>
                            </div>
                        `).join('')}
                    </div>

                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; margin-top: 30px;">
                        <h4 style="margin: 0;">模型配置</h4>
                        <button id="add-model" style="${buttonStyle} background: #10b981; color: white;">+ 新建模型</button>
                    </div>

                    <div id="models-list">
                        ${models.map(m => {
                            const apiMode = m.apiMode || 'openai-chat';

                            return `
                                <div style="border: 1px solid #ddd; padding: 12px; margin-bottom: 10px; border-radius: 6px; background: #fafafa;">
                                    <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 8px;">
                                        <div>
                                            <strong style="font-size: 15px;">${escapeHTML(m.name)}</strong>
                                            ${m.isDefault ? '<span style="color: #667eea; font-size: 13px; margin-left: 8px;">默认</span>' : ''}
                                            ${currentModelId === m.id ? '<span style="color: #10b981; font-size: 13px; margin-left: 8px;">当前</span>' : ''}
                                        </div>

                                        <div style="display: flex; gap: 6px;">
                                            ${currentModelId !== m.id ? `
                                                <button class="set-active-model" data-id="${m.id}" style="${buttonStyle} background: #10b981; color: white; font-size: 12px; padding: 4px 10px;">
                                                    设为当前
                                                </button>
                                            ` : ''}

                                            ${!m.isDefault ? `
                                                <button class="set-default-model" data-id="${m.id}" style="${buttonStyle} background: #f59e0b; color: white; font-size: 12px; padding: 4px 10px;">
                                                    设为默认
                                                </button>
                                            ` : ''}

                                            <button class="edit-model" data-id="${m.id}" style="${buttonStyle} background: #3b82f6; color: white; font-size: 12px; padding: 4px 10px;">编辑</button>
                                            <button class="delete-model" data-id="${m.id}" style="${buttonStyle} background: #ef4444; color: white; font-size: 12px; padding: 4px 10px;">删除</button>
                                        </div>
                                    </div>

                                    <div style="margin-top: 8px; font-size: 13px; color: #666; line-height: 1.6;">
                                        <div><strong>API 模式:</strong> ${apiModeLabels[apiMode] || apiMode}</div>
                                        <div><strong>API URL:</strong> ${escapeHTML(m.apiUrl)}</div>
                                        <div><strong>Model:</strong> ${escapeHTML(m.modelName)}</div>
                                        <div><strong>API Key:</strong> ${'*'.repeat(Math.min((m.apiKey || '').length, 20))}</div>
                                    </div>
                                </div>
                            `;
                        }).join('')}
                    </div>

                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; margin-top: 30px;">
                        <h4 style="margin: 0;">自动执行规则</h4>
                        <button id="add-auto-rule" style="${buttonStyle} background: #10b981; color: white;">+ 新建规则</button>
                    </div>

                    <div id="auto-rules-list">
                        ${autoRules.length === 0 ? `
                            <p style="color: #999;">暂无自动执行规则</p>
                        ` : autoRules.map(r => `
                            <div style="border: 1px solid #ddd; padding: 12px; margin-bottom: 10px; border-radius: 6px; background: #fafafa;">
                                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                                    <div>
                                        <strong style="font-size: 15px;">${escapeHTML(r.name)}</strong>
                                        ${r.enabled ? '<span style="color: #10b981; margin-left: 8px;">启用</span>' : '<span style="color: #999; margin-left: 8px;">禁用</span>'}
                                    </div>

                                    <div style="display: flex; gap: 6px;">
                                        <button class="toggle-auto-rule" data-id="${r.id}" style="${buttonStyle} background: #f59e0b; color: white; font-size: 12px; padding: 4px 10px;">
                                            ${r.enabled ? '禁用' : '启用'}
                                        </button>

                                        <button class="edit-auto-rule" data-id="${r.id}" style="${buttonStyle} background: #3b82f6; color: white; font-size: 12px; padding: 4px 10px;">编辑</button>
                                        <button class="delete-auto-rule" data-id="${r.id}" style="${buttonStyle} background: #ef4444; color: white; font-size: 12px; padding: 4px 10px;">删除</button>
                                    </div>
                                </div>

                                <div style="font-size: 13px; color: #666; line-height: 1.6;">
                                    <div><strong>URL 正则:</strong> <code>${escapeHTML(r.urlPattern)}</code></div>
                                    <div><strong>提示词:</strong> ${escapeHTML(getPromptName(r.promptId))}</div>
                                    <div><strong>模型:</strong> ${escapeHTML(getModelName(r.modelId))}</div>
                                </div>
                            </div>
                        `).join('')}
                    </div>

                    <h4 style="margin-top: 30px;">历史记录 (共 ${history.length} 条)</h4>

                    <div id="history-list">
                        ${history.length === 0 ? '<p style="color: #999;">暂无历史记录</p>' : history.map(h => {
                            const date = new Date(h.timestamp);

                            return `
                                <div style="border: 1px solid #ddd; padding: 10px; margin-bottom: 10px; border-radius: 6px; background: #fafafa;">
                                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                                        <div style="font-size: 12px; color: #999;">${date.toLocaleString()}</div>
                                        <button class="view-history-detail" data-id="${h.id}" style="${buttonStyle} background: #667eea; color: white; font-size: 12px; padding: 4px 10px;">
                                            查看详情
                                        </button>
                                    </div>

                                    <div style="font-size: 14px;">
                                        <strong>结果预览:</strong>
                                        <div style="max-height: 80px; overflow-y: auto; background: #f5f5f5; padding: 8px; border-radius: 4px; margin-top: 5px; font-size: 13px; line-height: 1.5;">
                                            ${h.result.substring(0, 150)}${h.result.length > 150 ? '...' : ''}
                                        </div>
                                    </div>
                                </div>
                            `;
                        }).join('')}
                    </div>

                    ${history.length > 0 ? '<button id="clear-history" style="margin-top: 10px; padding: 8px 16px; background: #ef4444; color: white; border: none; border-radius: 6px; cursor: pointer;">清空历史</button>' : ''}
                </div>
            `;
        }

        attachConfigEventListeners(configManager, historyManager) {
            const addPromptBtn = document.getElementById('add-prompt');
            if (addPromptBtn) {
                addPromptBtn.onclick = () => this.showPromptForm(configManager, historyManager);
            }

            document.querySelectorAll('.edit-prompt').forEach(btn => {
                btn.onclick = () => {
                    const promptId = btn.getAttribute('data-id');
                    this.showPromptForm(configManager, historyManager, promptId);
                };
            });

            document.querySelectorAll('.view-prompt-detail').forEach(btn => {
                btn.onclick = () => {
                    const promptId = btn.getAttribute('data-id');
                    this.showPromptDetail(configManager, promptId);
                };
            });

            document.querySelectorAll('.delete-prompt').forEach(btn => {
                btn.onclick = () => {
                    const promptId = btn.getAttribute('data-id');
                    const prompts = configManager.getPrompts();

                    if (prompts.length === 1) {
                        alert('至少需要保留一个提示词模板');
                        return;
                    }

                    const prompt = prompts.find(p => p.id === promptId);

                    if (prompt && prompt.isDefault && prompts.length > 1) {
                        alert('请先将其他提示词设为默认，再删除当前默认提示词');
                        return;
                    }

                    if (confirm(`确定要删除提示词 "${prompt.name}" 吗？`)) {
                        configManager.deletePrompt(promptId);
                        this.showConfigPanel(configManager, historyManager);
                    }
                };
            });

            document.querySelectorAll('.set-default-prompt').forEach(btn => {
                btn.onclick = () => {
                    const promptId = btn.getAttribute('data-id');
                    configManager.updatePrompt(promptId, { isDefault: true });
                    this.showConfigPanel(configManager, historyManager);
                };
            });

            document.querySelectorAll('.set-active-prompt').forEach(btn => {
                btn.onclick = () => {
                    const promptId = btn.getAttribute('data-id');
                    this.setActivePrompt(promptId);
                    this.showConfigPanel(configManager, historyManager);
                };
            });

            const addModelBtn = document.getElementById('add-model');
            if (addModelBtn) {
                addModelBtn.onclick = () => this.showModelForm(configManager, historyManager);
            }

            document.querySelectorAll('.edit-model').forEach(btn => {
                btn.onclick = () => {
                    const modelId = btn.getAttribute('data-id');
                    this.showModelForm(configManager, historyManager, modelId);
                };
            });

            document.querySelectorAll('.delete-model').forEach(btn => {
                btn.onclick = () => {
                    const modelId = btn.getAttribute('data-id');
                    const models = configManager.getModels();

                    if (models.length === 1) {
                        alert('至少需要保留一个模型配置');
                        return;
                    }

                    const model = models.find(m => m.id === modelId);

                    if (model && model.isDefault && models.length > 1) {
                        alert('请先将其他模型设为默认，再删除当前默认模型');
                        return;
                    }

                    if (confirm(`确定要删除模型 "${model.name}" 吗？`)) {
                        configManager.deleteModel(modelId);
                        this.showConfigPanel(configManager, historyManager);
                    }
                };
            });

            document.querySelectorAll('.set-default-model').forEach(btn => {
                btn.onclick = () => {
                    const modelId = btn.getAttribute('data-id');
                    configManager.updateModel(modelId, { isDefault: true });
                    this.showConfigPanel(configManager, historyManager);
                };
            });

            document.querySelectorAll('.set-active-model').forEach(btn => {
                btn.onclick = () => {
                    const modelId = btn.getAttribute('data-id');
                    this.setActiveModel(modelId);
                    this.showConfigPanel(configManager, historyManager);
                };
            });

            document.querySelectorAll('.edit-shortcut').forEach(btn => {
                btn.onclick = () => {
                    const action = btn.getAttribute('data-action');

                    ShortcutManager.capturing = true;
                    btn.textContent = '请按下新快捷键...';

                    const handler = (event) => {
                        if (event.key === 'Escape') {
                            event.preventDefault();
                            event.stopPropagation();

                            ShortcutManager.capturing = false;
                            document.removeEventListener('keydown', handler, true);
                            this.showConfigPanel(configManager, historyManager);
                            return;
                        }

                        const combo = ShortcutManager.normalizeEvent(event);
                        if (!combo) return;

                        event.preventDefault();
                        event.stopPropagation();

                        ShortcutManager.capturing = false;
                        document.removeEventListener('keydown', handler, true);

                        const shortcuts = ShortcutManager.get();
                        shortcuts[action] = combo;
                        ShortcutManager.save(shortcuts);

                        this.showConfigPanel(configManager, historyManager);
                    };

                    document.addEventListener('keydown', handler, true);
                };
            });

            document.querySelectorAll('.reset-shortcut').forEach(btn => {
                btn.onclick = () => {
                    const action = btn.getAttribute('data-action');
                    const shortcuts = ShortcutManager.get();

                    shortcuts[action] = ShortcutManager.defaults[action];
                    ShortcutManager.save(shortcuts);

                    this.showConfigPanel(configManager, historyManager);
                };
            });

            const addAutoRuleBtn = document.getElementById('add-auto-rule');
            if (addAutoRuleBtn) {
                addAutoRuleBtn.onclick = () => this.showAutoRuleForm(configManager, historyManager);
            }

            document.querySelectorAll('.edit-auto-rule').forEach(btn => {
                btn.onclick = () => {
                    const ruleId = btn.getAttribute('data-id');
                    this.showAutoRuleForm(configManager, historyManager, ruleId);
                };
            });

            document.querySelectorAll('.delete-auto-rule').forEach(btn => {
                btn.onclick = () => {
                    const ruleId = btn.getAttribute('data-id');
                    const rule = configManager.getAutoRuleById(ruleId);

                    if (!rule) return;

                    if (confirm(`确定要删除自动执行规则 "${rule.name}" 吗？`)) {
                        configManager.deleteAutoRule(ruleId);
                        this.showConfigPanel(configManager, historyManager);
                    }
                };
            });

            document.querySelectorAll('.toggle-auto-rule').forEach(btn => {
                btn.onclick = () => {
                    const ruleId = btn.getAttribute('data-id');
                    const rule = configManager.getAutoRuleById(ruleId);

                    if (!rule) return;

                    configManager.updateAutoRule(ruleId, {
                        enabled: !rule.enabled
                    });

                    this.showConfigPanel(configManager, historyManager);
                };
            });

            const clearBtn = document.getElementById('clear-history');
            if (clearBtn) {
                clearBtn.onclick = () => {
                    if (confirm('确定要清空所有历史记录吗？')) {
                        historyManager.clearHistory();
                        this.showConfigPanel(configManager, historyManager);
                    }
                };
            }

            document.querySelectorAll('.view-history-detail').forEach(btn => {
                btn.onclick = () => {
                    const recordId = btn.getAttribute('data-id');
                    this.showHistoryDetail(configManager, historyManager, recordId);
                };
            });
        }

        showPromptForm(configManager, historyManager, promptId = null) {
            const prompt = promptId ? configManager.getPromptById(promptId) : null;
            const isEdit = !!prompt;

            const modal = document.createElement('div');
            modal.style.cssText = `
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background: rgba(0, 0, 0, 0.5);
                z-index: 1000001;
                display: flex;
                align-items: center;
                justify-content: center;
            `;

            const form = document.createElement('div');
            form.style.cssText = `
                background: white;
                border-radius: 12px;
                padding: 24px;
                width: 90%;
                max-width: 600px;
                box-shadow: 0 10px 40px rgba(0, 0, 0, 0.3);
            `;

            form.innerHTML = `
                <h3 style="margin: 0 0 8px 0; font-size: 18px; color: #333;">${isEdit ? '编辑提示词' : '新建提示词'}</h3>

                <p style="margin: 0 0 20px 0; font-size: 13px; color: #999; line-height: 1.5;">
                    支持的插值语法：{{url}} - 页面URL，{{title}} - 页面标题，{{content}} - 页面正文，{{selection}} - 选中文本
                </p>

                <div style="margin-bottom: 16px;">
                    <label style="display: block; margin-bottom: 6px; font-weight: 500; color: #555;">名称</label>
                    <input type="text" id="prompt-name" value="${isEdit ? escapeHTML(prompt.name) : ''}"
                        style="width: 100%; padding: 10px; border: 1px solid #ddd; border-radius: 6px; font-size: 14px; box-sizing: border-box;"
                        placeholder="例如：网页内容总结" required>
                </div>

                <div style="margin-bottom: 16px;">
                    <label style="display: block; margin-bottom: 6px; font-weight: 500; color: #555;">模板</label>
                    <textarea id="prompt-template" rows="8"
                        style="width: 100%; padding: 10px; border: 1px solid #ddd; border-radius: 6px; font-size: 14px; font-family: monospace; box-sizing: border-box; resize: vertical;"
                        placeholder="使用 {{url}}, {{title}}, {{content}}, {{selection}} 作为占位符" required>${isEdit ? escapeHTML(prompt.template) : ''}</textarea>
                </div>

                <div style="margin-bottom: 20px;">
                    <label style="display: flex; align-items: center; cursor: pointer;">
                        <input type="checkbox" id="prompt-default" ${isEdit && prompt.isDefault ? 'checked' : ''}
                            style="margin-right: 8px; width: 18px; height: 18px; cursor: pointer;">
                        <span style="font-weight: 500; color: #555;">设为默认</span>
                    </label>
                </div>

                <div style="display: flex; gap: 10px; justify-content: flex-end;">
                    <button id="prompt-cancel" style="padding: 10px 20px; background: #e5e7eb; color: #374151; border: none; border-radius: 6px; cursor: pointer; font-size: 14px; font-weight: 500;">取消</button>
                    <button id="prompt-save" style="padding: 10px 20px; background: #667eea; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 14px; font-weight: 500;">保存</button>
                </div>
            `;

            modal.appendChild(form);
            document.body.appendChild(modal);

            document.getElementById('prompt-cancel').onclick = () => modal.remove();

            document.getElementById('prompt-save').onclick = () => {
                const name = document.getElementById('prompt-name').value.trim();
                const template = document.getElementById('prompt-template').value.trim();
                const isDefault = document.getElementById('prompt-default').checked;

                if (!name || !template) {
                    alert('请填写所有必填字段');
                    return;
                }

                if (isEdit) {
                    configManager.updatePrompt(promptId, { name, template, isDefault });
                } else {
                    configManager.addPrompt(name, template, isDefault);
                }

                modal.remove();
                this.showConfigPanel(configManager, historyManager);
            };
        }

        showModelForm(configManager, historyManager, modelId = null) {
            const model = modelId ? configManager.getModelById(modelId) : null;
            const isEdit = !!model;

            const modal = document.createElement('div');
            modal.style.cssText = `
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background: rgba(0, 0, 0, 0.5);
                z-index: 1000001;
                display: flex;
                align-items: center;
                justify-content: center;
            `;

            const form = document.createElement('div');
            form.style.cssText = `
                background: white;
                border-radius: 12px;
                padding: 24px;
                width: 90%;
                max-width: 600px;
                box-shadow: 0 10px 40px rgba(0, 0, 0, 0.3);
            `;

            const currentApiMode = isEdit ? (model.apiMode || 'openai-chat') : 'openai-chat';

            form.innerHTML = `
                <h3 style="margin: 0 0 20px 0; font-size: 18px; color: #333;">${isEdit ? '编辑模型' : '新建模型'}</h3>

                <div style="margin-bottom: 16px;">
                    <label style="display: block; margin-bottom: 6px; font-weight: 500; color: #555;">名称</label>
                    <input type="text" id="model-name" value="${isEdit ? escapeHTML(model.name) : ''}"
                        style="width: 100%; padding: 10px; border: 1px solid #ddd; border-radius: 6px; font-size: 14px; box-sizing: border-box;"
                        placeholder="例如：GPT-4" required>
                </div>

                <div style="margin-bottom: 16px;">
                    <label style="display: block; margin-bottom: 6px; font-weight: 500; color: #555;">API 模式</label>
                    <select id="model-apimode"
                        style="width: 100%; padding: 10px; border: 1px solid #ddd; border-radius: 6px; font-size: 14px; box-sizing: border-box; cursor: pointer;" required>
                        <option value="openai-chat" ${currentApiMode === 'openai-chat' ? 'selected' : ''}>OpenAI Chat Completions</option>
                        <option value="openai-responses" ${currentApiMode === 'openai-responses' ? 'selected' : ''}>OpenAI Responses API</option>
                        <option value="anthropic-messages" ${currentApiMode === 'anthropic-messages' ? 'selected' : ''}>Anthropic Messages</option>
                        <option value="gemini-native" ${currentApiMode === 'gemini-native' ? 'selected' : ''}>Gemini Native generateContent</option>
                    </select>
                </div>

                <div style="margin-bottom: 16px;">
                    <label style="display: block; margin-bottom: 6px; font-weight: 500; color: #555;">API URL</label>
                    <input type="url" id="model-url" value="${isEdit ? escapeHTML(model.apiUrl) : ''}"
                        style="width: 100%; padding: 10px; border: 1px solid #ddd; border-radius: 6px; font-size: 14px; box-sizing: border-box;"
                        placeholder="https://api.openai.com/v1/chat/completions" required>
                </div>

                <div style="margin-bottom: 16px;">
                    <label style="display: block; margin-bottom: 6px; font-weight: 500; color: #555;">API Key</label>
                    <input type="password" id="model-key" value="${isEdit ? escapeHTML(model.apiKey) : ''}"
                        style="width: 100%; padding: 10px; border: 1px solid #ddd; border-radius: 6px; font-size: 14px; box-sizing: border-box;"
                        placeholder="sk-..." required>
                </div>

                <div style="margin-bottom: 16px;">
                    <label style="display: block; margin-bottom: 6px; font-weight: 500; color: #555;">模型名称</label>
                    <input type="text" id="model-modelname" value="${isEdit ? escapeHTML(model.modelName) : ''}"
                        style="width: 100%; padding: 10px; border: 1px solid #ddd; border-radius: 6px; font-size: 14px; box-sizing: border-box;"
                        placeholder="gpt-4" required>
                </div>

                <div style="margin-bottom: 20px;">
                    <label style="display: flex; align-items: center; cursor: pointer;">
                        <input type="checkbox" id="model-default" ${isEdit && model.isDefault ? 'checked' : ''}
                            style="margin-right: 8px; width: 18px; height: 18px; cursor: pointer;">
                        <span style="font-weight: 500; color: #555;">设为默认</span>
                    </label>
                </div>

                <div style="display: flex; gap: 10px; justify-content: flex-end;">
                    <button id="model-cancel" style="padding: 10px 20px; background: #e5e7eb; color: #374151; border: none; border-radius: 6px; cursor: pointer; font-size: 14px; font-weight: 500;">取消</button>
                    <button id="model-save" style="padding: 10px 20px; background: #667eea; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 14px; font-weight: 500;">保存</button>
                </div>
            `;

            modal.appendChild(form);
            document.body.appendChild(modal);

            document.getElementById('model-cancel').onclick = () => modal.remove();

            document.getElementById('model-save').onclick = () => {
                const name = document.getElementById('model-name').value.trim();
                const apiMode = document.getElementById('model-apimode').value;
                const apiUrl = document.getElementById('model-url').value.trim();
                const apiKey = document.getElementById('model-key').value.trim();
                const modelName = document.getElementById('model-modelname').value.trim();
                const isDefault = document.getElementById('model-default').checked;

                if (!name || !apiMode || !apiUrl || !apiKey || !modelName) {
                    alert('请填写所有必填字段');
                    return;
                }

                if (isEdit) {
                    configManager.updateModel(modelId, { name, apiMode, apiUrl, apiKey, modelName, isDefault });
                } else {
                    configManager.addModel(name, apiUrl, apiKey, modelName, isDefault, apiMode);
                }

                modal.remove();
                this.showConfigPanel(configManager, historyManager);
            };
        }

        showAutoRuleForm(configManager, historyManager, ruleId = null) {
            const rule = ruleId ? configManager.getAutoRuleById(ruleId) : null;
            const isEdit = !!rule;

            const prompts = configManager.getPrompts();
            const models = configManager.getModels();

            const modal = document.createElement('div');
            modal.style.cssText = `
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background: rgba(0, 0, 0, 0.5);
                z-index: 1000001;
                display: flex;
                align-items: center;
                justify-content: center;
            `;

            const form = document.createElement('div');
            form.style.cssText = `
                background: white;
                border-radius: 12px;
                padding: 24px;
                width: 90%;
                max-width: 680px;
                box-shadow: 0 10px 40px rgba(0, 0, 0, 0.3);
            `;

            form.innerHTML = `
                <h3 style="margin: 0 0 20px 0; font-size: 18px; color: #333;">
                    ${isEdit ? '编辑自动执行规则' : '新建自动执行规则'}
                </h3>

                <div style="margin-bottom: 16px;">
                    <label style="display: block; margin-bottom: 6px; font-weight: 500; color: #555;">规则名称</label>
                    <input type="text" id="rule-name"
                        value="${isEdit ? escapeHTML(rule.name) : ''}"
                        style="width: 100%; padding: 10px; border: 1px solid #ddd; border-radius: 6px; font-size: 14px; box-sizing: border-box;"
                        placeholder="例如：GitHub Issue 页面自动总结" required>
                </div>

                <div style="margin-bottom: 16px;">
                    <label style="display: block; margin-bottom: 6px; font-weight: 500; color: #555;">URL 正则</label>
                    <input type="text" id="rule-pattern"
                        value="${isEdit ? escapeHTML(rule.urlPattern) : ''}"
                        style="width: 100%; padding: 10px; border: 1px solid #ddd; border-radius: 6px; font-size: 14px; box-sizing: border-box; font-family: monospace;"
                        placeholder="例如：https://github\\.com/.*/issues/\\d+" required>
                    <p style="margin: 6px 0 0 0; font-size: 12px; color: #999;">
                        当前页面 URL 命中该正则后自动执行。
                    </p>
                </div>

                <div style="margin-bottom: 16px;">
                    <label style="display: block; margin-bottom: 6px; font-weight: 500; color: #555;">提示词</label>
                    <select id="rule-prompt"
                        style="width: 100%; padding: 10px; border: 1px solid #ddd; border-radius: 6px; font-size: 14px; box-sizing: border-box;">
                        <option value="">跟随当前/默认</option>
                        ${prompts.map(p => `
                            <option value="${p.id}" ${isEdit && rule.promptId === p.id ? 'selected' : ''}>
                                ${escapeHTML(p.name)}
                            </option>
                        `).join('')}
                    </select>
                </div>

                <div style="margin-bottom: 16px;">
                    <label style="display: block; margin-bottom: 6px; font-weight: 500; color: #555;">模型</label>
                    <select id="rule-model"
                        style="width: 100%; padding: 10px; border: 1px solid #ddd; border-radius: 6px; font-size: 14px; box-sizing: border-box;">
                        <option value="">跟随当前/默认</option>
                        ${models.map(m => `
                            <option value="${m.id}" ${isEdit && rule.modelId === m.id ? 'selected' : ''}>
                                ${escapeHTML(m.name)}
                            </option>
                        `).join('')}
                    </select>
                </div>

                <div style="margin-bottom: 20px;">
                    <label style="display: flex; align-items: center; cursor: pointer;">
                        <input type="checkbox" id="rule-enabled"
                            ${!isEdit || rule.enabled ? 'checked' : ''}
                            style="margin-right: 8px; width: 18px; height: 18px; cursor: pointer;">
                        <span style="font-weight: 500; color: #555;">启用</span>
                    </label>
                </div>

                <div style="display: flex; gap: 10px; justify-content: flex-end;">
                    <button id="rule-cancel"
                        style="padding: 10px 20px; background: #e5e7eb; color: #374151; border: none; border-radius: 6px; cursor: pointer; font-size: 14px; font-weight: 500;">
                        取消
                    </button>

                    <button id="rule-save"
                        style="padding: 10px 20px; background: #667eea; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 14px; font-weight: 500;">
                        保存
                    </button>
                </div>
            `;

            modal.appendChild(form);
            document.body.appendChild(modal);

            document.getElementById('rule-cancel').onclick = () => modal.remove();

            document.getElementById('rule-save').onclick = () => {
                const name = document.getElementById('rule-name').value.trim();
                const urlPattern = document.getElementById('rule-pattern').value.trim();
                const promptId = document.getElementById('rule-prompt').value || null;
                const modelId = document.getElementById('rule-model').value || null;
                const enabled = document.getElementById('rule-enabled').checked;

                if (!name || !urlPattern) {
                    alert('请填写规则名称和 URL 正则');
                    return;
                }

                try {
                    new RegExp(urlPattern);
                } catch (e) {
                    alert(`URL 正则无效：${e.message}`);
                    return;
                }

                if (isEdit) {
                    configManager.updateAutoRule(ruleId, {
                        name,
                        urlPattern,
                        promptId,
                        modelId,
                        enabled
                    });
                } else {
                    configManager.addAutoRule(name, urlPattern, promptId, modelId, enabled);
                }

                modal.remove();
                this.showConfigPanel(configManager, historyManager);
            };
        }

        showHistoryDetail(configManager, historyManager, recordId) {
            const record = historyManager.getRecordById(recordId);

            if (!record) {
                alert('历史记录不存在');
                return;
            }

            const prompt = configManager.getPromptById(record.promptId);
            const model = configManager.getModelById(record.modelId);
            const date = new Date(record.timestamp);

            const modal = document.createElement('div');
            modal.style.cssText = `
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background: rgba(0, 0, 0, 0.5);
                z-index: 1000001;
                display: flex;
                align-items: center;
                justify-content: center;
                overflow-y: auto;
                padding: 20px;
            `;

            const content = document.createElement('div');
            content.style.cssText = `
                background: white;
                border-radius: 12px;
                padding: 24px;
                width: 90%;
                max-width: 900px;
                max-height: 90vh;
                overflow-y: auto;
                box-shadow: 0 10px 40px rgba(0, 0, 0, 0.3);
            `;

            const apiModeLabels = {
                'openai-chat': 'OpenAI Chat Completions',
                'openai-responses': 'OpenAI Responses API',
                'anthropic-messages': 'Anthropic Messages',
                'gemini-native': 'Gemini Native generateContent'
            };

            let requestBodyFormatted = '';

            try {
                requestBodyFormatted = JSON.stringify(JSON.parse(record.requestBody), null, 2);
            } catch (e) {
                requestBodyFormatted = record.requestBody;
            }

            content.innerHTML = `
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
                    <h3 style="margin: 0; font-size: 20px; color: #333;">历史记录详情</h3>
                    <button id="history-detail-close" style="background: none; border: none; color: #999; font-size: 28px; cursor: pointer; padding: 0; width: 30px; height: 30px; line-height: 1;">×</button>
                </div>

                <div style="font-size: 13px; color: #999; margin-bottom: 20px;">
                    ${date.toLocaleString()}
                </div>

                <div style="margin-bottom: 24px;">
                    <h4 style="margin: 0 0 12px 0; font-size: 16px; color: #667eea; border-bottom: 2px solid #667eea; padding-bottom: 6px;">模型信息</h4>
                    <div style="background: #f9fafb; padding: 12px; border-radius: 6px; font-size: 14px; line-height: 1.8;">
                        <div><strong>模型名称:</strong> ${model ? escapeHTML(model.name) : '未知'}</div>
                        <div><strong>API 模式:</strong> ${model && model.apiMode ? escapeHTML(apiModeLabels[model.apiMode] || model.apiMode) : 'OpenAI Chat Completions'}</div>
                        <div><strong>API URL:</strong> ${model ? escapeHTML(model.apiUrl) : '未知'}</div>
                        <div><strong>模型标识:</strong> ${model ? escapeHTML(model.modelName) : '未知'}</div>
                    </div>
                </div>

                <div style="margin-bottom: 24px;">
                    <h4 style="margin: 0 0 12px 0; font-size: 16px; color: #667eea; border-bottom: 2px solid #667eea; padding-bottom: 6px;">提示词信息</h4>
                    <div style="background: #f9fafb; padding: 12px; border-radius: 6px; font-size: 14px;">
                        <div style="margin-bottom: 8px;"><strong>提示词名称:</strong> ${prompt ? escapeHTML(prompt.name) : '未知'}</div>
                        <div><strong>模板:</strong></div>
                        <pre style="background: #fff; padding: 10px; border-radius: 4px; overflow-x: auto; margin: 8px 0 0 0; font-size: 13px; line-height: 1.5; border: 1px solid #e5e7eb;">${prompt ? escapeHTML(prompt.template) : '未知'}</pre>
                    </div>
                </div>

                <div style="margin-bottom: 24px;">
                    <h4 style="margin: 0 0 12px 0; font-size: 16px; color: #667eea; border-bottom: 2px solid #667eea; padding-bottom: 6px;">接口信息</h4>
                    <div style="background: #f9fafb; padding: 12px; border-radius: 6px; font-size: 14px;">
                        <div style="margin-bottom: 8px;"><strong>请求 URL:</strong></div>
                        <div style="background: #fff; padding: 10px; border-radius: 4px; overflow-x: auto; margin-bottom: 12px; font-family: monospace; font-size: 13px; border: 1px solid #e5e7eb; word-break: break-all;">${escapeHTML(record.requestUrl || '未知')}</div>
                        <div style="margin-bottom: 8px;"><strong>请求体:</strong></div>
                        <pre style="background: #fff; padding: 10px; border-radius: 4px; overflow-x: auto; margin: 0; font-size: 13px; line-height: 1.5; border: 1px solid #e5e7eb;">${escapeHTML(requestBodyFormatted)}</pre>
                    </div>
                </div>

                <div style="margin-bottom: 0;">
                    <h4 style="margin: 0 0 12px 0; font-size: 16px; color: #667eea; border-bottom: 2px solid #667eea; padding-bottom: 6px;">结果信息</h4>
                    <div style="background: #f9fafb; padding: 12px; border-radius: 6px; font-size: 14px;">
                        <pre style="background: #fff; padding: 12px; border-radius: 4px; overflow-x: auto; margin: 0; font-size: 13px; line-height: 1.6; white-space: pre-wrap; word-wrap: break-word; border: 1px solid #e5e7eb; max-height: 400px;">${escapeHTML(record.result)}</pre>
                    </div>
                </div>
            `;

            modal.appendChild(content);
            document.body.appendChild(modal);

            document.getElementById('history-detail-close').onclick = () => modal.remove();

            modal.onclick = (event) => {
                if (event.target === modal) {
                    modal.remove();
                }
            };
        }

        showPromptDetail(configManager, promptId) {
            const prompt = configManager.getPromptById(promptId);

            if (!prompt) {
                alert('提示词不存在');
                return;
            }

            const modal = document.createElement('div');
            modal.style.cssText = `
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background: rgba(0, 0, 0, 0.5);
                z-index: 1000001;
                display: flex;
                align-items: center;
                justify-content: center;
                padding: 20px;
            `;

            const content = document.createElement('div');
            content.style.cssText = `
                background: #fff;
                border-radius: 12px;
                width: 90%;
                max-width: 760px;
                max-height: 85vh;
                overflow-y: auto;
                box-shadow: 0 10px 40px rgba(0, 0, 0, 0.3);
                padding: 24px;
            `;

            content.innerHTML = `
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
                    <h3 style="margin: 0; font-size: 20px; color: #1f2937;">提示词详情</h3>
                    <button id="prompt-detail-close" style="background: none; border: none; color: #9ca3af; font-size: 28px; cursor: pointer; line-height: 1;">×</button>
                </div>

                <div style="margin-bottom: 12px; font-size: 14px; color: #374151;">
                    <strong>名称：</strong>${escapeHTML(prompt.name)} ${prompt.isDefault ? '<span style="color:#4f46e5;">(默认)</span>' : ''}
                </div>

                <div style="margin-bottom: 8px; font-size: 14px; color: #374151;"><strong>完整模板：</strong></div>

                <pre style="background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 6px; padding: 12px; margin: 0; white-space: pre-wrap; word-break: break-word; line-height: 1.6; font-size: 13px;">${escapeHTML(prompt.template)}</pre>
            `;

            modal.appendChild(content);
            document.body.appendChild(modal);

            const close = () => modal.remove();

            const closeBtn = content.querySelector('#prompt-detail-close');
            if (closeBtn) {
                closeBtn.onclick = close;
            }

            modal.onclick = (event) => {
                if (event.target === modal) {
                    close();
                }
            };
        }
    }

    // ==================== 自动执行引擎 ====================

    class AutoExecutionManager {
        constructor(configManager, historyManager, uiManager) {
            this.configManager = configManager;
            this.historyManager = historyManager;
            this.uiManager = uiManager;
            this.lastExecuted = null;
        }

        start() {
            if (window.self !== window.top) return;

            this.check();
            this.watchUrlChange(() => this.check());
        }

        check() {
            const rules = this.configManager.getAutoRules().filter(rule => rule.enabled);
            if (!rules.length) return;

            const url = window.location.href;

            for (const rule of rules) {
                let regex;

                try {
                    regex = new RegExp(rule.urlPattern);
                } catch (e) {
                    continue;
                }

                if (!regex.test(url)) continue;

                if (
                    this.lastExecuted &&
                    this.lastExecuted.url === url &&
                    this.lastExecuted.ruleId === rule.id
                ) {
                    continue;
                }

                const promptOverride = rule.promptId ? this.configManager.getPromptById(rule.promptId) : null;
                const modelOverride = rule.modelId ? this.configManager.getModelById(rule.modelId) : null;

                const effectiveModel = modelOverride || this.uiManager.getActiveModel(this.configManager);

                if (!effectiveModel || effectiveModel.apiKey === 'YOUR_API_KEY_HERE') {
                    continue;
                }

                this.lastExecuted = {
                    url,
                    ruleId: rule.id
                };

                setTimeout(() => {
                    executeWorkflow(this.configManager, this.historyManager, this.uiManager, {
                        promptOverride,
                        modelOverride,
                        source: 'auto',
                        ruleName: rule.name
                    });
                }, 500);

                return;
            }
        }

        watchUrlChange(callback) {
            let currentUrl = window.location.href;

            const check = () => {
                if (window.location.href !== currentUrl) {
                    currentUrl = window.location.href;
                    callback();
                }
            };

            ['pushState', 'replaceState'].forEach((method) => {
                const original = history[method];

                history[method] = function (...args) {
                    const result = original.apply(this, args);
                    setTimeout(check, 0);
                    return result;
                };
            });

            window.addEventListener('popstate', check);
            window.addEventListener('hashchange', check);
        }
    }

    // ==================== 主工作流 ====================

    async function executeWorkflow(configManager, historyManager, uiManager, options = {}) {
        const {
            promptOverride = null,
            modelOverride = null,
            source = 'manual',
            ruleName = ''
        } = options;

        try {
            const loadingText = source === 'auto'
                ? `自动执行规则「${ruleName}」，正在调用 AI...`
                : '正在调用 AI 模型，请稍候...';

            uiManager.showLoading(loadingText);

            const pageInfo = extractPageInfo();

            const prompt = promptOverride || uiManager.getActivePrompt(configManager);
            const model = modelOverride || uiManager.getActiveModel(configManager);

            if (!model || model.apiKey === 'YOUR_API_KEY_HERE') {
                throw new Error('请先配置 API Key！');
            }

            const interpolatedPrompt = InterpolationEngine.replace(prompt.template, pageInfo);

            const response = await callAI(model, interpolatedPrompt);

            historyManager.addRecord(
                prompt.id,
                model.id,
                interpolatedPrompt,
                response.result,
                response.requestUrl,
                response.requestBody
            );

            uiManager.showResultPanel(response.result, false);
        } catch (error) {
            uiManager.showResultPanel(error.message, true);
        }
    }

    // ==================== 全局快捷键绑定 ====================

    function bindGlobalShortcuts(configManager, historyManager, uiManager) {
        document.addEventListener('keydown', (event) => {
            if (ShortcutManager.capturing) return;

            const shortcuts = ShortcutManager.get();

            if (ShortcutManager.matchEvent(event, shortcuts.openConfig)) {
                event.preventDefault();
                event.stopPropagation();
                uiManager.showConfigPanel(configManager, historyManager);
                return;
            }

            if (ShortcutManager.matchEvent(event, shortcuts.execute)) {
                event.preventDefault();
                event.stopPropagation();
                executeWorkflow(configManager, historyManager, uiManager);
            }
        }, true);
    }

    // ==================== 初始化 ====================

    function init() {
        if (window.self !== window.top) return;

        const configManager = new ConfigManager();
        const historyManager = new HistoryManager();
        const uiManager = new UIManager();

        bindGlobalShortcuts(configManager, historyManager, uiManager);

        GM_registerMenuCommand('AI Toolbox 配置', () => {
            uiManager.showConfigPanel(configManager, historyManager);
        });

        const autoExecutionManager = new AutoExecutionManager(configManager, historyManager, uiManager);
        autoExecutionManager.start();

        console.log('AI Toolbox 已加载：快捷键模式 + 自动执行');
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();