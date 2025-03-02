import { Lesson } from "webuntis";

function subjectNames(subject: string): string {
  const subjectMap: { [key: string]: string } = {
    "M": "Mathe",
    "CH": "Chemie",
    "PH": "Physik",
    "D": "Deutsch",
    "E": "Englisch",
    "PL": "Philosophie",
    "KU": "Kunst",
    "SP": "Sport",
    "GE": "Geschichte",
    "MU": "Musik",
    "BI": "Biologie",
    "IF": "Informatik",
  };

  return subjectMap[subject] || subject;
}

function teacherName(teacher: string, pronoun?: boolean): string {
  if (pronoun) {
    const teacherMap: { [key: string]: string } = {
      "MEYE": "Herr Meyer",
      "GROD": "Herr Grodtke",
      "HUEB": "Frau Hübner",
    };

    return teacherMap[teacher] || teacher;
  }

  const teacherMap: { [key: string]: string } = {
    "MEYE": "Meyer",
    "GROD": "Grodtke",
    "HUEB": "Hübner",
  };

  return teacherMap[teacher] || teacher;
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

export { mergeLessons, untisDateToDateString, untisTimeToTimeString, subjectNames, teacherName };