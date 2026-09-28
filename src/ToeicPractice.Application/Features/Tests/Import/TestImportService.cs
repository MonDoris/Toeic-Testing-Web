using System.IO.Compression;
using System.Text.Json;
using ToeicPractice.Application.Common.Exceptions;
using ToeicPractice.Application.Common.Interfaces;
using ToeicPractice.Domain.Entities;
using ToeicPractice.Domain.Enums;

namespace ToeicPractice.Application.Features.Tests.Import;

public interface ITestImportService
{
    /// <summary>
    /// Nhập đề từ file .zip (test.json + media) hoặc .json.
    /// <paramref name="dryRun"/> = true: chỉ kiểm tra định dạng, không lưu.
    /// </summary>
    Task<ImportResultDto> ImportAsync(Stream file, string fileName, bool dryRun, CancellationToken ct);
}

public class TestImportService(IApplicationDbContext db, IFileStorage storage) : ITestImportService
{
    private const long MaxEntryBytes = 50 * 1024 * 1024;

    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNameCaseInsensitive = true,
        ReadCommentHandling = JsonCommentHandling.Skip,
        AllowTrailingCommas = true
    };

    public async Task<ImportResultDto> ImportAsync(Stream file, string fileName, bool dryRun, CancellationToken ct)
    {
        var ext = Path.GetExtension(fileName).ToLowerInvariant();
        if (ext == ".json")
        {
            var pkg = await DeserializeAsync(file, ct);
            return await ProcessAsync(pkg, media: null, dryRun, ct);
        }
        if (ext != ".zip")
            throw new ValidationAppException("Chỉ chấp nhận file .zip (test.json + media) hoặc .json.");

        using var buffer = new MemoryStream();
        await file.CopyToAsync(buffer, ct);
        buffer.Position = 0;

        ZipArchive archive;
        try { archive = new ZipArchive(buffer, ZipArchiveMode.Read); }
        catch (InvalidDataException) { throw new ValidationAppException("File zip bị hỏng hoặc không đúng định dạng."); }

        using (archive)
        {
            var manifest = archive.Entries.FirstOrDefault(e =>
                               e.FullName.Equals("test.json", StringComparison.OrdinalIgnoreCase))
                           ?? archive.Entries.FirstOrDefault(e =>
                               e.FullName.Replace('\\', '/').Split('/')[^1].Equals("test.json", StringComparison.OrdinalIgnoreCase))
                           ?? throw new ValidationAppException("Không tìm thấy file test.json trong gói đề.");

            await using var manifestStream = manifest.Open();
            var pkg = await DeserializeAsync(manifestStream, ct);

            // Media được tham chiếu tương đối với thư mục chứa test.json.
            var manifestPath = manifest.FullName.Replace('\\', '/');
            var slash = manifestPath.LastIndexOf('/');
            var root = slash >= 0 ? manifestPath[..(slash + 1)] : "";
            return await ProcessAsync(pkg, new ZipMedia(archive, root), dryRun, ct);
        }
    }

    private static async Task<TestPackage> DeserializeAsync(Stream stream, CancellationToken ct)
    {
        try
        {
            return await JsonSerializer.DeserializeAsync<TestPackage>(stream, JsonOptions, ct)
                   ?? throw new ValidationAppException("File test.json rỗng.");
        }
        catch (JsonException ex)
        {
            throw new ValidationAppException($"test.json sai cú pháp JSON: {ex.Message}");
        }
    }

    private async Task<ImportResultDto> ProcessAsync(TestPackage pkg, ZipMedia? media, bool dryRun, CancellationToken ct)
    {
        var (skill, errors, warnings) = Validate(pkg, media);
        if (errors.Count > 0) throw new ValidationAppException(errors);

        var parts = pkg.Groups.GroupBy(g => g.Part).OrderBy(g => g.Key)
            .Select(g => new PartCountDto(g.Key, g.Sum(x => x.Questions.Count))).ToList();
        var questionCount = parts.Sum(p => p.Questions);
        var duration = pkg.DurationMinutes ?? DefaultDuration(skill, questionCount);

        if (dryRun)
            return new ImportResultDto(null, pkg.Title, skill.ToString(), questionCount, parts, warnings, false);

        var savedUrls = new List<string>();
        try
        {
            var test = new Test
            {
                Title = pkg.Title.Trim(),
                Description = pkg.Description?.Trim(),
                Skill = skill,
                DurationMinutes = duration,
                IsPublished = pkg.Publish
            };

            var order = 0;
            foreach (var g in pkg.Groups.OrderBy(x => x.Questions.Min(q => q.Number)))
            {
                var part = (ToeicPart)g.Part;
                var group = new QuestionGroup
                {
                    Part = part,
                    OrderIndex = ++order,
                    Passage = g.Passage?.Trim(),
                    Transcript = g.Transcript?.Trim(),
                    AudioUrl = await ResolveMediaAsync(g.Audio, media, "audio", savedUrls, ct),
                    ImageUrl = await ResolveMediaAsync(g.Image, media, "images", savedUrls, ct)
                };
                foreach (var q in g.Questions.OrderBy(x => x.Number))
                    group.Questions.Add(MapQuestion(q, part));
                test.Groups.Add(group);
            }

            db.Tests.Add(test);
            await db.SaveChangesAsync(ct);
            return new ImportResultDto(test.Id, test.Title, skill.ToString(), questionCount, parts, warnings, true);
        }
        catch
        {
            foreach (var url in savedUrls) await storage.DeleteAsync(url, CancellationToken.None);
            throw;
        }
    }

    private static Question MapQuestion(PackageQuestion q, ToeicPart part)
    {
        string? Opt(string key) => q.Options?.FirstOrDefault(o => o.Key.Equals(key, StringComparison.OrdinalIgnoreCase)).Value?.Trim();
        return new Question
        {
            Number = q.Number,
            Content = q.Content?.Trim(),
            OptionA = Opt("A"),
            OptionB = Opt("B"),
            OptionC = Opt("C"),
            OptionD = part == ToeicPart.L2_QuestionResponse ? null : Opt("D"),
            CorrectAnswer = q.Answer?.Trim().ToUpperInvariant(),
            Explanation = q.Explanation?.Trim(),
            RequiredKeywords = q.Keywords is { Count: > 0 } ? string.Join("|", q.Keywords.Select(k => k.Trim())) : null,
            SampleAnswer = q.SampleAnswer?.Trim(),
            MinWords = q.MinWords ?? part switch
            {
                ToeicPart.W2_RespondEmail => 100,
                ToeicPart.W3_OpinionEssay => 300,
                _ => null
            }
        };
    }

    private async Task<string?> ResolveMediaAsync(string? path, ZipMedia? media, string folder, List<string> saved, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(path)) return null;
        if (IsAbsoluteUrl(path)) return path;
        var entry = media!.Find(path)!;
        await using var stream = entry.Open();
        var url = await storage.SaveAsync(stream, entry.Name, folder, ct);
        saved.Add(url);
        return url;
    }

    // ===================== Validation theo đúng dạng bài TOEIC =====================

    internal static (Skill Skill, List<string> Errors, List<string> Warnings) Validate(TestPackage pkg, ZipMedia? media)
    {
        var errors = new List<string>();
        var warnings = new List<string>();

        if (string.IsNullOrWhiteSpace(pkg.Title)) errors.Add("Thiếu \"title\" (tên đề).");
        if (!Enum.TryParse<Skill>(pkg.Skill, true, out var skill))
        {
            errors.Add("\"skill\" phải là \"Listening\", \"Reading\", \"Writing\" hoặc \"ListeningReading\" (đề thi đủ Part 1–7).");
            return (default, errors, warnings);
        }
        if (pkg.Groups.Count == 0) errors.Add("Đề chưa có câu hỏi nào (\"groups\" rỗng).");
        if (pkg.DurationMinutes is < 1 or > 300) errors.Add("\"durationMinutes\" phải từ 1–300.");

        var numbers = new List<int>();
        for (var i = 0; i < pkg.Groups.Count; i++)
        {
            var g = pkg.Groups[i];
            var label = $"Nhóm #{i + 1}";
            if (!Enum.IsDefined(typeof(ToeicPart), g.Part))
            {
                errors.Add($"{label}: part \"{g.Part}\" không hợp lệ (Listening: 1–4, Reading: 5–7, Writing: 11–13).");
                continue;
            }
            var part = (ToeicPart)g.Part;
            label = $"{label} ({PartName(part)})";
            if (!part.BelongsTo(skill))
            {
                errors.Add($"{label}: không thuộc kỹ năng {skill}.");
                continue;
            }
            if (g.Questions.Count == 0) { errors.Add($"{label}: chưa có câu hỏi."); continue; }

            var (min, max) = part.QuestionsPerGroup();
            if (g.Questions.Count < min || g.Questions.Count > max)
                errors.Add(min == max
                    ? $"{label}: mỗi nhóm {PartName(part)} phải có đúng {min} câu (đang có {g.Questions.Count})."
                    : $"{label}: mỗi nhóm {PartName(part)} có từ {min}–{max} câu (đang có {g.Questions.Count}).");

            ValidateMedia(g.Audio, media, MediaRules.AudioExtensions, $"{label} – audio", errors);
            ValidateMedia(g.Image, media, MediaRules.ImageExtensions, $"{label} – image", errors);

            switch (part)
            {
                case ToeicPart.L1_Photographs:
                    Require(g.Audio, $"{label}: Part 1 bắt buộc có audio.", errors);
                    Require(g.Image, $"{label}: Part 1 bắt buộc có ảnh.", errors);
                    break;
                case ToeicPart.L2_QuestionResponse:
                case ToeicPart.L3_Conversations:
                case ToeicPart.L4_Talks:
                    Require(g.Audio, $"{label}: bắt buộc có audio.", errors);
                    break;
                case ToeicPart.R6_TextCompletion:
                case ToeicPart.R7_ReadingComprehension:
                    if (string.IsNullOrWhiteSpace(g.Passage) && string.IsNullOrWhiteSpace(g.Image))
                        errors.Add($"{label}: bắt buộc có \"passage\" (đoạn văn) hoặc ảnh đoạn văn.");
                    break;
                case ToeicPart.W1_PictureSentence:
                    Require(g.Image, $"{label}: bắt buộc có ảnh để mô tả.", errors);
                    break;
                case ToeicPart.W2_RespondEmail:
                    Require(g.Passage, $"{label}: bắt buộc có \"passage\" là nội dung email cần trả lời.", errors);
                    break;
            }
            if (part.GetSkill() == Skill.Listening && string.IsNullOrWhiteSpace(g.Transcript))
                warnings.Add($"{label}: chưa có transcript – học viên sẽ không xem được lời thoại khi chữa bài.");

            foreach (var q in g.Questions)
            {
                var ql = $"Câu {q.Number}";
                if (q.Number <= 0) errors.Add($"{label}: số thứ tự câu phải > 0.");
                numbers.Add(q.Number);
                if (part.IsMultipleChoice()) ValidateChoiceQuestion(part, q, ql, errors, warnings);
                else ValidateWritingQuestion(part, q, ql, errors, warnings);
            }
        }

        var dup = numbers.GroupBy(n => n).Where(x => x.Count() > 1).Select(x => x.Key).ToList();
        if (dup.Count > 0) errors.Add($"Trùng số thứ tự câu: {string.Join(", ", dup)}.");

        if (errors.Count == 0 && skill == Skill.ListeningReading)
        {
            if (pkg.Groups.All(g => g.Part > 4)) errors.Add("Đề thi Listening & Reading phải có phần Listening (Part 1–4).");
            if (pkg.Groups.All(g => g.Part is < 5 or > 7)) errors.Add("Đề thi Listening & Reading phải có phần Reading (Part 5–7).");
        }
        if (errors.Count == 0) AddStructureWarnings(pkg, skill, warnings);
        return (skill, errors, warnings);
    }

    private static void ValidateChoiceQuestion(ToeicPart part, PackageQuestion q, string ql, List<string> errors, List<string> warnings)
    {
        var keys = "ABCD"[..part.OptionCount()];
        var answer = q.Answer?.Trim().ToUpperInvariant();
        if (string.IsNullOrEmpty(answer) || answer.Length != 1 || !keys.Contains(answer))
            errors.Add($"{ql}: \"answer\" phải là một trong {string.Join("/", keys.ToCharArray())}.");

        var provided = q.Options?.Keys.Select(k => k.Trim().ToUpperInvariant()).ToList() ?? [];
        var extra = provided.Where(k => !keys.Contains(k) || k.Length != 1).ToList();
        if (extra.Count > 0)
            errors.Add($"{ql}: {PartName(part)} chỉ có {keys.Length} lựa chọn ({string.Join("/", keys.ToCharArray())}), thừa: {string.Join(", ", extra)}.");

        // Part 1–2: lựa chọn chỉ được đọc trong audio. Các Part còn lại phải in đủ 4 lựa chọn.
        if (part is not (ToeicPart.L1_Photographs or ToeicPart.L2_QuestionResponse))
        {
            // Part 6: chỗ trống nằm trong đoạn văn nên câu hỏi không cần nội dung riêng.
            if (part != ToeicPart.R6_TextCompletion && string.IsNullOrWhiteSpace(q.Content))
                errors.Add($"{ql}: {PartName(part)} bắt buộc có nội dung câu hỏi (\"content\").");
            var missing = keys.Where(k => q.Options == null ||
                                          !q.Options.Any(o => o.Key.Equals(k.ToString(), StringComparison.OrdinalIgnoreCase) && !string.IsNullOrWhiteSpace(o.Value)));
            var missingList = missing.ToList();
            if (missingList.Count > 0) errors.Add($"{ql}: thiếu nội dung lựa chọn {string.Join(", ", missingList)}.");
        }
        else if (provided.Count > 0 && provided.Count < keys.Length)
        {
            warnings.Add($"{ql}: chỉ có {provided.Count}/{keys.Length} lựa chọn được ghi lời thoại.");
        }
    }

    private static void ValidateWritingQuestion(ToeicPart part, PackageQuestion q, string ql, List<string> errors, List<string> warnings)
    {
        switch (part)
        {
            case ToeicPart.W1_PictureSentence:
                if (q.Keywords is not { Count: 2 } || q.Keywords.Any(string.IsNullOrWhiteSpace))
                    errors.Add($"{ql}: Writing Q1–5 phải có đúng 2 từ/cụm từ bắt buộc trong \"keywords\".");
                break;
            case ToeicPart.W2_RespondEmail:
            case ToeicPart.W3_OpinionEssay:
                if (string.IsNullOrWhiteSpace(q.Content)) errors.Add($"{ql}: thiếu yêu cầu đề bài (\"content\").");
                break;
        }
        if (string.IsNullOrWhiteSpace(q.SampleAnswer))
            warnings.Add($"{ql}: chưa có bài mẫu (\"sampleAnswer\").");
    }

    private static void AddStructureWarnings(TestPackage pkg, Skill skill, List<string> warnings)
    {
        var counts = pkg.Groups.GroupBy(g => g.Part).ToDictionary(g => g.Key, g => g.Sum(x => x.Questions.Count));
        var official = skill switch
        {
            Skill.Listening => new Dictionary<int, int> { [1] = 6, [2] = 25, [3] = 39, [4] = 30 },
            Skill.Reading => new Dictionary<int, int> { [5] = 30, [6] = 16, [7] = 54 },
            Skill.ListeningReading => new Dictionary<int, int> { [1] = 6, [2] = 25, [3] = 39, [4] = 30, [5] = 30, [6] = 16, [7] = 54 },
            _ => new Dictionary<int, int> { [11] = 5, [12] = 2, [13] = 1 }
        };
        var diffs = official
            .Where(o => counts.GetValueOrDefault(o.Key) != o.Value)
            .Select(o => $"{PartName((ToeicPart)o.Key)}: {counts.GetValueOrDefault(o.Key)}/{o.Value}")
            .ToList();
        if (diffs.Count > 0)
            warnings.Add($"Số câu khác đề thi thật ({string.Join("; ", diffs)}) – đề sẽ được xem là đề rút gọn, điểm quy đổi theo tỉ lệ.");
    }

    private static void ValidateMedia(string? path, ZipMedia? media, string[] allowedExt, string label, List<string> errors)
    {
        if (string.IsNullOrWhiteSpace(path) || IsAbsoluteUrl(path)) return;
        var ext = Path.GetExtension(path).ToLowerInvariant();
        if (!allowedExt.Contains(ext))
        {
            errors.Add($"{label}: định dạng {ext} không hỗ trợ (cho phép {string.Join(", ", allowedExt)}).");
            return;
        }
        if (media is null)
        {
            errors.Add($"{label}: \"{path}\" là đường dẫn tương đối – hãy upload dạng .zip kèm file media, hoặc dùng URL http(s).");
            return;
        }
        var entry = media.Find(path);
        if (entry is null) errors.Add($"{label}: không tìm thấy file \"{path}\" trong gói zip.");
        else if (entry.Length > MaxEntryBytes) errors.Add($"{label}: file \"{path}\" vượt quá 50MB.");
    }

    private static void Require(string? value, string message, List<string> errors)
    {
        if (string.IsNullOrWhiteSpace(value)) errors.Add(message);
    }

    private static bool IsAbsoluteUrl(string path) =>
        Uri.TryCreate(path, UriKind.Absolute, out var uri) && (uri.Scheme == Uri.UriSchemeHttp || uri.Scheme == Uri.UriSchemeHttps);

    public static int DefaultDuration(Skill skill, int questions) => skill switch
    {
        Skill.Listening => Math.Max(5, (int)Math.Ceiling(questions * 0.45)),  // 100 câu ≈ 45 phút
        Skill.Reading => Math.Max(5, (int)Math.Ceiling(questions * 0.75)),    // 100 câu = 75 phút
        Skill.ListeningReading => Math.Max(10, (int)Math.Ceiling(questions * 0.6)), // 200 câu = 45 + 75 = 120 phút
        _ => Math.Max(10, questions >= 8 ? 60 : questions * 8)                // đề đủ 8 câu = 60 phút
    };

    public static string PartName(ToeicPart p) => p switch
    {
        ToeicPart.L1_Photographs => "Part 1",
        ToeicPart.L2_QuestionResponse => "Part 2",
        ToeicPart.L3_Conversations => "Part 3",
        ToeicPart.L4_Talks => "Part 4",
        ToeicPart.R5_IncompleteSentences => "Part 5",
        ToeicPart.R6_TextCompletion => "Part 6",
        ToeicPart.R7_ReadingComprehension => "Part 7",
        ToeicPart.W1_PictureSentence => "Writing Q1–5",
        ToeicPart.W2_RespondEmail => "Writing Q6–7",
        ToeicPart.W3_OpinionEssay => "Writing Q8",
        _ => p.ToString()
    };

    internal sealed class ZipMedia(ZipArchive archive, string root)
    {
        public ZipArchiveEntry? Find(string relativePath)
        {
            var normalized = relativePath.Replace('\\', '/').TrimStart('.', '/');
            if (normalized.Contains("..")) return null; // chặn path traversal
            var full = root + normalized;
            // Một số công cụ nén trên Windows ghi đường dẫn bằng dấu "\".
            return archive.Entries.FirstOrDefault(e =>
                e.FullName.Replace('\\', '/').Equals(full, StringComparison.OrdinalIgnoreCase));
        }
    }
}
