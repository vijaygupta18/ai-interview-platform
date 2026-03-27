export interface TTSProvider {
  name: string;
  synthesize(text: string): Promise<Buffer>;  // Returns audio buffer (mp3/wav)
  contentType: string;  // audio/mpeg, audio/wav, etc.
}

export interface STTConfig {
  provider: string;
  language: string;
  wsUrl: string;  // WebSocket URL for the provider
  headers: Record<string, string>;  // Auth headers
  params: Record<string, string>;  // Query params
}
