import type {
  AuthResponse,
  ChatRequest,
  ConversationDetailResponse,
  ConversationListResponse,
  CreateConversationRequest,
  CreateConversationResponse,
  LoginRequest,
  RegisterRequest,
} from '@travel/shared';
import { ApiError, appPath, postJson, readApiData } from './http';

/** GET /api/auth/me，保留旧调用方需要的 AuthResponse 形态。 */
export async function getMe(): Promise<AuthResponse> {
  const res = await fetch(appPath('/api/auth/me'), { credentials: 'include' });
  return readApiData<AuthResponse>(res);
}

/** POST /api/auth/login，保留旧调用方需要的 AuthResponse 形态。 */
export async function login(body: LoginRequest): Promise<AuthResponse> {
  return postJson<AuthResponse, LoginRequest>('/api/auth/login', body);
}

/** POST /api/auth/register，保留旧调用方需要的 AuthResponse 形态。 */
export async function register(body: RegisterRequest): Promise<AuthResponse> {
  return postJson<AuthResponse, RegisterRequest>('/api/auth/register', body);
}

/** POST /api/auth/logout。 */
export async function logout(): Promise<void> {
  const res = await fetch(appPath('/api/auth/logout'), { method: 'POST', credentials: 'include' });
  await readApiData<Record<string, never>>(res);
}

/** GET /api/conversations，返回当前用户最近会话。 */
export async function listConversations(): Promise<ConversationListResponse> {
  const res = await fetch(appPath('/api/conversations'), { credentials: 'include' });
  return readApiData<ConversationListResponse>(res);
}

/** POST /api/conversations，显式创建一个空会话。 */
export async function createConversation(
  body: CreateConversationRequest = {},
): Promise<CreateConversationResponse> {
  return postJson<CreateConversationResponse, CreateConversationRequest>(
    '/api/conversations',
    body,
  );
}

/** GET /api/conversations/:id，读取历史消息和卡片制品。 */
export async function getConversation(id: string): Promise<ConversationDetailResponse> {
  const res = await fetch(appPath(`/api/conversations/${encodeURIComponent(id)}`), {
    credentials: 'include',
  });
  return readApiData<ConversationDetailResponse>(res);
}

/** 发起聊天请求并返回 SSE 响应体，调用方负责逐帧读取流内容。 */
export async function postChat(
  body: ChatRequest,
  signal?: AbortSignal,
): Promise<ReadableStream<Uint8Array>> {
  const res = await fetch(appPath('/api/chat'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'text/event-stream',
    },
    body: JSON.stringify(body),
    credentials: 'include',
    signal,
  });

  if (!res.ok) {
    await readApiData<unknown>(res);
  }

  if (!res.body) {
    throw new ApiError(`Chat request failed (${res.status}): empty response body`, res.status, res.status, {});
  }

  return res.body;
}
