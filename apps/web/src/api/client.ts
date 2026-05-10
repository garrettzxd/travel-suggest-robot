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

async function readJson<T>(res: Response): Promise<T> {
  const text = await res.text();
  if (!res.ok) {
    throw new Error(text || `Request failed (${res.status})`);
  }
  return (text ? JSON.parse(text) : {}) as T;
}

async function postJson<TResponse, TBody extends object>(
  url: string,
  body: TBody,
): Promise<TResponse> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return readJson<TResponse>(res);
}

export async function getMe(): Promise<AuthResponse> {
  const res = await fetch('/api/auth/me');
  return readJson<AuthResponse>(res);
}

export async function login(body: LoginRequest): Promise<AuthResponse> {
  return postJson<AuthResponse, LoginRequest>('/api/auth/login', body);
}

export async function register(body: RegisterRequest): Promise<AuthResponse> {
  return postJson<AuthResponse, RegisterRequest>('/api/auth/register', body);
}

export async function logout(): Promise<void> {
  const res = await fetch('/api/auth/logout', { method: 'POST' });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(text || `Logout failed (${res.status})`);
  }
}

export async function listConversations(): Promise<ConversationListResponse> {
  const res = await fetch('/api/conversations');
  return readJson<ConversationListResponse>(res);
}

export async function createConversation(
  body: CreateConversationRequest = {},
): Promise<CreateConversationResponse> {
  return postJson<CreateConversationResponse, CreateConversationRequest>(
    '/api/conversations',
    body,
  );
}

export async function getConversation(id: string): Promise<ConversationDetailResponse> {
  const res = await fetch(`/api/conversations/${encodeURIComponent(id)}`);
  return readJson<ConversationDetailResponse>(res);
}

// 发起聊天请求并返回 SSE 响应体，调用方负责逐帧读取流内容。
export async function postChat(
  body: ChatRequest,
  signal?: AbortSignal,
): Promise<ReadableStream<Uint8Array>> {
  const res = await fetch('/api/chat', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'text/event-stream',
    },
    body: JSON.stringify(body),
    credentials: 'include',
    signal,
  });

  if (!res.ok || !res.body) {
    const text = await res.text().catch(() => '');
    throw new Error(`Chat request failed (${res.status}): ${text}`);
  }

  return res.body;
}
