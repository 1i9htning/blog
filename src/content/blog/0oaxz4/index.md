
## 注意：

- **同一作用域中**的几个函数**名字相同但是形参列表不同**，称之为**重载函数**
- **调用重载函数时，应该避免对实参进行强制类型转换。如果必须进行强制类型转换，说明设计的形参集不合理！**
- **仅仅改变了形参名字不算重载，算重复声明。因为形参名字是可选的！**

```c++
int func(int i);
int func(int j);//合法，算重复声明，而不是函数重载
int func(int i)
{
    return i;
}
int func(int j)
{
    return j;
}//不合法，算同一个函数的重复定义
```

- **仅仅改变返回类型不能重载！就算再多改变了函数体也不行！声明都算错误声明**

```c++
int get();
double get();//错误！

int func(int i)
{
    return i;
}
//下面的定义是错的！因为函数体的改变不能判断函数重载，而只改变返回类型不能重载函数
double func(int i)
{
    i = 100*i;
    return i;//此处发生隐式转换
}
```

- **因为顶层const不影响参数传递，所以仅仅添加了顶层的const关键字也不算函数重载！但是底层const为函数重载**
- **main函数不能重载**

## 调用重载函数结果：

- 找到一个与实参最佳匹配的
- 找不到任何一个与实参相匹配的，报错
- 找到多个相匹配的，且每个都不是最佳选择。报错，成为**二义性调用**

## 函数重载与作用域：

**在内层作用域中声明名字，它将隐藏外层作用域声明的同名实体。**一般来说，不会在局部作用域中声明

```c++
string read();
void print(const string&);
void print(double);//函数重载
void func(int ival)
{
    bool read = false;//bool类型的局部变量read隐藏了外层的同名函数实体
    string s = read();//错误！因为read是一个bool值，外层的read函数被隐藏了
    //下面这条函数声明是不好的习惯！
    void print(int);//并不是函数重载，它隐藏了外部的两个print重载函数
    print("Value:");//错误！不会调用print(const string&)，因为被隐藏掉了，只能找到print(int)，但是参数类型不匹配也不能转换，所以编译器报错！
    print(ival);//正确！调用print(int)
    print(3.14);//正确！调用print(int)，而不是print(double)，因为外层的print(double)已经被隐藏了。发生隐式转换
}
```

**C++中，名字查找发生在类型检查之前**
