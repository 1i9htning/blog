---
title: bind函数
tags: [C++, std]
migrated: true
createdAt: 2022-10-08 18:50
updatedAt:
  - 2022-10-08 18:50
---

## 注意：

- 调用bind的一般形式为使用auto类型符
  ~~~c++
  auto newCallable = bind(callable, arg_list);//arg_list为参数列表，对应给定的callable的参数
  ~~~

- bind参数中的_n占位符参数定义在命名空间placeholders中，该命名空间本身定义在命名空间std中

- **占位符的顺序影响底层可调用对象的参数顺序**

  ~~~c++
  void g(int,int,int,int,int)
  auto f = bind(g,a,b,_2,c,_1);
  f(X,Y);//相当于调用g(a,b,Y,c,X)，而不是g(a,b,X,c,Y)
  ~~~

- **当我们想传递给bind一个参数，但是又不想拷贝它（比如IO流对象），我们就必须使用标准库函数ref，该函数返回一个对象的引用，类似的还有cref，返回常量引用**