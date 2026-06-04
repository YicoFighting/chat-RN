# 项目功能与需求分析报告

我们对当前基于 Expo (React Native) 和 TypeScript 构建的 AI 聊天客户端项目（`chatRN`）进行了详细的代码结构与功能梳理。

该项目目前实现了大模型多提供商配置、基础流式对话（包含推理/思考过程展示）以及单图多模态输入等核心功能，界面风格现代且适配了深色模式。然而，作为一款完备的 AI 聊天应用，目前仍处于极简状态，有许多核心功能和体验亟待补齐。

以下是针对该项目的功能现状评估、潜在问题诊断，以及未来核心功能与需求的优化建议。

---

## 1. 现有功能与架构评估

### 已实现的核心功能
1. **多模型提供商配置**：支持 OpenAI、Anthropic、DeepSeek 和 Custom 模式，允许用户自定义 API Base URL、API Key 和 Model 标识，配置通过 MMKV 持久化存储在本地。
2. **基础流式聊天 (Streaming)**：实现了 `/chat/completions` 的流式接口请求，支持实时更新 AI 消息。
3. **推理模型适配**：能解析并以折叠/展开的 UI 形式友好展示 DeepSeek 等模型的推理过程（`reasoning_content`）。
4. **单图多模态支持**：利用 `expo-image-picker` 允许用户从相册选择单张图片，转换为 Base64 并随请求发送给多模态模型。
5. **UI & 主题**：使用 Nativewind (Tailwind CSS) 样式，适配了系统的 Light/Dark 主题。

---

## 2. 发现的潜在问题与改进空间

在查看源码后，我们发现以下几个影响稳定性与兼容性的问题：

1. **聊天记录未持久化**：
   - 目前 `store/useChatStore.ts` 存储的 `messages` 仅在内存中。应用一旦关闭或崩溃重启，所有的聊天记录都会丢失。
2. **Anthropic 官方 API 兼容性问题**：
   - 源码中对 Anthropic 的请求拼装为 `${baseUrl}/chat/completions`，但这属于 OpenAI 兼容格式。如果用户使用 Anthropic 官方的 Endpoint (`https://api.anthropic.com/v1/messages`)，其请求体结构、响应格式（如使用 `messages` 节点，而非 `choices` 节点）截然不同。当前实现只适用于包装了 OpenAI 格式的 Anthropic 代理中转服务。
3. **React Native 下的流式 Stream 兼容性**：
   - `utils/llmClient.ts` 中使用了 Web 标准的 `fetch` 和 `response.body.getReader()`。在某些旧版本的 React Native 或特定平台的 JavaScriptCore 引擎中，`response.body` 可能为 `undefined` 导致流式传输失败。通常在 RN 中，更稳健的方法是引入 SSE 库或使用特定的 polyfill。
4. **移动端安全区适配不足**：
   - 输入框 `MessageInput` 紧贴屏幕底部，在带刘海屏/手势条的 iOS 与 Android 现代设备上，可能会被系统手势区遮挡，需要完整引入 `react-native-safe-area-context` 的 `useSafeAreaInsets` 来处理输入框的底部 padding。

---

## 3. 功能与需求提案（路线图建议）

为了将此项目提升为一款高实用性、WOW 级设计体验的完整 AI 客户端，我们建议后续着手开发以下几个维度的功能：

### 维度一：会话管理（核心缺失）
*   **[P0] 多会话（Chats / Sessions）支持**：
    *   目前只有全局单一会话。需要增加“历史会话列表”，允许用户新建会话、切换会话。
    *   **历史记录持久化**：将不同会话的聊天历史通过 MMKV 序列化持久化存储在本地，下次打开时自动恢复。
    *   **会话管理操作**：支持对会话进行重命名（甚至可以通过 AI 自动根据首句生成会话标题）、删除会话、一键清空所有历史。
    *   **会话搜索**：在历史列表中支持通过关键词搜索会话标题或聊天内容。

### 维度二：聊天交互与 UI/UX 极致体验
*   **[P0] Markdown 与代码高亮渲染**：
    *   目前 AI 的回复以纯文本形式展示。若 AI 返回代码块、表格、列表、粗体等，可读性极差。
    *   需要引入 React Native 兼容的 Markdown 渲染库（例如 `react-native-markdown-display`），并对代码块（Code Blocks）进行语法高亮，同时提供**一键复制**代码块的功能。
*   **[P0] 停止生成 (Abort Generation)**：
    *   使用 `AbortController` 并在 UI 上提供“停止”按钮。当 AI 输出过多废话或方向偏离时，用户可中途打断流式响应。
*   **[P1] 重新生成与编辑消息**：
    *   允许用户对 AI 的最新一条回复点击“重新生成”（Regenerate）。
    *   允许用户编辑自己之前发送的某条消息，并触发从该节点开始的分支对话。
*   **[P1] 快捷操作工具栏**：
    *   长按消息弹出菜单：支持复制全文、分享、删除单条消息。
    *   提供消息朗读 (TTS - Text to Speech) 播放按钮。
*   **[P2] 打字机动画与精美过渡**：
    *   为了减缓大模型流式接收文本时的视觉抖动，可配合 Reanimated 库实现顺滑的文本打字机过渡效果与滚动动画。

### 维度三：多模态与输入增强
*   **[P1] 拍照功能集成**：
    *   目前只支持 `pickImage`（相册）。应扩展支持通过摄像头直接拍照上传。
    *   支持多张图片同时上传（OpenAI / Claude 支持多图输入）。
*   **[P2] 语音输入**：
    *   集成语音转文字 (STT) 模块，支持用户按住说话，将其自动转化为文字输入。
*   **[P2] 文档读取/附件支持**：
    *   对于支持附件的模型，支持用户上传 `.txt` 、`.pdf` 、`.md` 等文本文件作为上下文输入。

### 维度四：大模型参数及高级设置
*   **[P1] 模型预设与一键切换**：
    *   目前需要用户手动拼写 Model 字符串。可针对各 Provider 提供官方主流模型的下拉选择列表（如 `gpt-4o`, `gpt-4o-mini`, `claude-3-5-sonnet`, `deepseek-chat`, `deepseek-reasoner` 等），只在 Custom 时保留纯文本输入。
*   **[P1] System Prompt (系统提示词) 配置**：
    *   允许用户在设置中自定义全局的系统提示词（如“你是一个资深的 React Native 专家”），或者在创建每个新会话时单独设定其 System Role。
*   **[P2] 高级模型参数控制**：
    *   在设置或会话中暴露 `Temperature`（温度/随机性）、`Max Tokens`（最大生成长度）、`Top P` 等参数滑动条，以满足开发者或高级用户的调优需求。
*   **[P2] API 连通性测试按钮**：
    *   在配置完 API 密钥和 Base URL 后，提供一键“测试连接”功能，避免用户发送消息后才发现配置错误。

---

## 4. 后续开发建议步骤

1.  **第一步：基础架构修复与升级**  
    *   利用 MMKV 引入多会话数据结构。
    *   重构 `utils/llmClient.ts`，彻底分离 Anthropic 官方原生格式请求，并处理好 React Native 环境下流式读取的潜在阻碍。
2.  **第一步（并行）：UI 体验与 Markdown 补齐**  
    *   实现 Markdown 显示和代码高亮。这是程序员等核心用户体验分水岭。
    *   加入安全区高度（Safe Area）适配。
3.  **第二步：添加交互动作**  
    *   实现 Abort 停止生成、消息复制与重新生成。
4.  **第三步：大模型高级设置与多模态扩展**  
    *   添加模型常用列表、连通性测试和 System Prompt 配置。
