---
title: Rust 基础环境部署
tags: [C++, cargo, rustup]
migrated: true
createdAt: 2026-05-12 09:40
updatedAt:
  - 2026-05-12 09:40
---

## Windows

1. 设置环境变量（用于指定安装位置），环境变量名为：`RUSTUP_HOME` 、 `CARGO_HOME`；
2. 设置环境变量 `Path`，新增栏目，路径为 `$CARGO_HOME\bin`；
3. 去 [RUSTUP 官网](https://rustup.rs/)下载 `rustup-init.exe`；
4. 执行 `rustup-init.exe`；
5. VS Installer 选择 3；
6. 安装方式？选择自定义安装，输入 2；
7. Default host triple？输入 `x86_64-pc-windows-gnullvm`；
8. Default toolchain？默认，直接回车；
9. Profile？默认，直接回车；
10. Modify PATH variable？输入 Y；
11. 安装方式？选择开始安装，输入 1。
