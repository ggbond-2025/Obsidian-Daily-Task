# 📅 {{week.start}} 周总览
[[总览/任务总览|任务总览]] · [打开 / 创建本周总览](obsidian://daily-todo-views?vault=%E6%AF%8F%E6%97%A5%E5%BE%85%E5%8A%9E&view=week)

> [!info] 固定周范围
> {{week.start}} 至 {{week.end}}（周一至周日），按每日笔记文件日期限定。以后打开仍是这一周。

## 🎯 今日任务
[打开 / 创建今日待办](obsidian://daily?vault=%E6%AF%8F%E6%97%A5%E5%BE%85%E5%8A%9E)

```tasks-fold
path regex matches /{{week.pathRegex}}/
description regex does not match /^\s*$/
not done
path includes {{today.file}}
sort by priority
```

## 📥 待办任务
```tasks-fold
path regex matches /{{week.pathRegex}}/
description regex does not match /^\s*$/
not done
(no due date) OR (due on or after today)
group by filename
sort by filename
sort by due
```

## 🔥 今日到期任务
```tasks-fold
path regex matches /{{week.pathRegex}}/
description regex does not match /^\s*$/
not done
due on today
sort by priority
```

## ⚠️ 逾期任务
```tasks-fold
path regex matches /{{week.pathRegex}}/
description regex does not match /^\s*$/
not done
due before today
group by filename
sort by filename
sort by due
```

## ✅ 今日完成
```tasks-fold
path regex matches /{{week.pathRegex}}/
description regex does not match /^\s*$/
done on today
group by filename
sort by filename
```

## 🗓️ 本周任务日历
待完成和已完成按笔记日期统计；即将截止跨所有每日笔记按截止日期统计，包含之前其他周记录但尚未到截止时间的任务，只在今天及未来日期显示。
```todo-calendar
week: {{week.start}}
```
