import { z } from 'zod';

const questionSchema = z
  .object({
    id: z.string().min(1).max(40),
    prompt: z.string().min(3).max(400),
    options: z.array(z.string().min(1).max(160)).min(2).max(6),
    correct: z.number().int().min(0),
    explanation: z.string().min(3).max(500),
  })
  .superRefine((q, ctx) => {
    if (q.correct >= q.options.length) {
      ctx.addIssue({ code: 'custom', message: `correct index out of range for question ${q.id}` });
    }
  });

const researchResourceSchema = z.object({
  title: z.string().min(2).max(120),
  url: z.string().url().max(500).optional(),
  excerpt: z.string().min(10).max(1200).optional(),
});

const researchSchema = z.object({
  prompt: z.string().min(10).max(1200),
  instructions: z.string().min(10).max(1200),
  minWords: z.number().int().min(30).max(500),
  maxWords: z.number().int().min(80).max(900),
  sourcesRequired: z.number().int().min(1).max(4),
  resources: z.array(researchResourceSchema).max(8).default([]),
});

const roomSchema = z.object({
  id: z.string().min(1).max(40),
  title: z.string().min(1).max(80),
  subtitle: z.string().min(1).max(120),
  narrative: z.string().min(10).max(2000),
  questions: z.array(questionSchema).min(1).max(4),
  exitPrompt: z.string().min(3).max(240),
  exitCode: z.string().regex(/^\d$/, 'exitCode must be a single digit'),
  hint: z.string().min(3).max(500),
  clues: z.array(z.string().min(3).max(300)).min(1).max(12),
  success: z.string().min(3).max(500),
  lock: z.enum(['focus', 'open']),
  research: researchSchema.optional(),
  session: z.number().int().min(1).max(3),
});

export const scenarioSchema = z
  .object({
    id: z.string().min(1).max(60),
    version: z.number().int().min(1),
    title: z.string().min(1).max(100),
    subtitle: z.string().min(1).max(100),
    durationMinutes: z.number().int().min(5).max(300),
    sessionCount: z.number().int().min(1).max(3),
    sessionTitles: z.array(z.string().min(2).max(80)).min(1).max(3),
    intro: z.string().min(10).max(4000),
    rules: z.array(z.string().min(3).max(240)).min(1).max(10),
    rooms: z.array(roomSchema).length(10),
    final: z.object({
      prompt: z.string().min(3).max(500),
      code: z.string().regex(/^\d{10}$/),
      success: z.string().min(3).max(1000),
    }),
    finalQuizIntro: z.string().min(3).max(500),
    finalQuiz: z.array(questionSchema).length(10),
  })
  .superRefine((s, ctx) => {
    const computed = s.rooms.map((r) => r.exitCode).join('');
    if (computed !== s.final.code) {
      ctx.addIssue({
        code: 'custom',
        message: `final.code (${s.final.code}) must equal the concatenation of room exit codes (${computed})`,
      });
    }
    if (s.sessionTitles.length !== s.sessionCount) {
      ctx.addIssue({ code: 'custom', message: 'sessionTitles length must equal sessionCount' });
    }
    const ids = new Set<string>();
    for (const room of s.rooms) {
      if (ids.has(room.id)) {
        ctx.addIssue({ code: 'custom', message: `duplicate room id: ${room.id}` });
      }
      ids.add(room.id);
      if (room.session > s.sessionCount) {
        ctx.addIssue({ code: 'custom', message: `room ${room.id} references session ${room.session}` });
      }
      const qids = new Set<string>();
      for (const q of room.questions) {
        if (qids.has(q.id)) {
          ctx.addIssue({ code: 'custom', message: `duplicate question id in ${room.id}: ${q.id}` });
        }
        qids.add(q.id);
      }
      if (room.research && room.research.minWords >= room.research.maxWords) {
        ctx.addIssue({ code: 'custom', message: `research minWords must be lower than maxWords in ${room.id}` });
      }
    }
    const quizIds = new Set<string>();
    for (const q of s.finalQuiz) {
      if (quizIds.has(q.id)) {
        ctx.addIssue({ code: 'custom', message: `duplicate final quiz id: ${q.id}` });
      }
      quizIds.add(q.id);
    }
  });

export type Scenario = z.infer<typeof scenarioSchema>;
export type ScenarioRoom = z.infer<typeof roomSchema>;
export type ScenarioQuestion = z.infer<typeof questionSchema>;

export function parseScenario(input: unknown): Scenario {
  return scenarioSchema.parse(input);
}
