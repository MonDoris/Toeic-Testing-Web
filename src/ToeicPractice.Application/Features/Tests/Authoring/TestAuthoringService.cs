using System.Text;
using System.Text.RegularExpressions;
using Microsoft.EntityFrameworkCore;
using ToeicPractice.Application.Common.Exceptions;
using ToeicPractice.Application.Common.Interfaces;
using ToeicPractice.Application.Features.Tests.Import;
using ToeicPractice.Domain.Entities;
using ToeicPractice.Domain.Enums;

namespace ToeicPractice.Application.Features.Tests.Authoring;

/// <summary>
/// Quy trình soạn đề: (1) upload PDF đề → dựng cấu trúc (bản nháp) → (2) upload đáp án ảnh/PDF → đối chiếu, lưu
/// → (3) Listening: upload audio → (4) công khai khi đủ điều kiện.
/// </summary>
public interface ITestAuthoringService
{
    Task<PdfImportResultDto> CreateFromPdfAsync(UploadedFile pdf, string skill, string? title, CancellationToken ct);
    Task<AnswerKeyProposalDto> ExtractAnswerKeyAsync(Guid testId, IReadOnlyList<UploadedFile> files, CancellationToken ct);
    Task<TestReadinessDto> SaveAnswersAsync(Guid testId, SaveAnswersRequest request, CancellationToken ct);
    Task<AudioUploadResultDto> UploadAudioAsync(Guid testId, IReadOnlyList<UploadedFile> files, string target, CancellationToken ct);
    Task<TestReadinessDto> DeleteAudioTrackAsync(Guid testId, Guid trackId, CancellationToken ct);
}

public partial class TestAuthoringService(
    IApplicationDbContext db,
    IFileStorage storage,
    IPdfDocumentReader pdfReader,
    IOcrService ocr) : ITestAuthoringService
{
    private const long MaxPdfBytes = 80L * 1024 * 1024;
    private static readonly string[] AnswerImageExt = [".png", ".jpg", ".jpeg", ".bmp", ".gif", ".tif", ".tiff"];

    // ============================================================ 1. PDF đề → cấu trúc

    public async Task<PdfImportResultDto> CreateFromPdfAsync(UploadedFile pdf, string skill, string? title, CancellationToken ct)
    {
        if (!Enum.TryParse<Skill>(skill, true, out var sk)) throw new ValidationAppException("Chọn kỹ năng Listening, Reading, Writing hoặc đề thi Listening & Reading.");
        if (!pdf.FileName.EndsWith(".pdf", StringComparison.OrdinalIgnoreCase)) throw new ValidationAppException("File đề phải là PDF.");

        var bytes = await ReadAllAsync(pdf.Content, MaxPdfBytes, ct);
        PdfContent content;
        try { content = await pdfReader.ReadAsync(new MemoryStream(bytes), ct); }
        catch (AppException) { throw; }
        catch (Exception) { throw new ValidationAppException("Không đọc được file PDF (file hỏng hoặc có mật khẩu)."); }

        var parsed = PdfTestParser.Parse(content, sk);
        if (parsed.Groups.Count == 0) throw new ValidationAppException(parsed.Warnings);

        var saved = new List<string>();
        try
        {
            var pdfUrl = await storage.SaveAsync(new MemoryStream(bytes), pdf.FileName, "pdf", ct);
            saved.Add(pdfUrl);

            var test = new Test
            {
                Title = ResolveTitle(title, content.Title, pdf.FileName),
                Description = $"Tạo từ file {Path.GetFileName(pdf.FileName)}",
                Skill = sk,
                IsPublished = false,
                SourcePdfUrl = pdfUrl
            };

            var order = 0;
            foreach (var g in parsed.Groups)
            {
                var group = new QuestionGroup { Part = g.Part, OrderIndex = ++order, Passage = g.Passage };
                if (g.Image is not null)
                {
                    group.ImageUrl = await storage.SaveAsync(new MemoryStream(g.Image.Bytes), "image" + g.Image.Extension, "images", ct);
                    saved.Add(group.ImageUrl);
                }
                foreach (var q in g.Questions)
                {
                    string? Opt(string k) => q.Options.GetValueOrDefault(k);
                    group.Questions.Add(new Question
                    {
                        Number = q.Number,
                        Content = q.Content,
                        OptionA = Opt("A"), OptionB = Opt("B"), OptionC = Opt("C"),
                        OptionD = g.Part == ToeicPart.L2_QuestionResponse ? null : Opt("D"),
                        RequiredKeywords = q.Keywords.Count > 0 ? string.Join("|", q.Keywords) : null,
                        MinWords = g.Part switch { ToeicPart.W2_RespondEmail => 100, ToeicPart.W3_OpinionEssay => 300, _ => null }
                    });
                }
                test.Groups.Add(group);
            }

            var questionCount = test.Groups.Sum(g => g.Questions.Count);
            test.DurationMinutes = TestImportService.DefaultDuration(sk, questionCount);

            db.Tests.Add(test);
            await db.SaveChangesAsync(ct);

            var parts = test.Groups.GroupBy(g => g.Part).OrderBy(g => g.Key)
                .Select(g => new PartCountDto((int)g.Key, g.Sum(x => x.Questions.Count))).ToList();
            var warnings = parsed.Warnings.ToList();
            if (content.UsedOcr) warnings.Insert(0, "PDF là bản scan – nội dung được đọc bằng OCR, hãy soát lại câu hỏi.");
            return new PdfImportResultDto(test.Id, test.Title, sk.ToString(), questionCount, parts, warnings, content.UsedOcr);
        }
        catch
        {
            foreach (var url in saved) await storage.DeleteAsync(url, CancellationToken.None);
            throw;
        }
    }

    // ============================================================ 2. Đáp án ảnh / PDF

    public async Task<AnswerKeyProposalDto> ExtractAnswerKeyAsync(Guid testId, IReadOnlyList<UploadedFile> files, CancellationToken ct)
    {
        if (files.Count == 0) throw new ValidationAppException("Chọn ít nhất một file đáp án (ảnh hoặc PDF).");
        var test = await LoadAsync(testId, ct);

        var text = new StringBuilder();
        var urls = new List<string>();
        var warnings = new List<string>();

        foreach (var f in files)
        {
            var ext = Path.GetExtension(f.FileName).ToLowerInvariant();
            if (ext != ".pdf" && !AnswerImageExt.Contains(ext))
            {
                warnings.Add($"{f.FileName}: định dạng không hỗ trợ (dùng PDF, PNG, JPG).");
                continue;
            }
            var bytes = await ReadAllAsync(f.Content, MaxPdfBytes, ct);
            try
            {
                if (ext == ".pdf")
                {
                    var pdf = await pdfReader.ReadAsync(new MemoryStream(bytes), ct);
                    foreach (var p in pdf.Pages) text.AppendLine(string.Join("\n", p.Lines));
                    if (pdf.UsedOcr) warnings.Add($"{f.FileName}: PDF dạng scan – đã đọc bằng OCR.");
                }
                else
                {
                    text.AppendLine(await ocr.RecognizeAsync(bytes, ct));
                }
            }
            catch (AppException) { throw; }
            catch (Exception)
            {
                warnings.Add($"{f.FileName}: không đọc được nội dung file.");
                continue;
            }
            urls.Add(await storage.SaveAsync(new MemoryStream(bytes), f.FileName, "answers", ct));
        }

        var all = text.ToString();
        var questions = test.Groups.OrderBy(g => g.OrderIndex)
            .SelectMany(g => g.Questions.OrderBy(q => q.Number).Select(q => (g.Part, q))).ToList();

        Dictionary<int, string> choices = new(), written = new();
        if (test.Skill != Skill.Writing)
            choices = AnswerKeyParser.ParseChoices(all, questions.ToDictionary(x => x.q.Number, x => x.Part.OptionCount()));
        else
            written = AnswerKeyParser.ParseWritten(all, questions.Select(x => x.q.Number).ToList());

        var items = questions.Select(x =>
        {
            var detected = test.Skill != Skill.Writing ? choices.ContainsKey(x.q.Number) : written.ContainsKey(x.q.Number);
            return new AnswerKeyItemDto(
                x.q.Id, x.q.Number, (int)x.Part, x.Part.OptionCount(),
                choices.GetValueOrDefault(x.q.Number) ?? x.q.CorrectAnswer,
                written.GetValueOrDefault(x.q.Number) ?? x.q.SampleAnswer,
                detected);
        }).ToList();

        var detectedCount = items.Count(i => i.Detected);
        if (detectedCount == 0)
            warnings.Add("Không nhận diện được đáp án nào. Hãy dùng ảnh rõ nét, đáp án dạng \"1. B\" / \"1 (B)\", hoặc nhập tay trên phiếu bên dưới.");
        else if (detectedCount < items.Count)
            warnings.Add($"Nhận diện được {detectedCount}/{items.Count} câu – các câu còn lại hãy chọn tay.");

        if (urls.Count > 0)
        {
            var tracked = await db.Tests.FirstAsync(t => t.Id == testId, ct);
            tracked.AnswerKeyUrls = string.Join("|", SplitUrls(tracked.AnswerKeyUrls).Concat(urls));
            tracked.UpdatedAt = DateTime.UtcNow;
            await db.SaveChangesAsync(ct);
        }

        var preview = all.Length > 1500 ? all[..1500] + "…" : all;
        return new AnswerKeyProposalDto(items, detectedCount, items.Count, SplitUrls(test.AnswerKeyUrls).Concat(urls).ToList(), warnings, preview.Trim());
    }

    public async Task<TestReadinessDto> SaveAnswersAsync(Guid testId, SaveAnswersRequest request, CancellationToken ct)
    {
        var test = await db.Tests
            .Include(t => t.Groups).ThenInclude(g => g.Questions)
            .Include(t => t.AudioTracks)
            .AsSplitQuery()
            .FirstOrDefaultAsync(t => t.Id == testId, ct) ?? throw new NotFoundException("đề thi", testId);

        var byId = test.Groups.SelectMany(g => g.Questions.Select(q => (g.Part, q))).ToDictionary(x => x.q.Id);
        var errors = new List<string>();
        foreach (var item in request.Items ?? [])
        {
            if (!byId.TryGetValue(item.QuestionId, out var x)) continue;
            if (test.Skill != Skill.Writing)
            {
                var ans = item.Answer?.Trim().ToUpperInvariant();
                if (string.IsNullOrEmpty(ans)) { x.q.CorrectAnswer = null; continue; }
                if (ans.Length != 1 || ans[0] < 'A' || ans[0] >= 'A' + x.Part.OptionCount())
                {
                    errors.Add($"Câu {x.q.Number}: đáp án \"{ans}\" không hợp lệ.");
                    continue;
                }
                x.q.CorrectAnswer = ans;
            }
            else
            {
                x.q.SampleAnswer = string.IsNullOrWhiteSpace(item.SampleAnswer) ? null : item.SampleAnswer.Trim();
            }
            x.q.UpdatedAt = DateTime.UtcNow;
        }
        if (errors.Count > 0) throw new ValidationAppException(errors);

        await db.SaveChangesAsync(ct);
        return TestReadiness.Evaluate(test);
    }

    // ============================================================ 3. Audio

    /// <param name="target">"auto" (theo tên file) · "test" (cả đề) · "part1".."part4" · "group:{id}"</param>
    public async Task<AudioUploadResultDto> UploadAudioAsync(Guid testId, IReadOnlyList<UploadedFile> files, string target, CancellationToken ct)
    {
        var test = await db.Tests
            .Include(t => t.Groups).ThenInclude(g => g.Questions)
            .Include(t => t.AudioTracks)
            .AsSplitQuery()
            .FirstOrDefaultAsync(t => t.Id == testId, ct) ?? throw new NotFoundException("đề thi", testId);
        if (test.Skill is not (Skill.Listening or Skill.ListeningReading))
            throw new ValidationAppException("Chỉ đề có phần Listening mới cần audio.");
        if (files.Count == 0) throw new ValidationAppException("Chọn ít nhất một file audio.");

        target = (target ?? "auto").Trim().ToLowerInvariant();
        var assigned = new List<AudioAssignmentDto>();
        var unmatched = new List<string>();
        var toDelete = new List<string>();

        foreach (var f in files)
        {
            var ext = Path.GetExtension(f.FileName).ToLowerInvariant();
            if (!MediaRules.AudioExtensions.Contains(ext))
            {
                unmatched.Add($"{f.FileName} (định dạng không hỗ trợ)");
                continue;
            }

            var dest = target == "auto" ? MatchByName(test, f.FileName, files.Count) : ParseTarget(test, target);
            if (dest is null)
            {
                unmatched.Add(f.FileName);
                continue;
            }

            var url = await storage.SaveAsync(f.Content, f.FileName, "audio", ct);
            switch (dest)
            {
                case GroupTarget gt:
                    if (!string.IsNullOrEmpty(gt.Group.AudioUrl)) toDelete.Add(gt.Group.AudioUrl);
                    gt.Group.AudioUrl = url;
                    gt.Group.UpdatedAt = DateTime.UtcNow;
                    var nums = gt.Group.Questions.Select(q => q.Number).OrderBy(n => n).ToList();
                    assigned.Add(new AudioAssignmentDto(f.FileName, nums.Count == 1 ? $"Câu {nums[0]}" : $"Câu {nums[0]}–{nums[^1]}"));
                    break;
                case TrackTarget tt:
                    var old = test.AudioTracks.FirstOrDefault(t => t.Part == tt.Part);
                    if (old is not null)
                    {
                        toDelete.Add(old.Url);
                        db.TestAudioTracks.Remove(old);
                        test.AudioTracks.Remove(old);
                    }
                    var track = new TestAudioTrack { TestId = test.Id, Part = tt.Part, Url = url, FileName = Path.GetFileName(f.FileName) };
                    db.TestAudioTracks.Add(track);
                    test.AudioTracks.Add(track);
                    assigned.Add(new AudioAssignmentDto(f.FileName, tt.Part is null ? "Cả đề" : TestImportService.PartName(tt.Part.Value)));
                    break;
            }
        }

        test.UpdatedAt = DateTime.UtcNow;
        await db.SaveChangesAsync(ct);
        foreach (var url in toDelete) await storage.DeleteAsync(url, ct);
        return new AudioUploadResultDto(assigned, unmatched, TestReadiness.Evaluate(test));
    }

    public async Task<TestReadinessDto> DeleteAudioTrackAsync(Guid testId, Guid trackId, CancellationToken ct)
    {
        var test = await db.Tests
            .Include(t => t.Groups).ThenInclude(g => g.Questions)
            .Include(t => t.AudioTracks)
            .AsSplitQuery()
            .FirstOrDefaultAsync(t => t.Id == testId, ct) ?? throw new NotFoundException("đề thi", testId);
        var track = test.AudioTracks.FirstOrDefault(t => t.Id == trackId) ?? throw new NotFoundException("audio", trackId);
        db.TestAudioTracks.Remove(track);
        test.AudioTracks.Remove(track);
        await db.SaveChangesAsync(ct);
        await storage.DeleteAsync(track.Url, ct);
        return TestReadiness.Evaluate(test);
    }

    private abstract record AudioTarget;
    private sealed record GroupTarget(QuestionGroup Group) : AudioTarget;
    private sealed record TrackTarget(ToeicPart? Part) : AudioTarget;

    private static AudioTarget? ParseTarget(Test test, string target)
    {
        if (target == "test") return new TrackTarget(null);
        var part = PartTargetRegex().Match(target);
        if (part.Success) return new TrackTarget((ToeicPart)int.Parse(part.Groups[1].Value));
        if (target.StartsWith("group:") && Guid.TryParse(target[6..], out var gid))
        {
            var g = ListeningGroups(test).FirstOrDefault(x => x.Id == gid);
            return g is null ? null : new GroupTarget(g);
        }
        return null;
    }

    /// <summary>
    /// Ghép audio theo tên file: "part2.mp3" → Part 2 · "32-34.mp3" → nhóm câu 32–34 ·
    /// "q07.mp3" → câu 7 · "full/test/listening.mp3" hoặc chỉ 1 file không rõ → cả đề.
    /// </summary>
    private static AudioTarget? MatchByName(Test test, string fileName, int fileCount)
    {
        var name = Path.GetFileNameWithoutExtension(fileName).ToLowerInvariant();

        var part = PartNameRegex().Match(name);
        if (part.Success) return new TrackTarget((ToeicPart)int.Parse(part.Groups[1].Value));

        var range = RangeNameRegex().Match(name);
        if (range.Success)
        {
            var a = int.Parse(range.Groups[1].Value);
            var b = int.Parse(range.Groups[2].Value);
            var g = ListeningGroups(test).FirstOrDefault(x => x.Questions.Any(q => q.Number == a) && x.Questions.Any(q => q.Number == b));
            if (g is not null) return new GroupTarget(g);
        }

        if (WholeTestRegex().IsMatch(name)) return new TrackTarget(null);

        var single = NumberRegex().Match(name);
        if (single.Success && int.TryParse(single.Groups[1].Value, out var n))
        {
            var g = ListeningGroups(test).FirstOrDefault(x => x.Questions.Any(q => q.Number == n));
            if (g is not null) return new GroupTarget(g);
        }

        return fileCount == 1 ? new TrackTarget(null) : null;
    }

    // Đề Listening & Reading: audio chỉ gán cho Part 1–4.
    private static IEnumerable<QuestionGroup> ListeningGroups(Test test) =>
        test.Groups.Where(g => g.Part.GetSkill() == Skill.Listening);

    // ============================================================ Helpers

    private async Task<Test> LoadAsync(Guid id, CancellationToken ct) =>
        await db.Tests.AsNoTracking()
            .Include(t => t.Groups).ThenInclude(g => g.Questions)
            .Include(t => t.AudioTracks)
            .AsSplitQuery()
            .FirstOrDefaultAsync(t => t.Id == id, ct) ?? throw new NotFoundException("đề thi", id);

    private static async Task<byte[]> ReadAllAsync(Stream s, long max, CancellationToken ct)
    {
        using var ms = new MemoryStream();
        await s.CopyToAsync(ms, ct);
        if (ms.Length > max) throw new ValidationAppException($"File vượt quá {max / 1024 / 1024}MB.");
        if (ms.Length == 0) throw new ValidationAppException("File rỗng.");
        return ms.ToArray();
    }

    public static IEnumerable<string> SplitUrls(string? raw) =>
        (raw ?? "").Split('|', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);

    private static string ResolveTitle(string? title, string? pdfTitle, string fileName)
    {
        if (!string.IsNullOrWhiteSpace(title)) return title.Trim();
        // Bỏ qua tiêu đề metadata vô nghĩa: "Microsoft Word - …", hay chính là tên file (de1.docx, abc.html…)
        if (!string.IsNullOrWhiteSpace(pdfTitle) && !pdfTitle.StartsWith("Microsoft Word", StringComparison.OrdinalIgnoreCase)
            && pdfTitle.Length <= 150 && !FileLikeRegex().IsMatch(pdfTitle.Trim())) return pdfTitle.Trim();
        return Path.GetFileNameWithoutExtension(fileName).Replace('_', ' ').Replace('-', ' ').Trim();
    }

    [GeneratedRegex(@"^part([1-4])$")] private static partial Regex PartTargetRegex();
    [GeneratedRegex(@"\.(html?|docx?|pdf|txt|pptx?)$", RegexOptions.IgnoreCase)] private static partial Regex FileLikeRegex();
    [GeneratedRegex(@"(?<![a-z])(?:part|p)\s*[-_ ]?\s*([1-4])(?!\d)")] private static partial Regex PartNameRegex();
    [GeneratedRegex(@"(\d{1,3})\s*(?:-|_|~|to)\s*(\d{1,3})")] private static partial Regex RangeNameRegex();
    [GeneratedRegex(@"(?:^|\D)0*(\d{1,3})(?:\D|$)")] private static partial Regex NumberRegex();
    [GeneratedRegex(@"(?<![a-z])(full|test|listening|all|toan-de|ca-de)(?![a-z])")] private static partial Regex WholeTestRegex();
}
