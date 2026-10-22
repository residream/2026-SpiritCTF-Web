import ast


MAX_EXPRESSION_LENGTH = 2048

BLOCK_WORDS = (
    "__globals__",
    "__builtins__",
    "__subclasses__",
    "__import__",
)


class ExpressionRejected(ValueError):
    pass


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


def parse_and_check(expression, allowed_names):
    if not isinstance(expression, str) or not expression.strip():
        raise ExpressionRejected("expression is required")
    if len(expression) > MAX_EXPRESSION_LENGTH:
        raise ExpressionRejected("expression is too long")

    lowered = expression.lower()
    for word in BLOCK_WORDS:
        if word in lowered:
            raise ExpressionRejected(f"blocked word: {word}")

    try:
        tree = ast.parse(expression, mode="eval")
    except SyntaxError as exc:
        raise ExpressionRejected(exc.msg) from None

    ReportExpressionChecker(allowed_names).visit(tree)
    return tree
