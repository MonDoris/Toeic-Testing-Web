using ToeicPractice.Domain.Common;
using ToeicPractice.Domain.Enums;

namespace ToeicPractice.Domain.Entities;

/// <summary>Một đề luyện thi: Listening, Reading, Writing hoặc đề thi Listening &amp; Reading đầy đủ.</summary>
public class Test : BaseEntity
{
    public string Title { get; set; } = string.Empty;
    public string? Description { get; set; }
    public Skill Skill { get; set; }
    public int DurationMinutes { get; set; }
    public bool IsPublished { get; set; }

    /// <summary>File PDF đề gốc mà Admin đã upload.</summary>
    public string? SourcePdfUrl { get; set; }
    /// <summary>Các file đáp án (ảnh / PDF) giáo viên đã upload, phân tách bằng "|".</summary>
    public string? AnswerKeyUrls { get; set; }

    public ICollection<QuestionGroup> Groups { get; set; } = new List<QuestionGroup>();
    public ICollection<Attempt> Attempts { get; set; } = new List<Attempt>();
    public ICollection<TestAudioTrack> AudioTracks { get; set; } = new List<TestAudioTrack>();
}

/// <summary>
/// Audio dùng chung cho nhiều nhóm câu: cả đề (Part = null) hoặc một Part.
/// Nhóm câu có AudioUrl riêng sẽ được ưu tiên hơn track dùng chung.
/// </summary>
public class TestAudioTrack : BaseEntity
{
    public Guid TestId { get; set; }
    public Test? Test { get; set; }
    public ToeicPart? Part { get; set; }
    public string Url { get; set; } = string.Empty;
    public string FileName { get; set; } = string.Empty;
}

/// <summary>
/// Nhóm câu hỏi dùng chung ngữ liệu: 1 ảnh (Part 1), 1 câu hỏi (Part 2),
/// 1 hội thoại / bài nói gồm 3 câu (Part 3, 4), hoặc 1 đề bài Writing.
/// </summary>
public class QuestionGroup : BaseEntity
{
    public Guid TestId { get; set; }
    public Test? Test { get; set; }

    public ToeicPart Part { get; set; }
    public int OrderIndex { get; set; }

    public string? AudioUrl { get; set; }
    public string? ImageUrl { get; set; }
    /// <summary>Ngữ liệu hiển thị cho thí sinh (VD: email cần trả lời ở Writing Q6–7).</summary>
    public string? Passage { get; set; }
    /// <summary>Lời thoại audio – chỉ hiện sau khi nộp bài / ở chế độ luyện tập.</summary>
    public string? Transcript { get; set; }

    public ICollection<Question> Questions { get; set; } = new List<Question>();
}

public class Question : BaseEntity
{
    public Guid GroupId { get; set; }
    public QuestionGroup? Group { get; set; }

    /// <summary>Số thứ tự câu trong đề (1..100 Listening, 101..200 Reading, 1..8 Writing).</summary>
    public int Number { get; set; }
    /// <summary>Nội dung câu hỏi (Part 3/4) hoặc yêu cầu đề bài (Writing).</summary>
    public string? Content { get; set; }

    public string? OptionA { get; set; }
    public string? OptionB { get; set; }
    public string? OptionC { get; set; }
    public string? OptionD { get; set; }
    /// <summary>"A" | "B" | "C" | "D" – chỉ dùng cho Listening.</summary>
    public string? CorrectAnswer { get; set; }
    public string? Explanation { get; set; }

    // Writing
    /// <summary>Writing Q1–5: hai từ/cụm từ bắt buộc, phân tách bằng "|".</summary>
    public string? RequiredKeywords { get; set; }
    public string? SampleAnswer { get; set; }
    public int? MinWords { get; set; }
}
