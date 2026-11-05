export const LIMITS = { imageBytes: 10 * 1024 ** 2, fileBytes: 20 * 1024 ** 2, pixels: 25_000_000, pdfPages: 100, ocrPages: 10, unpackBytes: 80 * 1024 ** 2, backupBytes: 100 * 1024 ** 2, backupUnpack: 250 * 1024 ** 2, textChars: 1_000_000, importItems: 50 };
export type Life = 'active' | 'done';
export const normalizeLife = (life:Life|'review'|'archived'):Life => life==='done'||life==='archived'?'done':'active';
export type JobState = 'waiting' | 'running' | 'success' | 'partial' | 'failed' | 'cancelled';
export interface Evidence { sourceId: string; page?: number; start: number; end: number; snippet: string; ruleId: string }
export interface DateCandidate extends Evidence { id: string; raw: string; value?: string; precision: 'day' | 'minute' | 'unknown'; role: 'deadline' | 'other' | 'unknown'; tentative: boolean; valid: boolean; note: string }
export interface Deadline { value: string; precision: 'day' | 'minute'; confirmed: boolean; candidateId?: string }
export interface Material { id: string; name: string; requirement: 'required' | 'optional' | 'excluded'; done: boolean; origin: 'machine' | 'manual'; originKey?: string; edited?: boolean; evidence?: Evidence }
export interface AgentSource { client: string; requestId: string; fingerprint: string; notes: string }
export interface PersonalTask { id: string; text: string; date: string; time?: string; done: boolean; agent?: AgentSource }
export interface McpReceipt { key: string; fingerprint: string; noticeId: string; taskId: string }
export interface ActionCandidate { id: string; text: string; time?: string; timeNote: string; optional: boolean; selected: boolean; originKey: string; evidence: Evidence; edited?: boolean; dismissed?: boolean; taskId?: string }
export interface PageText { page: number; text: string; method: 'text' | 'scan' | 'ocr'; error?: string }
export interface Source { id: string; kind: 'text' | 'web' | 'image' | 'pdf' | 'docx'; name: string; titleHint?: string; url?: string; text: string; originalText: string; attachmentId?: string; pages?: PageText[]; editedAt?: number; rotation?: number; warnings?: string[] }
export interface Notice { id: string; title: string; titleEdited: boolean; summary?: string; summaryEdited?: boolean; life: Life; deadline?: Deadline; deadlineEdited: boolean; createdAt: number; updatedAt: number; sources: Source[]; dates: DateCandidate[]; materials: Material[]; tasks: PersonalTask[]; actions?: ActionCandidate[]; dismissedMaterials: string[] }
export interface Attachment { id: string; noticeId: string; sourceId: string; name: string; type: string; size: number; blob: Blob }
export interface ParseJob { id: string; noticeId: string; sourceId: string; state: JobState; progress: string; updatedAt: number; pages?: number[]; error?: string }
export interface Settings { upcomingDays: number; sort: 'deadline' | 'created' | 'planned'; compact: boolean }
export const id = () => crypto.randomUUID();
export const safeURL = (s?: string) => { try { const u = new URL(s || ''); return /^https?:$/.test(u.protocol)&&!u.username&&!u.password ? u.href : undefined; } catch { return undefined; } };
export const normalize = (s: string) => s.replace(/\r\n?/g, '\n').replace(/[\t\u00a0]+/g, ' ').trim();
