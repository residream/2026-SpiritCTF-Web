GRADE_BANDS = (
    (3.7, "优秀"),
    (3.0, "良好"),
    (2.0, "中等"),
    (1.0, "及格"),
    (0.0, "不及格"),
)


class ReportFormatter:
    def __init__(self, student="guest"):
        self.student = student

    def grade_band(self, gpa):
        for threshold, label in GRADE_BANDS:
            if gpa >= threshold:
                return label
        return "不及格"

    def render(self, summary):
        gpa = float(summary.get("gpa", 0.0))
        return "{}：加权 GPA {:.2f}（{}），共 {} 门课程".format(
            self.student,
            gpa,
            self.grade_band(gpa),
            summary.get("course_count", 0),
        )
