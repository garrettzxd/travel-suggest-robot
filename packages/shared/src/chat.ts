export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  id: string;
  createdAt: number;
}

export interface ChatRequest {
  message: string;
  history: ChatMessage[];
}

export type ToolName = 'getWeather' | 'getAttractions';

export type StreamEvent =
  | { type: 'token'; delta: string }
  | { type: 'tool_start'; name: ToolName; args: unknown }
  | { type: 'tool_end'; name: ToolName; result: unknown }
  | { type: 'final'; content: string }
  | { type: 'error'; message: string }
  | { type: 'done' };
