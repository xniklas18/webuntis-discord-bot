import { Lesson } from 'webuntis';
import { belongsToCourse, isEigenverantwortlichesArbeiten } from '../../src/participants';

const ent = (id: number, name: string) => ({ id, name, longname: name, orgname: name, orgid: id });
const lesson = (over: Partial<Lesson> & Record<string, unknown>): Lesson =>
  ({
    id: 1,
    date: 20261118,
    startTime: 800,
    endTime: 845,
    su: [ent(10, 'M')],
    te: [ent(20, 'MEYE')],
    ...over,
  }) as unknown as Lesson;

describe('belongsToCourse', () => {
  it('matches the same event id', () => {
    expect(belongsToCourse(lesson({}), lesson({ startTime: 900, endTime: 945 }))).toBe(true);
  });

  it('matches same subject and teacher at an overlapping time', () => {
    expect(belongsToCourse(lesson({ id: 2 }), lesson({ id: 3, startTime: 830, endTime: 915 }))).toBe(true);
  });

  it('rejects another teacher, another day and a non-overlapping time', () => {
    const base = lesson({ id: 2 });
    expect(belongsToCourse(base, lesson({ id: 3, te: [ent(99, 'X')] }))).toBe(false);
    expect(belongsToCourse(base, lesson({ id: 3, date: 20261119 }))).toBe(false);
    expect(belongsToCourse(base, lesson({ id: 3, startTime: 900, endTime: 945 }))).toBe(false);
  });
});

describe('isEigenverantwortlichesArbeiten', () => {
  it('detects the substitution text', () => {
    expect(isEigenverantwortlichesArbeiten(lesson({ substText: 'Eigenverantwortliches  Arbeiten' }))).toBe(true);
    expect(isEigenverantwortlichesArbeiten(lesson({ substText: 'Vertretung' }))).toBe(false);
  });
});
