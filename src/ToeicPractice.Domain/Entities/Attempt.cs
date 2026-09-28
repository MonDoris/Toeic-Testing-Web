using ToeicPractice.Domain.Common;
using ToeicPractice.Domain.Enums;

namespace ToeicPractice.Domain.Entities;

/// <summary>Một lượt làm bài của học viên.</summary>
public class Attempt : BaseEntity
{
    public Guid UserId { get; set; }
    public User? User { get; set; }
    public Guid TestId { get; set; }
    public Test? Test { get; set; }

    public AttemptMode Mode { get; set; }
    /// <summary>Nếu luyện tập theo Part, lưu Part đã chọn.</summary>
    public ToeicPart? PartFilter { get; set; }

    public DateTime StartedAt { get; set; } = DateTime.UtcNow;
    public DateTime? SubmittedAt { get; set; }

    public int TotalQuestions { get; set; }
    public int CorrectCount { get; set; }
    /// <summary>Điểm quy đổi: Listening/Reading 5–495, Writing 0–200, đề Listening &amp; Reading 10–990.</summary>
    public int? ScaledScore { get; set; }
    /// <summary>Đề Listening &amp; Reading: điểm quy đổi từng phần (5–495).</summary>
    public int? ListeningScore { get; set; }
    public int? ReadingScore { get; set; }
    public GradingStatus GradingStatus { get; set; } = GradingStatus.AutoGraded;

    public ICollection<AttemptAnswer> Answers { get; set; } = new List<AttemptAnswer>();
}

public class AttemptAnswer : BaseEntity
{
    public Guid AttemptId { get; set; }
    public Attempt? Attempt { get; set; }
    public Guid QuestionId { get; set; }
    public Question? Question { get; set; }

    public string? SelectedOption { get; set; }
    public bool? IsCorrect { get; set; }

    // Writing
    public string? WrittenText { get; set; }
    public int? WordCount { get; set; }
    /// <summary>Điểm tự động (tạm tính) theo thang của từng dạng câu.</summary>
    public double? AutoScore { get; set; }
    /// <summary>Điểm do Admin chấm lại.</summary>
    public double? ReviewerScore { get; set; }
    public string? AutoFeedback { get; set; }
    public string? ReviewerFeedback { get; set; }
}
