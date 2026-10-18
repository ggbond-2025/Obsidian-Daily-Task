const test = require('node:test');
const assert = require('node:assert/strict');
const core = require('./core');

function task(date, description, status) {
    return {
        file: { path: 'To do/2026-10-12.md' },
        description: description,
        status: { type: status || 'TODO' },
        due: { moment: date ? {} : null, format: function () { return date; } }
    };
}

test('deadline editor preserves task metadata and writes time immediately after the native due date', function () {
    const line = '  - [ ] 提交报告 #工作 🔼 🛫 2026-10-19 ⏳ 2026-10-20 📅 2026-10-21 ✅ 2026-10-18 ^report';
    const saved = core.setDeadline(line, '2026-10-22', '08:05');
    assert.ok(saved.startsWith('  - [ ] 提交报告 #工作 🔼 🛫 2026-10-19 ⏳ 2026-10-20'));
    assert.ok(saved.includes('✅ 2026-10-18'));
    assert.ok(saved.includes('📅 2026-10-22 🕒 08:05'));
    assert.ok(saved.endsWith(' ^report'));
    assert.deepEqual(core.deadlineFields(saved), { date: '2026-10-22', time: '08:05' });
    assert.equal(core.setDeadline(saved, '2026-10-22', '').includes('🕒'), false);
    const old = '- [ ] 报告 🕒 18:30 📅 2026-10-21';
    assert.equal(core.clockAfterDate(old), '- [ ] 报告 📅 2026-10-21 🕒 18:30');
    assert.equal(core.clockBeforeDate(core.clockAfterDate(old)), old);
    assert.equal(core.clockAfterDate(core.clockAfterDate(old)), core.clockAfterDate(old));
    for (const time of ['8:05', '24:00', '18:60', '18:30:00']) {
        assert.throws(function () { core.setDeadline(line, '2026-10-22', time); }, /HH:mm/);
    }
    assert.throws(function () { core.setDeadline(line, '2026-02-30', '18:30'); }, /日期/);
    assert.throws(function () { core.setDeadline('普通段落', '2026-10-22', '18:30'); }, /任务行/);
});

test('minute deadlines expire at the specified minute, while date-only tasks retain the full day', function () {
    const timed = task('2026-10-18', '报告 🕒 18:30');
    assert.equal(core.isOverdue(timed, new Date(2026, 9, 18, 18, 29, 59)), false);
    assert.equal(core.isOverdue(timed, new Date(2026, 9, 18, 18, 30)), true);
    assert.equal(core.isOverdue(timed, new Date(2026, 9, 18, 18, 31)), true);
    assert.equal(core.isOverdue(task('2026-10-19', '明天 🕒 00:00'), new Date(2026, 9, 18, 23, 59)), false);
    assert.equal(core.isOverdue(task('2026-10-18', '今天 🕒 00:00'), new Date(2026, 9, 18, 0, 0)), true);
    assert.equal(core.isOverdue(task('2026-10-18', '整天'), new Date(2026, 9, 18, 23, 59, 59)), false);
    assert.equal(core.isOverdue(task('2026-10-18', '整天'), new Date(2026, 9, 19, 0, 0)), true);
    assert.equal(core.isOverdue(task(null, '没有截止日期 🕒 18:30'), new Date(2026, 9, 19)), false);
    for (const invalid of ['24:00', '18:60', '8:30', '18:30:45']) {
        assert.equal(core.isOverdue(task('2026-10-18', '无效时刻 🕒 ' + invalid), new Date(2026, 9, 18, 23, 59)), false);
    }
});

test('expired tasks leave upcoming counts but stay in source-date unfinished counts', function () {
    const tasks = [
        task('2026-10-18', '已到时刻 🕒 18:30'),
        task('2026-10-18', '稍后 🕒 18:31'),
        task('2026-10-18', '只写日期'),
        task('2026-10-19', '明天 🕒 09:00'),
        task('2026-10-18', '已完成 🕒 18:30', 'DONE'),
        task('2026-10-18', '已取消 🕒 18:30', 'CANCELLED')
    ];
    const counts = core.summarizeTasks(tasks, new Date(2026, 9, 18, 18, 30));
    assert.deepEqual(counts['2026-10-12'], { pending: 4, completed: 1, soon: 0 });
    assert.equal(counts['2026-10-18'].soon, 2);
    assert.equal(counts['2026-10-19'].soon, 1);
});

test('native query expansion preserves scopes and excludes expired times without JavaScript queries', function () {
    const now = new Date(2026, 9, 18, 18, 30);
    const upcoming = core.deadlineQuery('not done\ndue on 2026-10-18\npath includes To do/\nsort by priority', now);
    assert.ok(upcoming.includes('due on 2026-10-18'));
    assert.ok(upcoming.includes('path includes To do/'));
    assert.ok(!upcoming.includes('by function'));
    const expression = upcoming.match(/description regex does not match \/(.+)\//);
    assert.ok(expression, 'Upcoming query must exclude expired times');
    const expired = new RegExp(expression[1]);
    for (let hour = 0; hour < 24; hour++) {
        for (let minute = 0; minute < 60; minute++) {
            const time = String(hour).padStart(2, '0') + ':' + String(minute).padStart(2, '0');
            assert.equal(expired.test('报告 🕒 ' + time), hour * 60 + minute <= 18 * 60 + 30, time);
        }
    }
    assert.equal(expired.test('报告 🕒 18:30:45'), false);
    assert.equal(expired.test('没有时刻'), false);
    assert.equal(core.deadlineQuery('due on 2026-10-19', now), 'due on 2026-10-19');
    assert.ok(core.deadlineQuery('due on 2026-10-17', now).includes('description regex matches /^$/'));
    const overdue = core.deadlineQuery('due before today', now);
    assert.ok(overdue.includes('(due before today) OR'));
    assert.ok(overdue.includes('due on today'));
    assert.ok(overdue.includes('description regex matches'));
    const pending = core.deadlineQuery('(no due date) OR (due on or after today)', now);
    assert.ok(pending.includes('no due date'));
    assert.ok(pending.includes('due after today'));
    assert.ok(pending.includes('description regex does not match'));
});
