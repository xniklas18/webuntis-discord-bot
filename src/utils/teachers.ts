import teachers from '../data/teachers.json';

type Teacher = { name: string, longname: string };
const teachersTyped: { [key: string]: Teacher } = teachers;

function getTeacherById(id: number): Teacher | undefined {
  return teachersTyped[id.toString()];
}

function getTeacherByName(name: string): Teacher | undefined {
  return Object.values(teachersTyped).find(teacher => teacher.name === name);
}

function teacherName(name: string, long?: boolean): string {
  const teacher = getTeacherByName(name);
  if (teacher) {
    const teacherName = long ? teacher.longname : teacher.name;
    return teacherName.startsWith('Herr ') ? `Herrn ${teacherName.slice(5)}` : teacherName;
  }
  return name;
}

export { getTeacherById, getTeacherByName, teacherName, Teacher };