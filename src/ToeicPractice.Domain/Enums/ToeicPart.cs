namespace ToeicPractice.Domain.Enums;

/// <summary>
/// Official TOEIC question types for the supported skills.
/// Listening: Parts 1–4 (100 câu). Reading: Parts 5–7 (100 câu). Writing: 8 câu, 3 dạng bài.
/// </summary>
public enum ToeicPart
{
    // Listening
    L1_Photographs = 1,          // 6 câu – 1 ảnh, 4 lựa chọn (A–D)
    L2_QuestionResponse = 2,     // 25 câu – 3 lựa chọn (A–C), không in văn bản
    L3_Conversations = 3,        // 39 câu – 13 hội thoại × 3 câu
    L4_Talks = 4,                // 30 câu – 10 bài nói × 3 câu

    // Reading
    R5_IncompleteSentences = 5,  // 30 câu – điền từ vào câu
    R6_TextCompletion = 6,       // 16 câu – 4 đoạn văn × 4 chỗ trống
    R7_ReadingComprehension = 7, // 54 câu – đọc hiểu đoạn đơn / đa đoạn, mỗi nhóm 2–5 câu

    // Writing
    W1_PictureSentence = 11,     // Câu 1–5 – viết 1 câu mô tả ảnh với 2 từ cho sẵn
    W2_RespondEmail = 12,        // Câu 6–7 – trả lời email
    W3_OpinionEssay = 13         // Câu 8 – bài luận nêu quan điểm (≥ 300 từ)
}

public static class ToeicPartExtensions
{
    public static Skill GetSkill(this ToeicPart part) => (int)part switch
    {
        >= 10 => Skill.Writing,
        >= 5 => Skill.Reading,
        _ => Skill.Listening
    };

    /// <summary>Part có thuộc loại đề này không (đề Listening &amp; Reading gồm cả Part 1–7).</summary>
    public static bool BelongsTo(this ToeicPart part, Skill skill) =>
        skill == Skill.ListeningReading ? part.GetSkill() != Skill.Writing : part.GetSkill() == skill;

    /// <summary>Trắc nghiệm A–D (Listening + Reading), chấm tự động theo đáp án.</summary>
    public static bool IsMultipleChoice(this ToeicPart part) => part.GetSkill() != Skill.Writing;

    /// <summary>Number of answer options for multiple-choice parts.</summary>
    public static int OptionCount(this ToeicPart part) => part switch
    {
        ToeicPart.L2_QuestionResponse => 3,
        _ when part.IsMultipleChoice() => 4,
        _ => 0
    };

    /// <summary>Số câu tối thiểu / tối đa trong một nhóm theo cấu trúc đề thật.</summary>
    public static (int Min, int Max) QuestionsPerGroup(this ToeicPart part) => part switch
    {
        ToeicPart.L3_Conversations or ToeicPart.L4_Talks => (3, 3),
        ToeicPart.R6_TextCompletion => (4, 4),
        ToeicPart.R7_ReadingComprehension => (2, 5),
        _ => (1, 1)
    };

    /// <summary>Maximum raw score per writing question on the ETS rubric.</summary>
    public static int WritingMaxScore(this ToeicPart part) => part switch
    {
        ToeicPart.W1_PictureSentence => 3,
        ToeicPart.W2_RespondEmail => 4,
        ToeicPart.W3_OpinionEssay => 5,
        _ => 0
    };
}
