using System.Text.RegularExpressions;
using ToeicPractice.Domain.Entities;
using ToeicPractice.Domain.Enums;

namespace ToeicPractice.Application.Features.Scoring;

public record WritingGrade(double Score, int MaxScore, int WordCount, bool NeedsReview, IReadOnlyList<string> Feedback);

/// <summary>
/// Chấm sơ bộ bài Writing theo các tiêu chí đo được (từ khóa, số từ, cấu trúc).
/// Câu 6–8 luôn được đánh dấu chờ giáo viên chấm lại vì cần đánh giá nội dung.
/// </summary>
public static partial class WritingAutoGrader
{
    private static readonly string[] Connectors =
    [
        "first", "firstly", "second", "secondly", "finally", "however", "moreover", "furthermore",
        "in addition", "for example", "for instance", "therefore", "as a result", "in conclusion",
        "on the other hand", "consequently", "to sum up", "in my opinion", "i believe"
    ];

    public static WritingGrade Grade(ToeicPart part, Question question, string? text)
    {
        text = text?.Trim() ?? "";
        var words = CountWords(text);
        return part switch
        {
            ToeicPart.W1_PictureSentence => GradePictureSentence(question, text, words),
            ToeicPart.W2_RespondEmail => GradeEmail(text, words, question.MinWords ?? 100),
            ToeicPart.W3_OpinionEssay => GradeEssay(text, words, question.MinWords ?? 300),
            _ => new WritingGrade(0, 0, words, false, [])
        };
    }

    public static int CountWords(string text) =>
        string.IsNullOrWhiteSpace(text) ? 0 : WordRegex().Matches(text).Count;

    private static WritingGrade GradePictureSentence(Question q, string text, int words)
    {
        var fb = new List<string>();
        if (words == 0) return new WritingGrade(0, 3, 0, false, ["Bạn chưa viết câu trả lời."]);

        var keywords = (q.RequiredKeywords ?? "")
            .Split('|', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
        var used = keywords.Where(k => ContainsKeyword(text, k)).ToList();
        var missing = keywords.Except(used).ToList();

        var sentences = SentenceEndRegex().Matches(text.TrimEnd()).Count;
        var oneSentence = sentences <= 1;
        var startsUpper = char.IsUpper(text[0]);
        var endsPunct = ".!?".Contains(text[^1]);

        double score;
        if (keywords.Length > 0 && missing.Count == keywords.Length) score = 0;
        else if (missing.Count > 0) score = 1;
        else if (oneSentence && startsUpper && endsPunct && words >= 6) score = 3;
        else score = 2;

        if (missing.Count > 0) fb.Add($"Thiếu từ bắt buộc: {string.Join(", ", missing)}.");
        else fb.Add("Đã dùng đủ 2 từ/cụm từ cho sẵn.");
        if (!oneSentence) fb.Add("Đề yêu cầu chỉ viết MỘT câu.");
        if (!startsUpper) fb.Add("Câu nên bắt đầu bằng chữ in hoa.");
        if (!endsPunct) fb.Add("Câu nên kết thúc bằng dấu chấm.");
        if (words < 6) fb.Add("Câu quá ngắn – hãy mô tả rõ hơn nội dung bức ảnh.");
        fb.Add("Điểm tự động chỉ kiểm tra hình thức; ngữ pháp và sự liên quan tới ảnh cần tự đối chiếu với câu mẫu.");
        return new WritingGrade(score, 3, words, false, fb);
    }

    private static WritingGrade GradeEmail(string text, int words, int minWords)
    {
        var fb = new List<string>();
        if (words == 0) return new WritingGrade(0, 4, 0, true, ["Bạn chưa viết email trả lời."]);

        var lower = text.ToLowerInvariant();
        var hasGreeting = GreetingRegex().IsMatch(lower);
        var hasClosing = ClosingRegex().IsMatch(lower);

        double score = words switch
        {
            < 30 => 1,
            < 60 => 2,
            _ when words < minWords => 3,
            _ => hasGreeting && hasClosing ? 4 : 3
        };
        fb.Add($"Số từ: {words} (khuyến nghị ≥ {minWords}).");
        fb.Add(hasGreeting ? "Có lời chào mở đầu." : "Thiếu lời chào (VD: Dear Mr. Smith,).");
        fb.Add(hasClosing ? "Có phần kết thư." : "Thiếu phần kết thư (VD: Best regards, ...).");
        fb.Add("Hãy chắc chắn email đã trả lời đủ các yêu cầu trong đề (câu hỏi / yêu cầu / đề xuất).");
        return new WritingGrade(score, 4, words, true, fb);
    }

    private static WritingGrade GradeEssay(string text, int words, int minWords)
    {
        var fb = new List<string>();
        if (words == 0) return new WritingGrade(0, 5, 0, true, ["Bạn chưa viết bài luận."]);

        var lower = text.ToLowerInvariant();
        var paragraphs = text.Split(["\r\n\r\n", "\n\n", "\n"], StringSplitOptions.RemoveEmptyEntries)
            .Count(p => CountWords(p) >= 15);
        var connectors = Connectors.Count(c => lower.Contains(c));

        double score = words switch
        {
            < 100 => 1,
            < 200 => 2,
            _ when words < minWords => 3,
            _ => paragraphs >= 3 && connectors >= 3 ? 5 : 4
        };
        fb.Add($"Số từ: {words} (yêu cầu ≥ {minWords}).");
        fb.Add($"Số đoạn văn: {paragraphs} (nên có mở bài – 2 đoạn thân bài – kết luận).");
        fb.Add(connectors >= 3
            ? $"Dùng tốt từ nối ({connectors} cụm)."
            : "Nên dùng thêm từ nối: First, Moreover, For example, In conclusion...");
        fb.Add("Bài luận cần có quan điểm rõ ràng và ví dụ cụ thể để đạt điểm cao.");
        return new WritingGrade(score, 5, words, true, fb);
    }

    /// <summary>Chấp nhận các dạng biến đổi thông dụng: work → works/worked/working.</summary>
    private static bool ContainsKeyword(string text, string keyword)
    {
        var lowerText = text.ToLowerInvariant();
        var parts = keyword.ToLowerInvariant().Split(' ', StringSplitOptions.RemoveEmptyEntries);
        var pattern = string.Join(@"\s+", parts.Select(p =>
        {
            var stem = p.Length > 3 && (p.EndsWith('e') || p.EndsWith('y')) ? p[..^1] : p;
            return $@"\b{Regex.Escape(stem)}\w*";
        }));
        return Regex.IsMatch(lowerText, pattern);
    }

    [GeneratedRegex(@"[A-Za-z0-9']+")]
    private static partial Regex WordRegex();

    [GeneratedRegex(@"[.!?](\s|$)")]
    private static partial Regex SentenceEndRegex();

    [GeneratedRegex(@"^\s*(dear|hello|hi|to whom)")]
    private static partial Regex GreetingRegex();

    [GeneratedRegex(@"(regards|sincerely|best wishes|thank you|thanks|yours)")]
    private static partial Regex ClosingRegex();
}
