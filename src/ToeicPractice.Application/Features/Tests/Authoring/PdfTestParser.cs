using System.Text.RegularExpressions;
using ToeicPractice.Application.Common.Interfaces;
using ToeicPractice.Application.Features.Tests.Import;
using ToeicPractice.Domain.Enums;

namespace ToeicPractice.Application.Features.Tests.Authoring;

public class ParsedQuestion
{
    public int Number { get; init; }
    public string? Content { get; set; }
    public Dictionary<string, string> Options { get; } = new();
    public List<string> Keywords { get; } = new();
}

public class ParsedGroup
{
    public ToeicPart Part { get; init; }
    public List<ParsedQuestion> Questions { get; } = new();
    public string? Passage { get; set; }
    public PdfImage? Image { get; set; }
}

public class ParsedTest
{
    public List<ParsedGroup> Groups { get; } = new();
    public List<string> Warnings { get; } = new();
}

/// <summary>
/// Dựng cấu trúc đề TOEIC từ nội dung chữ + ảnh của file PDF đề thi (dạng quyển đề ETS).
/// Nhận diện tiêu đề Part, số câu, câu hỏi + lựa chọn (A)–(D), nhóm "Questions 32-34 refer to…",
/// từ khoá Writing Q1–5, email Q6–7, đề luận Q8 và gán ảnh cho Part 1 / Writing Q1–5.
/// </summary>
public static partial class PdfTestParser
{
    private sealed class RawQuestion
    {
        public int Number { get; init; }
        public ToeicPart? Part { get; init; }
        public int Page { get; init; }
        public List<string> Body { get; } = new();
    }

    /// <summary>"Questions X-Y refer to…" + các dòng chữ ngay sau đó (đoạn văn Reading Part 6/7).</summary>
    private sealed class Range(int from, int to, int page, bool graphic)
    {
        public int From { get; } = from;
        public int To { get; } = to;
        public int Page { get; } = page;
        public bool Graphic { get; } = graphic;
        public List<string> Lines { get; } = new();
    }

    public static ParsedTest Parse(PdfContent pdf, Skill skill)
    {
        var result = new ParsedTest();
        var raws = new List<RawQuestion>();
        var ranges = new List<Range>();
        ToeicPart? current = null;
        var headerSeen = false;
        RawQuestion? open = null;
        Range? openRange = null;
        var afterHeader = false;
        var last = 0;
        var choice = skill != Skill.Writing;
        var maxNumber = choice ? 200 : 8;

        foreach (var page in pdf.Pages)
        foreach (var rawLine in page.Lines)
        {
            var line = Normalize(rawLine);
            if (line.Length == 0 || IsNoise(line)) continue;

            var header = DetectHeader(line, skill);
            if (header is not null)
            {
                current = header; headerSeen = true; open = null; openRange = null; afterHeader = true;
                continue;
            }

            var range = RangeRegex().Match(line);
            if (range.Success)
            {
                openRange = new Range(int.Parse(range.Groups[1].Value), int.Parse(range.Groups[2].Value), page.Index,
                    GraphicRegex().IsMatch(line));
                ranges.Add(openRange);
                open = null;
                continue;
            }

            if (choice && line.StartsWith("Directions", StringComparison.OrdinalIgnoreCase))
            {
                open = null; openRange = null;
                continue;
            }

            var q = (choice ? ChoiceNumberRegex() : WritingNumberRegex()).Match(line);
            var numText = q.Groups[1].Success ? q.Groups[1].Value : q.Groups[3].Value;
            // Số câu phải tăng dần, nhảy tối đa 15 – trừ khi vừa qua tiêu đề Part hoặc khớp "Questions X-Y refer to"
            // (đề rút gọn có thể nhảy 104 → 131 → 147).
            var allowJump = afterHeader || (openRange is not null && numText == openRange.From.ToString());
            if (q.Success && int.TryParse(numText, out var n) && n > last && (n <= last + 15 || allowJump) && n <= maxNumber)
            {
                afterHeader = false;
                open = new RawQuestion { Number = n, Part = current, Page = page.Index };
                var rest = q.Groups[2].Value.Trim();
                if (rest.Length > 0) open.Body.Add(rest);
                raws.Add(open);
                last = n;
                openRange = null;
                continue;
            }

            if (open is not null) open.Body.Add(line);
            else openRange?.Lines.Add(rawLine.TrimEnd());   // giữ nguyên dòng gốc của đoạn văn
        }

        if (raws.Count == 0)
        {
            result.Warnings.Add("Không nhận diện được câu hỏi nào trong PDF. Hãy kiểm tra PDF có đánh số câu dạng \"1.\", \"101.\"…");
            return result;
        }
        if (!headerSeen && skill == Skill.Listening)
            result.Warnings.Add("Không tìm thấy tiêu đề \"PART 1–4\" – đã chia Part theo số câu chuẩn (1–6, 7–31, 32–70, 71–100).");
        if (!headerSeen && skill == Skill.Reading)
            result.Warnings.Add("Không tìm thấy tiêu đề \"PART 5–7\" – đã chia Part theo số câu chuẩn (101–130, 131–146, 147–200).");
        if (!headerSeen && skill == Skill.ListeningReading)
            result.Warnings.Add("Không tìm thấy tiêu đề \"PART 1–7\" – đã chia Part theo số câu chuẩn (1–6, 7–31, 32–70, 71–100, 101–130, 131–146, 147–200).");

        // Writing luôn cố định: câu 1–5, 6–7, 8 → chia dạng bài theo số câu cho chắc chắn.
        var questions = raws
            .Select(r => (Raw: r, Part: skill == Skill.Writing ? DefaultPart(r.Number, skill) : r.Part ?? DefaultPart(r.Number, skill)))
            .ToList();

        if (choice) BuildChoice(questions, ranges, result, skill);
        else BuildWriting(questions, result);

        AssignImages(pdf, questions.Select(q => (q.Raw.Number, q.Raw.Page)).ToList(), result);
        return result;
    }

    // ------------------------------------------------------------------ Listening + Reading (trắc nghiệm)

    private static readonly ToeicPart[] SingleParts = [ToeicPart.L1_Photographs, ToeicPart.L2_QuestionResponse, ToeicPart.R5_IncompleteSentences];

    private static readonly Dictionary<ToeicPart, int> DefaultGroupSize = new()
    {
        [ToeicPart.L3_Conversations] = 3,
        [ToeicPart.L4_Talks] = 3,
        [ToeicPart.R6_TextCompletion] = 4,
        [ToeicPart.R7_ReadingComprehension] = 5,
    };

    private static void BuildChoice(List<(RawQuestion Raw, ToeicPart Part)> questions, List<Range> ranges, ParsedTest result, Skill skill)
    {
        var parsed = questions.ToDictionary(q => q.Raw.Number, q => ToChoiceQuestion(q.Raw, q.Part));

        // Part 1, 2, 5: mỗi câu một nhóm
        foreach (var (raw, part) in questions.Where(q => SingleParts.Contains(q.Part)))
        {
            var g = new ParsedGroup { Part = part };
            g.Questions.Add(parsed[raw.Number]);
            result.Groups.Add(g);
            if (part == ToeicPart.R5_IncompleteSentences && (g.Questions[0].Options.Count < 4 || string.IsNullOrWhiteSpace(g.Questions[0].Content)))
                result.Warnings.Add($"Câu {raw.Number}: chưa đọc đủ câu/4 lựa chọn – kiểm tra lại sau khi tạo đề.");
        }

        // Part 3, 4, 6, 7: theo "Questions X-Y refer to…", phần còn lại gom theo kích thước nhóm chuẩn
        foreach (var (part, size) in DefaultGroupSize)
        {
            var nums = questions.Where(q => q.Part == part).Select(q => q.Raw.Number).OrderBy(n => n).ToList();
            if (nums.Count == 0) continue;
            var used = new HashSet<int>();
            var groups = new List<ParsedGroup>();

            foreach (var r in ranges.Where(r => r.To >= r.From && r.To - r.From <= 5))
            {
                var inRange = Enumerable.Range(r.From, r.To - r.From + 1).ToList();
                if (!inRange.All(n => nums.Contains(n) && !used.Contains(n))) continue;
                var g = new ParsedGroup { Part = part };
                g.Questions.AddRange(inRange.Select(n => parsed[n]));
                // Listening không in lời thoại; Reading giữ đoạn văn đứng trước câu hỏi
                if (part.GetSkill() == Skill.Reading) g.Passage = CleanPassage(r.Lines);
                groups.Add(g);
                used.UnionWith(inRange);
            }

            foreach (var chunk in nums.Where(n => !used.Contains(n)).Chunk(size))
            {
                var g = new ParsedGroup { Part = part };
                g.Questions.AddRange(chunk.Select(n => parsed[n]));
                groups.Add(g);
                if (part.GetSkill() == Skill.Reading)
                    result.Warnings.Add($"{PartLabel(part)}: không tìm thấy dòng \"Questions {chunk[0]}-{chunk[^1]} refer to…\" – " +
                                        "chưa có đoạn văn cho nhóm câu này, hãy bổ sung trong phần sửa nhóm câu.");
                else if (chunk.Length != size)
                    result.Warnings.Add($"{PartLabel(part)}: nhóm câu {chunk[0]}–{chunk[^1]} chỉ có {chunk.Length} câu (chuẩn là {size}).");
            }
            result.Groups.AddRange(groups);

            foreach (var q in nums.Select(n => parsed[n]))
            {
                var needsContent = part != ToeicPart.R6_TextCompletion;
                if (q.Options.Count < 4 || (needsContent && string.IsNullOrWhiteSpace(q.Content)))
                    result.Warnings.Add($"Câu {q.Number}: chưa đọc đủ {(needsContent ? "câu hỏi/" : "")}4 lựa chọn – kiểm tra lại sau khi tạo đề.");
            }
        }

        result.Groups.Sort((a, b) => a.Questions[0].Number.CompareTo(b.Questions[0].Number));
    }

    /// <summary>Ghép các dòng đoạn văn: giữ xuống dòng giữa các đoạn, nối dòng bị ngắt giữa câu.</summary>
    private static string? CleanPassage(List<string> lines)
    {
        var kept = lines.Select(l => l.Trim()).Where(l => l.Length > 0 && !IsNoise(Normalize(l))).ToList();
        if (kept.Count == 0) return null;
        var sb = new System.Text.StringBuilder();
        for (var i = 0; i < kept.Count; i++)
        {
            sb.Append(kept[i]);
            if (i == kept.Count - 1) break;
            var endsSentence = ".!?:".Contains(kept[i][^1]) || kept[i].Length < 45;
            sb.Append(endsSentence ? "\n" : " ");
        }
        return sb.ToString().Trim();
    }

    private static ParsedQuestion ToChoiceQuestion(RawQuestion raw, ToeicPart part)
    {
        var q = new ParsedQuestion { Number = raw.Number };
        var body = string.Join(" ", raw.Body);
        var pieces = OptionSplitRegex().Split(body);
        var content = pieces[0].Trim();
        for (var i = 1; i + 1 < pieces.Length; i += 2)
        {
            var key = pieces[i].ToUpperInvariant();
            var text = pieces[i + 1].Trim();
            if (!q.Options.ContainsKey(key) && text.Length > 0) q.Options[key] = text;
        }
        if (part is ToeicPart.L1_Photographs or ToeicPart.L2_QuestionResponse)
        {
            // Part 1–2 không in câu hỏi; bỏ các dòng "Mark your answer…"
            q.Content = null;
            if (part == ToeicPart.L2_QuestionResponse) q.Options.Remove("D");
        }
        else q.Content = content.Length > 0 ? content : null;
        return q;
    }

    // ------------------------------------------------------------------ Writing

    private static void BuildWriting(List<(RawQuestion Raw, ToeicPart Part)> questions, ParsedTest result)
    {
        foreach (var (raw, part) in questions.OrderBy(q => q.Raw.Number))
        {
            var q = new ParsedQuestion { Number = raw.Number };
            var g = new ParsedGroup { Part = part };
            var lines = raw.Body
                .Where(l => !l.StartsWith("Directions", StringComparison.OrdinalIgnoreCase) && !QuestionLabelRegex().IsMatch(l))
                .ToList();
            // Dòng đầu không kết thúc câu (VD "Write an opinion essay") là tiêu đề mục, không phải đề bài.
            if (part == ToeicPart.W3_OpinionEssay && lines.Count > 1 && !".?!:".Contains(lines[0].TrimEnd()[^1]))
                lines.RemoveAt(0);

            switch (part)
            {
                case ToeicPart.W1_PictureSentence:
                    q.Content = "Write ONE sentence based on the picture using the TWO words or phrases given.";
                    var kw = KeywordRegex().Match(string.Join(" ", lines));
                    if (kw.Success)
                    {
                        q.Keywords.Add(kw.Groups[1].Value.Trim());
                        q.Keywords.Add(kw.Groups[2].Value.Trim());
                    }
                    else result.Warnings.Add($"Câu {q.Number}: không tìm thấy 2 từ bắt buộc dạng \"word / word\".");
                    break;

                case ToeicPart.W2_RespondEmail:
                    var idx = lines.FindIndex(l => l.Contains("Respond", StringComparison.OrdinalIgnoreCase));
                    if (idx >= 0)
                    {
                        g.Passage = string.Join("\n", lines.Take(idx)).Trim();
                        q.Content = string.Join(" ", lines.Skip(idx)).Trim();
                    }
                    else
                    {
                        g.Passage = string.Join("\n", lines).Trim();
                        result.Warnings.Add($"Câu {q.Number}: không tìm thấy yêu cầu \"Respond to the e-mail…\" – hãy bổ sung đề bài.");
                    }
                    if (string.IsNullOrWhiteSpace(g.Passage))
                        result.Warnings.Add($"Câu {q.Number}: chưa đọc được nội dung email.");
                    break;

                case ToeicPart.W3_OpinionEssay:
                    q.Content = string.Join(" ", lines).Trim();
                    if (string.IsNullOrWhiteSpace(q.Content))
                        result.Warnings.Add($"Câu {q.Number}: chưa đọc được đề bài luận.");
                    break;
            }
            g.Questions.Add(q);
            result.Groups.Add(g);
        }
    }

    // ------------------------------------------------------------------ Images

    private static void AssignImages(PdfContent pdf, List<(int Number, int Page)> positions, ParsedTest result)
    {
        var pageOf = positions.ToDictionary(p => p.Number, p => p.Page);
        var used = new HashSet<PdfImage>();
        var photoGroups = result.Groups.Where(g => g.Part is ToeicPart.L1_Photographs or ToeicPart.W1_PictureSentence).ToList();

        if (photoGroups.Count > 0)
        {
            var firstPage = photoGroups.Min(g => pageOf[g.Questions[0].Number]);
            var lastPage = photoGroups.Max(g => pageOf[g.Questions[0].Number]);
            var pool = pdf.Pages.Where(p => p.Index >= firstPage - 1 && p.Index <= lastPage)
                .SelectMany(p => p.Images.Select(i => (p.Index, Img: i)))
                .Where(x => IsPhoto(x.Img))
                .OrderBy(x => x.Index).ThenBy(x => x.Img.Top).ThenBy(x => x.Img.Left)
                .Select(x => x.Img).ToList();

            // Ảnh trên trang đứng TRƯỚC câu đầu tiên chỉ dùng khi thiếu ảnh (VD ảnh ví dụ ở trang hướng dẫn)
            if (pool.Count > photoGroups.Count)
            {
                var beforeFirst = pdf.Pages.Where(p => p.Index == firstPage - 1).SelectMany(p => p.Images).Where(IsPhoto).ToHashSet();
                pool = pool.Where(i => !beforeFirst.Contains(i)).Concat(pool.Where(beforeFirst.Contains)).ToList();
            }

            for (var i = 0; i < photoGroups.Count && i < pool.Count; i++)
            {
                photoGroups[i].Image = pool[i];
                used.Add(pool[i]);
            }

            var missing = photoGroups.Where(g => g.Image is null).ToList();
            foreach (var g in missing)
            {
                var render = pdf.Pages.FirstOrDefault(p => p.Index == pageOf[g.Questions[0].Number])?.PageRender;
                if (render is not null) g.Image = new PdfImage(render, ".png", 0, 0, 0, 0);
            }
            if (missing.Count > 0)
                result.Warnings.Add($"Có {missing.Count} câu mô tả tranh không tách được ảnh riêng " +
                                    $"({string.Join(", ", missing.Select(g => g.Questions[0].Number))}) – " +
                                    "đã dùng ảnh chụp cả trang nếu có; có thể thay ảnh trong trang chi tiết đề.");
            else if (pool.Count != photoGroups.Count)
                result.Warnings.Add($"Số ảnh tìm thấy ({pool.Count}) khác số câu mô tả tranh ({photoGroups.Count}) – kiểm tra lại ảnh từng câu.");
        }

        // Part 3/4 có biểu đồ/bảng ("Look at the graphic");
        // Part 6/7 có đoạn văn dạng ảnh (quảng cáo, biểu mẫu…) khi không đọc được chữ.
        foreach (var g in result.Groups.Where(g => g.Part is ToeicPart.L3_Conversations or ToeicPart.L4_Talks
                                                   or ToeicPart.R6_TextCompletion or ToeicPart.R7_ReadingComprehension))
        {
            var wantsImage = g.Part is ToeicPart.R6_TextCompletion or ToeicPart.R7_ReadingComprehension
                ? (g.Passage ?? "").Length < 80
                : g.Questions.Any(q => (q.Content ?? "").Contains("graphic", StringComparison.OrdinalIgnoreCase));
            if (!wantsImage) continue;
            var page = pageOf[g.Questions[0].Number];
            var img = pdf.Pages.Where(p => p.Index == page || p.Index == page - 1)
                .SelectMany(p => p.Images).Where(i => !used.Contains(i) && i.Width >= 60 && i.Height >= 40)
                .OrderBy(i => i.Top).FirstOrDefault();
            if (img is null) continue;
            g.Image = img;
            used.Add(img);
        }
    }

    private static bool IsPhoto(PdfImage i) => i.Width >= 120 && i.Height >= 90;

    // ------------------------------------------------------------------ Helpers

    private static ToeicPart? DetectHeader(string line, Skill skill)
    {
        if (skill != Skill.Writing)
        {
            var m = PartHeaderRegex().Match(line);
            if (!m.Success) return null;
            var part = (ToeicPart)int.Parse(m.Groups[1].Value);
            return part.BelongsTo(skill) ? part : null;
        }
        if (W1HeaderRegex().IsMatch(line)) return ToeicPart.W1_PictureSentence;
        if (W2HeaderRegex().IsMatch(line)) return ToeicPart.W2_RespondEmail;
        return null;
    }

    private static ToeicPart DefaultPart(int n, Skill skill) => skill switch
    {
        Skill.Listening => n <= 6 ? ToeicPart.L1_Photographs : n <= 31 ? ToeicPart.L2_QuestionResponse
            : n <= 70 ? ToeicPart.L3_Conversations : ToeicPart.L4_Talks,
        Skill.Reading => n <= 130 ? ToeicPart.R5_IncompleteSentences : n <= 146 ? ToeicPart.R6_TextCompletion
            : ToeicPart.R7_ReadingComprehension,
        Skill.ListeningReading => DefaultPart(n, n <= 100 ? Skill.Listening : Skill.Reading),
        _ => n <= 5 ? ToeicPart.W1_PictureSentence : n <= 7 ? ToeicPart.W2_RespondEmail : ToeicPart.W3_OpinionEssay
    };

    private static string PartLabel(ToeicPart p) => TestImportService.PartName(p);

    private static string Normalize(string s) => WhitespaceRegex().Replace(
        s.Replace('–', '-').Replace('—', '-').Replace('’', '\'').Replace('（', '(').Replace('）', ')'), " ").Trim();

    private static bool IsNoise(string line) =>
        NoiseRegex().IsMatch(line) || line.All(c => char.IsDigit(c) || char.IsWhiteSpace(c));

    [GeneratedRegex(@"\s+")] private static partial Regex WhitespaceRegex();
    [GeneratedRegex(@"^PART\s*([1-7])\b", RegexOptions.IgnoreCase)] private static partial Regex PartHeaderRegex();
    [GeneratedRegex(@"Questions?\s*1\s*-\s*5\b", RegexOptions.IgnoreCase)] private static partial Regex W1HeaderRegex();
    [GeneratedRegex(@"Questions?\s*6\s*-\s*7\b", RegexOptions.IgnoreCase)] private static partial Regex W2HeaderRegex();
    [GeneratedRegex(@"Questions?\s*(\d{1,3})\s*(?:-|through|to|and)\s*(\d{1,3})\s*refer", RegexOptions.IgnoreCase)] private static partial Regex RangeRegex();
    [GeneratedRegex(@"graphic|table|chart|map|schedule|list|floor plan|coupon|menu", RegexOptions.IgnoreCase)] private static partial Regex GraphicRegex();
    [GeneratedRegex(@"^(\d{1,3})\s*[\.\)](?!\d)\s*(.*)$")] private static partial Regex ChoiceNumberRegex();
    [GeneratedRegex(@"^(?:Question\s+)?([1-8])\s*[\.\):](?!\d)\s*(.*)$|^Question\s+([1-8])\s*$", RegexOptions.IgnoreCase)] private static partial Regex WritingNumberRegex();
    [GeneratedRegex(@"\(([A-Da-d])\)")] private static partial Regex OptionSplitRegex();
    [GeneratedRegex(@"^Questions?\s*\d+(\s*-\s*\d+)?\s*:?$", RegexOptions.IgnoreCase)] private static partial Regex QuestionLabelRegex();
    [GeneratedRegex(@"([A-Za-z][A-Za-z'\-]*(?:\s[A-Za-z][A-Za-z'\-]*){0,2})\s*/\s*([A-Za-z][A-Za-z'\-]*(?:\s[A-Za-z][A-Za-z'\-]*){0,2})")] private static partial Regex KeywordRegex();
    [GeneratedRegex(@"^(GO ON TO THE NEXT PAGE|Mark your answer on your answer sheet\.?|Page \d+|\d+\s*/\s*\d+|TOEIC|LISTENING TEST|WRITING TEST)$", RegexOptions.IgnoreCase)] private static partial Regex NoiseRegex();
}
