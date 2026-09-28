using ToeicPractice.Domain.Entities;
using ToeicPractice.Domain.Enums;

namespace ToeicPractice.Application.Features.Tests.Authoring;

/// <summary>Kiểm tra một đề đã đủ điều kiện công khai cho học viên chưa.</summary>
public static class TestReadiness
{
    /// <summary>
    /// Audio thực tế của nhóm: riêng của nhóm → track của Part → track cả đề.
    /// Track dùng chung chỉ áp dụng cho Part 1–4 (đề Listening &amp; Reading có cả Part 5–7 không cần audio).
    /// </summary>
    public static string? EffectiveAudio(Test test, QuestionGroup g) =>
        !string.IsNullOrEmpty(g.AudioUrl) ? g.AudioUrl
            : g.Part.GetSkill() != Skill.Listening ? null
            : test.AudioTracks.FirstOrDefault(t => t.Part == g.Part)?.Url
              ?? test.AudioTracks.FirstOrDefault(t => t.Part == null)?.Url;

    public static TestReadinessDto Evaluate(Test test)
    {
        var issues = new List<string>();
        var groups = test.Groups.OrderBy(g => g.OrderIndex).ToList();
        var questions = groups.SelectMany(g => g.Questions.Select(q => (g, q))).ToList();
        var listeningGroups = groups.Where(g => g.Part.GetSkill() == Skill.Listening).ToList();
        var listening = test.Skill is Skill.Listening or Skill.ListeningReading;
        var choice = test.Skill != Skill.Writing;

        if (questions.Count == 0) issues.Add("Đề chưa có câu hỏi nào.");

        int answered;
        if (choice)
        {
            var missing = questions.Where(x => string.IsNullOrEmpty(x.q.CorrectAnswer)).Select(x => x.q.Number).ToList();
            answered = questions.Count - missing.Count;
            if (missing.Count > 0) issues.Add($"Còn {missing.Count} câu chưa có đáp án ({Summarize(missing)}).");

            // Part 1–2 không in lựa chọn; Part 6 không cần nội dung câu hỏi (chỗ trống nằm trong đoạn văn).
            var partial = questions
                .Where(x => x.g.Part is not (ToeicPart.L1_Photographs or ToeicPart.L2_QuestionResponse) &&
                            ((x.g.Part != ToeicPart.R6_TextCompletion && string.IsNullOrWhiteSpace(x.q.Content)) ||
                             new[] { x.q.OptionA, x.q.OptionB, x.q.OptionC, x.q.OptionD }.Any(string.IsNullOrWhiteSpace)))
                .Select(x => x.q.Number).ToList();
            if (partial.Count > 0) issues.Add($"{partial.Count} câu thiếu nội dung câu hỏi hoặc lựa chọn ({Summarize(partial)}).");

            var noPassage = groups
                .Where(g => g.Part is ToeicPart.R6_TextCompletion or ToeicPart.R7_ReadingComprehension &&
                            string.IsNullOrWhiteSpace(g.Passage) && string.IsNullOrEmpty(g.ImageUrl))
                .Select(g => g.Questions.Min(q => q.Number)).ToList();
            if (noPassage.Count > 0) issues.Add($"Part 6/7: {noPassage.Count} nhóm câu chưa có đoạn văn ({Summarize(noPassage)}).");

            var noImage = groups.Where(g => g.Part == ToeicPart.L1_Photographs && string.IsNullOrEmpty(g.ImageUrl))
                .Select(g => g.Questions.Min(q => q.Number)).ToList();
            if (noImage.Count > 0) issues.Add($"Part 1: {noImage.Count} câu chưa có ảnh ({Summarize(noImage)}).");
        }
        else
        {
            var missing = questions.Where(x => string.IsNullOrWhiteSpace(x.q.SampleAnswer)).Select(x => x.q.Number).ToList();
            answered = questions.Count - missing.Count;
            if (missing.Count > 0) issues.Add($"Còn {missing.Count} câu chưa có bài mẫu/đáp án ({Summarize(missing)}).");

            foreach (var (g, q) in questions)
            {
                if (g.Part == ToeicPart.W1_PictureSentence)
                {
                    if (string.IsNullOrEmpty(g.ImageUrl)) issues.Add($"Câu {q.Number}: chưa có ảnh.");
                    if ((q.RequiredKeywords ?? "").Split('|', StringSplitOptions.RemoveEmptyEntries).Length != 2)
                        issues.Add($"Câu {q.Number}: cần đúng 2 từ bắt buộc.");
                }
                if (g.Part == ToeicPart.W2_RespondEmail && string.IsNullOrWhiteSpace(g.Passage))
                    issues.Add($"Câu {q.Number}: chưa có nội dung email.");
                if (g.Part is ToeicPart.W2_RespondEmail or ToeicPart.W3_OpinionEssay && string.IsNullOrWhiteSpace(q.Content))
                    issues.Add($"Câu {q.Number}: chưa có yêu cầu đề bài.");
            }
        }

        var withAudio = listening ? listeningGroups.Count(g => EffectiveAudio(test, g) != null) : 0;
        if (listening && withAudio < listeningGroups.Count)
        {
            var missingParts = listeningGroups.Where(g => EffectiveAudio(test, g) == null).Select(g => (int)g.Part).Distinct().OrderBy(p => p);
            issues.Add($"Còn {listeningGroups.Count - withAudio}/{listeningGroups.Count} nhóm câu chưa có audio (Part {string.Join(", ", missingParts)}).");
        }
        if (test.Skill == Skill.ListeningReading)
        {
            var missingSections = new[] { (Skill.Listening, "Listening (Part 1–4)"), (Skill.Reading, "Reading (Part 5–7)") }
                .Where(s => groups.All(g => g.Part.GetSkill() != s.Item1)).Select(s => s.Item2).ToList();
            if (missingSections.Count > 0) issues.Add($"Đề thi Listening & Reading còn thiếu phần {string.Join(" và ", missingSections)}.");
        }

        return new TestReadinessDto(questions.Count, answered, listening, listening ? listeningGroups.Count : groups.Count,
            withAudio, issues.Count == 0, issues);
    }

    private static string Summarize(List<int> numbers)
    {
        numbers = numbers.OrderBy(n => n).ToList();
        var shown = numbers.Take(8).Select(n => n.ToString());
        return numbers.Count > 8 ? $"câu {string.Join(", ", shown)}…" : $"câu {string.Join(", ", shown)}";
    }
}
