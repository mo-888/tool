// ==UserScript==
// @name         AI Toolbox - 通用 AI 助手
// @namespace    http://tampermonkey.net/
// @version      1.0.0
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

    // ==================== 工具函数 ====================

    /**
     * 生成 UUID
     */
    function generateUUID() {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
            const r = Math.random() * 16 | 0;
            const v = c === 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
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

    // ==================== 配置管理 ====================

    class ConfigManager {
        constructor() {
            this.prompts = StorageManager.load('prompts', []);
            this.models = StorageManager.load('models', []);
            this.initDefaults();
        }

        /**
         * 初始化默认配置
         */
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
            // Ensure backward compatibility: add apiMode to models that don't have it
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

        savePrompts() {
            StorageManager.save('prompts', this.prompts);
        }

        saveModels() {
            StorageManager.save('models', this.models);
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
            // If limit is null, return all history
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
        /**
         * 替换模板中的占位符
         * @param {string} template - 提示词模板
         * @param {Object} pageInfo - 页面信息
         * @returns {string} 插值后的文本
         */
        static replace(template, pageInfo) {
            return template
                .replace(/\{\{url\}\}/g, pageInfo.url || '')
                .replace(/\{\{title\}\}/g, pageInfo.title || '')
                .replace(/\{\{content\}\}/g, pageInfo.content || '')
                .replace(/\{\{selection\}\}/g, pageInfo.selection || '');
        }
    }

    // ==================== 页面信息提取 ====================

    /**
     * 提取当前页面信息
     * @returns {Object} PageInfo 对象
     */
    function extractPageInfo() {
        return {
            url: window.location.href,
            title: document.title,
            content: document.body.innerText.trim(),
            selection: window.getSelection().toString().trim()
        };
    }

    // ==================== AI 模型调用 ====================

    /**
     * 调用 AI 模型 API
     * @param {Object} model - 模型配置
     * @param {string} prompt - 插值后的提示词
     * @returns {Promise<Object>} 包含结果和请求信息的对象
     */
    function callAI(model, prompt) {
        return new Promise((resolve, reject) => {
            const apiMode = model.apiMode || 'openai-chat';
            let url = model.apiUrl;
            let headers = { 'Content-Type': 'application/json' };
            let requestBody = {};

            // 根据 API 模式构建请求
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
                    // Gemini 使用 URL 参数传递 API key
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
                url: url,
                headers: headers,
                data: requestBodyStr,
                onload: function(response) {
                    try {
                        const data = JSON.parse(response.responseText);
                        let result = null;

                        // 根据 API 模式解析响应
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
                                if (data.candidates && data.candidates[0] &&
                                    data.candidates[0].content && data.candidates[0].content.parts &&
                                    data.candidates[0].content.parts[0]) {
                                    result = data.candidates[0].content.parts[0].text;
                                }
                                break;
                        }

                        if (result) {
                            resolve({
                                result: result,
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
                onerror: function(error) {
                    reject(new Error(`请求失败: ${error.statusText || '网络错误'}`));
                },
                ontimeout: function() {
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
        }

        /**
         * 创建页面按钮
         */
        createPageButton() {
            const button = document.createElement('button');
            button.id = 'ai-toolbox-button';
            button.textContent = '🤖 AI';
            button.style.cssText = `
                position: fixed;
                bottom: 20px;
                right: 20px;
                z-index: 999999;
                padding: 12px 20px;
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                color: white;
                border: none;
                border-radius: 25px;
                font-size: 16px;
                font-weight: bold;
                cursor: pointer;
                box-shadow: 0 4px 15px rgba(0, 0, 0, 0.2);
                transition: all 0.3s ease;
            `;
            button.onmouseover = () => {
                button.style.transform = 'scale(1.05)';
                button.style.boxShadow = '0 6px 20px rgba(0, 0, 0, 0.3)';
            };
            button.onmouseout = () => {
                button.style.transform = 'scale(1)';
                button.style.boxShadow = '0 4px 15px rgba(0, 0, 0, 0.2)';
            };
            document.body.appendChild(button);
            return button;
        }

        /**
         * 显示结果面板
         */
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

        /**
         * 显示加载状态
         */
        showLoading() {
            this.showResultPanel('正在调用 AI 模型，请稍候...', false);
        }

        /**
         * 显示配置界面
         */
        showConfigPanel(configManager, historyManager) {
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

        /**
         * 显示提示词表单模态框
         */
        showPromptForm(configManager, historyManager, promptId = null) {
            const prompt = promptId ? configManager.getPrompts().find(p => p.id === promptId) : null;
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
                    <input type="text" id="prompt-name" value="${isEdit ? prompt.name : ''}"
                        style="width: 100%; padding: 10px; border: 1px solid #ddd; border-radius: 6px; font-size: 14px; box-sizing: border-box;"
                        placeholder="例如：网页内容总结" required>
                </div>
                <div style="margin-bottom: 16px;">
                    <label style="display: block; margin-bottom: 6px; font-weight: 500; color: #555;">模板</label>
                    <textarea id="prompt-template" rows="8"
                        style="width: 100%; padding: 10px; border: 1px solid #ddd; border-radius: 6px; font-size: 14px; font-family: monospace; box-sizing: border-box; resize: vertical;"
                        placeholder="使用 {{url}}, {{title}}, {{content}}, {{selection}} 作为占位符" required>${isEdit ? prompt.template : ''}</textarea>
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

        /**
         * 显示模型表单模态框
         */
        showModelForm(configManager, historyManager, modelId = null) {
            const model = modelId ? configManager.getModels().find(m => m.id === modelId) : null;
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
                    <input type="text" id="model-name" value="${isEdit ? model.name : ''}"
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
                    <input type="url" id="model-url" value="${isEdit ? model.apiUrl : ''}"
                        style="width: 100%; padding: 10px; border: 1px solid #ddd; border-radius: 6px; font-size: 14px; box-sizing: border-box;"
                        placeholder="https://api.openai.com/v1/chat/completions" required>
                </div>
                <div style="margin-bottom: 16px;">
                    <label style="display: block; margin-bottom: 6px; font-weight: 500; color: #555;">API Key</label>
                    <input type="password" id="model-key" value="${isEdit ? model.apiKey : ''}"
                        style="width: 100%; padding: 10px; border: 1px solid #ddd; border-radius: 6px; font-size: 14px; box-sizing: border-box;"
                        placeholder="sk-..." required>
                </div>
                <div style="margin-bottom: 16px;">
                    <label style="display: block; margin-bottom: 6px; font-weight: 500; color: #555;">模型名称</label>
                    <input type="text" id="model-modelname" value="${isEdit ? model.modelName : ''}"
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

        /**
         * 显示历史记录详情模态框
         */
        showHistoryDetail(configManager, historyManager, recordId) {
            const record = historyManager.getRecordById(recordId);
            if (!record) {
                alert('历史记录不存在');
                return;
            }

            const prompt = configManager.getPrompts().find(p => p.id === record.promptId);
            const model = configManager.getModels().find(m => m.id === record.modelId);
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
                        <div><strong>模型名称:</strong> ${model ? model.name : '未知'}</div>
                        <div><strong>API 模式:</strong> ${model && model.apiMode ? apiModeLabels[model.apiMode] || model.apiMode : 'OpenAI Chat Completions'}</div>
                        <div><strong>API URL:</strong> ${model ? model.apiUrl : '未知'}</div>
                        <div><strong>模型标识:</strong> ${model ? model.modelName : '未知'}</div>
                    </div>
                </div>

                <div style="margin-bottom: 24px;">
                    <h4 style="margin: 0 0 12px 0; font-size: 16px; color: #667eea; border-bottom: 2px solid #667eea; padding-bottom: 6px;">提示词信息</h4>
                    <div style="background: #f9fafb; padding: 12px; border-radius: 6px; font-size: 14px;">
                        <div style="margin-bottom: 8px;"><strong>提示词名称:</strong> ${prompt ? prompt.name : '未知'}</div>
                        <div><strong>模板:</strong></div>
                        <pre style="background: #fff; padding: 10px; border-radius: 4px; overflow-x: auto; margin: 8px 0 0 0; font-size: 13px; line-height: 1.5; border: 1px solid #e5e7eb;">${prompt ? prompt.template : '未知'}</pre>
                    </div>
                </div>

                <div style="margin-bottom: 24px;">
                    <h4 style="margin: 0 0 12px 0; font-size: 16px; color: #667eea; border-bottom: 2px solid #667eea; padding-bottom: 6px;">接口信息</h4>
                    <div style="background: #f9fafb; padding: 12px; border-radius: 6px; font-size: 14px;">
                        <div style="margin-bottom: 8px;"><strong>请求 URL:</strong></div>
                        <div style="background: #fff; padding: 10px; border-radius: 4px; overflow-x: auto; margin-bottom: 12px; font-family: monospace; font-size: 13px; border: 1px solid #e5e7eb; word-break: break-all;">${record.requestUrl || '未知'}</div>
                        <div style="margin-bottom: 8px;"><strong>请求体:</strong></div>
                        <pre style="background: #fff; padding: 10px; border-radius: 4px; overflow-x: auto; margin: 0; font-size: 13px; line-height: 1.5; border: 1px solid #e5e7eb;">${requestBodyFormatted}</pre>
                    </div>
                </div>

                <div style="margin-bottom: 0;">
                    <h4 style="margin: 0 0 12px 0; font-size: 16px; color: #667eea; border-bottom: 2px solid #667eea; padding-bottom: 6px;">结果信息</h4>
                    <div style="background: #f9fafb; padding: 12px; border-radius: 6px; font-size: 14px;">
                        <pre style="background: #fff; padding: 12px; border-radius: 4px; overflow-x: auto; margin: 0; font-size: 13px; line-height: 1.6; white-space: pre-wrap; word-wrap: break-word; border: 1px solid #e5e7eb; max-height: 400px;">${record.result}</pre>
                    </div>
                </div>
            `;

            modal.appendChild(content);
            document.body.appendChild(modal);

            document.getElementById('history-detail-close').onclick = () => modal.remove();
            modal.onclick = (e) => {
                if (e.target === modal) {
                    modal.remove();
                }
            };
        }

        generateConfigHTML(configManager, historyManager) {
            const prompts = configManager.getPrompts();
            const models = configManager.getModels();
            const history = historyManager.getHistory(null); // Get all history

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

            return `
                <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
                        <h4 style="margin: 0;">提示词模板</h4>
                        <button id="add-prompt" style="${buttonStyle} background: #10b981; color: white;">+ 新建提示词</button>
                    </div>
                    <div id="prompts-list">
                        ${prompts.map(p => `
                            <div style="border: 1px solid #ddd; padding: 12px; margin-bottom: 10px; border-radius: 6px; background: #fafafa;">
                                <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 8px;">
                                    <div>
                                        <strong style="font-size: 15px;">${p.name}</strong>
                                        ${p.isDefault ? '<span style="color: #667eea; font-size: 13px; margin-left: 8px;">(默认)</span>' : ''}
                                    </div>
                                    <div style="display: flex; gap: 6px;">
                                        ${!p.isDefault ? `<button class="set-default-prompt" data-id="${p.id}" style="${buttonStyle} background: #f59e0b; color: white; font-size: 12px; padding: 4px 10px;">设为默认</button>` : ''}
                                        <button class="edit-prompt" data-id="${p.id}" style="${buttonStyle} background: #3b82f6; color: white; font-size: 12px; padding: 4px 10px;">编辑</button>
                                        <button class="delete-prompt" data-id="${p.id}" style="${buttonStyle} background: #ef4444; color: white; font-size: 12px; padding: 4px 10px;">删除</button>
                                    </div>
                                </div>
                                <pre style="background: #f5f5f5; padding: 10px; border-radius: 4px; overflow-x: auto; margin: 0; font-size: 13px; line-height: 1.5;">${p.template}</pre>
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
                                        <strong style="font-size: 15px;">${m.name}</strong>
                                        ${m.isDefault ? '<span style="color: #667eea; font-size: 13px; margin-left: 8px;">(默认)</span>' : ''}
                                    </div>
                                    <div style="display: flex; gap: 6px;">
                                        ${!m.isDefault ? `<button class="set-default-model" data-id="${m.id}" style="${buttonStyle} background: #f59e0b; color: white; font-size: 12px; padding: 4px 10px;">设为默认</button>` : ''}
                                        <button class="edit-model" data-id="${m.id}" style="${buttonStyle} background: #3b82f6; color: white; font-size: 12px; padding: 4px 10px;">编辑</button>
                                        <button class="delete-model" data-id="${m.id}" style="${buttonStyle} background: #ef4444; color: white; font-size: 12px; padding: 4px 10px;">删除</button>
                                    </div>
                                </div>
                                <div style="margin-top: 8px; font-size: 13px; color: #666; line-height: 1.6;">
                                    <div><strong>API 模式:</strong> ${apiModeLabels[apiMode] || apiMode}</div>
                                    <div><strong>API URL:</strong> ${m.apiUrl}</div>
                                    <div><strong>Model:</strong> ${m.modelName}</div>
                                    <div><strong>API Key:</strong> ${'*'.repeat(Math.min(m.apiKey.length, 20))}</div>
                                </div>
                            </div>
                        `;
                        }).join('')}
                    </div>

                    <h4 style="margin-top: 30px;">历史记录 (共 ${history.length} 条)</h4>
                    <div id="history-list">
                        ${history.length === 0 ? '<p style="color: #999;">暂无历史记录</p>' : history.map(h => {
                            const date = new Date(h.timestamp);
                            return `
                                <div style="border: 1px solid #ddd; padding: 10px; margin-bottom: 10px; border-radius: 6px; background: #fafafa;">
                                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                                        <div style="font-size: 12px; color: #999;">${date.toLocaleString()}</div>
                                        <button class="view-history-detail" data-id="${h.id}" style="${buttonStyle} background: #667eea; color: white; font-size: 12px; padding: 4px 10px;">查看详情</button>
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
            // 新建提示词
            const addPromptBtn = document.getElementById('add-prompt');
            if (addPromptBtn) {
                addPromptBtn.onclick = () => this.showPromptForm(configManager, historyManager);
            }

            // 编辑提示词
            document.querySelectorAll('.edit-prompt').forEach(btn => {
                btn.onclick = () => {
                    const promptId = btn.getAttribute('data-id');
                    this.showPromptForm(configManager, historyManager, promptId);
                };
            });

            // 删除提示词
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

            // 设为默认提示词
            document.querySelectorAll('.set-default-prompt').forEach(btn => {
                btn.onclick = () => {
                    const promptId = btn.getAttribute('data-id');
                    configManager.updatePrompt(promptId, { isDefault: true });
                    this.showConfigPanel(configManager, historyManager);
                };
            });

            // 新建模型
            const addModelBtn = document.getElementById('add-model');
            if (addModelBtn) {
                addModelBtn.onclick = () => this.showModelForm(configManager, historyManager);
            }

            // 编辑模型
            document.querySelectorAll('.edit-model').forEach(btn => {
                btn.onclick = () => {
                    const modelId = btn.getAttribute('data-id');
                    this.showModelForm(configManager, historyManager, modelId);
                };
            });

            // 删除模型
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

            // 设为默认模型
            document.querySelectorAll('.set-default-model').forEach(btn => {
                btn.onclick = () => {
                    const modelId = btn.getAttribute('data-id');
                    configManager.updateModel(modelId, { isDefault: true });
                    this.showConfigPanel(configManager, historyManager);
                };
            });

            // 清空历史
            const clearBtn = document.getElementById('clear-history');
            if (clearBtn) {
                clearBtn.onclick = () => {
                    if (confirm('确定要清空所有历史记录吗？')) {
                        historyManager.clearHistory();
                        this.showConfigPanel(configManager, historyManager);
                    }
                };
            }

            // 查看历史详情
            document.querySelectorAll('.view-history-detail').forEach(btn => {
                btn.onclick = () => {
                    const recordId = btn.getAttribute('data-id');
                    this.showHistoryDetail(configManager, historyManager, recordId);
                };
            });
        }
    }

    // ==================== 主工作流 ====================

    /**
     * 执行完整工作流
     */
    async function executeWorkflow(configManager, historyManager, uiManager) {
        try {
            uiManager.showLoading();

            const pageInfo = extractPageInfo();
            const prompt = configManager.getDefaultPrompt();
            const model = configManager.getDefaultModel();

            if (!model || model.apiKey === 'YOUR_API_KEY_HERE') {
                throw new Error('请先配置 API Key！点击菜单 "AI Toolbox 配置" 进行设置。');
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

    // ==================== 初始化 ====================

    function init() {
        const configManager = new ConfigManager();
        const historyManager = new HistoryManager();
        const uiManager = new UIManager();

        const button = uiManager.createPageButton();
        button.onclick = () => executeWorkflow(configManager, historyManager, uiManager);

        GM_registerMenuCommand('AI Toolbox 配置', () => {
            uiManager.showConfigPanel(configManager, historyManager);
        });

        console.log('AI Toolbox 已加载');
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();
