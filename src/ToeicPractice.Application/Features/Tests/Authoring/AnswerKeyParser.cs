using System.Text.RegularExpressions;

namespace ToeicPractice.Application.Features.Tests.Authoring;

/// <summary>Đọc đáp án từ văn bản trích từ PDF / OCR ảnh đáp án.</summary>
public static partial class AnswerKeyParser
{
    /// <summary>
    /// Đáp án trắc nghiệm. Nhận các kiểu viết: "1. B", "1 (B)", "1-B", "1: b", "1 | B", "Question 1 B",
    /// kể cả khi nhiều đáp án nằm trên cùng một dòng / dạng bảng.
    /// </summary>
    /// <param name="optionCount">Số lựa chọn hợp lệ của từng câu (3 cho Part 2, 4 cho phần còn lại).</param>
    public static Dictionary<int, string> ParseChoices(string text, IReadOnlyDictionary<int, int> optionCount)
    {
        var found = new Dictionary<int, string>();
        var normalized = text
            .Replace('（', '(').Replace('）', ')')
            .Replace('–', '-').Replace('—', '-');
        // Lỗi OCR hay gặp ở số thứ tự câu: "I." → "1.", "IO." → "10.", "II." → "11.", "l2." → "12."
        normalized = OcrNumberRegex().Replace(normalized,
            m => m.Groups[1].Value.Replace('I', '1').Replace('l', '1').Replace('|', '1').Replace('O', '0').Replace('o', '0'));

        foreach (Match m in ChoiceRegex().Matches(normalized))
        {
            if (!int.TryParse(m.Groups["num"].Value, out var n) || !optionCount.TryGetValue(n, out var count)) continue;
            if (found.ContainsKey(n)) continue;

            var raw = m.Groups["ans"].Value.ToUpperInvariant();
            // Lỗi OCR thường gặp: (8) → B, (0) → D khi nằm trong ngoặc
            var letter = raw switch
            {
                "8" when m.Groups["open"].Success => "B",
                "0" when m.Groups["open"].Success => "D",
                _ => raw
            };
            if (letter.Length != 1 || letter[0] < 'A' || letter[0] >= 'A' + count) continue;
            found[n] = letter;
        }
        return found;
    }

    /// <summary>Bài mẫu Writing: tách theo tiêu đề "1.", "Question 6:", "Q8)"… ở đầu dòng.</summary>
    public static Dictionary<int, string> ParseWritten(string text, IReadOnlyCollection<int> numbers)
    {
        var found = new Dictionary<int, string>();
        var heads = HeadingRegex().Matches(text.Replace("\r\n", "\n"))
            .Where(m => int.TryParse(m.Groups[1].Value, out var n) && numbers.Contains(n))
            .ToList();

        for (var i = 0; i < heads.Count; i++)
        {
            var n = int.Parse(heads[i].Groups[1].Value);
            if (found.ContainsKey(n)) continue;
            var start = heads[i].Index + heads[i].Length;
            var end = i + 1 < heads.Count ? heads[i + 1].Index : text.Length;
            var body = text[start..Math.Min(end, text.Length)].Trim();
            if (body.Length > 0) found[n] = body;
        }
        return found;
    }

    [GeneratedRegex(@"(?<![\d.,])(?<num>\d{1,3})\s*(?:[.):\-=|]\s*)?(?<open>\()?\s*(?<ans>[A-D80])\s*\)?(?![A-Za-z0-9])")]
    private static partial Regex ChoiceRegex();

    /// <summary>Token 1–3 ký tự gồm số và các chữ dễ nhầm với số, đứng ngay trước dấu . ) : của số câu.</summary>
    [GeneratedRegex(@"(?<![A-Za-z0-9])((?=[0-9IlO|o]{1,3}\s*[.):])(?=[0-9IlO|o]*[0-9Il|])[0-9IlO|o]{1,3})(?=\s*[.):])")]
    private static partial Regex OcrNumberRegex();

    [GeneratedRegex(@"^[ \t]*(?:Question|Q)?\s*([1-8])\s*[.):](?!\d)", RegexOptions.Multiline | RegexOptions.IgnoreCase)]
    private static partial Regex HeadingRegex();
}
