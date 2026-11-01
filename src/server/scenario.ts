import fs from 'node:fs';
import { config } from './config.js';
import { parseScenario, type Scenario, type ScenarioQuestion, type ScenarioRoom } from '../shared/scenario.js';
import type {
  FocusState,
  PublicQuestion,
  PublicRoom,
  QuizQuestionState,
  ResearchState,
} from '../shared/types.js';

let cached: Scenario | null = null;

export function loadScenario(): Scenario {
  if (cached) return cached;
  const raw = fs.readFileSync(config.scenarioPath, 'utf8');
  const parsed = parseScenario(JSON.parse(raw) as unknown);
  cached = parsed;
  return parsed;
}

export function scenarioForGame(scenarioJson: string): Scenario {
  return parseScenario(JSON.parse(scenarioJson) as unknown);
}

export function playerClues(room: ScenarioRoom, playerIndex: number, playerCount: number): string[] {
  if (playerCount <= 0) return [];
  if (playerCount >= room.clues.length) {
    return [room.clues[playerIndex % room.clues.length]];
  }
  const base = Math.floor(room.clues.length / playerCount);
  const remainder = room.clues.length % playerCount;
  const start = playerIndex * base + Math.min(playerIndex, remainder);
  const count = base + (playerIndex < remainder ? 1 : 0);
  return room.clues.slice(start, start + count);
}

export interface RoomProgress {
  questions: Record<string, { correct: boolean; by: string; at: number }>;
  attempts: number;
  hintUsed: boolean;
  solvedAt: number | null;
}

export function publicQuestion(q: ScenarioQuestion, progress: RoomProgress): PublicQuestion {
  const answeredCorrectly = progress.questions[q.id]?.correct === true;
  return {
    id: q.id,
    prompt: q.prompt,
    options: q.options,
    answeredCorrectly,
    explanation: answeredCorrectly ? q.explanation : null,
  };
}

export function allQuestionsCorrect(room: ScenarioRoom, progress: RoomProgress): boolean {
  return room.questions.every((q) => progress.questions[q.id]?.correct === true);
}

export function publicRoom(
  room: ScenarioRoom,
  index: number,
  progress: RoomProgress,
  clues: string[],
  extras: {
    research?: ResearchState | null;
    focus?: FocusState | null;
    researchApproved?: boolean;
  } = {},
): PublicRoom {
  const questionsOk = allQuestionsCorrect(room, progress);
  return {
    index,
    id: room.id,
    title: room.title,
    subtitle: room.subtitle,
    narrative: room.narrative,
    questions: room.questions.map((q) => publicQuestion(q, progress)),
    exitPrompt: room.exitPrompt,
    allQuestionsCorrect: questionsOk,
    exitUnlocked: questionsOk && (!room.research || Boolean(extras.researchApproved)),
    hint: progress.hintUsed ? room.hint : null,
    clues,
    attempts: progress.attempts,
    lock: room.lock,
    research: extras.research ?? null,
    focus: extras.focus ?? null,
  };
}

export function quizQuestions(
  scenario: Scenario,
  answers: Map<string, { choice: number; correct: boolean }>,
): QuizQuestionState[] {
  return scenario.finalQuiz.map((q) => {
    const answer = answers.get(q.id);
    return {
      id: q.id,
      prompt: q.prompt,
      options: q.options,
      choice: answer?.choice ?? null,
      correct: answer?.correct ?? null,
      correctOption: answer ? q.correct : null,
      explanation: answer ? q.explanation : null,
    };
  });
}

export function solution(scenario: Scenario) {
  return {
    rooms: scenario.rooms.map((room) => ({
      id: room.id,
      title: room.title,
      exitCode: room.exitCode,
      questions: room.questions.map((q) => ({
        id: q.id,
        prompt: q.prompt,
        correct: q.correct,
        correctText: q.options[q.correct] ?? '',
      })),
    })),
    finalCode: scenario.final.code,
  };
}

export function findRoom(scenario: Scenario, roomId: string): { room: ScenarioRoom; index: number } | null {
  const index = scenario.rooms.findIndex((r) => r.id === roomId);
  if (index === -1) return null;
  return { room: scenario.rooms[index], index };
}
