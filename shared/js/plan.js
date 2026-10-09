/* ─────────────────────────────────────────────
   Week planning rules shared by To Do's and Review (both read/write To Do's blob).
   Per item, all optional (absent = not set):
     plannedFor    YYYY-MM-DD you mean to do it (separate from dueDate, the deadline)
     deferredUntil YYYY-MM-DD Monday it was pushed to — hidden from Review until then
     deferCount    how many times it has been pushed
───────────────────────────────────────────── */
const LINGER_DAYS = 21;  // open three weeks without being done → lingering
const LINGER_PUSHES = 2; // or pushed to next week this many times

// Planned for a day that has passed and still open.
function isBehind(item) {
  return !!item.plannedFor && item.plannedFor < todayISO();
}

// Pushed past the week being planned. Pushes land on a Monday, so a pushed item
// is back in Review from the Saturday before (when the plan week rolls over).
function isPushed(item) {
  return !!item.deferredUntil && item.deferredUntil > planWeekStartISO();
}

function nextPlanWeekISO() {
  return addDaysISO(planWeekStartISO(), 7);
}

function pushItemToNextWeek(item) {
  item.deferredUntil = nextPlanWeekISO();
  item.deferCount = (item.deferCount || 0) + 1;
  item.plannedFor = null;
}

function bringItemBack(item) {
  item.deferredUntil = null;
}

function itemAgeDays(item) {
  const created = item.createdAt || idTimestamp(item.id);
  return created ? daysBetweenISO(isoDate(new Date(created)), todayISO()) : 0;
}

// Open for weeks or pushed repeatedly — needs a real decision (do, schedule, drop),
// not another push. Items already planned this week or currently pushed don't count.
function isLingering(item) {
  if (isPushed(item) || isBehind(item)) return false;
  const start = planWeekStartISO();
  if (item.plannedFor && item.plannedFor >= start && item.plannedFor <= addDaysISO(start, 6)) return false;
  return itemAgeDays(item) >= LINGER_DAYS || (item.deferCount || 0) >= LINGER_PUSHES;
}
