import path from 'path';
import os from 'os';
import fs from 'fs/promises';
import { randomUUID } from 'crypto';

export interface ConversationMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface Conversation {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messages: ConversationMessage[];
}

function getStoreDir(): string {
  return path.join(os.homedir(), '.codeharness', 'conversations');
}

function getFilePath(id: string): string {
  return path.join(getStoreDir(), `${id}.json`);
}

async function ensureStoreDir(): Promise<void> {
  await fs.mkdir(getStoreDir(), { recursive: true });
}

export async function createConversation(title?: string): Promise<Conversation> {
  await ensureStoreDir();
  const now = new Date().toISOString();
  const conv: Conversation = {
    id: randomUUID().slice(0, 8),
    title: title ?? `Conversation ${now.slice(0, 10)}`,
    createdAt: now,
    updatedAt: now,
    messages: [],
  };
  await fs.writeFile(getFilePath(conv.id), JSON.stringify(conv, null, 2), 'utf-8');
  return conv;
}

export async function saveConversation(conv: Conversation): Promise<void> {
  await ensureStoreDir();
  conv.updatedAt = new Date().toISOString();
  await fs.writeFile(getFilePath(conv.id), JSON.stringify(conv, null, 2), 'utf-8');
}

export async function loadConversation(id: string): Promise<Conversation | null> {
  try {
    const content = await fs.readFile(getFilePath(id), 'utf-8');
    return JSON.parse(content) as Conversation;
  } catch {
    return null;
  }
}

export async function listConversations(): Promise<Conversation[]> {
  await ensureStoreDir();
  const files = await fs.readdir(getStoreDir());
  const conversations: Conversation[] = [];
  for (const file of files) {
    if (!file.endsWith('.json')) continue;
    try {
      const content = await fs.readFile(path.join(getStoreDir(), file), 'utf-8');
      const conv = JSON.parse(content) as Conversation;
      // Auto-generate title from first user message if no title
      if (!conv.title || conv.title.startsWith('Conversation ')) {
        const firstUser = conv.messages.find((m) => m.role === 'user');
        if (firstUser) {
          conv.title = firstUser.content.slice(0, 50);
        }
      }
      conversations.push(conv);
    } catch {
      // Skip corrupted files
    }
  }
  conversations.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  return conversations;
}

export async function deleteConversation(id: string): Promise<boolean> {
  try {
    await fs.unlink(getFilePath(id));
    return true;
  } catch {
    return false;
  }
}

export async function exportConversation(id: string, outputPath: string): Promise<boolean> {
  const conv = await loadConversation(id);
  if (!conv) return false;
  await fs.writeFile(outputPath, JSON.stringify(conv, null, 2), 'utf-8');
  return true;
}

export async function importConversation(filePath: string): Promise<Conversation | null> {
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    const data = JSON.parse(content) as Conversation;
    if (!data.id || !Array.isArray(data.messages)) {
      return null;
    }
    await ensureStoreDir();
    data.id = randomUUID().slice(0, 8);
    data.updatedAt = new Date().toISOString();
    await fs.writeFile(getFilePath(data.id), JSON.stringify(data, null, 2), 'utf-8');
    return data;
  } catch {
    return null;
  }
}

export async function renameConversation(id: string, title: string): Promise<boolean> {
  const conv = await loadConversation(id);
  if (!conv) return false;
  conv.title = title;
  await saveConversation(conv);
  return true;
}
