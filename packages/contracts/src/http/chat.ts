import { z } from 'zod';

export const ChatUserSearchItemSchema = z.object({
  id: z.string(), // userId
  displayName: z.string(),
  username: z.string().optional(),
  role: z.string(),
  characterId: z.string().nullable().optional(),
  isOnline: z.boolean().optional(),
});
export type ChatUserSearchItem = z.infer<typeof ChatUserSearchItemSchema>;

export const ChatConversationSchema = z.object({
  peerUserId: z.string(),
  displayName: z.string(),
  role: z.string(),
  isOnline: z.boolean(),
  lastMessage: z.string().nullable(),
  lastAt: z.string().nullable(),
  unreadCount: z.number().int(),
});
export type ChatConversation = z.infer<typeof ChatConversationSchema>;

export const ChatSearchUsersResponseSchema = z.array(ChatUserSearchItemSchema);
export const ChatConversationsResponseSchema = z.array(ChatConversationSchema);