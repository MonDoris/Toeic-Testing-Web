using Microsoft.EntityFrameworkCore;
using ToeicPractice.Application.Common.Exceptions;
using ToeicPractice.Application.Common.Interfaces;
using ToeicPractice.Application.Features.Tests.Authoring;
using ToeicPractice.Domain.Entities;
using ToeicPractice.Domain.Enums;

namespace ToeicPractice.Application.Features.Tests;

public interface ITestService
{
    Task<IReadOnlyList<TestSummaryDto>> GetTestsAsync(bool includeUnpublished, string? skill, CancellationToken ct);
    Task<TestSummaryDto> GetSummaryAsync(Guid id, bool includeUnpublished, CancellationToken ct);
    Task<AdminTestDetailDto> GetAdminDetailAsync(Guid id, CancellationToken ct);
    Task<TestSummaryDto> UpdateTestAsync(Guid id, UpdateTestRequest request, CancellationToken ct);
    Task UpdateGroupAsync(Guid groupId, UpdateGroupRequest request, CancellationToken ct);
    Task<string> ReplaceGroupMediaAsync(Guid groupId, string kind, Stream content, string fileName, CancellationToken ct);
    Task UpdateQuestionAsync(Guid questionId, UpdateQuestionRequest request, CancellationToken ct);
    Task DeleteTestAsync(Guid id, CancellationToken ct);
}

public class TestService(IApplicationDbContext db, IFileStorage storage) : ITestService
{
    public async Task<IReadOnlyList<TestSummaryDto>> GetTestsAsync(bool includeUnpublished, string? skill, CancellationToken ct)
    {
        var query = db.Tests.AsNoTracking()
            .Include(t => t.Groups).ThenInclude(g => g.Questions)
            .Include(t => t.AudioTracks)
            .AsSplitQuery()
            .AsQueryable();
        if (!includeUnpublished) query = query.Where(t => t.IsPublished);
        if (Enum.TryParse<Skill>(skill, true, out var s)) query = query.Where(t => t.Skill == s);

        var tests = await query.OrderByDescending(t => t.CreatedAt).ToListAsync(ct);
        var ids = tests.Select(t => t.Id).ToList();
        var attemptCounts = await db.Attempts.Where(a => ids.Contains(a.TestId))
            .GroupBy(a => a.TestId).Select(g => new { g.Key, Count = g.Count() })
            .ToDictionaryAsync(x => x.Key, x => x.Count, ct);

        return tests.Select(t => ToSummary(t, attemptCounts.GetValueOrDefault(t.Id), includeUnpublished)).ToList();
    }

    public async Task<TestSummaryDto> GetSummaryAsync(Guid id, bool includeUnpublished, CancellationToken ct)
    {
        var test = await db.Tests.AsNoTracking()
            .Include(t => t.Groups).ThenInclude(g => g.Questions)
            .Include(t => t.AudioTracks)
            .AsSplitQuery()
            .FirstOrDefaultAsync(t => t.Id == id && (includeUnpublished || t.IsPublished), ct)
            ?? throw new NotFoundException("đề thi", id);
        var attempts = await db.Attempts.CountAsync(a => a.TestId == id, ct);
        return ToSummary(test, attempts, includeUnpublished);
    }

    public async Task<AdminTestDetailDto> GetAdminDetailAsync(Guid id, CancellationToken ct)
    {
        var t = await db.Tests.AsNoTracking()
            .Include(x => x.Groups).ThenInclude(g => g.Questions)
            .Include(x => x.AudioTracks)
            .AsSplitQuery()
            .FirstOrDefaultAsync(x => x.Id == id, ct) ?? throw new NotFoundException("đề thi", id);

        var groups = t.Groups.OrderBy(g => g.OrderIndex).Select(g => new AdminGroupDto(
            g.Id, (int)g.Part, g.OrderIndex, g.AudioUrl, g.ImageUrl, g.Passage, g.Transcript,
            g.Questions.OrderBy(q => q.Number).Select(q => new AdminQuestionDto(
                q.Id, q.Number, q.Content, q.OptionA, q.OptionB, q.OptionC, q.OptionD,
                q.CorrectAnswer, q.Explanation, q.RequiredKeywords, q.SampleAnswer, q.MinWords)).ToList()
        )).ToList();

        var tracks = t.AudioTracks.OrderBy(a => a.Part ?? 0)
            .Select(a => new AudioTrackDto(a.Id, (int?)a.Part, a.Url, a.FileName)).ToList();
        return new AdminTestDetailDto(t.Id, t.Title, t.Description, t.Skill.ToString(),
            t.DurationMinutes, t.IsPublished, t.CreatedAt, groups,
            t.SourcePdfUrl, TestAuthoringService.SplitUrls(t.AnswerKeyUrls).ToList(), tracks, TestReadiness.Evaluate(t));
    }

    public async Task<TestSummaryDto> UpdateTestAsync(Guid id, UpdateTestRequest request, CancellationToken ct)
    {
        var test = await db.Tests
            .Include(t => t.Groups).ThenInclude(g => g.Questions)
            .Include(t => t.AudioTracks)
            .AsSplitQuery()
            .FirstOrDefaultAsync(t => t.Id == id, ct) ?? throw new NotFoundException("đề thi", id);
        if (string.IsNullOrWhiteSpace(request.Title)) throw new ValidationAppException("Tên đề không được để trống.");
        if (request.IsPublished && !test.IsPublished)
        {
            var readiness = TestReadiness.Evaluate(test);
            if (!readiness.Ready)
                throw new ValidationAppException(new[] { "Đề chưa đủ điều kiện công khai:" }.Concat(readiness.Issues));
        }
        if (request.DurationMinutes is < 1 or > 300) throw new ValidationAppException("Thời gian làm bài phải từ 1–300 phút.");
        test.Title = request.Title.Trim();
        test.Description = request.Description?.Trim();
        test.DurationMinutes = request.DurationMinutes;
        test.IsPublished = request.IsPublished;
        test.UpdatedAt = DateTime.UtcNow;
        await db.SaveChangesAsync(ct);
        return await GetSummaryAsync(id, true, ct);
    }

    public async Task UpdateGroupAsync(Guid groupId, UpdateGroupRequest request, CancellationToken ct)
    {
        var group = await db.QuestionGroups.FindAsync([groupId], ct) ?? throw new NotFoundException("nhóm câu hỏi", groupId);
        group.Passage = request.Passage;
        group.Transcript = request.Transcript;
        group.UpdatedAt = DateTime.UtcNow;
        await db.SaveChangesAsync(ct);
    }

    public async Task<string> ReplaceGroupMediaAsync(Guid groupId, string kind, Stream content, string fileName, CancellationToken ct)
    {
        var group = await db.QuestionGroups.FindAsync([groupId], ct) ?? throw new NotFoundException("nhóm câu hỏi", groupId);
        var ext = Path.GetExtension(fileName).ToLowerInvariant();
        var isAudio = kind == "audio";
        var allowed = isAudio ? MediaRules.AudioExtensions : MediaRules.ImageExtensions;
        if (!allowed.Contains(ext))
            throw new ValidationAppException($"Định dạng {ext} không được hỗ trợ. Cho phép: {string.Join(", ", allowed)}.");

        var url = await storage.SaveAsync(content, fileName, isAudio ? "audio" : "images", ct);
        var old = isAudio ? group.AudioUrl : group.ImageUrl;
        if (isAudio) group.AudioUrl = url; else group.ImageUrl = url;
        group.UpdatedAt = DateTime.UtcNow;
        await db.SaveChangesAsync(ct);
        if (!string.IsNullOrEmpty(old)) await storage.DeleteAsync(old, ct);
        return url;
    }

    public async Task UpdateQuestionAsync(Guid questionId, UpdateQuestionRequest r, CancellationToken ct)
    {
        var q = await db.Questions.Include(x => x.Group).FirstOrDefaultAsync(x => x.Id == questionId, ct)
                ?? throw new NotFoundException("câu hỏi", questionId);
        var part = q.Group!.Part;
        if (part.IsMultipleChoice())
        {
            var answer = r.CorrectAnswer?.Trim().ToUpperInvariant();
            var validKeys = "ABCD"[..part.OptionCount()];
            if (string.IsNullOrEmpty(answer)) answer = null; // đề nháp: cho phép chưa có đáp án
            else if (answer.Length != 1 || !validKeys.Contains(answer))
                throw new ValidationAppException($"Đáp án đúng phải là một trong: {string.Join(", ", validKeys.ToCharArray())}.");
            q.CorrectAnswer = answer;
        }
        q.Content = r.Content;
        q.OptionA = r.OptionA; q.OptionB = r.OptionB; q.OptionC = r.OptionC;
        q.OptionD = part == ToeicPart.L2_QuestionResponse ? null : r.OptionD;
        q.Explanation = r.Explanation;
        q.RequiredKeywords = r.RequiredKeywords;
        q.SampleAnswer = r.SampleAnswer;
        q.MinWords = r.MinWords;
        q.UpdatedAt = DateTime.UtcNow;
        await db.SaveChangesAsync(ct);
    }

    public async Task DeleteTestAsync(Guid id, CancellationToken ct)
    {
        var test = await db.Tests.Include(t => t.Groups).Include(t => t.AudioTracks).FirstOrDefaultAsync(t => t.Id == id, ct)
                   ?? throw new NotFoundException("đề thi", id);
        var media = test.Groups.SelectMany(g => new[] { g.AudioUrl, g.ImageUrl })
            .Concat(test.AudioTracks.Select(a => a.Url))
            .Concat(TestAuthoringService.SplitUrls(test.AnswerKeyUrls))
            .Append(test.SourcePdfUrl)
            .Where(u => !string.IsNullOrEmpty(u)).Distinct().ToList();

        // Xoá lịch sử làm bài trước (tránh vòng cascade Question ↔ AttemptAnswer).
        var attempts = await db.Attempts.Where(a => a.TestId == id).Include(a => a.Answers).ToListAsync(ct);
        foreach (var a in attempts) db.AttemptAnswers.RemoveRange(a.Answers);
        db.Attempts.RemoveRange(attempts);
        db.Tests.Remove(test);
        await db.SaveChangesAsync(ct);

        foreach (var url in media) await storage.DeleteAsync(url!, ct);
    }

    internal static TestSummaryDto ToSummary(Test t, int attempts, bool withReadiness = false)
    {
        var parts = t.Groups.GroupBy(g => g.Part).OrderBy(g => g.Key)
            .Select(g => new PartCountDto((int)g.Key, g.Sum(x => x.Questions.Count))).ToList();
        return new TestSummaryDto(t.Id, t.Title, t.Description, t.Skill.ToString(), t.DurationMinutes,
            t.IsPublished, parts.Sum(p => p.Questions), parts, attempts, t.CreatedAt,
            withReadiness ? TestReadiness.Evaluate(t) : null);
    }
}

public static class MediaRules
{
    public static readonly string[] AudioExtensions = [".mp3", ".wav", ".ogg", ".m4a"];
    public static readonly string[] ImageExtensions = [".jpg", ".jpeg", ".png", ".webp", ".gif"];
}
