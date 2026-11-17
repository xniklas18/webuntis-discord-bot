import { Lesson } from 'webuntis';
import { dayText, homeworkText, hwButtons } from '../../src/features';
import { dayNumber, dayLabel, timeString } from '../../src/untisData';

const ent = (id: number, name: string) => ({ id, name, longname: name, orgname: name, orgid: id });
const lesson = (over: Record<string, unknown>) =>
  ({ id: 1, date: 20261118, startTime: 800, endTime: 845, su: [ent(1, 'M')], te: [ent(2, 'MEYE')], ...over }) as unknown as Lesson;

describe('features', () => {
  it('marks cancelled and substituted lessons', () => {
    expect(dayText([lesson({ code: 'cancelled' })])).toContain('entfällt');
    expect(dayText([lesson({ substText: 'Eigenverantwortliches Arbeiten' })])).toContain('Eigenverantwortliches Arbeiten');
    expect(dayText([])).toBe('Kein Unterricht.');
  });

  it('lists open homework and offers at most 5 buttons', () => {
    const hw = Array.from({ length: 7 }, (_, i) => ({ id: i + 1, subject: 'Mathe', text: 'S. 5', due: 20261119 }));
    expect(homeworkText([])).toBe('Keine offenen Hausaufgaben.');
    expect(homeworkText(hw.slice(0, 1))).toContain('Mathe');
    const rows = hwButtons(hw);
    expect(rows).toHaveLength(1);
    expect(rows[0].components).toHaveLength(5);
    expect(hwButtons([])).toHaveLength(0);
  });

  it('formats dates and times', () => {
    expect(timeString(805)).toBe('08:05');
    expect(dayLabel(20261118)).toMatch(/18\.11\./);
    expect(dayNumber(new Date('2026-11-18T10:00:00Z'))).toBe(20261118);
  });
});
