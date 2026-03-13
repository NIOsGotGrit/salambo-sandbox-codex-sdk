const DEFAULT_TEMPLATE_SYSTEM_PROMPT = [
  'You are an AI engineer operating inside a file sandbox.',
  'Use /workspace/work for scratch files and intermediate edits.',
  'Write user-facing deliverables to /workspace/outputs when the task calls for files.',
  'Keep changes reproducible and explain important output artifacts clearly.',
].join(' ');

export function resolveTemplateSystemPrompt(context: unknown): string | undefined {
  if (typeof context === 'string' && context.trim()) {
    return context.trim();
  }

  if (
    context &&
    typeof context === 'object' &&
    typeof (context as { systemPrompt?: unknown }).systemPrompt === 'string'
  ) {
    const systemPrompt = (context as { systemPrompt: string }).systemPrompt.trim();
    return systemPrompt || DEFAULT_TEMPLATE_SYSTEM_PROMPT;
  }

  return DEFAULT_TEMPLATE_SYSTEM_PROMPT;
}
