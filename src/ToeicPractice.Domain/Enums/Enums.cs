namespace ToeicPractice.Domain.Enums;

public enum UserRole
{
    Student = 0,
    Admin = 1
}

public enum Skill
{
    Listening = 0,
    Writing = 1,
    Reading = 2,
    /// <summary>Đề thi TOEIC Listening &amp; Reading đầy đủ: Part 1–7 trong cùng một đề (thang 10–990).</summary>
    ListeningReading = 3
}

public enum AttemptMode
{
    /// <summary>Thi thử: tính giờ, chỉ xem đáp án sau khi nộp bài.</summary>
    Exam = 0,
    /// <summary>Luyện tập: chọn Part, xem đáp án và giải thích ngay.</summary>
    Practice = 1
}

public enum GradingStatus
{
    AutoGraded = 0,
    PendingReview = 1,
    Reviewed = 2
}
