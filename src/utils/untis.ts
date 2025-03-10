import { Lesson } from "webuntis";
import * as fs from 'fs';

const teacherMap = JSON.parse(fs.readFileSync('src/data/teachers.json', 'utf8'));
const subjectMap = JSON.parse(fs.readFileSync('src/data/subjects.json', 'utf8'));

function subjectName(subject: string): string {
  return subjectMap[subject] || subject;
}

function teacherName(id: number, long?: boolean): string {
  const teacher = teacherMap[id];
  return teacher ? (long ? teacher.longname : teacher.name) : "";
}

function mergeLessons(lessons: Lesson[]): Lesson[] {
  const mergedLessons: Lesson[] = [];

  lessons.forEach(lesson => {
    const existingLesson = mergedLessons.find(l =>
      l.su[0].name === lesson.su[0].name &&
      l.te[0].name === lesson.te[0].name &&
      l.date === lesson.date
    );

    if (existingLesson) {
      existingLesson.startTime = Math.min(existingLesson.startTime, lesson.startTime);
      existingLesson.endTime = Math.max(existingLesson.endTime, lesson.endTime);
    } else {
      mergedLessons.push({ ...lesson });
    }
  });

  return mergedLessons;
}

function untisDateToDateString(date: any): String {
  const dateString = date.toString();
  const year = dateString.substring(0, 4);
  const month = dateString.substring(4, 6);
  const day = dateString.substring(6, 8);
  return `${day}.${month}.${year}`;
}

function untisTimeToTimeString(time: any): String {
  let timeString = time.toString();
  if (timeString.length === 3) {
    timeString = '0' + timeString;
  }
  const hours = timeString.substring(0, 2);
  const minutes = timeString.substring(2, 4);
  return `${hours}:${minutes}`;
}

function untisDateToDate(date: any) {
  const dateString = date.toString();
  const year = dateString.substring(0, 4);
  const month = dateString.substring(4, 6);
  const day = dateString.substring(6, 8);
  return new Date(`${year}-${month}-${day}`);
}

export { mergeLessons, untisDateToDateString, untisTimeToTimeString, untisDateToDate, subjectName, teacherName };