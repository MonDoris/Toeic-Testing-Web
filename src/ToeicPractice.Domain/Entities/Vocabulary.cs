using ToeicPractice.Domain.Common;

namespace ToeicPractice.Domain.Entities;

public class Vocabulary : BaseEntity
{
    public string Word { get; set; } = string.Empty;
    public string? Phonetic { get; set; }
    public string? PartOfSpeech { get; set; }
    public string MeaningVi { get; set; } = string.Empty;
    public string? DefinitionEn { get; set; }
    public string? Example { get; set; }
    public string? ExampleVi { get; set; }
    public string? Synonyms { get; set; }
    /// <summary>Chủ đề TOEIC: Office, Contracts, Marketing...</summary>
    public string Topic { get; set; } = "General";
    /// <summary>Mốc điểm gợi ý: 450, 650, 850.</summary>
    public int Level { get; set; } = 450;
    public string? AudioUrl { get; set; }
    public string? Source { get; set; }
}

/// <summary>Từ vựng học viên đã lưu vào sổ tay.</summary>
public class SavedVocabulary : BaseEntity
{
    public Guid UserId { get; set; }
    public User? User { get; set; }
    public Guid VocabularyId { get; set; }
    public Vocabulary? Vocabulary { get; set; }
    public bool IsMastered { get; set; }
}

public class GrammarTopic : BaseEntity
{
    public string Title { get; set; } = string.Empty;
    public string Slug { get; set; } = string.Empty;
    /// <summary>Nhóm: Thì, Mệnh đề, Từ loại...</summary>
    public string Category { get; set; } = string.Empty;
    public string Summary { get; set; } = string.Empty;
    /// <summary>Công thức rút gọn, VD: "S + have/has + V3".</summary>
    public string? Formula { get; set; }
    /// <summary>Nội dung bài học dạng Markdown.</summary>
    public string Content { get; set; } = string.Empty;
    public int Level { get; set; } = 450;
    public int OrderIndex { get; set; }
    public string? Source { get; set; }
}
