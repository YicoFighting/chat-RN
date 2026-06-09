# 后端技术架构与接口需求说明

本文档用于发给后端同学，作为 `chatRN` 项目的后端技术准入、工程规范和第一阶段接口清单。

## 1. 项目背景

当前项目是一个基于 Expo + React Native 的跨平台 AI 聊天客户端，已具备：

- 多模型提供商配置：OpenAI、Anthropic、DeepSeek、Custom。
- 流式聊天：支持 OpenAI 兼容 `/chat/completions` 和 Anthropic 官方 `/messages`。
- 推理内容展示：可解析 `reasoning_content` / `thinking`。
- 多模态输入：图片、拍照、文本类文档、语音转文字。
- 本地会话管理：通过 MMKV/Zustand 保存会话、消息和设置。

后端第一阶段目标：

- 接管用户体系、远程会话、消息持久化、附件上传凭证、语音转文字和 AI 流式网关。
- 前端不再直接持有平台级 LLM Key，生产环境由后端统一读取环境变量并代理调用。
- 保持技术栈轻量、类型安全、可迁移，避免被具体云厂商 SDK 或 BaaS 锁死。

未来可能扩展：

- 申论 / 行测题库系统。
- AI 批改，多图、多文档上传。
- 多用户、多设备同步。

## 2. 关键结论

| 层级 | 推荐选型 | 约束 |
| --- | --- | --- |
| 后端框架 | Hono | 基于标准 Web API 编写，便于部署到 Cloudflare Workers、Node.js、Bun、阿里云 FC/ECS |
| 类型契约 | Hono RPC | 后端导出 `export type AppType = typeof routes`，前端使用 `hono/client` 消费 |
| 参数校验 | Zod + `@hono/zod-validator` | 所有入口参数必须校验，禁止未校验的 JSON 直透业务层 |
| 数据库 | PostgreSQL | 国内环境优先阿里云 RDS / 腾讯云 PostgreSQL；海外/边缘环境可选 Supabase 托管 PostgreSQL |
| ORM | Drizzle ORM | 业务代码禁止直接使用 `@supabase/supabase-js` 做数据库增删改查 |
| Migration | drizzle-kit | 迁移 SQL 和快照必须进入代码仓库 |
| 对象存储 | 七牛云 Kodo | 前端直传，后端只签发上传凭证 |
| 邮件 | 阿里云邮件推送 / Resend / Brevo | 统一用标准 `fetch` 调 HTTP API，禁止引入重型邮件 SDK |
| 认证 | JWT access token + refresh token | Hono 路由守卫使用 `hono/jwt` 或自定义 JWT middleware |

## 3. 部署口径与合规说明

面向中国大陆用户时，建议优先使用境内数据库、境内对象存储和境内部署节点。个人信息出境、跨境调用、境外云服务使用等问题需要按业务规模、数据类型和法务要求单独评估。

推荐部署分支：

| 场景 | 运行时 | 数据库 | 对象存储 | 说明 |
| --- | --- | --- | --- | --- |
| 中国大陆生产环境 | 阿里云 ECS / FC、腾讯云云函数、Node.js / Bun | 阿里云 RDS PostgreSQL / 腾讯云 PostgreSQL | 七牛云 / 阿里 OSS | 合规优先，网络访问稳定 |
| 海外或纯技术验证 | Cloudflare Workers / Node.js | Supabase 托管 PostgreSQL | 七牛云 / R2 / S3 兼容服务 | 仍需通过 Drizzle 隔离数据库 |
| 未来自建服务器 | Node.js / Bun + PM2 + Nginx | Docker PostgreSQL / 自建 PostgreSQL | 保持七牛云或 OSS | 只替换部署入口和 `DATABASE_URL` |

注意：

- Supabase 官方托管可作为 PostgreSQL 技术参考，但中国大陆生产环境是否可用需单独做合规判断。
- 即使使用 Supabase PostgreSQL，也只能通过 Drizzle 访问数据库，不能在业务层直接使用 Supabase DB Client。
- 如果后端部署在 Cloudflare Workers，需要确认数据库连接方式、连接池和跨境链路是否满足生产要求。

## 4. 总体架构

```text
Expo / React Native App
  |
  | HTTPS JSON / SSE / Multipart
  v
Hono API
  |-- Auth: JWT、邮箱验证码、用户资料
  |-- Chat: 会话、消息、AI 流式网关
  |-- Upload: 七牛云上传凭证、文件记录
  |-- Audio: 语音转文字代理
  |-- Admin/Future: 题库、批改、统计
  |
  | Drizzle ORM
  v
PostgreSQL

Object Storage: 七牛云 Kodo，前端直传
Email API: 阿里云邮件推送 / Resend / Brevo，通过 fetch 调用
LLM API: OpenAI-compatible / Anthropic / DeepSeek / 自定义模型网关
```

## 5. 当前前端真实数据结构

后端接口需要兼容当前前端已有概念。

### 5.1 会话结构

```typescript
interface ChatSession {
  id: string;
  title: string;
  messages: Message[];
  createdAt: number;
}
```

### 5.2 消息结构

```typescript
interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  thinking?: string;
  imagesBase64?: string[];
  imagesUri?: string[];
  createdAt: number;
}
```

后端化后的调整建议：

- 数据库不要保存 `imagesBase64`，图片和文档先上传对象存储，只保存文件记录和 URL。
- `createdAt` 建议后端返回 ISO 8601 字符串，前端可自行转换展示。
- `thinking` 只给 assistant 消息使用，用于保存推理模型的思考内容。
- 建议增加 `status` 字段：`streaming`、`completed`、`aborted`、`error`。

### 5.3 模型设置结构

```typescript
interface SettingState {
  provider: "openai" | "anthropic" | "deepseek" | "custom";
  baseUrl: string;
  apiKey: string;
  model: string;
  systemPrompt: string;
  temperature: number;
  maxTokens: number;
  language: "en" | "zh";
}
```

后端化后的调整建议：

- 平台级 `apiKey` 放到后端环境变量，不下发给前端。
- 如果产品需要用户自带 Key，必须明确告知用户，并在后端加密保存；第一阶段可以先不做。
- `provider`、`model`、`systemPrompt`、`temperature`、`maxTokens` 可以保留为用户设置或单次请求参数。

### 5.4 当前网络请求

| 功能 | 当前前端行为 | 后端化后建议 |
| --- | --- | --- |
| 聊天生成 | 直接请求 LLM `/chat/completions` 或 Anthropic `/messages` | 改为请求后端 `/api/chat/stream` |
| 语音转文字 | 直接请求 `/audio/transcriptions` | 改为请求后端 `/api/audio/transcriptions` |
| 测试连接 | 前端直接测试 LLM API | 改为 `/api/ai/test-connection` |
| 图片输入 | 前端把图片转 base64 送给模型 | 改为前端直传七牛，消息只带附件 URL / fileId |
| 文档输入 | 前端读取小于 1MB 的文本内容拼进 prompt | 第一阶段可继续传文本内容，后续再做服务端解析 |

## 6. API 通用规范

### 6.1 Base URL 与鉴权

- API 前缀统一为 `/api`。
- 除登录、注册、发送验证码、刷新 token 外，其他接口默认需要鉴权。
- 鉴权 Header：

```http
Authorization: Bearer <accessToken>
```

### 6.2 响应格式

成功：

```json
{
  "data": {}
}
```

失败：

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "请求参数错误",
    "details": {},
    "requestId": "req_xxx"
  }
}
```

### 6.3 分页

列表接口统一使用 cursor 分页：

```text
GET /api/sessions?cursor=xxx&limit=20
```

响应：

```json
{
  "data": {
    "items": [],
    "nextCursor": null
  }
}
```

### 6.4 流式响应

AI 生成接口使用 SSE：

```http
Content-Type: text/event-stream
Cache-Control: no-cache
```

事件格式：

```text
event: content_delta
data: {"messageId":"msg_xxx","delta":"你好"}
```

前端关闭连接或中止请求时，后端应尽量取消上游 LLM 请求，并保存已生成的部分内容为 `aborted` 或 `completed` 状态。

## 7. 第一阶段接口清单

优先级说明：

- P0：当前项目接后端必须要有。
- P1：上线体验更完整，但可在 P0 后补。
- P2：未来题库、批改等扩展。

### 7.1 Auth 用户与邮箱验证码

#### P0 `POST /api/auth/send-code`

发送邮箱验证码。

请求：

```json
{
  "email": "user@example.com",
  "scene": "register"
}
```

字段约束：

- `scene`: `register`、`login`、`reset_password`。
- 验证码建议 6 位数字，10 分钟过期。
- 同邮箱需要限流，例如 60 秒内不可重复发送。

响应：

```json
{
  "data": {
    "sent": true,
    "expiresIn": 600,
    "cooldownSeconds": 60
  }
}
```

#### P0 `POST /api/auth/register`

邮箱验证码注册。

请求：

```json
{
  "email": "user@example.com",
  "code": "123456",
  "password": "optional-password",
  "nickname": "可选昵称"
}
```

说明：

- 如果产品第一阶段只做邮箱验证码登录，可以不要求 `password`。
- 验证码入库时必须保存 hash，不保存明文。

响应：

```json
{
  "data": {
    "user": {
      "id": "usr_xxx",
      "email": "user@example.com",
      "nickname": "可选昵称"
    },
    "accessToken": "jwt_access_token",
    "refreshToken": "refresh_token"
  }
}
```

#### P0 `POST /api/auth/login/email-code`

邮箱验证码登录。

请求：

```json
{
  "email": "user@example.com",
  "code": "123456"
}
```

响应同注册接口。

#### P1 `POST /api/auth/login/password`

邮箱密码登录。如果第一阶段不做密码，可暂缓。

请求：

```json
{
  "email": "user@example.com",
  "password": "password"
}
```

#### P0 `POST /api/auth/refresh`

刷新 access token。

请求：

```json
{
  "refreshToken": "refresh_token"
}
```

响应：

```json
{
  "data": {
    "accessToken": "new_jwt_access_token",
    "refreshToken": "new_refresh_token"
  }
}
```

#### P0 `POST /api/auth/logout`

登出并吊销当前 refresh token。

请求：

```json
{
  "refreshToken": "refresh_token"
}
```

#### P0 `GET /api/me`

获取当前用户资料。

响应：

```json
{
  "data": {
    "id": "usr_xxx",
    "email": "user@example.com",
    "nickname": "昵称",
    "avatarUrl": null,
    "createdAt": "2026-06-09T00:00:00.000Z"
  }
}
```

#### P1 `PATCH /api/me`

更新昵称、头像等基础资料。

### 7.2 User Settings 用户设置

#### P1 `GET /api/me/settings`

获取用户默认模型和语言设置。

响应：

```json
{
  "data": {
    "language": "zh",
    "defaultProvider": "custom",
    "defaultModel": "mimo-v2.5",
    "systemPrompt": "",
    "temperature": 0.7,
    "maxTokens": 131072
  }
}
```

#### P1 `PATCH /api/me/settings`

保存用户默认模型和语言设置。

请求：

```json
{
  "language": "zh",
  "defaultProvider": "custom",
  "defaultModel": "mimo-v2.5",
  "systemPrompt": "",
  "temperature": 0.7,
  "maxTokens": 131072
}
```

注意：第一阶段不建议保存用户的原始 LLM API Key。

### 7.3 Sessions 会话

#### P0 `GET /api/sessions`

获取当前用户会话列表，支持搜索标题和消息内容。

Query：

```text
keyword?: string
cursor?: string
limit?: number
```

响应：

```json
{
  "data": {
    "items": [
      {
        "id": "ses_xxx",
        "title": "New Chat",
        "createdAt": "2026-06-09T00:00:00.000Z",
        "updatedAt": "2026-06-09T00:00:00.000Z",
        "lastMessagePreview": "你好",
        "messageCount": 2
      }
    ],
    "nextCursor": null
  }
}
```

#### P0 `POST /api/sessions`

创建会话。

请求：

```json
{
  "title": "New Chat",
  "systemPrompt": ""
}
```

响应：

```json
{
  "data": {
    "id": "ses_xxx",
    "title": "New Chat",
    "systemPrompt": "",
    "createdAt": "2026-06-09T00:00:00.000Z",
    "updatedAt": "2026-06-09T00:00:00.000Z"
  }
}
```

#### P0 `GET /api/sessions/:sessionId`

获取单个会话详情。

#### P0 `PATCH /api/sessions/:sessionId`

重命名会话或更新会话级系统提示词。

请求：

```json
{
  "title": "新的会话名",
  "systemPrompt": "可选"
}
```

#### P0 `DELETE /api/sessions/:sessionId`

删除单个会话。建议软删除。

#### P0 `DELETE /api/sessions`

清空当前用户所有会话。建议软删除。

### 7.4 Messages 消息

#### P0 `GET /api/sessions/:sessionId/messages`

获取会话消息列表。

Query：

```text
cursor?: string
limit?: number
```

响应：

```json
{
  "data": {
    "items": [
      {
        "id": "msg_xxx",
        "sessionId": "ses_xxx",
        "role": "user",
        "content": "你好",
        "thinking": null,
        "status": "completed",
        "attachments": [],
        "createdAt": "2026-06-09T00:00:00.000Z",
        "updatedAt": "2026-06-09T00:00:00.000Z"
      }
    ],
    "nextCursor": null
  }
}
```

#### P0 `POST /api/chat/stream`

发送用户消息并流式生成 assistant 回复。这个接口是当前前端 `streamChat` 的后端化替代。

请求 Header：

```http
Accept: text/event-stream
Authorization: Bearer <accessToken>
```

请求 Body：

```json
{
  "sessionId": "ses_xxx",
  "clientMessageId": "local_msg_123",
  "message": {
    "content": "解释这张图",
    "attachments": [
      {
        "fileId": "file_xxx",
        "url": "https://cdn.example.com/chat/usr_xxx/xxx.jpg",
        "mimeType": "image/jpeg",
        "name": "photo.jpg"
      }
    ],
    "documents": [
      {
        "name": "notes.md",
        "content": "小于 1MB 的文本内容"
      }
    ]
  },
  "options": {
    "provider": "custom",
    "model": "mimo-v2.5",
    "systemPrompt": "",
    "temperature": 0.7,
    "maxTokens": 131072
  }
}
```

SSE 事件：

```text
event: session
data: {"session":{"id":"ses_xxx","title":"New Chat"}}

event: user_message
data: {"message":{"id":"msg_user_xxx","role":"user","content":"解释这张图"}}

event: assistant_message
data: {"message":{"id":"msg_assistant_xxx","role":"assistant","content":"","status":"streaming"}}

event: thinking_delta
data: {"messageId":"msg_assistant_xxx","delta":"推理内容"}

event: content_delta
data: {"messageId":"msg_assistant_xxx","delta":"回复内容"}

event: done
data: {"messageId":"msg_assistant_xxx","status":"completed","usage":{"promptTokens":0,"completionTokens":0}}
```

错误事件：

```text
event: error
data: {"code":"LLM_UPSTREAM_ERROR","message":"模型服务暂不可用"}
```

实现要求：

- 后端负责创建 user message 和 assistant message，并在流结束后持久化完整内容。
- 需要兼容 OpenAI-compatible SSE、Anthropic 官方 SSE、DeepSeek reasoning 字段。
- 需要支持客户端中止请求。
- 如果 `sessionId` 为空，后端可自动创建新会话并通过 `session` 事件返回。
- 图片附件优先传 URL；只有模型供应商不支持 URL 时，后端再决定是否拉取并转 base64。

#### P0 `PATCH /api/messages/:messageId`

编辑用户消息。当前前端编辑用户消息后，会截断该消息之后的上下文并重新生成。

请求：

```json
{
  "content": "编辑后的内容",
  "truncateAfter": true
}
```

响应：

```json
{
  "data": {
    "message": {
      "id": "msg_xxx",
      "content": "编辑后的内容"
    },
    "deletedAfterCount": 3
  }
}
```

#### P0 `DELETE /api/messages/:messageId`

删除单条消息。建议软删除。

#### P1 `POST /api/messages/:messageId/regenerate`

重新生成指定 assistant 消息。也可以复用 `POST /api/chat/stream`，通过 `mode: "regenerate"` 实现。

请求：

```json
{
  "options": {
    "provider": "custom",
    "model": "mimo-v2.5",
    "temperature": 0.7,
    "maxTokens": 131072
  }
}
```

响应为 SSE，事件格式同 `/api/chat/stream`。

### 7.5 Upload 文件上传

#### P0 `POST /api/upload/token`

生成七牛云上传凭证。前端拿 token 后直传七牛云，后端不接收大文件。

请求：

```json
{
  "filename": "photo.jpg",
  "mimeType": "image/jpeg",
  "size": 523421,
  "purpose": "chat_image"
}
```

字段约束：

- `purpose`: `chat_image`、`chat_document`、`avatar`。
- 后端需要校验文件大小和 MIME 类型。
- 上传 token 建议 10 分钟过期。

响应：

```json
{
  "data": {
    "uploadToken": "qiniu_upload_token",
    "key": "chat/usr_xxx/2026/06/09/file_xxx.jpg",
    "uploadUrl": "https://up.qiniup.com",
    "bucket": "bucket-name",
    "domain": "https://cdn.example.com",
    "fileUrl": "https://cdn.example.com/chat/usr_xxx/2026/06/09/file_xxx.jpg",
    "expiresAt": "2026-06-09T00:10:00.000Z"
  }
}
```

#### P0 `POST /api/files/confirm`

前端直传成功后，通知后端落库文件记录。

请求：

```json
{
  "key": "chat/usr_xxx/2026/06/09/file_xxx.jpg",
  "url": "https://cdn.example.com/chat/usr_xxx/2026/06/09/file_xxx.jpg",
  "filename": "photo.jpg",
  "mimeType": "image/jpeg",
  "size": 523421,
  "purpose": "chat_image",
  "hash": "可选"
}
```

响应：

```json
{
  "data": {
    "id": "file_xxx",
    "url": "https://cdn.example.com/chat/usr_xxx/2026/06/09/file_xxx.jpg",
    "mimeType": "image/jpeg",
    "size": 523421
  }
}
```

#### P1 `DELETE /api/files/:fileId`

删除文件记录并异步删除对象存储文件。

### 7.6 Audio 语音转文字

#### P0 `POST /api/audio/transcriptions`

语音转文字。这个接口是当前前端 `transcribeAudio` 的后端化替代。

请求：

```http
Content-Type: multipart/form-data
Authorization: Bearer <accessToken>
```

表单字段：

```text
file: audio/m4a | audio/mp4 | audio/wav
model?: whisper-1
language?: zh
```

响应：

```json
{
  "data": {
    "text": "识别后的文字"
  }
}
```

要求：

- 后端读取环境变量中的 STT API Key。
- 限制音频大小和时长。
- DeepSeek 不支持 STT 时，后端应返回明确错误，不让前端猜。

### 7.7 AI 配置与连通性

#### P1 `GET /api/ai/providers`

返回后端支持的供应商、模型预设和能力。

响应：

```json
{
  "data": {
    "providers": [
      {
        "key": "openai",
        "label": "OpenAI",
        "models": ["gpt-4o", "gpt-4o-mini"],
        "capabilities": ["chat", "vision", "stt"]
      },
      {
        "key": "deepseek",
        "label": "DeepSeek",
        "models": ["deepseek-chat", "deepseek-reasoner"],
        "capabilities": ["chat", "reasoning"]
      }
    ]
  }
}
```

#### P1 `POST /api/ai/test-connection`

由后端测试模型服务连通性。

请求：

```json
{
  "provider": "custom",
  "model": "mimo-v2.5"
}
```

响应：

```json
{
  "data": {
    "success": true,
    "latencyMs": 320
  }
}
```

## 8. 数据库表建议

### 8.1 `users`

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | text / uuid | 主键 |
| `email` | text unique | 邮箱 |
| `password_hash` | text nullable | 密码登录可用 |
| `nickname` | text nullable | 昵称 |
| `avatar_file_id` | text nullable | 头像文件 |
| `created_at` | timestamp | 创建时间 |
| `updated_at` | timestamp | 更新时间 |
| `deleted_at` | timestamp nullable | 软删除 |

### 8.2 `verification_codes`

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | text / uuid | 主键 |
| `email` | text | 邮箱 |
| `scene` | text | register / login / reset_password |
| `code_hash` | text | 验证码 hash |
| `expires_at` | timestamp | 过期时间 |
| `consumed_at` | timestamp nullable | 使用时间 |
| `attempts` | integer | 尝试次数 |
| `created_ip` | text nullable | 风控 |
| `created_at` | timestamp | 创建时间 |

### 8.3 `refresh_tokens`

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | text / uuid | 主键 |
| `user_id` | text / uuid | 用户 ID |
| `token_hash` | text | refresh token hash |
| `device_info` | jsonb | 设备信息 |
| `expires_at` | timestamp | 过期时间 |
| `revoked_at` | timestamp nullable | 吊销时间 |
| `created_at` | timestamp | 创建时间 |

### 8.4 `user_settings`

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `user_id` | text / uuid | 用户 ID |
| `language` | text | zh / en |
| `default_provider` | text | 默认供应商 |
| `default_model` | text | 默认模型 |
| `system_prompt` | text | 默认系统提示词 |
| `temperature` | numeric | 温度 |
| `max_tokens` | integer | 最大 token |
| `encrypted_api_key` | text nullable | 仅 BYOK 场景需要 |
| `updated_at` | timestamp | 更新时间 |

### 8.5 `chat_sessions`

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | text / uuid | 主键 |
| `user_id` | text / uuid | 用户 ID |
| `title` | text | 会话标题 |
| `system_prompt` | text nullable | 会话级系统提示词 |
| `created_at` | timestamp | 创建时间 |
| `updated_at` | timestamp | 更新时间 |
| `deleted_at` | timestamp nullable | 软删除 |

### 8.6 `messages`

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | text / uuid | 主键 |
| `session_id` | text / uuid | 会话 ID |
| `user_id` | text / uuid | 用户 ID，便于鉴权 |
| `role` | text | user / assistant / system |
| `content` | text | 消息正文 |
| `thinking` | text nullable | 推理内容 |
| `status` | text | streaming / completed / aborted / error |
| `provider` | text nullable | 生成供应商 |
| `model` | text nullable | 生成模型 |
| `token_usage` | jsonb nullable | token 消耗 |
| `error` | jsonb nullable | 错误信息 |
| `created_at` | timestamp | 创建时间 |
| `updated_at` | timestamp | 更新时间 |
| `deleted_at` | timestamp nullable | 软删除 |

### 8.7 `files`

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | text / uuid | 主键 |
| `user_id` | text / uuid | 用户 ID |
| `storage_provider` | text | qiniu / oss |
| `bucket` | text | 存储桶 |
| `key` | text unique | 对象 key |
| `url` | text | CDN URL |
| `filename` | text | 原文件名 |
| `mime_type` | text | MIME 类型 |
| `size` | integer | 字节数 |
| `purpose` | text | chat_image / chat_document / avatar |
| `metadata` | jsonb nullable | 图片宽高、hash 等 |
| `created_at` | timestamp | 创建时间 |
| `deleted_at` | timestamp nullable | 软删除 |

### 8.8 `message_attachments`

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | text / uuid | 主键 |
| `message_id` | text / uuid | 消息 ID |
| `file_id` | text / uuid nullable | 文件 ID |
| `name` | text | 附件名 |
| `mime_type` | text | MIME 类型 |
| `url` | text nullable | 文件 URL |
| `content` | text nullable | 小文本文件可直接保存提取内容 |
| `sort_order` | integer | 排序 |

### 8.9 `ai_request_logs`

可选，用于排查问题和成本统计。不要记录敏感 prompt 明文，或至少提供脱敏策略。

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | text / uuid | 主键 |
| `user_id` | text / uuid | 用户 ID |
| `session_id` | text / uuid nullable | 会话 ID |
| `message_id` | text / uuid nullable | assistant 消息 ID |
| `provider` | text | 供应商 |
| `model` | text | 模型 |
| `status` | text | success / error / aborted |
| `latency_ms` | integer | 耗时 |
| `token_usage` | jsonb nullable | token 消耗 |
| `error` | jsonb nullable | 错误 |
| `created_at` | timestamp | 创建时间 |

## 9. 核心业务流

### 9.1 邮箱验证码注册 / 登录

1. 前端请求 `POST /api/auth/send-code`。
2. 后端生成验证码，保存 `code_hash`、邮箱、场景、过期时间。
3. 后端使用 `fetch` 调阿里云邮件推送、Resend 或 Brevo。
4. 用户输入验证码，前端请求注册或登录接口。
5. 后端验证验证码和尝试次数，成功后签发 access token 和 refresh token。

### 9.2 聊天流式生成

1. 前端确保已登录并拿到 access token。
2. 如果有图片，先走 `/api/upload/token` 和七牛云直传，再 `/api/files/confirm`。
3. 前端请求 `POST /api/chat/stream`，带上 `sessionId`、消息正文、附件和模型参数。
4. 后端创建用户消息和空 assistant 消息。
5. 后端调用 LLM，上游 token 流转为统一 SSE 事件。
6. 前端收到 `thinking_delta` 更新思考内容，收到 `content_delta` 更新正文。
7. 流结束后，后端保存最终 assistant 消息和 token 用量。

### 9.3 七牛云前端直传

1. 前端选择图片或文件。
2. 前端请求 `/api/upload/token`。
3. 后端用七牛云 AccessKey / SecretKey / Bucket 生成 10 分钟有效的 upload token。
4. 前端把 token 和文件通过 FormData 直传七牛云上传域名。
5. 上传成功后，前端请求 `/api/files/confirm`。
6. 后端落库文件记录，后续消息只引用 `fileId` 或 URL。

### 9.4 语音转文字

1. 前端录音后，将音频文件用 multipart/form-data 提交到 `/api/audio/transcriptions`。
2. 后端校验文件大小、类型和用户权限。
3. 后端调用 OpenAI-compatible STT 服务或指定语音识别服务。
4. 后端返回识别文本，前端填入输入框。

## 10. 后端工程目录建议

```text
server/
├── src/
│   ├── index.ts              # Hono 主入口，组装路由并导出 AppType
│   ├── config.ts             # 环境变量解析
│   ├── db/
│   │   ├── index.ts          # Drizzle 实例
│   │   └── schema.ts         # 数据库表结构
│   ├── middlewares/
│   │   ├── auth.ts           # JWT 鉴权
│   │   ├── error.ts          # 全局错误处理
│   │   └── rateLimit.ts      # 限流
│   ├── routes/
│   │   ├── auth.ts
│   │   ├── me.ts
│   │   ├── sessions.ts
│   │   ├── messages.ts
│   │   ├── chat.ts
│   │   ├── upload.ts
│   │   ├── files.ts
│   │   └── audio.ts
│   ├── services/
│   │   ├── email.ts          # fetch 调邮件服务
│   │   ├── llm.ts            # LLM 网关适配
│   │   ├── storage.ts        # 七牛云 token 生成
│   │   └── token.ts          # JWT / refresh token
│   └── validators/
│       ├── auth.ts
│       ├── chat.ts
│       └── upload.ts
├── drizzle/
│   └── migrations...
├── drizzle.config.ts
├── wrangler.toml            # 如果部署 Cloudflare Workers
├── package.json
└── tsconfig.json
```

入口示例：

```typescript
const app = new Hono();

const routes = app
  .route("/api/auth", authRoutes)
  .route("/api/me", meRoutes)
  .route("/api/sessions", sessionRoutes)
  .route("/api/messages", messageRoutes)
  .route("/api/chat", chatRoutes)
  .route("/api/upload", uploadRoutes)
  .route("/api/files", fileRoutes)
  .route("/api/audio", audioRoutes);

export default app;
export type AppType = typeof routes;
```

## 11. 环境变量建议

```text
NODE_ENV=production
DATABASE_URL=postgres://...

JWT_SECRET=...
JWT_ACCESS_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=30d

CORS_ORIGIN=https://your-app-domain.example.com

QINIU_ACCESS_KEY=...
QINIU_SECRET_KEY=...
QINIU_BUCKET=...
QINIU_DOMAIN=https://cdn.example.com
QINIU_UPLOAD_URL=https://up.qiniup.com

EMAIL_PROVIDER=aliyun_dm
ALIYUN_DM_ACCESS_KEY_ID=...
ALIYUN_DM_ACCESS_KEY_SECRET=...
RESEND_API_KEY=...

LLM_DEFAULT_PROVIDER=custom
LLM_DEFAULT_BASE_URL=https://token-plan-cn.xiaomimimo.com/v1
LLM_DEFAULT_API_KEY=...
OPENAI_API_KEY=...
ANTHROPIC_API_KEY=...
DEEPSEEK_API_KEY=...

STT_PROVIDER=openai_compatible
STT_BASE_URL=https://api.openai.com/v1
STT_API_KEY=...
```

## 12. 安全与工程红线

- 禁止在业务代码中直接使用 `@supabase/supabase-js` 做数据库 CRUD。
- 禁止把平台级 LLM Key、邮件 Key、七牛 SecretKey 下发到客户端。
- 禁止把图片 base64 长期保存到数据库。
- 所有请求体、query、param 都必须经过 Zod 校验。
- Auth、发送验证码、AI 流式接口必须限流。
- Refresh token 只保存 hash，登出时可吊销。
- 邮箱验证码只保存 hash，限制错误尝试次数。
- Drizzle migration 文件必须进入版本控制。
- 全局错误响应必须统一，不直接把上游完整错误和密钥信息返回给前端。
- 日志中不要记录完整 Authorization、API Key、refresh token、邮箱验证码。

## 13. 迁移与替换策略

| 迁移项 | 当前推荐 | 未来替换 | 代码影响 |
| --- | --- | --- | --- |
| 运行时 | Hono on ECS/FC/Workers | Node.js / Bun 自建服务 | 只换入口适配器 |
| 数据库 | 托管 PostgreSQL | 自建 PostgreSQL | 修改 `DATABASE_URL`，Drizzle 业务代码不变 |
| 对象存储 | 七牛云 | 阿里 OSS / S3 兼容存储 | 替换 `storage.ts` 实现 |
| 邮件 | 阿里云邮件推送 / Resend | 其他 HTTP 邮件服务 | 替换 `email.ts` 实现 |
| LLM | OpenAI-compatible 网关 | 多供应商网关 | 增加 `llm.ts` provider 适配 |

## 14. 第一阶段交付验收

后端交付时至少需要提供：

- Hono 服务可本地启动。
- `export type AppType = typeof routes` 已导出。
- Drizzle schema 和 migration 已提交。
- `.env.example` 完整列出必需变量。
- P0 接口全部可调用。
- `/api/chat/stream` 能返回 SSE，并支持 `content_delta`、`thinking_delta`、`done`、`error`。
- 七牛上传凭证可用，前端可完成直传和文件确认。
- 邮箱验证码可发送、校验、过期、限流。
- 鉴权 middleware 覆盖所有私有接口。
- 提供最小接口测试脚本或 Postman / Insomnia 集合。

## 15. 未来 P2 接口方向

题库与 AI 批改暂不进入第一阶段，但数据库和接口命名可提前留出空间：

- `GET /api/question-banks`
- `GET /api/questions`
- `POST /api/practice-sessions`
- `POST /api/essay-reviews`
- `GET /api/essay-reviews/:id`
- `POST /api/rubrics`

这些接口等产品需求明确后再单独出详细协议，避免第一阶段过度设计。

## 16. 参考文档

- Hono RPC：`https://hono.dev/docs/guides/rpc`
- Hono Validation：`https://hono.dev/docs/guides/validation`
- Drizzle Kit Generate：`https://orm.drizzle.team/docs/drizzle-kit-generate`
- Drizzle Kit Migrate：`https://orm.drizzle.team/docs/drizzle-kit-migrate`
- 七牛云 Node.js SDK 与上传凭证：`https://developer.qiniu.com/kodo/sdk/nodejs`
- 国家网信办《促进和规范数据跨境流动规定》：`https://www.cac.gov.cn/2024-03/22/c_1712776612187994.htm`
- 个人信息保护法相关出境规则以官方法律文本和法务意见为准。
