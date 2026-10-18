const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('date navigation creates the selected date and never overwrites existing daily or weekly notes', async function () {
    const source = fs.readFileSync(path.join(__dirname, 'main.js'), 'utf8');
    assert.ok(!source.includes("require('./core')"));
    const target = { exports: {} };
    class Component {}
    class Notice { constructor(message) { throw new Error(message); } }
    function loadObsidian(name) {
        assert.equal(name, 'obsidian');
        return { Plugin: Component, Component: Component, MarkdownRenderChild: Component, PluginSettingTab: Component, Modal: Component, MarkdownRenderer: {}, Notice: Notice };
    }
    new Function('require', 'module', source)(loadObsidian, target);
    const plugin = new target.exports();
    const files = new Map();
    files.set('总览', { path: '总览' });
    files.set('Templates/Daily-Template.md', { path: 'Templates/Daily-Template.md' });
    files.set('Templates/Weekly-Template.md', { path: 'Templates/Weekly-Template.md' });
    const creations = [];
    const opened = [];
    plugin.app = {
        vault: {
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
        workspace: { getLeaf: function () { return { openFile: async function (file) { opened.push(file.path); } }; } }
    };
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
