const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const core = require('./core');

// Read the installed Obsidian runtime; do not add a second Moment version to the plugin.
function readMoment() {
    const archive = process.env.OBSIDIAN_ASAR;
    assert.ok(archive, 'Set OBSIDIAN_ASAR to the installed Obsidian application archive');
    const data = fs.readFileSync(archive);
    const header = JSON.parse(data.subarray(16, 16 + data.readUInt32LE(12)).toString());
    const entry = header.files.lib.files['moment.min.js'];
    const start = 8 + data.readUInt32LE(4) + Number(entry.offset);
    return data.subarray(start, start + entry.size).toString();
}

async function run() {
    const browser = await chromium.launch({ channel: 'msedge', headless: true });
    try {
        const page = await browser.newPage({ timezoneId: 'Asia/Shanghai' });
        await page.clock.install({ time: new Date('2026-10-18T10:29:59Z') });
        await page.addScriptTag({ content: readMoment() });
        const source = fs.readFileSync(path.join(__dirname, '../obsidian-tasks-plugin/main.js'), 'utf8');
        const result = await page.evaluate(function (sources) {
            const coreModule = { exports: {} };
            new Function('module', sources.core)(coreModule);
            class Dummy {}
            const obsidian = new Proxy({
                Plugin: Dummy, PluginSettingTab: Dummy, Component: Dummy, MarkdownRenderChild: Dummy,
                Platform: { isMobile: false }, getLanguage: function () { return 'en'; },
                moment: window.moment, normalizePath: function (value) { return value; }
            }, { get: function (target, key) { return target[key] || Dummy; } });
            const module = { exports: {} };
            function localRequire(name) { return name === 'obsidian' ? obsidian : {}; }
            // Internal names belong to the installed Tasks 8.6.0 bundle and are used only in this check.
            new Function('require', 'module', sources.tasks + '\nmodule.exports.fixture = { Query: Xi, Task: _e };')(localRequire, module);
            const fixture = module.exports.fixture;
            window.nativeFixture = fixture;
            function parse(line) {
                return fixture.Task.fromLine({
                    line: line, fallbackDate: null,
                    taskLocation: { path: 'To do/2026-10-12.md', tasksFile: { path: 'To do/2026-10-12.md' }, lineNumber: 0, sectionStart: 0, sectionIndex: 0 }
                });
            }
            const cached = parse('- [ ] 已缓存任务 📅 2026-10-18 🕒 18:30');
            const before = cached.due.format('YYYY-MM-DD');
            const parent = {};
            const children = [{}];
            cached.parent = parent;
            cached.children = children;
            const pluginModule = { exports: {} };
            new Function('require', 'module', sources.main)(localRequire, pluginModule);
            const plugin = new pluginModule.exports();
            let notifications = 0;
            plugin.app = {
                plugins: { getPlugin: function () { return { getTasks: function () { return [cached]; } }; } },
                workspace: { trigger: function () { notifications++; } }
            };
            plugin.ensureDeadlineCompatibility();
            plugin.ensureDeadlineCompatibility();
            window.compatibilityProof = {
                before: before, after: cached.due.format('YYYY-MM-DD'),
                original: cached.originalMarkdown, hierarchyPreserved: cached.parent === parent && cached.children === children,
                notifications: notifications
            };
            window.restoreDeadlineCompatibility = plugin.restoreDeadlineCompatibility;
            window.nativeDeadlineTasks = [
                parse('- [ ] 报告 📅 2026-10-18 🕒 18:30'),
                parse('- [ ] 晚些 🕒 18:31 📅 2026-10-18'),
                parse('- [ ] 全天 📅 2026-10-18'),
                parse('- [ ] 昨天 📅 2026-10-17'),
                parse('- [ ] 明天 🕒 09:00 📅 2026-10-19'),
                parse('- [ ] 无期限 🕒 18:30')
            ];
            return window.nativeDeadlineTasks.map(function (task) { return { description: task.description, due: task.due.format('YYYY-MM-DD'), saved: task.toFileLineString() }; });
        }, { tasks: source, core: fs.readFileSync(path.join(__dirname, 'core.js'), 'utf8'), main: fs.readFileSync(path.join(__dirname, 'main.js'), 'utf8') });
        assert.deepEqual(await page.evaluate(function () { return window.compatibilityProof; }), {
            before: '', after: '2026-10-18', original: '- [ ] 已缓存任务 📅 2026-10-18 🕒 18:30', hierarchyPreserved: true, notifications: 1
        });
        assert.equal(result[0].due, '2026-10-18');
        assert.ok(result[0].description.includes('🕒 18:30'));
        assert.ok(result[0].saved.includes('🕒 18:30'));
        assert.ok(result[0].saved.includes('📅 2026-10-18'));
        assert.ok(result[0].saved.includes('📅 2026-10-18 🕒 18:30'));
        assert.equal(result[1].due, '2026-10-18');
        for (const minute of [29, 30, 31]) {
            await page.clock.setSystemTime(new Date('2026-10-18T10:' + minute + ':59Z'));
            const now = new Date(2026, 9, 18, 18, minute, 59);
            for (const base of ['due on today', 'due before today', '(no due date) OR (due on or after today)', 'due on 2026-10-17']) {
                const query = 'not done\npath includes To do/\n' + core.deadlineQuery(base, now);
                const native = await page.evaluate(function (query) {
                    const parsed = new window.nativeFixture.Query(query);
                    if (parsed.error) { return { error: parsed.error }; }
                    const result = parsed.applyQueryToTasks(window.nativeDeadlineTasks);
                    return { error: result.searchErrorMessage, count: result.totalTasksCountBeforeLimit };
                }, query);
                assert.equal(native.error, undefined, query + '\n' + native.error);
                let expected = 0;
                if (base === 'due on today') { expected = minute === 29 ? 3 : minute === 30 ? 2 : 1; }
                if (base === 'due before today') { expected = minute === 29 ? 1 : minute === 30 ? 2 : 3; }
                if (base.startsWith('(no due date)')) { expected = minute === 29 ? 5 : minute === 30 ? 4 : 3; }
                assert.equal(native.count, expected, base + ' at 18:' + minute);
            }
        }
        const notes = ['../../../总览/任务总览.md', '../../../Templates/Weekly-Template.md', '../../../Templates/Daily-Template.md'];
        let checkedQueries = 0;
        for (const note of notes) {
            const content = fs.readFileSync(path.join(__dirname, note), 'utf8');
            for (const block of content.matchAll(/```tasks-fold\r?\n([\s\S]*?)```/g)) {
                const now = new Date(2026, 9, 18, 18, 31);
                const resolved = core.resolveQuery(block[1], '2026-10-18', 'To do/2026-10-18.md');
                const query = core.deadlineQuery(resolved, now);
                const error = await page.evaluate(function (query) {
                    const parsed = new window.nativeFixture.Query(query);
                    if (parsed.error) { return parsed.error; }
                    return parsed.applyQueryToTasks(window.nativeDeadlineTasks).searchErrorMessage;
                }, query);
                assert.equal(error, undefined, note + '\n' + query + '\n' + error);
                checkedQueries++;
            }
        }
        assert.equal(checkedQueries, 11);
        const saved = await page.evaluate(function () {
            const task = window.nativeDeadlineTasks[0];
            const completed = task.toggle()[0];
            const line = completed.toFileLineString();
            const parsed = window.nativeFixture.Task.fromLine({ line: line, taskLocation: task.taskLocation, fallbackDate: null });
            const edited = window.nativeFixture.Task.fromLine({ line: line.replace('📅 2026-10-18', '📅 2026-10-21'), taskLocation: task.taskLocation, fallbackDate: null });
            const result = { line: line, due: parsed.due.format('YYYY-MM-DD'), done: parsed.done.format('YYYY-MM-DD'), edited: edited.toFileLineString() };
            window.restoreDeadlineCompatibility();
            result.restored = window.nativeFixture.Task.fromLine({ line: '- [ ] 检查 📅 2026-10-21 🕒 18:30', taskLocation: task.taskLocation, fallbackDate: null }).due.format('YYYY-MM-DD');
            return result;
        });
        assert.ok(saved.line.includes('📅 2026-10-18 🕒 18:30'));
        assert.equal(saved.due, '2026-10-18');
        assert.equal(saved.done, '2026-10-18');
        assert.ok(saved.edited.includes('📅 2026-10-21 🕒 18:30'));
        assert.equal(saved.restored, '');
        console.log('PASS: installed Tasks 8.6.0 cache repair, time after date, checkbox completion/edit round trips, and all 11 native queries. Headless runtime check only.');
    } finally { await browser.close(); }
}

run().catch(function (error) { console.error(error); process.exitCode = 1; });
