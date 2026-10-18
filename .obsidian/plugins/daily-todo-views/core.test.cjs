const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('weekly dates, native queries and calendar navigation keep the agreed date rules', function () {
    const file = path.join(__dirname, 'core.js');
    let core = {};
    if (fs.existsSync(file)) {
        core = require(file);
    }
    assert.equal(typeof core.weekForDate, 'function', 'Date helpers have not been implemented');
    assert.deepEqual(core.weekForDate('2026-10-18'), { start: '2026-10-12', end: '2026-10-18' });
    assert.deepEqual(core.weekForDate('2027-01-01'), { start: '2026-12-28', end: '2027-01-03' });
    assert.equal(core.resolveQuery('path includes {{today.file}}', '2026-10-18'), 'path includes To do/2026-10-18.md');
    assert.equal(core.resolveQuery('due on {{daily.date}}', '2026-10-18', 'To do/2026-10-21.md'), 'due on 2026-10-21');
    assert.equal(core.resolveQuery('due on {{daily.date}}', '2026-10-18', 'To do/2026-10-12.md'), 'due on 2026-10-12');
    assert.equal(core.shiftDate('2026-01-31', 'month', 1), '2026-02-01');
    assert.equal(core.shiftDate('2026-12-28', 'week', 1), '2027-01-04');
    assert.equal(core.calendarDays('2026-10-18', 'week').length, 7);
    assert.equal(core.calendarDays('2026-10-18', 'week')[0], '2026-10-12');
    assert.equal(core.calendarDays('2026-10-18', 'month').length, 42);
    assert.equal(core.calendarDays('2026-10-18', 'month')[0], '2026-09-28');
    const regex = new RegExp(core.weekPathRegex('2026-12-28'));
    assert.equal(regex.test('To do/2027-01-03.md'), true);
    assert.equal(regex.test('To do/2027-01-04.md'), false);
    assert.equal(regex.test('Templates/2026-12-28.md'), false);
    const template = fs.readFileSync(path.join(__dirname, '../../../Templates/Weekly-Template.md'), 'utf8');
    assert.equal(typeof core.renderWeeklyTemplate, 'function', 'Weekly template rendering is missing');
    const note = core.renderWeeklyTemplate(template, '2026-10-18');
    assert.ok(note.includes('2026-10-12 至 2026-10-18'));
    assert.equal((note.match(/```tasks-fold/g) || []).length, 5);
    assert.ok(!note.includes('by function'));
    assert.ok(note.includes('(no due date) OR (due on or after today)'));
    assert.equal((note.match(/path regex matches/g) || []).length, 5);
    assert.ok(note.includes('[[总览/任务总览|任务总览]]'));
    assert.ok(!note.includes('{{week.'));
    const crossYear = core.renderWeeklyTemplate(template + '\n自定义周复盘', '2027-01-01');
    assert.ok(crossYear.includes('2026-12-28 至 2027-01-03'));
    assert.ok(crossYear.includes('自定义周复盘'));
});

test('calendar counts include all unfinished tasks, completed tasks, and exclude empty and cancelled items', function () {
    const core = require('./core');
    assert.equal(typeof core.summarizeTasks, 'function', 'Calendar statistics have not been implemented');
    function task(status, description, file) {
        return { file: { path: file || 'To do/2026-10-18.md' }, status: { type: status }, description: description, due: { moment: null } };
    }
    const tasks = [
        task('TODO', '学习'), task('IN_PROGRESS', '写报告'), task('ON_HOLD', '等待资料'), task('DONE', '读书'),
        task('CANCELLED', '已取消'), task('TODO', ' '), task('TODO', '模板任务', 'Templates/Daily-Template.md'),
        task('TODO', '下周任务', 'To do/2026-10-19.md')
    ];
    const counts = core.summarizeTasks(tasks, new Date(2026, 9, 18, 12, 0));
    assert.deepEqual(counts['2026-10-18'], { pending: 3, completed: 1, soon: 0 });
    assert.deepEqual(counts['2026-10-19'], { pending: 1, completed: 0, soon: 0 });
});

test('upcoming means due today and unfinished, with dates changing correctly at midnight', function () {
    const core = require('./core');
    function task(date, status) {
        return {
            file: { path: 'To do/2026-10-18.md' }, status: { type: status || 'TODO' }, description: '任务',
            due: { moment: date ? {} : null, format: function () { return date; } }
        };
    }
    const tasks = [
        task('2026-10-18'), task('2026-10-18', 'IN_PROGRESS'), task('2026-10-18', 'DONE'),
        task('2026-10-18', 'CANCELLED'), task('2026-10-17'), task('2026-10-19'), task(null)
    ];
    const counts = core.summarizeTasks(tasks, new Date(2026, 9, 18, 12, 0, 30));
    assert.deepEqual(counts['2026-10-18'], { pending: 5, completed: 1, soon: 2 });
    const tomorrow = core.summarizeTasks(tasks, new Date(2026, 9, 19, 0, 0));
    assert.equal(tomorrow['2026-10-18'].soon, 0);
    assert.equal(tomorrow['2026-10-19'].soon, 1);
});

test('deadline counts use the due day across daily notes and do not populate past days', function () {
    const core = require('./core');
    function task(fileDate, dueDate, type) {
        return {
            file: { path: 'To do/' + fileDate + '.md' }, status: { type: type || 'TODO' }, description: '跨日期任务',
            due: { moment: {}, format: function () { return dueDate; } }
        };
    }
    const counts = core.summarizeTasks([
        task('2026-10-12', '2026-10-18'), task('2026-10-12', '2026-10-21'),
        task('2026-10-18', '2026-10-21'), task('2026-10-12', '2026-10-17'),
        task('2026-10-12', '2026-10-21', 'DONE')
    ], new Date(2026, 9, 18, 12, 0));
    assert.deepEqual(counts['2026-10-12'], { pending: 3, completed: 1, soon: 0 });
    assert.deepEqual(counts['2026-10-18'], { pending: 1, completed: 0, soon: 1 });
    assert.deepEqual(counts['2026-10-21'], { pending: 0, completed: 0, soon: 2 });
    assert.equal(counts['2026-10-17'], undefined);
});
