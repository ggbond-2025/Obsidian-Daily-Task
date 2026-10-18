const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function dailyFixture() {
    const source = fs.readFileSync(path.join(__dirname, 'main.js'), 'utf8');
    assert.ok(!source.includes("require('./core')"));
    const target = { exports: {} };
    class Component {
        addCommand() {}
        registerEvent() {}
        register() {}
        addSettingTab() {}
        registerMarkdownCodeBlockProcessor() {}
        registerObsidianProtocolHandler() {}
        addRibbonIcon(icon, title, callback) {
            this.ribbon = { icon: icon, title: title, click: callback };
        }
    }
    class Notice { constructor(message) { throw new Error(message); } }
    function loadObsidian(name) {
        assert.equal(name, 'obsidian');
        return { Plugin: Component, Component: Component, MarkdownRenderChild: Component, PluginSettingTab: Component, Modal: Component, MarkdownRenderer: {}, Notice: Notice };
    }
    const window = { setInterval: function () {}, clearInterval: function () {} };
    new Function('require', 'module', 'window', source)(loadObsidian, target, window);
    const plugin = new target.exports();
    const files = new Map();
    files.set('总览', { path: '总览' });
    files.set('Templates/Daily-Template.md', { path: 'Templates/Daily-Template.md' });
    files.set('Templates/Weekly-Template.md', { path: 'Templates/Weekly-Template.md' });
    const creations = [];
    const opened = [];
    plugin.app = {
        vault: {
            on: function () {},
            getAbstractFileByPath: function (file) { return files.get(file); },
            read: async function (file) {
                if (file.path === 'Templates/Weekly-Template.md') {
                    return fs.readFileSync(path.join(__dirname, '../../../Templates/Weekly-Template.md'), 'utf8') + '\n从周模板读取的自定义内容';
                }
                return '# {{date:YYYY-MM-DD}} 每日计划\n- [ ] \n';
            },
            createFolder: async function (folder) { assert.equal(files.has(folder), false); files.set(folder, { path: folder }); },
            create: async function (file, content) {
                assert.equal(files.has(file), false);
                const created = { path: file, content: content };
                files.set(file, created);
                creations.push(created);
                return created;
            }
        },
        workspace: {
            on: function () {},
            onLayoutReady: function () {},
            getLeaf: function () { return { openFile: async function (file) { opened.push(file.path); } }; }
        },
        plugins: { getPlugin: function () { return null; } }
    };
    return { plugin: plugin, files: files, creations: creations, opened: opened };
}

test('date navigation creates the selected date and never overwrites existing daily or weekly notes', async function () {
    const { plugin, files, creations, opened } = dailyFixture();
    await plugin.openDaily('2026-10-19');
    await plugin.openDaily('2026-10-19');
    assert.equal(creations.length, 2);
    assert.equal(creations[0].path, '总览/周任务总览/2026-10-19 周总览.md');
    assert.ok(creations[0].content.includes('从周模板读取的自定义内容'));
    assert.ok(creations[1].content.includes('# 2026-10-19 每日计划'));
    assert.equal(opened.length, 2);
    await plugin.openWeeklySafely();
    await plugin.openWeeklySafely();
    assert.equal(opened[2], opened[3]);
    assert.match(opened[2], /^总览\/周任务总览\/\d{4}-\d{2}-\d{2} 周总览\.md$/);
    assert.ok(creations.every(function (file) { return !file.path.startsWith('总览/2026-'); }));
    const before = creations.length;
    await plugin.ensureCurrentWeekSafely();
    await plugin.ensureCurrentWeekSafely();
    assert.equal(creations.length, before);
    await Promise.all([plugin.ensureWeekly('2026-11-04'), plugin.ensureWeekly('2026-11-06')]);
    assert.equal(creations.length, before + 1);
    assert.ok(files.has('总览/周任务总览/2026-11-02 周总览.md'));
    await plugin.onDailyCreated({ path: 'To do/2026-11-09.md' });
    assert.ok(files.has('总览/周任务总览/2026-11-09 周总览.md'));
});

for (const scenario of [
    { today: '2026-10-18', existing: [], expected: '2026-10-19' },
    { today: '2026-10-18', existing: ['2026-10-19', '2026-10-20'], expected: '2026-10-21' },
    { today: '2026-10-18', existing: ['2026-10-20'], expected: '2026-10-19' },
    { today: '2026-10-31', existing: [], expected: '2026-11-01' },
    { today: '2026-12-31', existing: ['2027-01-01'], expected: '2027-01-02' }
]) {
    test('tomorrow action creates the first missing future note: ' + JSON.stringify(scenario), async function (context) {
        context.mock.timers.enable({ apis: ['Date'], now: new Date(scenario.today + 'T20:00:00') });
        const { plugin, files, creations, opened } = dailyFixture();
        for (const date of scenario.existing) {
            files.set('To do/' + date + '.md', { path: 'To do/' + date + '.md', content: '已有计划' });
        }
        await plugin.createNextDailySafely();
        const daily = creations.filter(function (file) { return file.path.startsWith('To do/'); });
        assert.equal(daily.length, 1);
        assert.equal(daily[0].path, 'To do/' + scenario.expected + '.md');
        assert.ok(daily[0].content.includes('# ' + scenario.expected + ' 每日计划'));
        assert.deepEqual(opened, [daily[0].path]);
        for (const date of scenario.existing) {
            assert.equal(files.get('To do/' + date + '.md').content, '已有计划');
        }
    });
}

test('repeated tomorrow clicks create consecutive notes without a collision', async function (context) {
    context.mock.timers.enable({ apis: ['Date'], now: new Date('2026-10-18T20:00:00') });
    const { plugin, opened } = dailyFixture();
    await Promise.all([plugin.createNextDailySafely(), plugin.createNextDailySafely()]);
    assert.deepEqual(opened, ['To do/2026-10-19.md', 'To do/2026-10-20.md']);
});

test('weekly link still opens the current weekly overview', async function (context) {
    context.mock.timers.enable({ apis: ['Date'], now: new Date('2026-10-18T20:00:00') });
    const { plugin, creations, opened } = dailyFixture();
    await plugin.openWeeklySafely();
    assert.deepEqual(opened, ['总览/周任务总览/2026-10-12 周总览.md']);
    assert.equal(creations.length, 1);
});

test('plugin load adds an independent ribbon button that creates the next missing daily note', async function (context) {
    context.mock.timers.enable({ apis: ['Date'], now: new Date('2026-10-18T20:00:00') });
    const { plugin, files, opened } = dailyFixture();
    files.set('To do/2026-10-19.md', { path: 'To do/2026-10-19.md', content: '明天的计划' });
    plugin.onload();
    assert.ok(plugin.ribbon, '插件加载后应注册左侧工具栏按钮');
    await plugin.ribbon.click();
    assert.deepEqual(opened, ['To do/2026-10-20.md']);
    assert.equal(files.get('To do/2026-10-19.md').content, '明天的计划');
});
