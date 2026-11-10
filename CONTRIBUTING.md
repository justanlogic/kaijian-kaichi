# Contributing

感谢愿意花时间改进开健开吃。这个项目没有构建步骤，改完刷新就能看到效果。

## 本地运行

```bash
git clone https://github.com/justanlogic/kaijian-kaichi.git
cd kaijian-kaichi
python3 -m http.server 4173
# http://127.0.0.1:4173/
```

需要 HTTPS 或 localhost 才能启用 Service Worker；`file://` 下不可用。

## 改完之后

至少跑一遍食物库自检：

```bash
node scripts/check-foods.mjs
```

再手动检查：

- 记录 / 编辑 / 删除撤销 / 复制昨天 / 模板
- 导入一份坏 JSON，确认不会覆盖本地数据
- 360 / 390 / 1024 / 1440 四档宽度无横向溢出
- 断网重载仍能打开
- 控制台无报错

## 食物数据

新增或修改食物前，请先读 [docs/food-data.md](docs/food-data.md)。

最低要求：

1. 名称遵循「主体名 + 必要状态」，品牌写进 `alias`，不写进口味修饰；
2. 每 100g（饮品每 100ml）热量 / 蛋白质 / 碳水 / 脂肪；
3. 写清来源：成分表条目、品牌营养表链接、或参照数据与校正方式；
4. 跑 `node scripts/check-foods.mjs`，确认无重复、无分类错误；
5. 数量变化时同步更新 README 与 docs/food-data.md 的分类表。

## 代码约定

- 原生 ES Modules，不引入框架与运行时依赖；
- 用户输入渲染前必须经过 `esc()`；
- 新增静态资源要同步加入 `sw.js` 的 `ASSETS`，并提升 `VERSION`；
- 样式集中在 `assets/styles.css`，优先复用 CSS 变量与现有组件；
- 数据写入统一走 `store.actions`，不要在页面里直接改 localStorage；
- 保持深色 / 浅色两套主题都能看。

## 提交与 PR

- 一个 PR 只做一件事；功能、重构、格式化分开；
- 提交信息写清“改了什么、为什么”；
- PR 描述里附：改动点、验证方式、截图（UI 改动）、是否影响旧数据；
- 不要提交个人健康数据、真实记录、令牌或任何密钥。

## 隐私

- 不要在 Issue / PR / 截图中粘贴真实体重、体脂、饮食记录；
- 演示数据请用 `?demo=1` 或自造的假数据；
- `js/cloud-config.js` 里的 `publishableKey` 是设计为公开下发的客户端标识，但仍不要添加其他密钥。

## License

提交即表示同意以 [MIT](LICENSE) 许可发布你的贡献。
