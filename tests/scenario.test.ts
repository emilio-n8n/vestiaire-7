import { describe, expect, it } from 'vitest';
import { loadScenario, playerClues, allQuestionsCorrect, type RoomProgress } from '../src/server/scenario';

describe('scénario', () => {
  const scenario = loadScenario();

  it('charge 5 salles et un code final cohérent', () => {
    expect(scenario.rooms).toHaveLength(5);
    expect(scenario.rooms.map((room) => room.exitCode).join('')).toBe(scenario.final.code);
    expect(scenario.final.code).toBe('32769');
  });

  it('a un quiz individuel de 5 questions', () => {
    expect(scenario.finalQuiz).toHaveLength(5);
    for (const question of scenario.finalQuiz) {
      expect(question.options.length).toBeGreaterThanOrEqual(2);
      expect(question.correct).toBeLessThan(question.options.length);
    }
  });

  it('distribue une clue à chaque joueur quand il y a autant de joueurs que de clues', () => {
    const room = scenario.rooms[0];
    const clues = [0, 1, 2, 3].map((index) => playerClues(room, index, 4));
    expect(clues.every((items) => items.length === 1)).toBe(true);
    expect(new Set(clues.map((items) => items[0])).size).toBe(4);
  });

  it('distribue toutes les clues quand il y a moins de joueurs', () => {
    const room = scenario.rooms[0];
    const clues = [0, 1, 2].flatMap((index) => playerClues(room, index, 3));
    expect(clues).toHaveLength(4);
  });

  it('donne toutes les clues à un joueur seul', () => {
    const room = scenario.rooms[0];
    expect(playerClues(room, 0, 1)).toHaveLength(4);
  });

  it('vérifie que toutes les questions d’une salle sont correctes', () => {
    const room = scenario.rooms[0];
    const progress: RoomProgress = {
      questions: Object.fromEntries(room.questions.map((question) => [question.id, { correct: true, by: 'p', at: 1 }])),
      attempts: 0,
      hintUsed: false,
      solvedAt: null,
    };
    expect(allQuestionsCorrect(room, progress)).toBe(true);
    const incomplete: RoomProgress = { ...progress, questions: { [room.questions[0].id]: { correct: true, by: 'p', at: 1 } } };
    expect(allQuestionsCorrect(room, incomplete)).toBe(false);
  });
});
