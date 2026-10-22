import math


MAX_COURSES = 100
MAX_NAME_LEN = 48

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

DEFAULT_COURSES = [
    {"name": "程序设计基础", "credits": 4, "score": 89.9},
    {"name": "微积分AⅠ", "credits": 3.5, "score": 83.9},
    {"name": "线性代数A", "credits": 2.5, "score": 86.9},
]


def _finite_number(value, field):
    if isinstance(value, bool):
        raise ValueError(f"{field} must be a number")
    try:
        number = float(value)
    except (TypeError, ValueError):
        raise ValueError(f"{field} must be a number") from None
    if not math.isfinite(number):
        raise ValueError(f"{field} must be finite")
    return number


def validate_courses(value):
    if value is None:
        value = DEFAULT_COURSES
    if not isinstance(value, list):
        raise ValueError("courses must be a list")
    if not value:
        raise ValueError("at least one course is required")
    if len(value) > MAX_COURSES:
        raise ValueError(f"at most {MAX_COURSES} courses are allowed")

    courses = []
    for index, item in enumerate(value, start=1):
        if not isinstance(item, dict):
            raise ValueError(f"course {index} must be an object")

        name = str(item.get("name") or f"Course {index}").strip()[:MAX_NAME_LEN]
        credits = _finite_number(item.get("credits"), f"course {index} credits")
        raw_score = item.get("score")
        score = None
        grade = str(item.get("grade") or "").strip()

        if raw_score is not None and not (isinstance(raw_score, str) and not raw_score.strip()):
            try:
                score = _finite_number(raw_score, f"course {index} score")
            except ValueError:
                grade = str(raw_score).strip()

        if score is None:
            if grade not in GRADE_POINTS:
                raise ValueError(f"course {index} needs a score or a supported grade")
            score = GRADE_SCORES[grade]
            point = GRADE_POINTS[grade]
        else:
            point = score_to_point(score)

        if credits <= 0 or credits > 20:
            raise ValueError(f"course {index} credits must be greater than 0 and at most 20")
        if score is not None and (score < 0 or score > 100):
            raise ValueError(f"course {index} score must be between 0 and 100")
        course = {"name": name, "credits": credits, "point": point}
        if score is not None:
            course["score"] = score
        if grade:
            course["grade"] = grade[:16]
        if item.get("term"):
            course["term"] = str(item.get("term"))[:32]
        courses.append(course)

    return courses


def score_to_point(score):
    for minimum, point in [
        (90, 4.0), (87, 3.7), (84, 3.3), (80, 3.0), (77, 2.7),
        (74, 2.3), (70, 2.0), (67, 1.7), (64, 1.3), (60, 1.0),
    ]:
        if score >= minimum:
            return point
    return 0.0


def calculate_summary(courses):
    # 同名课程按重修处理：数字成绩取最高分，等级成绩比较绩点。
    best_courses = {}
    for course in courses:
        name = course["name"]
        previous = best_courses.get(name)
        if previous is None:
            best_courses[name] = course
        elif "score" in course and "score" in previous:
            if course["score"] > previous["score"]:
                best_courses[name] = course
        elif course["point"] > previous["point"]:
            best_courses[name] = course
    courses = list(best_courses.values())

    total_credits = sum(float(course["credits"]) for course in courses)
    score_credits = sum(float(course["credits"]) for course in courses if "score" in course)
    weighted_scores = sum(
        float(course["credits"]) * float(course["score"])
        for course in courses
        if "score" in course
    )
    weighted_points = sum(float(course["credits"]) * float(course["point"]) for course in courses)

    return {
        "gpa": round(weighted_points / total_credits, 4),
        "avg_score": round(weighted_scores / score_credits, 2) if score_credits else 0.0,
        "credits": round(total_credits, 2),
        "course_count": len(courses),
        "numeric_score_count": sum(1 for course in courses if "score" in course),
    }


def build_expression_context(summary):
    return {
        "gpa": float(summary["gpa"]),
        "avg_score": float(summary["avg_score"]),
        "credits": float(summary["credits"]),
        "course_count": int(summary["course_count"]),
        "student_name": "guest",
    }
