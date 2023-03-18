export function formatDate(date: Date = new Date()): string {
  const year = date.getFullYear(),
    mon = date.getMonth() + 1,
    day = date.getDate(),
    hour = date.getHours(),
    min = date.getMinutes(),
    sec = date.getSeconds();
  return (
    `${year}-${mon < 10 ? `0${mon}` : mon}-${day < 10 ? `0${day}` : day} ` +
    `${hour < 10 ? `0${hour}` : hour}:${min < 10 ? `0${min}` : min}:${sec < 10 ? `0${sec}` : sec}`
  );
}
