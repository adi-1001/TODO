import type { ReflectionQuestion } from '../types';

/**
 * Reflection questions that ship with the app. Fixed ids and updatedAt = 1 mean every device
 * adds identical records, so they never duplicate during sync, and any edit wins over them.
 */
export const BUILTIN_QUESTIONS: ReflectionQuestion[] = [
  'Did I spend my study hours today on active problem-solving and recall, or did I fall back into passive reading/watching?',
  'Did I avoid any specific chapter or task today because it felt uncomfortable or difficult?',
  'What was the exact trigger that caused my longest distraction today, and how can I remove it tomorrow?',
  'What went well today that I should repeat tomorrow?',
].map((text, i) => ({ id: `builtin-q${i + 1}`, updatedAt: 1, text, order: i, builtIn: true, createdAt: 0 }));
