import { apiDelete, apiGet, apiPatch, apiPost, apiPut, apiUpload } from '@/src/lib/api';

export interface FeedAuthor {
  id: string;
  name: string;
  avatar: string | null;
  online?: boolean;
}

export interface FeedPost {
  id: string;
  kind: 'post' | 'story';
  mediaType: 'image' | 'video';
  mediaKey: string;
  caption: string;
  likeCount: number;
  likedByMe: boolean;
  commentCount: number;
  createdAt: string;
  expiresAt: string | null;
  author: FeedAuthor;
  mine: boolean;
  /** Solo en tus propias historias: quién las ha visto. */
  viewCount?: number;
  viewers?: FeedAuthor[];
}

export interface FeedComment {
  id: string;
  text: string;
  createdAt: string;
  author: FeedAuthor;
  mine: boolean;
}

export interface StoryGroup {
  author: FeedAuthor;
  items: FeedPost[];
}

export interface OwnProfile {
  id: string;
  name: string;
  avatar: string | null;
  bio: string;
  coach: FeedAuthor | null;
  athletes: FeedAuthor[];
}

export interface PublicProfile {
  id: string;
  name: string;
  username: string | null;
  avatar: string | null;
  bio: string;
  isSelf: boolean;
  isFriend: boolean;
  friendshipStatus: 'self' | 'accepted' | 'pending' | 'rejected' | 'none';
  postCount: number;
  friendCount: number;
  athleteCount: number;
  /** Escaparate: el servidor los deriva de amigos y alumnos, no siguen a nadie de verdad. */
  followerCount: number;
  followingCount: number;
  coachRequestStatus: 'none' | 'pending' | 'accepted' | 'rejected';
  /** El que mira es el entrenador de esta persona. */
  iAmTheirCoach?: boolean;
  routineName: string | null;
  coach: FeedAuthor | null;
  trainingMaxes: { id?: string; name: string; value: number; mode: string }[];
}

export interface ProfileTmHistory {
  tm: { id: string; name: string; value: number; mode: string };
  points: { dateISO: string; value: number }[];
}

export interface CoachRequest {
  id: string;
  createdAt: string;
  athlete: FeedAuthor;
}

export const MAX_UPLOAD_BYTES = 80 * 1024 * 1024;

export function fetchProfile(userId: string) {
  return apiGet<PublicProfile>(`/api/social/users/${userId}/profile`);
}

export function fetchProfileTmHistory(userId: string, tmId: string) {
  return apiGet<ProfileTmHistory>(`/api/social/users/${userId}/training-maxes/${tmId}/history`);
}

export function fetchFeed(before?: string | null) {
  return apiGet<{ posts: FeedPost[]; nextCursor: string | null }>(
    '/api/feed',
    before ? { before } : undefined
  );
}

export function fetchStories() {
  return apiGet<{ groups: StoryGroup[] }>('/api/feed/stories');
}

export function fetchUserPosts(userId: string) {
  return apiGet<{ posts: FeedPost[] }>(`/api/feed/users/${userId}/posts`);
}

export function publishMedia(file: File, opts: { kind: 'post' | 'story'; caption?: string }) {
  const form = new FormData();
  form.append('file', file);
  form.append('kind', opts.kind);
  if (opts.caption) form.append('caption', opts.caption);
  return apiUpload<FeedPost>('/api/feed/posts', form);
}

/** Avisar de que has visto una historia (el autor ve la lista de espectadores). */
export function markStoryViewed(postId: string) {
  return apiPost<{ ok: true }>(`/api/feed/posts/${postId}/view`, {});
}

export function toggleLike(postId: string) {
  return apiPost<{ likeCount: number; likedByMe: boolean }>(`/api/feed/posts/${postId}/like`, {});
}

export function fetchComments(postId: string) {
  return apiGet<{ comments: FeedComment[] }>(`/api/feed/posts/${postId}/comments`);
}

export function addComment(postId: string, text: string) {
  return apiPost<FeedComment>(`/api/feed/posts/${postId}/comments`, { text });
}

export function removeComment(commentId: string) {
  return apiDelete(`/api/feed/comments/${commentId}`);
}

export function removePost(postId: string) {
  return apiDelete(`/api/feed/posts/${postId}`);
}

export function fetchOwnProfile() {
  return apiGet<OwnProfile>('/api/social/me/profile');
}

export function saveBio(bio: string) {
  return apiPut<{ bio: string }>('/api/social/me/profile', { bio });
}

/** Pedir a un amigo que te entrene: queda pendiente hasta que él lo acepte. */
export function requestCoach(coachId: string) {
  return apiPost<{ status: 'pending' }>('/api/social/coach-requests', { coachId });
}

export function removeCoach() {
  return apiDelete('/api/social/me/coach');
}

export function fetchCoachRequests() {
  return apiGet<{ requests: CoachRequest[] }>('/api/social/coach-requests');
}

export function answerCoachRequest(id: string, decision: 'accept' | 'reject') {
  return apiPut<{ status: string }>(`/api/social/coach-requests/${id}/${decision}`, {});
}

export interface ChatGroupCard {
  id: string;
  name: string;
  createdBy?: string;
  members: FeedAuthor[];
  pending?: FeedAuthor[];
}

export interface ChatGroupInvite {
  id: string;
  groupId: string;
  groupName: string;
  from: FeedAuthor;
  createdAt: string;
}

export interface ChatThread {
  kind?: 'dm' | 'group';
  peer?: FeedAuthor;
  group?: ChatGroupCard;
  lastText: string;
  lastAt: string;
  unread: number;
  isCoach?: boolean;
  /** Chat enviado a alguien que aún no te sigue / no ha aceptado. */
  waiting?: boolean;
}

export interface ChatAsk {
  id: string;
  from: FeedAuthor;
  preview: string;
  createdAt: string;
}

export interface ChatLine {
  id: string;
  text: string;
  createdAt: string;
  mine: boolean;
  author?: FeedAuthor;
  mediaKey?: string | null;
  mediaType?: 'image' | 'video' | null;
  requested?: boolean;
  waiting?: boolean;
}

export function fetchChats() {
  return apiGet<{ threads: ChatThread[] }>('/api/social/chats');
}

export function fetchChatMessages(peerId: string) {
  return apiGet<{
    messages: ChatLine[];
    waiting?: boolean;
    incoming?: boolean;
    locked?: boolean;
    preview?: string;
    online?: boolean;
  }>(`/api/social/chats/${peerId}/messages`);
}

export function sendChatMessage(peerId: string, text: string, file?: File | null) {
  if (file) {
    const form = new FormData();
    if (text) form.append('text', text);
    form.append('file', file);
    return apiUpload<ChatLine & { requested?: boolean; waiting?: boolean }>(
      `/api/social/chats/${peerId}/messages`,
      form
    );
  }
  return apiPost<ChatLine & { requested?: boolean; waiting?: boolean }>(
    `/api/social/chats/${peerId}/messages`,
    { text }
  );
}

export function sendChatTyping(payload: { peerId?: string; groupId?: string }) {
  return apiPost<{ ok: boolean }>('/api/social/chats/typing', payload);
}

export function fetchChatRequests() {
  return apiGet<{ requests: ChatAsk[] }>('/api/social/chats/chat-requests');
}

export function answerChatRequest(id: string, decision: 'accept' | 'reject') {
  return apiPut<{ ok: boolean; peerId?: string }>(`/api/social/chats/chat-requests/${id}/${decision}`, {});
}

export function createChatGroup(name: string, memberIds: string[]) {
  return apiPost<ChatThread>('/api/social/chats/groups', { name, memberIds });
}

export function fetchGroupMessages(groupId: string) {
  return apiGet<{ group: ChatGroupCard; messages: ChatLine[] }>(`/api/social/chats/groups/${groupId}/messages`);
}

export function sendGroupMessage(groupId: string, text: string, file?: File | null) {
  if (file) {
    const form = new FormData();
    if (text) form.append('text', text);
    form.append('file', file);
    return apiUpload<ChatLine>(`/api/social/chats/groups/${groupId}/messages`, form);
  }
  return apiPost<ChatLine>(`/api/social/chats/groups/${groupId}/messages`, { text });
}

export function renameChatGroup(groupId: string, name: string) {
  return apiPatch<{ group: ChatGroupCard }>(`/api/social/chats/groups/${groupId}`, { name });
}

export function addChatGroupMembers(groupId: string, memberIds: string[]) {
  return apiPost<{ group: ChatGroupCard }>(`/api/social/chats/groups/${groupId}/members`, { memberIds });
}

export function removeChatGroupMember(groupId: string, userId: string) {
  return apiDelete(`/api/social/chats/groups/${groupId}/members/${userId}`);
}

export function fetchGroupInvites() {
  return apiGet<{ invites: ChatGroupInvite[] }>('/api/social/chats/group-invites');
}

export function answerGroupInvite(id: string, decision: 'accept' | 'reject') {
  return apiPut<{ ok: boolean; groupId?: string }>(`/api/social/chats/group-invites/${id}/${decision}`, {});
}

/** «hace 5 min», «ayer»…: fechas cortas al estilo de las redes. */
export function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return 'ahora';
  if (min < 60) return `hace ${min} min`;
  const hours = Math.floor(min / 60);
  if (hours < 24) return `hace ${hours} h`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'ayer';
  if (days < 7) return `hace ${days} días`;
  return new Date(iso).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
}
