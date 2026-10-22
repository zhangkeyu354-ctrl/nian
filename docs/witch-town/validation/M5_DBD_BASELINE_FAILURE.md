# M5 其他游戏回归阻塞对照

2026-10-22。未修改黎明杀机逻辑或验收脚本。

当前版本与合并基线356a4be均在 scripts/verify-lan-browsers.ts 的1701回放命令141失败：SELECT jake scrapyard:survival:1，期望版本142、实际143，8秒超时。当前版此前4111通过。

基线构建目录：C:/Users/Lenovo/AppData/Local/Temp/wt-m5-merge-baseline-356a4be。共享前端main.tsx/style.css取自git show 356a4be；未引用M5女巫镇UI，其余DBD代码与合并基线相同。产物CSS index-Bp9TytG4.css与合并构建一致。通过DBD_WEB_DIR指定该独立产物，使用原脚本复跑1701，得到相同失败。

这证明失败在未加入M5 UI的基线也存在；具体根因尚未裁定，不能把它称作已修复或全部回归通过。

## 当前版日志末尾

```text
C:\Users\Lenovo\Documents\codex\2026-10-22\4-12-4-12-4-12\work\nian-witch-town\scripts\verify-lan-browsers.ts:177
            throw new Error(
                  ^

Error: 命令 141 未同步到所有浏览器：{"type":"SELECT","actorId":"jake","propId":"scrapyard:survival:1"} 当前 {"room":"79FY","seat":"dwight","waiting":true,"version":143}
    at <anonymous> (C:\Users\Lenovo\Documents\codex\2026-10-22\4-12-4-12-4-12\work\nian-witch-town\scripts\verify-lan-browsers.ts:177:19)

Node.js v24.14.0

```

## 基线日志末尾

```text
C:\Users\Lenovo\Documents\codex\2026-10-22\4-12-4-12-4-12\work\nian-witch-town\scripts\verify-lan-browsers.ts:177
            throw new Error(
                  ^

Error: 命令 141 未同步到所有浏览器：{"type":"SELECT","actorId":"jake","propId":"scrapyard:survival:1"} 当前 {"room":"RVYJ","seat":"dwight","waiting":true,"version":143}
    at <anonymous> (C:\Users\Lenovo\Documents\codex\2026-10-22\4-12-4-12-4-12\work\nian-witch-town\scripts\verify-lan-browsers.ts:177:19)

Node.js v24.14.0

```
