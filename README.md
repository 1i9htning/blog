# Astro Starter Kit: Minimal

```sh
pnpm create astro@latest -- --template minimal
```

> 🧑‍🚀 **Seasoned astronaut?** Delete this file. Have fun!

## 🚀 Project Structure

Inside of your Astro project, you'll see the following folders and files:

```text
/
├── public/
├── src/
│   └── pages/
│       └── index.astro
└── package.json
```

## ✍️ 博客内容

文章放在 `src/content/blog/` 中，支持任意层级的目录。例如，一篇文章及其图片可以放在同一个文件夹：

```text
src/content/blog/2026/my-post/
├── my-post.md
├── cover.png
└── images/
    └── diagram.png
```

在 Markdown 中可用相对路径引用同级图片：`![封面](./cover.png)`。

文章之间可用 Wiki 链接直接按**文件名**跳转，无需写目录或扩展名：

```md
参见 [[another-post]]。
也可使用 [[another-post|另一篇文章]] 自定义链接文字。
```

`src/content/blog/` 中的 `.md` 文件名必须全局唯一；构建时会报出重名或找不到目标的 Wiki 链接。因此，不应在多个文章文件夹中重复使用 `index.md`。实际文章 URL 仍保留完整目录层级，例如 `2026/my-post/my-post.md` 对应 `/blog/2026/my-post/my-post/`。

`updatedAt` 可以是单个时间（兼容已有文章），也可以是从早到晚排列的更新时间列表：

```yaml
updatedAt:
  - 2022-10-09 17:31
  - 2022-10-29 01:31
```

也可写成一行：`updatedAt: [2022-10-09 17:31, 2022-10-29 01:31]`。手动时间必须严格升序且不能重复。无论是否填写 `updatedAt`，系统都会读取该文件的 Git 内容更新历史，与手动时间合并、去重并按时间升序排列；纯移动或重命名不会记作更新。`updatedAt:` 为空且 Git 中也没有该文件记录时，更新时间显示为“未知”。文章详情只显示最终最后一个时间，活动图会记录每一次更新。

对于从其他平台迁移的文章，添加 `migrated: true`。它不会从 Git 推断创建时间：请填写原始 `createdAt`，或使用 `createdAt: null`（也可省略）表示未知：

```yaml
migrated: true
createdAt: null # 无法确定原始创建时间
```

该文章最早的一次 Git 内容提交只代表导入，会从更新时间和活动图中排除；之后的内容修改仍会记录。

Astro looks for `.astro` or `.md` files in the `src/pages/` directory. Each page is exposed as a route based on its file name.

There's nothing special about `src/components/`, but that's where we like to put any Astro/React/Vue/Svelte/Preact components.

Any static assets, like images, can be placed in the `public/` directory.

## 🧞 Commands

All commands are run from the root of the project, from a terminal:

| Command                   | Action                                           |
| :------------------------ | :----------------------------------------------- |
| `pnpm install`             | Installs dependencies                            |
| `pnpm dev`             | Starts local dev server at `localhost:4321`      |
| `pnpm build`           | Build your production site to `./dist/`          |
| `pnpm preview`         | Preview your build locally, before deploying     |
| `pnpm astro ...`       | Run CLI commands like `astro add`, `astro check` |
| `pnpm astro -- --help` | Get help using the Astro CLI                     |

## 👀 Want to learn more?

Feel free to check [our documentation](https://docs.astro.build) or jump into our [Discord server](https://astro.build/chat).
