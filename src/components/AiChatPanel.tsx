import { useMemo, useState } from 'react';
import { useAppStore } from '../store/store';
import type { AiAttachment, EditModelResponse, GenerateModelResponse } from '../types/ai';
import LoadingSpinner from './LoadingSpinner';
import { Send } from 'lucide-react';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  diagnostics?: string[];
  timestamp: Date;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

async function fileToAttachment(file: File): Promise<AiAttachment> {
  const buffer = await file.arrayBuffer();
  return {
    name: file.name,
    mimeType: file.type || 'application/octet-stream',
    base64Data: bytesToBase64(new Uint8Array(buffer)),
  };
}

export default function AiChatPanel() {
  const sourceCode = useAppStore((state) => state.sourceCode);
  const drawioXml = useAppStore((state) => state.drawioXml);
  const applyGeneratedModel = useAppStore((state) => state.applyGeneratedModel);

  const [provider, setProvider] = useState<'local' | 'openai' | 'anthropic' | 'google'>('local');
  const [model, setModel] = useState('gpt-4.1-mini');
  const [apiKey, setApiKey] = useState(() => {
    try { return sessionStorage.getItem('sysml_ai_key') || ''; } catch { return ''; }
  });
  const [prompt, setPrompt] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSend = useMemo(() => prompt.trim().length > 0 && !isLoading, [prompt, isLoading]);

  const handleApiKeyChange = (value: string) => {
    setApiKey(value);
    try { sessionStorage.setItem('sysml_ai_key', value); } catch {}
  };

  const handleSubmit = async () => {
    if (!canSend) return;
    setIsLoading(true);
    setError(null);

    const userMessage: ChatMessage = {
      role: 'user',
      content: prompt.trim(),
      timestamp: new Date(),
    };
    setMessages((prev) => [...prev, userMessage]);

    try {
      const attachments = await Promise.all(files.map((file) => fileToAttachment(file)));
      const isFirstGeneration = messages.length === 0;
      const endpoint = isFirstGeneration ? `${import.meta.env.VITE_API_BASE_URL || ''}/api/ai/generate-model` : `${import.meta.env.VITE_API_BASE_URL || ''}/api/ai/edit-model`;

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-ai-provider': provider,
          'x-ai-model': model,
          ...(apiKey.trim() ? { 'x-ai-key': apiKey.trim() } : {}),
        },
        body: JSON.stringify({
          provider,
          model,
          apiKey: apiKey.trim() || undefined,
          prompt: userMessage.content,
          sourceCode,
          drawioXml,
          attachments,
          conversation: [...messages, userMessage],
        }),
      });

      if (!response.ok) {
        throw new Error(`AI endpoint failed with status ${response.status}`);
      }

      if (isFirstGeneration) {
        const data = (await response.json()) as GenerateModelResponse;
        applyGeneratedModel({
          sysml: data.sysml,
          drawioXml: data.drawioXml,
          diagnostics: data.diagnostics,
        });

        setMessages((prev) => [
          ...prev,
          {
            role: 'assistant',
            content: 'Generated SysML and Draw.io model from your input.',
            diagnostics: data.diagnostics,
            timestamp: new Date(),
          },
        ]);
      } else {
        const data = (await response.json()) as EditModelResponse;
        applyGeneratedModel({
          sysml: data.sysml,
          drawioXml: data.drawioXml,
          diagnostics: data.diagnostics,
        });

        setMessages((prev) => [
          ...prev,
          {
            role: 'assistant',
            content: 'Applied AI model edits and synchronized SysML + Draw.io.',
            diagnostics: data.diagnostics,
            timestamp: new Date(),
          },
        ]);
      }

      setPrompt('');
      setFiles([]);
    } catch (submitError) {
      setError((submitError as Error).message);
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: `Request failed: ${(submitError as Error).message}`,
          timestamp: new Date(),
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="ai-chat-panel">
      <div className="ai-chat-controls">
        <select value={provider} onChange={(event) => setProvider(event.target.value as typeof provider)}>
          <option value="local">Local Heuristic</option>
          <option value="openai">OpenAI (BYOK)</option>
          <option value="anthropic">Anthropic (BYOK)</option>
          <option value="google">Google (BYOK)</option>
        </select>
        <input
          value={model}
          onChange={(event) => setModel(event.target.value)}
          placeholder="Model"
          className="ai-chat-model-input"
        />
      </div>

      <input
        value={apiKey}
        onChange={(event) => handleApiKeyChange(event.target.value)}
        type="password"
        placeholder="API Key (session-only, never stored permanently)"
        className="ai-chat-key-input"
      />

      <textarea
        value={prompt}
        onChange={(event) => setPrompt(event.target.value)}
        placeholder="Describe the system or request an edit. You can attach text, PDF, DOCX, and images."
        className="ai-chat-prompt"
      />

      <input
        type="file"
        multiple
        accept=".txt,.md,.pdf,.docx,image/*"
        onChange={(event) => setFiles(Array.from(event.target.files ?? []))}
      />

      {files.length > 0 && (
        <div className="ai-chat-files">Attachments: {files.map((file) => file.name).join(', ')}</div>
      )}

      <button className="toolbar-btn" onClick={handleSubmit} disabled={!canSend}>
        {isLoading ? <LoadingSpinner size={14} /> : <Send size={14} />}
        <span style={{ marginLeft: 4 }}>{isLoading ? 'Sending...' : 'Send'}</span>
      </button>

      {error && <div className="ai-chat-error">{error}</div>}

      <div className="ai-chat-history">
        {messages.map((message, index) => (
          <div key={`${message.role}-${index}`} className={`ai-chat-message ai-chat-${message.role}`}>
            <div className="ai-chat-role">
              {message.role === 'user' ? 'You' : 'AI'}
              <span className="ai-chat-timestamp">{message.timestamp.toLocaleTimeString()}</span>
            </div>
            <div>{message.content}</div>
            {message.diagnostics && message.diagnostics.length > 0 && (
              <ul>
                {message.diagnostics.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
