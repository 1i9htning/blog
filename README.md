# Li9htning's Blog

基于 Astro 的静态博客。文章正文与运行时元数据分离，文章地址稳定地使用短 ID，而不是标题或文件名。

## 开发

需要 Node.js 22.12 或更高版本，以及 pnpm 11。

| 命令 | 用途 |
| --- | --- |
| `pnpm install` | 安装依赖 |
| `pnpm dev` | 启动本地开发服务器 |
| `pnpm build` | 构建静态站点到 `dist/` |
| `pnpm preview` | 预览已构建站点 |
| `pnpm new "文章标题"` | 创建一篇新文章及注册表条目 |

## 内容架构

```text
src/content/
├── blog.meta.yml          # 中央文章注册表
└── blog/
    └── <id>/
        ├── index.md       # 纯 Markdown 正文，无 frontmatter
        └── images/        # 文章配图（可选）
```

`<id>` 是唯一的六位小写字母数字串，也是文章 URL：`/blog/<id>/`。标题改动不会改变目录名或 URL。

所有文章元数据都位于 `src/content/blog.meta.yml` 的 `posts.<id>` 中。例如：

```yaml
posts:
  abc123:
    title: 示例文章
    tags: [C++, 示例]
    draft: false
    migrated: false
    createdAt: auto
    status: active
```

常用字段：

- `title`：文章当前标题；
- `tags`：平铺标签列表；多标签筛选可使用任一或交集匹配；
- `draft`：草稿不生成公开页面；
- `migrated`：站外迁移文章设为 `true`；
- `createdAt`：`auto`、上海墙钟时间，或 `null`；迁移文章不能使用 `auto`；
- `updatedAt`：可省略、为单个上海墙钟时间、时间列表，或 `null`；
- `status`：`active`、`merged` 或 `deleted`。

时间格式为 `YYYY-MM-DD HH:mm`，按 Asia/Shanghai 解释。手动时间与正文的 Git 修改历史共同构成文章时间线。

## 新建与编辑文章

使用下面的命令创建文章：

```sh
pnpm new "文章标题"
```

命令会生成 ID 目录、空的 `index.md`，并追加一条 `createdAt: auto` 的注册表记录。随后在 `index.md` 写入 Markdown，并按需在同目录放置图片：

```md
![示意图](./images/diagram.png)
```

迁移文章应保留原始标题、标签和时间，并显式设置 `migrated: true` 与 `createdAt`。迁移提交本身不会被视为正文更新；之后修改 `index.md` 会正常进入更新时间和活动记录。

## Wiki 链接

文章之间使用文章 ID 互链，而不是标题或文件名：

```md
参见 [[abc123]]。
也可使用 [[abc123|显示文字]] 指定链接文字。
```

目标必须是注册表中 `status: active` 的文章；无效链接会使构建失败。

## 校验

提交前至少运行：

```sh
pnpm build
```

构建会校验注册表、文章目录、文章状态和 Wiki 链接，并生成全部静态页面。
