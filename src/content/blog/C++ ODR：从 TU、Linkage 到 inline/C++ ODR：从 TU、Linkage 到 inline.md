---
title: C++ ODR：从 TU、linkage 到 inline
tags: [C++, ODR, Translation Unit, linkage, inline, static]
---

理解 C++ 的 ODR 时，经常会同时碰到几个概念：

- Translation Unit；
- Linkage；
- `static`；
- `inline`。

这些概念单独看都不算复杂，但一旦混在一起，就很容易产生疑问：

- 为什么 Header 中定义普通变量会重复定义？
- 为什么加 `static` 就没事？
- 为什么 `inline` 又可以在多个 `.cpp` 中定义？
- 为什么 Header-Only 库可以正常工作？
- 为什么 `inline` 函数中的局部 `static` 仍然只有一份？

这篇文章尝试从 Translation Unit 开始，把这些概念串起来。

## 一个例子

先看一个最简单的例子：<a id="示例-1"></a>

项目中有三个文件：

- `common.hpp`；
- `foo.cpp`；
- `bar.cpp`。

```cpp title="common.hpp"
int g_value = 0;
```

```cpp title="foo.cpp"
#include "common.hpp"

// ...
```

```cpp title="bar.cpp"
#include "common.hpp"

// ...
```

直接编译并链接时，通常会得到类似错误：

```bash
/usr/bin/ld: xxx.o:(.bss+0x0): multiple definition of `g_value';
yyy.o:(.bss+0x0): first defined here
```

要理解为什么，需要先知道什么是 TU。

---

## TU

TU 全称 **Translation Unit**，中文一般称为“翻译单元”。

TU 才是 C/C++ 编译器真正的一次编译单位。

一个 `.cpp` 文件并不直接等于一个 TU。更准确地说：

> 一个 `.cpp` 文件经过预处理后得到的完整代码，才是一个 TU。

例如：

```cpp
#include "common.hpp"
```

预处理器会把 `common.hpp` 的内容展开到当前 `.cpp` 中。

因此对于前面的例子，可以近似理解成：

```text
预处理 foo.cpp
↓
展开 #include "common.hpp"
↓
得到 TU Foo
```

```text
预处理 bar.cpp
↓
展开 #include "common.hpp"
↓
得到 TU Bar
```

由于 `common.hpp` 中有：

```cpp
int g_value = 0;
```

所以预处理后的结果近似变成：

```cpp title="TU Foo"
int g_value = 0;

// foo.cpp 中剩余的代码
```

以及：

```cpp title="TU Bar"
int g_value = 0;

// bar.cpp 中剩余的代码
```

也就是说，`g_value` 的定义分别出现在了两个 TU 中。

整个编译过程可以简单理解为：

```text
.cpp
 ↓ 预处理
Translation Unit
 ↓ 编译
.o / .obj
 ↓ 链接
可执行文件 / 动态库
```

因此我们平时常说：

> 一个 `.cpp` 对应一个 TU。

这在大部分日常讨论中是可以接受的，只需要知道严格来说 TU 指的是 `.cpp` 经过预处理之后的结果。

---

## entity

在继续讨论之前，还需要一个简单概念：**实体（entity）**。

C++ 中很多东西都可以称为实体，例如：

- 变量；
- 函数；
- 类；
- 枚举；
- 模板。

例如：

```cpp
int g_value = 0;
```

这里定义了一个变量实体。

接下来讨论 linkage 和 ODR 时，最重要的问题其实都是：

> 两个地方写到的同一个名字，到底是不是在表示同一个实体？

---

## linkage

Linkage 可以简单理解为：

> 同一个名字出现在不同地方时，它们是否能够表示同一个实体。

例如两个文件中都出现：

```cpp
g_value
```

仅仅名字一样，并不能说明它们一定是同一个变量。

这正是 linkage 所决定的事情。

本文主要讨论两种和多 TU 最相关的 linkage：

- external linkage
- internal linkage

---

### external linkage

External linkage 可以简单理解为：

> 这个名字可以跨 TU 表示同一个实体。

例如：

```cpp title="x.cpp"
int g_value = 123;
```

```cpp title="y.cpp"
extern int g_value;

void Print()
{
    std::cout << g_value << std::endl;
}
```

这里：

```cpp
int g_value = 123;
```

定义了 `g_value`。

而：

```cpp
extern int g_value;
```

只是声明：

> 存在一个叫 `g_value` 的外部变量，它的定义在别处。

因此可以简单画成：

```text
TU X                         TU Y

int g_value = 123;           extern int g_value;
       │                            │
       └──────────┬─────────────────┘
                  ↓
             同一个 g_value
```

编译 `y.cpp` 时，编译器并不需要知道 `g_value` 的具体定义在哪里。

它只需要知道：

```text
存在这样一个外部变量。
```

等到链接阶段，再把这个引用和真正的定义对应起来。

因此：

```text
x.o
提供 g_value 的定义

y.o
引用 g_value

        ↓

      linker

        ↓

对应到同一个实体
```

---

### internal linkage

Internal linkage 可以简单理解为：

> 这个名字只在当前 TU 中表示这个实体。

例如：

```cpp title="x.cpp"
static int g_value = 123;
```

```cpp title="y.cpp"
static int g_value = 234;
```

这里先不展开讨论 `static` 的其他含义，只需要知道：

> 当 `static` 出现在 namespace scope 时，它会让这个名字具有 internal linkage。

于是：

```text
TU X                      TU Y

g_value                    g_value
   ↓                          ↓
entity #1                  entity #2
```

它们虽然都叫：

```text
g_value
```

但实际上是两个完全不同的变量。

因此链接 `x.o` 和 `y.o` 时不存在冲突。

可以把 internal linkage 粗略理解成：

```text
TU 私有
```

但要注意，这里的“私有”只是为了方便理解，并不是 C++ `private` 关键字的含义。

---

## ODR

ODR 全称：

```text
One Definition Rule
```

中文通常称为“一处定义规则”。

ODR 讨论的核心问题是：

> 同一个实体允许有多少个定义？

这里最重要的是“**同一个实体**”，而非“**名字一样**”。

---

### 同一个 TU 中

首先，在同一个 TU 中，一个可定义项不能重复定义。

例如：

```cpp
int value = 0;
int value = 1;
```

显然是不合法的。

---

### 不同 TU 中

不同 TU 中的情况则需要结合 linkage 来判断。

回到最开始的例子：

```cpp title="common.hpp"
int g_value = 0;
```

被两个 `.cpp` 包含：

```cpp title="foo.cpp"
#include "common.hpp"
```

```cpp title="bar.cpp"
#include "common.hpp"
```

预处理之后：

```text
TU Foo                    TU Bar

int g_value = 0;          int g_value = 0;
```

这里的普通 namespace scope 变量 `g_value` 具有 external linkage。

因此两边定义的并不是：

```text
两个不同的 g_value
```

而是在定义：

```text
同一个 g_value 实体
```

于是：

```text
TU Foo
    definition
        │
        ├────→ g_value
        │
TU Bar
    definition
```

一个普通变量实体在整个程序中出现了多个定义，因此违反 ODR。

这就是为什么会得到：

```text
multiple definition
```

这样的链接错误。

---

## static

`static` 是 C++ 中一个非常容易混淆的关键字，因为它出现在不同位置时，含义并不一样。此处只针对 namespace scope 中的 `static` 进行讨论。

例如：

```cpp title="common.hpp"
static int g_value = 0;
```

仍然被 `foo.cpp` 和 `bar.cpp` 分别包含。

预处理后：

```text
TU Foo                    TU Bar

static int g_value = 0;   static int g_value = 0;
```

由于 namespace scope 中的 `static` 让 `g_value` 具有 internal linkage，因此：

```text
TU Foo                    TU Bar

g_value #1                g_value #2
```

它们已经不是同一个实体了。

所以这里并不是：

> 同一个变量允许定义两次。

而是：

> 两个完全不同的变量，各自定义了一次。

因此不会违反 ODR。

这也是一个非常重要的区别：`static` 不是让“重复定义”合法，而是让不同 TU 中的名字表示不同实体。

---

## inline

接下来再看另一种解决方式：

```cpp title="common.hpp"
inline int g_value = 0;
```

`inline` 变量从 C++17 开始支持。

同样被两个 TU 包含后：

```text
TU Foo                    TU Bar

inline int g_value = 0;   inline int g_value = 0;
```

这一次和 `static` 完全不同。

`inline` 并没有让两个 TU 获得两份不同的 `g_value`。

逻辑上仍然是：

```text
TU Foo ─────┐
            │
            ├────→ 同一个 g_value
            │
TU Bar ─────┘
```

但是 ODR 对 `inline` 实体有特殊规则：

> `inline` 函数或变量可以在多个 TU 中具有符合要求的定义，这些定义表示同一个实体。

因此：

```cpp
inline int g_value = 0;
```

可以安全地放在 Header 中。

---

## static 与 inline 的区别

这一点非常重要。

例如 Header 中：

```cpp
static int g_value = 0;
```

多个 TU 包含后：

```text
TU A → g_value #1
TU B → g_value #2
TU C → g_value #3
```

之所以不违反 ODR，是因为**它们本来就是不同实体**。

而：

```cpp
inline int g_value = 0;
```

则是：

```text
TU A ──┐
TU B ──┼──→ g_value
TU C ──┘
```

之所以不违反 ODR，是因为：**它们表示同一个实体，但 ODR 允许 inline 实体在多个 TU 中具有定义**。

所以两者虽然都可以避免 `multiple definition`，但原理完全不同：

```text
static
↓
每个 TU 一份不同实体

inline
↓
多个 TU 定义同一个实体
```

---

## inline 函数

`inline` 对函数也是一样。

假设 Header 中：

```cpp title="common.hpp"
inline int Add(int a, int b)
{
    return a + b;
}
```

然后 `foo.cpp` 和 `bar.cpp` 都包含这个 Header。

预处理后：

```text
TU Foo                         TU Bar

inline int Add(...)            inline int Add(...)
{
    ...
}                              {
                                   ...
                               }
```

源码层面确实存在多个函数定义。

但是这些定义表示的是同一个 Add() 函数实体

而 ODR 允许 `inline` 函数在多个 TU 中具有符合要求的定义，因此这是合法的。

这也是 Header-Only 库大量使用 `inline` 的重要原因之一。

需要注意：

> `inline` 在现代 C++ 中并不主要意味着“要求编译器把函数展开到调用处”。

是否真的进行 inline optimization，是编译器自己的优化决定。

这里我们更关心的是它对 ODR 的作用。

---

## class 内定义的成员函数

还有一个很常见的情况：

```cpp
class Singleton {
public:
    static Singleton& Instance()
    {
        static Singleton instance;
        return instance;
    }
};
```

这里：

```cpp
Singleton::Instance()
```

虽然没有显式写：

```cpp
inline
```

但因为它直接定义在 class 内，因此它隐式具有 `inline` 属性。

所以可以近似理解成：

```cpp
class Singleton {
public:
    static Singleton& Instance();
};

inline Singleton& Singleton::Instance()
{
    static Singleton instance;
    return instance;
}
```

如果这个 class 定义在 Header 中，并被多个 TU 包含：

```text
TU A ── Singleton::Instance() ──┐
                                │
TU B ── Singleton::Instance() ──┼──→ 同一个函数实体
                                │
TU C ── Singleton::Instance() ──┘
```

这也是合法的。

---

## inline 函数中的局部 static

再看：

```cpp
inline Singleton& Instance()
{
    static Singleton instance;
    return instance;
}
```

这里的：

```cpp
static Singleton instance;
```

和前面 namespace scope 的：

```cpp
static int g_value;
```

含义完全不同。

因为它位于函数内部。

这里的 `static` 主要表示 **static storage duration**。

也就是说：

```text
第一次需要时初始化
↓
对象一直存在
↓
直到程序结束
```

更重要的是，对于具有相应 linkage 的 `inline` 函数：

```text
多个 TU 中的这个局部 static
表示的是同一个对象。
```

因此：

```text
TU A ── Instance() ──┐
                     │
TU B ── Instance() ──┼──→ 同一个 instance
                     │
TU C ── Instance() ──┘
```

这也是经典 Meyers Singleton：

```cpp
class Singleton {
public:
    static Singleton& Instance()
    {
        static Singleton instance;
        return instance;
    }
};
```

能够工作的关键原因之一。

这里实际上叠加了三个不同概念：

```text
Instance() 前面的 static
↓
static member function
↓
没有 this 指针
```

```text
函数定义在 class 内
↓
隐式 inline
↓
可以在多个 TU 中定义同一个函数实体
```

```text
函数内部的 static instance
↓
static storage duration
↓
多个 TU 最终访问同一个局部静态对象
```

因此不要简单记成：`static` = 某一种固定作用

`static` 的含义必须结合它所在的位置判断。

---

## 总结

理解 ODR 时，可以按下面这个顺序思考。

首先：

```text
.cpp
↓
预处理
↓
Translation Unit
```

然后看到两个相同名字时，先问：它们是不是同一个实体？这主要由 linkage 决定。

```text
external linkage
↓
不同 TU 中可以表示同一个实体
```

```text
internal linkage
↓
不同 TU 中通常表示不同实体
```

然后再问：如果它们确实是同一个实体，这个实体允许出现多少个定义？这才是 ODR 关心的问题。

对于 Header 中的定义：

```cpp
static int value = 0;
```

模型是：

```text
TU A → value #1
TU B → value #2
```

合法的原因是：它们是不同实体。

而：

```cpp
inline int value = 0;
```

模型是：

```text
TU A ──┐
       ├──→ value
TU B ──┘
```

合法的原因是：它们是同一个实体，但 inline 允许这个实体在多个 TU 中具有定义。

可以把整篇文章最后压缩成两句话：

> **Linkage 决定不同地方出现的名字是否表示同一个实体。**

> **ODR 决定同一个实体允许出现多少个定义。**

而 `static` 和 `inline` 最值得记住的区别则是：

- namespace scope `static` → 每个 TU 得到不同实体；
- `inline` → 多个 TU 可以定义同一个实体。
