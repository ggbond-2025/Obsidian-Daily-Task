const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');

async function run() {
    const entry = path.join(__dirname, 'main.js');
    assert.ok(fs.existsSync(entry), 'Foldable Tasks renderer has not been implemented');
    const browser = await chromium.launch({ channel: 'msedge', headless: true });
    try {
        const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, timezoneId: 'Asia/Shanghai' });
        await page.clock.install({ time: new Date('2026-10-18T10:29:00Z') });
        page.setDefaultTimeout(8000);
        const errors = [];
        page.on('pageerror', function (error) { errors.push(error.message); });
        await page.setContent('<html lang="zh-CN"><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><main><h1>任务总览 · 展示验证</h1><h2>待办任务</h2><div id="fold"></div><h2>月历 / 周历</h2><div id="calendar"></div></main></body></html>');
        await page.addStyleTag({ content: 'body{font:16px system-ui;margin:24px;background:#faf9f6;color:#292b2c}main{max-width:1100px;margin:auto}button{font:inherit;cursor:pointer}a{color:#526b9c}ul{padding-left:24px}h1{font-size:28px}h2{font-size:20px}' });
        await page.addStyleTag({ content: fs.readFileSync(path.join(__dirname, 'styles.css'), 'utf8') });
        await page.evaluate(function (sources) {
            const coreModule = { exports: {} };
            new Function('module', sources.core)(coreModule);
            const core = coreModule.exports;
            class Component {
                constructor() { this.children = []; this.cleanups = []; }
                addChild(child) { this.children.push(child); child.load(); return child; }
                removeChild(child) { child.unload(); this.children = this.children.filter(function (item) { return item !== child; }); }
                register(cleanup) { this.cleanups.push(cleanup); }
                registerEvent() {}
                load() { if (this.onload) { this.onload(); } }
                unload() { for (const child of this.children) { child.unload(); } for (const cleanup of this.cleanups) { cleanup(); } if (this.onunload) { this.onunload(); } }
            }
            class RenderChild extends Component { constructor(element) { super(); this.containerEl = element; } }
            class Plugin extends Component {
                constructor() { super(); this.processors = {}; this.commands = {}; this.manifest = { version: '1.5.0' }; }
                registerMarkdownCodeBlockProcessor(name, callback) { this.processors[name] = callback; }
                addCommand(command) { this.commands[command.id] = command; }
                addRibbonIcon(icon, title, callback) { this.ribbon = { icon: icon, title: title, click: callback }; }
                addSettingTab(tab) { this.settingsTab = tab; }
                registerObsidianProtocolHandler() {}
            }
            class SettingsTab extends Component {
                constructor(app) { super(); this.app = app; this.containerEl = document.createElement('div'); }
            }
            class Modal extends Component {
                constructor(app) {
                    super(); this.app = app;
                    this.modalEl = document.createElement('div'); this.modalEl.className = 'modal';
                    this.contentEl = document.createElement('div'); this.modalEl.append(this.contentEl);
                }
                open() { document.body.append(this.modalEl); this.onOpen(); }
                close() { this.modalEl.remove(); }
            }
            window.fixtureCount = 8;
            const today = core.dateKey(new Date());
            const tomorrow = core.addDays(today, 1);
            const yesterday = core.addDays(today, -1);
            const nativeTasks = [];
            for (let index = 0; index < 8; index++) {
                nativeTasks.push({ file: { path: 'To do/' + today + '.md' }, status: { type: 'TODO' }, description: '示例任务 ' + index, due: { moment: index < 2 ? {} : null, format: function () { return today; } } });
            }
            for (let index = 0; index < 2; index++) {
                nativeTasks.push({ file: { path: 'To do/' + today + '.md' }, status: { type: 'DONE' }, description: '已完成任务 ' + index, due: { moment: null } });
            }
            nativeTasks[1].description += ' 🕒 18:30';
            nativeTasks.push({ file: { path: 'To do/' + yesterday + '.md' }, status: { type: 'TODO' }, description: '之前记录今天截止', due: { moment: {}, format: function () { return today; } } });
            nativeTasks.push({ file: { path: 'To do/' + yesterday + '.md' }, status: { type: 'TODO' }, description: '之前记录明天截止', due: { moment: {}, format: function () { return tomorrow; } } });
            const events = {};
            window.nativeTasks = nativeTasks;
            window.fixtureEvents = events;
            const renderer = {
                render: async function (app, text, element) {
                    element.replaceChildren();
                    let count = window.fixtureCount;
                    if (element.parentElement.id === 'deadline-query' || element.parentElement.id === 'overdue-query') {
                        const pattern = text.match(/description regex (?:does not match|matches) \/(.+)\//);
                        const expired = new RegExp(pattern[1]).test('报告 🕒 18:30');
                        count = element.parentElement.id === 'deadline-query' ? (expired ? 0 : 1) : (expired ? 1 : 0);
                    }
                    if (text.includes(tomorrow)) { count = 2; }
                    const grouped = text.includes('group by filename');
                    for (let group = 0; group < (grouped ? 2 : 1); group++) {
                        if (grouped) {
                            const heading = document.createElement('h4');
                            heading.className = 'tasks-group-heading';
                            heading.textContent = group === 0 ? today : tomorrow;
                            element.append(heading);
                        }
                        const list = document.createElement('ul');
                        list.className = 'plugin-tasks-query-result';
                        element.append(list);
                        const start = group === 0 ? 0 : Math.min(5, count);
                        const end = group === 0 && grouped ? Math.min(5, count) : count;
                        for (let index = start; index < end; index++) {
                            const item = document.createElement('li');
                            item.className = 'task-list-item';
                            item.innerHTML = '<input type="checkbox" aria-label="完成任务"> <span>示例任务 ' + (index + 1) + '</span>';
                            if (element.parentElement.id === 'deadline-query' || element.parentElement.id === 'overdue-query') {
                                item.innerHTML = '<input type="checkbox" aria-label="完成任务"> <span class="task-description">报告 🕒 18:30</span><span class="task-due">📅 ' + today + '</span>';
                            }
                            item.querySelector('input').addEventListener('change', function () { item.remove(); });
                            list.append(item);
                        }
                    }
                }
            };
            const pluginModule = { exports: {} };
            function localRequire(name) {
                if (name === './core') { return core; }
                return { Plugin: Plugin, Component: Component, MarkdownRenderChild: RenderChild, PluginSettingTab: SettingsTab, Modal: Modal, MarkdownRenderer: renderer, Notice: class {} };
            }
            new Function('require', 'module', sources.main)(localRequire, pluginModule);
            const plugin = new pluginModule.exports();
            plugin.app = {
                plugins: { getPlugin: function () { return { getState: function () { return 'Warm'; }, getTasks: function () { return nativeTasks; } }; } },
                vault: {
                    getAbstractFileByPath: function (file) { if (file === 'To do/' + today + '.md' || file === 'To do/' + tomorrow + '.md') { return { path: file, extension: 'md' }; } return null; },
                    on: function () { return {}; }
                },
                workspace: { onLayoutReady: function (callback) { window.layoutReadyHandler = callback; }, on: function (name, callback) { events[name] = callback; return {}; }, getLeaf: function () { return { openFile: async function () {} }; } }
            };
            plugin.onload();
            plugin.settingsTab.display();
            window.settingContent = plugin.settingsTab.containerEl.textContent;
            const context = { sourcePath: '总览/任务总览.md', children: [], addChild: function (child) { this.children.push(child); child.load(); } };
            window.testPlugin = plugin;
            window.testContext = context;
            window.yesterday = yesterday;
            window.tomorrow = tomorrow;
            plugin.processors['tasks-fold']('not done\ngroup by filename', document.querySelector('#fold'), context);
            plugin.processors['todo-calendar']('', document.querySelector('#calendar'), context);
        }, { core: fs.readFileSync(path.join(__dirname, 'core.js'), 'utf8'), main: fs.readFileSync(entry, 'utf8') });
        const fold = page.locator('#fold');
        await fold.locator('.daily-todo-more').waitFor();
        assert.equal(await fold.locator('li.task-list-item:not(.daily-todo-hidden)').count(), 5);
        assert.equal(await fold.locator('.tasks-group-heading.daily-todo-hidden').count(), 1);
        await fold.locator('.daily-todo-more').click();
        assert.equal(await fold.locator('li.task-list-item:not(.daily-todo-hidden)').count(), 8);
        assert.equal(await fold.locator('.daily-todo-more').getAttribute('aria-expanded'), 'true');
        await fold.locator('.daily-todo-more').click();
        assert.equal(await fold.locator('li.task-list-item:not(.daily-todo-hidden)').count(), 5);
        await fold.locator('.daily-todo-more').focus();
        await page.keyboard.press('Space');
        assert.equal(await fold.locator('li.task-list-item:not(.daily-todo-hidden)').count(), 8);
        await page.keyboard.press('Space');
        await fold.locator('li.task-list-item:not(.daily-todo-hidden) input').first().click();
        await page.waitForFunction(function () { return document.querySelectorAll('#fold li.task-list-item:not(.daily-todo-hidden)').length === 5; });
        assert.equal(await fold.locator('li.task-list-item').count(), 7);
        assert.equal(await page.locator('.daily-todo-day').count(), 42);
        assert.equal(await page.locator('#calendar li.task-list-item').count(), 0);
        assert.equal(await page.locator('#calendar .is-today .is-pending dd').textContent(), '8');
        assert.equal(await page.locator('#calendar .is-today .is-completed dd').textContent(), '2');
        assert.equal(await page.locator('#calendar .is-today .is-soon dd').textContent(), '3');
        assert.equal(await page.locator('#calendar .is-today .is-pending dt').textContent(), '待完成');
        const yesterday = await page.evaluate(function () { return window.yesterday; });
        const tomorrow = await page.evaluate(function () { return window.tomorrow; });
        assert.equal(await page.locator('#calendar section[aria-label="' + yesterday + '"] .is-soon').count(), 0);
        assert.equal(await page.locator('#calendar section[aria-label="' + tomorrow + '"] .is-soon dd').textContent(), '1');
        assert.ok((await page.evaluate(function () { return window.settingContent; })).includes('本地插件已加载，版本 1.5.0'));
        assert.equal(await page.evaluate(function () { return typeof window.layoutReadyHandler; }), 'function');
        assert.equal(await page.evaluate(function () { return typeof window.fixtureEvents['file-open']; }), 'function');
        const size = await page.locator('#calendar .is-today').boundingBox();
        assert.ok(size.height / size.width < 1.2, 'Date cells should stay compact');
        await page.evaluate(function () {
            window.nativeTasks[0].status.type = 'DONE';
            window.fixtureEvents['obsidian-tasks-plugin:cache-update']();
        });
        await page.waitForFunction(function () { return document.querySelector('#calendar .is-today .is-pending dd').textContent === '7'; });
        assert.equal(await page.locator('#calendar .is-today .is-completed dd').textContent(), '3');
        assert.equal(await page.locator('#calendar .is-today .is-soon dd').textContent(), '2');
        await page.evaluate(function () {
            for (const name of ['deadline-query', 'overdue-query']) {
                const container = document.createElement('div');
                container.id = name;
                document.body.append(container);
                const query = name === 'deadline-query' ? 'not done\ndue on {{daily.date}}' : 'not done\ndue before today';
                window.testPlugin.processors['tasks-fold'](query, container, window.testContext);
            }
        });
        assert.equal(await page.locator('#deadline-query li.task-list-item').count(), 1);
        assert.equal(await page.locator('#deadline-query .task-due + .daily-todo-deadline-time').textContent(), ' 🕒 18:30');
        assert.ok(!(await page.locator('#deadline-query .task-description').textContent()).includes('🕒'));
        assert.equal(await page.locator('#overdue-query li.task-list-item').count(), 0);
        await page.clock.fastForward(60000);
        await page.waitForFunction(function () { return document.querySelectorAll('#deadline-query li.task-list-item').length === 0; });
        assert.equal(await page.locator('#overdue-query li.task-list-item').count(), 1);
        assert.equal(await page.locator('#calendar .is-today .is-soon dd').textContent(), '1');
        await page.getByRole('button', { name: '周历', exact: true }).click();
        assert.equal(await page.locator('.daily-todo-day').count(), 7);
        await page.getByRole('button', { name: '下一周', exact: true }).click();
        assert.equal(await page.locator('.daily-todo-day').count(), 7);
        await page.getByRole('button', { name: '本日', exact: true }).click();
        await page.getByRole('button', { name: '月历', exact: true }).click();
        const artifacts = path.join(__dirname, 'test-artifacts');
        fs.mkdirSync(artifacts, { recursive: true });
        await page.screenshot({ path: path.join(artifacts, 'desktop.png'), fullPage: true });
        await page.setViewportSize({ width: 390, height: 844 });
        const overflow = await page.locator('#calendar .daily-todo-day').evaluateAll(function (cells) {
            const failures = [];
            for (const cell of cells) {
                const bounds = cell.getBoundingClientRect();
                const next = cell.nextElementSibling;
                if (next) {
                    const nextBounds = next.getBoundingClientRect();
                    if (Math.abs(bounds.top - nextBounds.top) < 1 && bounds.right > nextBounds.left) {
                        failures.push({ overlap: cell.getAttribute('aria-label'), right: bounds.right, nextLeft: nextBounds.left });
                    }
                }
                for (const number of cell.querySelectorAll('dd')) {
                    const rect = number.getBoundingClientRect();
                    if (rect.right > bounds.right || rect.left < bounds.left) {
                        failures.push({ date: cell.getAttribute('aria-label'), cell: { left: bounds.left, right: bounds.right }, number: { left: rect.left, right: rect.right } });
                    }
                }
            }
            return failures;
        });
        assert.deepEqual(overflow, [], 'Each statistic must stay inside its date card');
        await page.screenshot({ path: path.join(artifacts, 'mobile.png'), fullPage: true });
        assert.equal(await page.evaluate(function () { return document.documentElement.scrollWidth > window.innerWidth; }), false);
        await page.evaluate(function () {
            const rows = document.querySelectorAll('#fold li.task-list-item');
            for (let index = 0; index < 4; index++) { rows[index].remove(); }
        });
        await page.waitForFunction(function () { return document.querySelector('#fold .daily-todo-more').hidden; });
        assert.equal(await fold.locator('li.task-list-item:not(.daily-todo-hidden)').count(), 3);
        await page.evaluate(function () {
            const fixed = document.createElement('div');
            fixed.id = 'fixed-week';
            document.body.append(fixed);
            window.testPlugin.processors['todo-calendar']('week: 2026-10-12', fixed, window.testContext);
        });
        assert.equal(await page.locator('#fixed-week .daily-todo-day').count(), 7);
        assert.equal(await page.locator('#fixed-week .daily-todo-day').first().getAttribute('aria-label'), '2026-10-12');
        assert.equal(await page.locator('#fixed-week .daily-todo-day').last().getAttribute('aria-label'), '2026-10-18');
        assert.equal(await page.locator('#fixed-week .daily-todo-controls').count(), 0);
        await page.addStyleTag({ content: '.modal{position:fixed;inset:24px 12px auto;background:#fff;padding:18px;box-sizing:border-box;max-height:calc(100vh - 48px);overflow:auto;box-shadow:0 8px 40px #0005}' });
        await page.evaluate(function () {
            window.deadlineLine = '- [ ] 报告 #学习 ⏳ 2026-10-19 📅 2026-10-21 🕒 18:30';
            window.deadlineWrites = 0;
            window.deadlineEditor = {
                getCursor: function () { return { line: 0, ch: 5 }; },
                getLine: function () { return window.deadlineLine; },
                replaceRange: function (line) { window.deadlineLine = line; window.deadlineWrites++; }
            };
            window.openDeadlinePicker = function () { window.testPlugin.commands['edit-deadline'].editorCheckCallback(false, window.deadlineEditor); };
            window.openDeadlinePicker();
        });
        const picker = page.locator('.daily-todo-deadline-modal');
        assert.equal(await picker.getByLabel('截止日期', { exact: true }).inputValue(), '2026-10-21');
        assert.equal(await picker.getByLabel('手动输入时间', { exact: true }).inputValue(), '18:30');
        await picker.getByLabel('小时', { exact: true }).selectOption('20');
        await picker.getByLabel('分钟', { exact: true }).selectOption('45');
        assert.equal(await picker.getByLabel('手动输入时间', { exact: true }).inputValue(), '20:45');
        await picker.getByRole('button', { name: '保存', exact: true }).click();
        assert.equal(await picker.count(), 0);
        assert.ok((await page.evaluate(function () { return window.deadlineLine; })).includes('📅 2026-10-21 🕒 20:45'));
        await page.evaluate(function () { window.openDeadlinePicker(); });
        await picker.getByLabel('截止日期', { exact: true }).fill('2026-10-22');
        await picker.getByLabel('手动输入时间', { exact: true }).fill('07:05');
        assert.equal(await picker.getByLabel('小时', { exact: true }).inputValue(), '07');
        assert.equal(await picker.getByLabel('分钟', { exact: true }).inputValue(), '05');
        await picker.screenshot({ path: path.join(artifacts, 'deadline-picker-mobile.png') });
        assert.equal(await picker.evaluate(function (element) { return element.scrollWidth > element.clientWidth; }), false);
        await picker.getByRole('button', { name: '保存', exact: true }).click();
        assert.ok((await page.evaluate(function () { return window.deadlineLine; })).includes('📅 2026-10-22 🕒 07:05'));
        await page.evaluate(function () { window.openDeadlinePicker(); });
        await picker.getByLabel('手动输入时间', { exact: true }).fill('25:00');
        await picker.getByRole('button', { name: '保存', exact: true }).click();
        assert.ok((await picker.getByRole('alert').textContent()).includes('HH:mm'));
        assert.equal(await page.evaluate(function () { return window.deadlineWrites; }), 2);
        await picker.getByRole('button', { name: '取消', exact: true }).click();
        await page.evaluate(function () { window.openDeadlinePicker(); });
        await picker.getByRole('button', { name: '清除时间', exact: true }).click();
        await picker.getByRole('button', { name: '保存', exact: true }).click();
        assert.ok(!(await page.evaluate(function () { return window.deadlineLine; })).includes('🕒'));
        assert.ok((await page.evaluate(function () { return window.deadlineLine; })).includes('#学习 ⏳ 2026-10-19'));
        await page.evaluate(function () { window.openDeadlinePicker(); window.deadlineLine += ' 新改动'; });
        await picker.getByRole('button', { name: '保存', exact: true }).click();
        assert.ok((await picker.getByRole('alert').textContent()).includes('已被修改'));
        assert.equal(await page.evaluate(function () { return window.deadlineWrites; }), 3);
        await picker.getByRole('button', { name: '取消', exact: true }).click();
        assert.equal(await page.evaluate(function () { return typeof window.fixtureEvents['editor-menu']; }), 'function');
        const menuTitle = await page.evaluate(function () {
            const item = {
                setTitle: function (title) { this.title = title; return this; },
                setIcon: function () { return this; },
                onClick: function (callback) { this.click = callback; return this; }
            };
            window.fixtureEvents['editor-menu']({ addItem: function (callback) { callback(item); } }, window.deadlineEditor);
            item.click();
            return item.title;
        });
        assert.equal(menuTitle, '设置截止日期与时间');
        assert.equal(await picker.count(), 1);
        await picker.getByRole('button', { name: '取消', exact: true }).click();
        assert.deepEqual(errors, []);
        await page.evaluate(function () { for (const child of window.testContext.children) { child.unload(); } });
        console.log('PASS: calendar and minute refresh; deadline picker selection/manual input, validation, clearing, cancel, stale-edit protection and mobile width. Synthetic browser fixture only; not Obsidian acceptance.');
    } finally {
        await browser.close();
    }
}
run().catch(function (error) { console.error(error); process.exitCode = 1; });
