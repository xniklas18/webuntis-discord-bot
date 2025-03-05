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

function teacherNames(id: number, long?: boolean): string {
  const teacherMap: { [key: number]: { name: string, longname: string } } = {
    39: { name: "MEYE", longname: "Herr Meyer" },
    323: { name: "GROD", longname: "Frau Grodtke" },
    184: { name: "HUEB", longname: "Herr Hübner" },
    59: { name: "SOMM", longname: "Frau Sommer" },
    2: { name: "AYDO", longname: "Frau Aydogan" },
    223: { name: "KARA", longname: "Frau Karabelen" },
    28: { name: "HE", longname: "Herr Heßbrüggen" },
    130: { name: "BLAT", longname: "Herr Blatt" },
    35: { name: "LUCK", longname: "Frau Lucke" },
    26: { name: "HAM", longname: "Frau Hampe" },
    383: { name: "GUSI", longname: "Herr Gusinde" },
    65: { name: "TRA", longname: "Herr Trachte" },
    233: { name: "WALC", longname: "Frau Walczak" },
    42: { name: "MIS", longname: "Frau Michels" },
    18: { name: "KUNZ", longname: "Frau Kunze" },
    85: { name: "JANS", longname: "Herr Jansen" },
    64: { name: "SWF", longname: "Frau Schwenzfeier-Diedrich" },
    57: { name: "SILE", longname: "Frau Sile" },
    69: { name: "WEB", longname: "Frau Weber" },
    378: { name: "CHLE", longname: "Herr Chlebusch" }
  };

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

export { mergeLessons, untisDateToDateString, untisTimeToTimeString, subjectNames, teacherNames };