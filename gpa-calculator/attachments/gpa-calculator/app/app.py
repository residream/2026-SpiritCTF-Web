from flask import Flask, jsonify, render_template, request

from gpa import (
    build_expression_context,
    calculate_summary,
    validate_courses,
)
from runner import run_expression
from xlsx_import import XlsxImportError, parse_xlsx_courses


DEFAULT_EXPRESSION = 'f"加权 GPA：{gpa:.2f}\\n平均分：{avg_score:.2f}\\n总学分：{credits:.1f}\\n课程数：{course_count}"'
#小 r 发现这里还可以写 f"加权 GPA：{gpa:.{1+1}f}\\n平均分：{avg_score:.{1+1}f}\\n总学分：{credits:.{1+1}f}\\n课程数：{course_count}"
#既然这里可以执行参数，那这样以后改成可选精确值就方便多了呀！
#不过这种事情还是留给以后吧！
MAX_UPLOAD_BYTES = 2 * 1024 * 1024


def create_app():
    app = Flask(__name__)
    app.config["MAX_CONTENT_LENGTH"] = MAX_UPLOAD_BYTES

    @app.get("/")
    def index():
        return render_template("index.html", default_expression=DEFAULT_EXPRESSION)

    @app.get("/healthz")
    def healthz():
        return jsonify({"ok": True})

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

    @app.post("/api/import/xlsx")
    def import_xlsx():
        uploaded = request.files.get("file")
        if uploaded is None:
            return jsonify({"ok": False, "error_type": "BadRequest", "error": "file is required"}), 400
        data = uploaded.read(MAX_UPLOAD_BYTES + 1)
        if len(data) > MAX_UPLOAD_BYTES:
            return jsonify({"ok": False, "error_type": "BadRequest", "error": "file is too large"}), 400
        try:
            parsed = parse_xlsx_courses(data)
            courses = validate_courses(parsed["courses"])
            summary = calculate_summary(courses)
        except (XlsxImportError, ValueError) as exc:
            return jsonify({"ok": False, "error_type": "BadRequest", "error": str(exc)}), 400
        return jsonify({"ok": True, "sheet": parsed["sheet"], "courses": courses, "summary": summary})

    return app


if __name__ == "__main__":
    create_app().run(host="127.0.0.1", port=3000)
