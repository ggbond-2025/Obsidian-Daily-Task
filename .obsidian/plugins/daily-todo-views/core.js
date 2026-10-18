function dateKey(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return year + '-' + month + '-' + day;
}

function dateFromKey(key) {
    const parts = key.split('-');
    return new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]), 12);
}

function addDays(key, amount) {
    const date = dateFromKey(key);
    date.setDate(date.getDate() + amount);
    return dateKey(date);
}

function weekForDate(key) {
    const date = dateFromKey(key);
    const distance = (date.getDay() + 6) % 7;
    const start = addDays(key, -distance);
    return { start: start, end: addDays(start, 6) };
}

function shiftDate(key, view, amount) {
    if (view === 'week') {
        return addDays(key, amount * 7);
    }
    const date = dateFromKey(key);
    date.setDate(1);
    date.setMonth(date.getMonth() + amount);
    return dateKey(date);
}

function calendarDays(key, view) {
    let first = key;
    let length = 7;
    if (view === 'month') {
        first = key.slice(0, 7) + '-01';
        length = 42;
    }
    first = weekForDate(first).start;
    const dates = [];
    for (let index = 0; index < length; index++) {
        dates.push(addDays(first, index));
    }
    return dates;
}

function resolveQuery(query, today, sourcePath) {
    let dailyDate = today;
    if (sourcePath) {
        const match = sourcePath.match(/(?:^|\/)(\d{4}-\d{2}-\d{2})\.md$/);
        if (match) { dailyDate = match[1]; }
    }
    return renderWeeklyTemplate(query, dailyDate).replaceAll('{{today.file}}', 'To do/' + today + '.md').replaceAll('{{daily.date}}', dailyDate);
}

function weekPathRegex(monday) {
    const dates = calendarDays(monday, 'week');
    return '^To do\\/(?:' + dates.join('|') + ')\\.md$';
}

const CLOCK_PATTERN = /🕒\s+((?:[01]\d|2[0-3]):[0-5]\d)(?![\d:])/;
const DUE_PATTERN = /📅\uFE0F?\s+(\d{4}-\d{2}-\d{2})/;

function deadlineFields(line) {
    const date = line.match(DUE_PATTERN);
    const time = line.match(CLOCK_PATTERN);
    return { date: date ? date[1] : '', time: time ? time[1] : '' };
}

function placeClock(line, after) {
    const fields = deadlineFields(line);
    if (!fields.date || !fields.time) { return line; }
    const clock = line.match(CLOCK_PATTERN)[0];
    const body = line.replace(new RegExp('\\s*' + CLOCK_PATTERN.source), '');
    return body.replace(DUE_PATTERN, function (date) {
        return after ? date + ' ' + clock : clock + ' ' + date;
    });
}

function clockBeforeDate(line) { return placeClock(line, false); }
function clockAfterDate(line) { return placeClock(line, true); }

function setDeadline(line, date, time) {
    if (!/^\s*(?:[-*+]|\d+[.)])\s+\[[^\]]\]\s/.test(line)) { throw new Error('请将光标放在任务行'); }
    const parsed = dateFromKey(date);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || dateKey(parsed) !== date) { throw new Error('请选择有效的截止日期'); }
    if (time && !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(time)) { throw new Error('时间请使用 HH:mm，例如 08:30'); }
    let body = line.replace(new RegExp('\\s*' + CLOCK_PATTERN.source, 'g'), '').replace(new RegExp('\\s*' + DUE_PATTERN.source, 'g'), '');
    const hardBreak = body.endsWith('  ') ? '  ' : '';
    body = body.trimEnd();
    const block = body.match(/\s+\^[\w-]+$/);
    if (block) { body = body.slice(0, block.index); }
    return body.trimEnd() + ' 📅 ' + date + (time ? ' 🕒 ' + time : '') + (block ? block[0] : '') + hardBreak;
}

function installDeadlineCompatibility(Task) {
    const originalParse = Task.fromLine;
    const originalSave = Task.prototype.toFileLineString;
    function parse(options) {
        const normalized = Object.assign({}, options, { line: clockBeforeDate(options.line) });
        const task = originalParse.call(this, normalized);
        if (task) { task.originalMarkdown = options.line; }
        return task;
    }
    function save() { return clockAfterDate(originalSave.call(this)); }
    Task.fromLine = parse;
    Task.prototype.toFileLineString = save;
    return function () {
        if (Task.fromLine === parse) { Task.fromLine = originalParse; }
        if (Task.prototype.toFileLineString === save) { Task.prototype.toFileLineString = originalSave; }
    };
}

function isOverdue(task, now) {
    if (!task.due.moment) { return false; }
    const due = task.due.format('YYYY-MM-DD');
    const today = dateKey(now);
    if (due !== today) { return due < today; }
    const time = task.description.match(CLOCK_PATTERN);
    if (!time) { return false; }
    const parts = time[1].split(':');
    const deadlineMinutes = Number(parts[0]) * 60 + Number(parts[1]);
    return now.getHours() * 60 + now.getMinutes() >= deadlineMinutes;
}

function deadlineQuery(query, now) {
    // Use native description filters so Tasks keeps checkbox editing and needs no JavaScript query permission.
    const previousHours = [];
    for (let hour = 0; hour < now.getHours(); hour++) {
        previousHours.push(String(hour).padStart(2, '0'));
    }
    const currentMinutes = [];
    for (let minute = 0; minute <= now.getMinutes(); minute++) {
        currentMinutes.push(String(minute).padStart(2, '0'));
    }
    const expiredTimes = [];
    if (previousHours.length) { expiredTimes.push('(?:' + previousHours.join('|') + '):[0-5]\\d'); }
    expiredTimes.push(String(now.getHours()).padStart(2, '0') + ':(?:' + currentMinutes.join('|') + ')');
    const pattern = '🕒\\s+(?:' + expiredTimes.join('|') + ')(?![\\d:])';
    const expired = 'description regex matches /' + pattern + '/';
    const remaining = 'description regex does not match /' + pattern + '/';
    const lines = [];
    for (const line of query.split('\n')) {
        const instruction = line.trim();
        if (instruction === '(no due date) OR (due on or after today)') {
            lines.push('(no due date) OR (due after today) OR ((due on today) AND (' + remaining + '))');
        } else if (instruction === 'due before today') {
            lines.push('(due before today) OR ((due on today) AND (' + expired + '))');
        } else {
            lines.push(line);
            const date = instruction.match(/^due on (today|\d{4}-\d{2}-\d{2})$/);
            if (!date) { continue; }
            const target = date[1] === 'today' ? dateKey(now) : date[1];
            if (target < dateKey(now)) { lines.push('description regex matches /^$/'); }
            else if (target === dateKey(now)) { lines.push(remaining); }
        }
    }
    return lines.join('\n');
}

function summarizeTasks(tasks, now) {
    const counts = {};
    const today = dateKey(now);
    for (const task of tasks) {
        const match = task.file.path.match(/^To do\/(\d{4}-\d{2}-\d{2})\.md$/);
        if (!match || !task.description.trim()) { continue; }
        const type = task.status.type;
        if (!['TODO', 'IN_PROGRESS', 'ON_HOLD', 'DONE'].includes(type)) { continue; }
        const date = match[1];
        if (!counts[date]) { counts[date] = { pending: 0, completed: 0, soon: 0 }; }
        if (type === 'DONE') {
            counts[date].completed++;
        } else {
            counts[date].pending++;
            if (task.due.moment) {
                const due = task.due.format('YYYY-MM-DD');
                if (/^\d{4}-\d{2}-\d{2}$/.test(due) && due >= today && !isOverdue(task, now)) {
                    if (!counts[due]) { counts[due] = { pending: 0, completed: 0, soon: 0 }; }
                    counts[due].soon++;
                }
            }
        }
    }
    return counts;
}

function renderWeeklyTemplate(template, date) {
    const week = weekForDate(date);
    return template.replaceAll('{{week.start}}', week.start)
        .replaceAll('{{week.end}}', week.end)
        .replaceAll('{{week.pathRegex}}', weekPathRegex(week.start));
}

module.exports = { dateKey, addDays, weekForDate, shiftDate, calendarDays, resolveQuery, weekPathRegex, renderWeeklyTemplate, summarizeTasks, isOverdue, deadlineQuery, deadlineFields, setDeadline, clockBeforeDate, clockAfterDate, installDeadlineCompatibility };
