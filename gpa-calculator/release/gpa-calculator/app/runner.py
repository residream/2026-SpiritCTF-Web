from checker import ExpressionRejected, parse_and_check
from report import ReportFormatter


MAX_OUTPUT = 4096


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
