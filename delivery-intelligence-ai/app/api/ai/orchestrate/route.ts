import { handleAI } from '@/lib/ai';
export const runtime = 'nodejs';
export const maxDuration = 60;
export async function POST(request: Request) { return handleAI(request, true); }
