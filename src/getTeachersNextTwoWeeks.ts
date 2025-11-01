import 'dotenv/config';
import { WebUntis, Lesson } from 'webuntis';
import { teacherName } from './utils/untis';

async function main() {
  const SCHOOL = process.env.WEBUNTIS_SCHOOL || '';
  const USERNAME = process.env.WEBUNTIS_USERNAME || '';
  const PASSWORD = process.env.WEBUNTIS_PASSWORD || '';
  const BASEURL = process.env.WEBUNTIS_BASEURL || '';

  if (!SCHOOL || !USERNAME || !PASSWORD || !BASEURL) {
    console.error('Missing one of WEBUNTIS_SCHOOL, WEBUNTIS_USERNAME, WEBUNTIS_PASSWORD or WEBUNTIS_BASEURL in environment.');
    process.exit(2);
  }

  const untis = new WebUntis(SCHOOL, USERNAME, PASSWORD, BASEURL);

  try {
    console.log('Logging in to WebUntis...');
    await untis.login();

    const today = new Date();
    const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const end = new Date(start);
    end.setDate(start.getDate() + 13); // next two weeks (14 days inclusive)

    console.log(`Fetching timetable from ${start.toDateString()} to ${end.toDateString()}...`);

    // getOwnClassTimetableForRange returns Lesson[] for the user's class (matches what the bot uses)
    const lessons: Lesson[] = await untis.getOwnClassTimetableForRange(start, end);

    const teachersMap: Map<number, { id: number; orgname?: string; display?: string }> = new Map();

    for (const lesson of lessons) {
      if (!lesson.te) continue;
      for (const t of lesson.te) {
        const id = (t.orgid || t.id) as number; // sometimes orgid used
        if (!id || teachersMap.has(id)) continue;
        const orgname = t.orgname || (t.name ?? '');
        const display = teacherName(id, true) || orgname || String(id);
        teachersMap.set(id, { id, orgname, display });
      }
    }

    const teachers = Array.from(teachersMap.values()).sort((a, b) => (a.display || '').localeCompare(b.display || ''));

    console.log('Found teachers in next two weeks:');
    for (const t of teachers) {
      console.log(`- ${t.display} (id: ${t.id}${t.orgname ? `, orgname: ${t.orgname}` : ''})`);
    }

    console.log('\nSummary:');
    console.log(`${teachers.length} unique teacher${teachers.length === 1 ? '' : 's'} found.`);

    await untis.logout();
    process.exit(0);
  } catch (err: any) {
    console.error('Error while fetching teachers:', err && err.message ? err.message : err);
    try { await untis.logout(); } catch (_) { }
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

export { };
