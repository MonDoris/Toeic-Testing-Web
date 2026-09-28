using Microsoft.EntityFrameworkCore;
using ToeicPractice.Application.Common.Exceptions;
using ToeicPractice.Application.Common.Interfaces;
using ToeicPractice.Application.Common.Models;
using ToeicPractice.Application.Features.Scoring;
using ToeicPractice.Application.Features.Tests;
using ToeicPractice.Application.Features.Tests.Authoring;
using ToeicPractice.Application.Features.Tests.Import;
using ToeicPractice.Domain.Entities;
using ToeicPractice.Domain.Enums;

namespace ToeicPractice.Application.Features.Attempts;

public interface IAttemptService
{
    Task<SessionDto> StartAsync(Guid userId, StartAttemptRequest request, CancellationToken ct);
    Task<SessionDto> GetSessionAsync(Guid userId, Guid attemptId, CancellationToken ct);
    Task<PracticeFeedbackDto> AnswerPracticeAsync(Guid userId, Guid attemptId, AnswerInput input, CancellationToken ct);
    Task<AttemptResultDto> SubmitAsync(Guid userId, Guid attemptId, SubmitAttemptRequest request, CancellationToken ct);
    Task<AttemptResultDto> GetResultAsync(Guid? userId, Guid attemptId, CancellationToken ct);
    Task<IReadOnlyList<AttemptHistoryItemDto>> GetHistoryAsync(Guid userId, CancellationToken ct);
    Task<StudentStatsDto> GetStatsAsync(Guid userId, CancellationToken ct);

    // Admin
    Task<PagedResult<AttemptHistoryItemDto>> GetWritingSubmissionsAsync(string? status, int page, int pageSize, CancellationToken ct);
    Task<AttemptResultDto> ReviewAnswerAsync(Guid answerId, ReviewAnswerRequest request, CancellationToken ct);
}

public class AttemptService(IApplicationDbContext db) : IAttemptService
{
    public async Task<SessionDto> StartAsync(Guid userId, StartAttemptRequest request, CancellationToken ct)
    {
        if (!Enum.TryParse<AttemptMode>(request.Mode, true, out var mode))
            throw new ValidationAppException("Chế độ làm bài phải là Exam hoặc Practice.");

        var test = await LoadTestAsync(request.TestId, ct);
        if (!test.IsPublished) throw new NotFoundException("đề thi", request.TestId);

        ToeicPart? part = null;
        if (request.Part is { } p)
        {
            if (!Enum.IsDefined(typeof(ToeicPart), p) || test.Groups.All(g => (int)g.Part != p))
                throw new ValidationAppException("Đề này không có Part đã chọn.");
            part = (ToeicPart)p;
        }

        var questions = ScopeGroups(test, part).SelectMany(g => g.Questions).Count();
        var attempt = new Attempt
        {
            UserId = userId,
            TestId = test.Id,
            Mode = mode,
            PartFilter = part,
            TotalQuestions = questions
        };
        db.Attempts.Add(attempt);
        await db.SaveChangesAsync(ct);

        return BuildSession(attempt, test);
    }

    public async Task<SessionDto> GetSessionAsync(Guid userId, Guid attemptId, CancellationToken ct)
    {
        var attempt = await GetOwnedAttemptAsync(userId, attemptId, ct);
        if (attempt.SubmittedAt != null) throw new ConflictException("Bài làm này đã được nộp.");
        var test = await LoadTestAsync(attempt.TestId, ct);
        return BuildSession(attempt, test);
    }

    public async Task<PracticeFeedbackDto> AnswerPracticeAsync(Guid userId, Guid attemptId, AnswerInput input, CancellationToken ct)
    {
        var attempt = await GetOwnedAttemptAsync(userId, attemptId, ct, includeAnswers: true);
        if (attempt.Mode != AttemptMode.Practice)
            throw new ForbiddenAppException("Chỉ chế độ luyện tập mới xem đáp án ngay.");
        if (attempt.SubmittedAt != null) throw new ConflictException("Bài làm này đã được nộp.");

        var question = await db.Questions.AsNoTracking().Include(q => q.Group)
                           .FirstOrDefaultAsync(q => q.Id == input.QuestionId && q.Group!.TestId == attempt.TestId, ct)
                       ?? throw new NotFoundException("câu hỏi", input.QuestionId);
        var group = question.Group!;
        if (attempt.PartFilter is { } pf && group.Part != pf)
            throw new ValidationAppException("Câu hỏi không thuộc Part đang luyện.");

        var answer = UpsertAnswer(attempt, question, input);
        await db.SaveChangesAsync(ct);

        if (group.Part.IsMultipleChoice())
        {
            return new PracticeFeedbackDto(question.Id, answer.IsCorrect, question.CorrectAnswer, question.Explanation,
                group.Transcript, FullOptions(question, group.Part), null, null, null, [], null);
        }

        var grade = WritingAutoGrader.Grade(group.Part, question, input.WrittenText);
        return new PracticeFeedbackDto(question.Id, null, null, question.Explanation, null, [],
            grade.Score, grade.MaxScore, grade.WordCount, grade.Feedback, question.SampleAnswer);
    }

    public async Task<AttemptResultDto> SubmitAsync(Guid userId, Guid attemptId, SubmitAttemptRequest request, CancellationToken ct)
    {
        var attempt = await GetOwnedAttemptAsync(userId, attemptId, ct, includeAnswers: true);
        if (attempt.SubmittedAt != null) throw new ConflictException("Bài làm này đã được nộp.");

        var test = await LoadTestAsync(attempt.TestId, ct);
        var scope = ScopeGroups(test, attempt.PartFilter).ToList();
        var inputs = (request.Answers ?? []).GroupBy(a => a.QuestionId).ToDictionary(g => g.Key, g => g.Last());

        foreach (var group in scope)
        foreach (var q in group.Questions)
        {
            // Ở chế độ luyện tập, câu đã trả lời trước đó được giữ lại nếu client không gửi lại.
            if (inputs.TryGetValue(q.Id, out var input))
                UpsertAnswer(attempt, q, input, group.Part);
            else if (attempt.Answers.All(a => a.QuestionId != q.Id))
                UpsertAnswer(attempt, q, new AnswerInput(q.Id, null, null), group.Part);
        }

        attempt.SubmittedAt = DateTime.UtcNow;
        attempt.TotalQuestions = scope.Sum(g => g.Questions.Count);
        Recalculate(attempt, test, scope);
        await db.SaveChangesAsync(ct);

        return await GetResultAsync(userId, attempt.Id, ct);
    }

    public async Task<AttemptResultDto> GetResultAsync(Guid? userId, Guid attemptId, CancellationToken ct)
    {
        var attempt = await db.Attempts.AsNoTracking()
                          .Include(a => a.Answers)
                          .Include(a => a.User)
                          .FirstOrDefaultAsync(a => a.Id == attemptId, ct)
                      ?? throw new NotFoundException("bài làm", attemptId);
        if (userId is not null && attempt.UserId != userId) throw new NotFoundException("bài làm", attemptId);
        if (attempt.SubmittedAt is null) throw new ConflictException("Bài làm chưa được nộp.");

        var test = await LoadTestAsync(attempt.TestId, ct, tracking: false);
        var scope = ScopeGroups(test, attempt.PartFilter).ToList();
        var answers = attempt.Answers.ToDictionary(a => a.QuestionId);

        var partStats = new List<PartStatDto>();
        var groups = new List<ReviewGroupDto>();
        double? writingRaw = null;
        int? writingMax = null;

        string? previousAudio = null;
        foreach (var group in scope)
        {
            var audio = TestReadiness.EffectiveAudio(test, group);
            var showAudio = audio != previousAudio ? audio : null; // audio dùng chung chỉ hiện ở nhóm đầu
            previousAudio = audio;
            var qs = new List<ReviewQuestionDto>();
            foreach (var q in group.Questions)
            {
                answers.TryGetValue(q.Id, out var a);
                var isWriting = group.Part.GetSkill() == Skill.Writing;
                IReadOnlyList<string> autoFeedback = [];
                if (isWriting)
                {
                    var grade = WritingAutoGrader.Grade(group.Part, q, a?.WrittenText);
                    autoFeedback = grade.Feedback;
                    writingMax = (writingMax ?? 0) + grade.MaxScore;
                    writingRaw = (writingRaw ?? 0) + (a?.ReviewerScore ?? a?.AutoScore ?? 0);
                }
                qs.Add(new ReviewQuestionDto(
                    q.Id, a?.Id, q.Number, q.Content, FullOptions(q, group.Part),
                    q.CorrectAnswer, a?.SelectedOption, a?.IsCorrect, q.Explanation,
                    SplitKeywords(q.RequiredKeywords), q.SampleAnswer,
                    a?.WrittenText, a?.WordCount, a?.AutoScore, a?.ReviewerScore,
                    isWriting ? group.Part.WritingMaxScore() : null,
                    autoFeedback, a?.ReviewerFeedback));
            }
            groups.Add(new ReviewGroupDto(group.Id, (int)group.Part, showAudio, group.ImageUrl,
                group.Passage, group.Transcript, qs));
        }

        foreach (var byPart in scope.GroupBy(g => g.Part))
        {
            var qids = byPart.SelectMany(g => g.Questions).Select(q => q.Id).ToList();
            var correct = byPart.Key.IsMultipleChoice()
                ? qids.Count(id => answers.TryGetValue(id, out var a) && a.IsCorrect == true)
                : (int)Math.Round(qids.Sum(id => answers.TryGetValue(id, out var a) ? a.ReviewerScore ?? a.AutoScore ?? 0 : 0));
            var total = byPart.Key.IsMultipleChoice()
                ? qids.Count
                : qids.Count * byPart.Key.WritingMaxScore();
            partStats.Add(new PartStatDto((int)byPart.Key, correct, total));
        }

        var duration = (int)((attempt.SubmittedAt ?? DateTime.UtcNow) - attempt.StartedAt).TotalSeconds;
        return new AttemptResultDto(attempt.Id, test.Id, test.Title, test.Skill.ToString(), attempt.Mode.ToString(),
            (int?)attempt.PartFilter, attempt.User?.FullName ?? "", attempt.StartedAt, attempt.SubmittedAt, duration,
            attempt.TotalQuestions, attempt.CorrectCount, attempt.ScaledScore, attempt.GradingStatus.ToString(),
            writingRaw, writingMax, partStats, groups, attempt.ListeningScore, attempt.ReadingScore);
    }

    public async Task<IReadOnlyList<AttemptHistoryItemDto>> GetHistoryAsync(Guid userId, CancellationToken ct)
    {
        var items = await HistoryQuery()
            .Where(a => a.UserId == userId && a.SubmittedAt != null)
            .OrderByDescending(a => a.SubmittedAt)
            .Take(100)
            .ToListAsync(ct);
        return items.Select(ToHistory).ToList();
    }

    public async Task<StudentStatsDto> GetStatsAsync(Guid userId, CancellationToken ct)
    {
        var attempts = await HistoryQuery()
            .Where(a => a.UserId == userId && a.SubmittedAt != null)
            .OrderByDescending(a => a.SubmittedAt)
            .ToListAsync(ct);

        var choiceAnswers = await db.AttemptAnswers.AsNoTracking()
            .Where(a => a.Attempt!.UserId == userId && a.Attempt.SubmittedAt != null && a.IsCorrect != null)
            .Select(a => new { a.Question!.Group!.Part, Correct = a.IsCorrect == true, Answered = a.SelectedOption != null })
            .ToListAsync(ct);

        var partAccuracy = choiceAnswers.GroupBy(a => a.Part).OrderBy(g => g.Key)
            .Select(g => new PartStatDto((int)g.Key, g.Count(x => x.Correct), g.Count())).ToList();

        // Độ chính xác tính trên các bài trắc nghiệm (Listening + Reading)
        var choiceDone = attempts.Where(a => a.Test!.Skill != Skill.Writing).ToList();
        var avgAccuracy = choiceDone.Sum(a => a.TotalQuestions) == 0 ? 0
            : Math.Round(choiceDone.Sum(a => a.CorrectCount) * 100.0 / choiceDone.Sum(a => a.TotalQuestions), 1);

        var exams = attempts.Where(a => a.Mode == AttemptMode.Exam && a.ScaledScore != null).ToList();
        var trend = exams.OrderBy(a => a.SubmittedAt).TakeLast(12)
            .Select(a => new ScorePointDto(a.SubmittedAt!.Value, TrendSkill(a).ToString(), a.ScaledScore!.Value))
            .ToList();
        // Đề thi Listening & Reading cũng tính vào điểm cao nhất của từng kỹ năng.
        int? Best(Skill skill, Func<Attempt, int?> fromFullTest) => exams
            .Select(a => a.Test!.Skill == skill ? a.ScaledScore : a.Test!.Skill == Skill.ListeningReading ? fromFullTest(a) : null)
            .Max();

        var saved = await db.SavedVocabularies.CountAsync(s => s.UserId == userId, ct);

        return new StudentStatsDto(
            attempts.Count,
            attempts.Sum(a => a.TotalQuestions),
            Best(Skill.Listening, a => a.ListeningScore),
            exams.Where(a => a.Test!.Skill == Skill.Writing).Max(a => a.ScaledScore),
            Best(Skill.Reading, a => a.ReadingScore),
            exams.Where(a => a.Test!.Skill == Skill.ListeningReading && a.PartFilter == null).Max(a => a.ScaledScore),
            avgAccuracy,
            CalculateStreak(attempts.Select(a => a.SubmittedAt!.Value)),
            saved,
            partAccuracy,
            trend,
            attempts.Take(6).Select(ToHistory).ToList());
    }

    public async Task<PagedResult<AttemptHistoryItemDto>> GetWritingSubmissionsAsync(string? status, int page, int pageSize, CancellationToken ct)
    {
        page = Math.Max(1, page);
        pageSize = Math.Clamp(pageSize, 1, 100);
        var query = HistoryQuery().Where(a => a.SubmittedAt != null && a.Test!.Skill == Skill.Writing);
        if (Enum.TryParse<GradingStatus>(status, true, out var st)) query = query.Where(a => a.GradingStatus == st);

        var total = await query.CountAsync(ct);
        var items = await query
            .OrderBy(a => a.GradingStatus == GradingStatus.PendingReview ? 0 : 1)
            .ThenByDescending(a => a.SubmittedAt)
            .Skip((page - 1) * pageSize).Take(pageSize)
            .ToListAsync(ct);
        return new PagedResult<AttemptHistoryItemDto>(items.Select(ToHistory).ToList(), total, page, pageSize);
    }

    public async Task<AttemptResultDto> ReviewAnswerAsync(Guid answerId, ReviewAnswerRequest request, CancellationToken ct)
    {
        var answer = await db.AttemptAnswers
                         .Include(a => a.Question).ThenInclude(q => q!.Group)
                         .FirstOrDefaultAsync(a => a.Id == answerId, ct)
                     ?? throw new NotFoundException("câu trả lời", answerId);
        var part = answer.Question!.Group!.Part;
        if (part.GetSkill() != Skill.Writing)
            throw new ValidationAppException("Chỉ chấm tay được câu Writing.");
        var max = part.WritingMaxScore();
        if (request.Score < 0 || request.Score > max)
            throw new ValidationAppException($"Điểm câu này phải nằm trong khoảng 0–{max}.");

        answer.ReviewerScore = Math.Round(request.Score * 2, MidpointRounding.AwayFromZero) / 2; // bước 0.5
        answer.ReviewerFeedback = request.Feedback?.Trim();
        answer.UpdatedAt = DateTime.UtcNow;

        var attempt = await db.Attempts.Include(a => a.Answers).FirstAsync(a => a.Id == answer.AttemptId, ct);
        var test = await LoadTestAsync(attempt.TestId, ct);
        Recalculate(attempt, test, ScopeGroups(test, attempt.PartFilter).ToList());
        await db.SaveChangesAsync(ct);

        return await GetResultAsync(null, attempt.Id, ct);
    }

    // ============================== Helpers ==============================

    private AttemptAnswer UpsertAnswer(Attempt attempt, Question q, AnswerInput input, ToeicPart? knownPart = null)
    {
        var part = knownPart ?? q.Group!.Part;
        var answer = attempt.Answers.FirstOrDefault(a => a.QuestionId == q.Id);
        if (answer is null)
        {
            answer = new AttemptAnswer { AttemptId = attempt.Id, QuestionId = q.Id };
            attempt.Answers.Add(answer);
            db.AttemptAnswers.Add(answer);
        }
        answer.UpdatedAt = DateTime.UtcNow;

        if (part.IsMultipleChoice())
        {
            var selected = input.SelectedOption?.Trim().ToUpperInvariant();
            if (string.IsNullOrEmpty(selected) || !"ABCD"[..part.OptionCount()].Contains(selected) || selected.Length != 1)
                selected = null;
            answer.SelectedOption = selected;
            answer.IsCorrect = selected != null && selected == q.CorrectAnswer;
        }
        else
        {
            var text = input.WrittenText?.Trim();
            if (text?.Length > 20000) text = text[..20000];
            var grade = WritingAutoGrader.Grade(part, q, text);
            answer.WrittenText = text;
            answer.WordCount = grade.WordCount;
            answer.AutoScore = grade.Score;
            answer.AutoFeedback = string.Join("\n", grade.Feedback);
        }
        return answer;
    }

    private static void Recalculate(Attempt attempt, Test test, List<QuestionGroup> scope)
    {
        var answers = attempt.Answers.ToDictionary(a => a.QuestionId);
        if (test.Skill == Skill.ListeningReading)
        {
            // Mỗi phần quy đổi riêng (5–495), điểm tổng = Listening + Reading (10–990).
            int? Section(Skill skill)
            {
                var qs = scope.Where(g => g.Part.GetSkill() == skill).SelectMany(g => g.Questions).ToList();
                if (qs.Count == 0) return null;
                var correct = qs.Count(q => answers.TryGetValue(q.Id, out var a) && a.IsCorrect == true);
                return ScoreCalculator.ChoiceScaled(skill, correct, qs.Count);
            }
            attempt.CorrectCount = attempt.Answers.Count(a => a.IsCorrect == true);
            attempt.ListeningScore = Section(Skill.Listening);
            attempt.ReadingScore = Section(Skill.Reading);
            attempt.ScaledScore = (attempt.ListeningScore ?? 0) + (attempt.ReadingScore ?? 0);
            attempt.GradingStatus = GradingStatus.AutoGraded;
            return;
        }
        if (test.Skill != Skill.Writing)
        {
            attempt.CorrectCount = attempt.Answers.Count(a => a.IsCorrect == true);
            attempt.ScaledScore = ScoreCalculator.ChoiceScaled(test.Skill, attempt.CorrectCount, attempt.TotalQuestions);
            attempt.GradingStatus = GradingStatus.AutoGraded;
            return;
        }

        double raw = 0, max = 0;
        var needsReview = false;
        foreach (var g in scope)
        foreach (var q in g.Questions)
        {
            max += g.Part.WritingMaxScore();
            if (!answers.TryGetValue(q.Id, out var a)) continue;
            raw += a.ReviewerScore ?? a.AutoScore ?? 0;
            if (g.Part != ToeicPart.W1_PictureSentence && !string.IsNullOrWhiteSpace(a.WrittenText) && a.ReviewerScore is null)
                needsReview = true;
        }
        var anyReviewed = attempt.Answers.Any(a => a.ReviewerScore != null);
        attempt.CorrectCount = (int)Math.Round(raw);
        attempt.ScaledScore = ScoreCalculator.WritingScaled(raw, max);
        attempt.GradingStatus = needsReview ? GradingStatus.PendingReview
            : anyReviewed ? GradingStatus.Reviewed : GradingStatus.AutoGraded;
    }

    private async Task<Test> LoadTestAsync(Guid testId, CancellationToken ct, bool tracking = false)
    {
        var query = db.Tests.Include(t => t.Groups).ThenInclude(g => g.Questions).Include(t => t.AudioTracks).AsSplitQuery();
        if (!tracking) query = query.AsNoTracking();
        var test = await query.FirstOrDefaultAsync(t => t.Id == testId, ct) ?? throw new NotFoundException("đề thi", testId);
        test.Groups = test.Groups.OrderBy(g => g.OrderIndex).ToList();
        foreach (var g in test.Groups) g.Questions = g.Questions.OrderBy(q => q.Number).ToList();
        return test;
    }

    private async Task<Attempt> GetOwnedAttemptAsync(Guid userId, Guid attemptId, CancellationToken ct, bool includeAnswers = false)
    {
        var query = db.Attempts.AsQueryable();
        if (includeAnswers) query = query.Include(a => a.Answers);
        var attempt = await query.FirstOrDefaultAsync(a => a.Id == attemptId, ct);
        if (attempt is null || attempt.UserId != userId) throw new NotFoundException("bài làm", attemptId);
        return attempt;
    }

    private static IEnumerable<QuestionGroup> ScopeGroups(Test test, ToeicPart? part) =>
        part is null ? test.Groups : test.Groups.Where(g => g.Part == part);

    private static SessionDto BuildSession(Attempt attempt, Test test)
    {
        var groups = ScopeGroups(test, attempt.PartFilter).Select(g => new SessionGroupDto(
            g.Id, (int)g.Part, g.OrderIndex, TestReadiness.EffectiveAudio(test, g), g.ImageUrl, g.Passage,
            g.Questions.Select(q => new SessionQuestionDto(
                q.Id, q.Number, q.Content, SessionOptions(q, g.Part),
                SplitKeywords(q.RequiredKeywords), q.MinWords)).ToList(),
            SharedAudio: string.IsNullOrEmpty(g.AudioUrl) && TestReadiness.EffectiveAudio(test, g) != null
        )).ToList();

        int? duration = attempt.Mode == AttemptMode.Exam
            ? attempt.PartFilter is null
                ? test.DurationMinutes
                : Math.Max(1, (int)Math.Ceiling(test.DurationMinutes * (double)attempt.TotalQuestions /
                                                  Math.Max(1, test.Groups.Sum(g => g.Questions.Count))))
            : null;

        // Đề thi Listening & Reading: Listening chạy theo audio, Reading có thời gian riêng (đề chuẩn: 120 − 45 = 75 phút).
        int? readingMinutes = null;
        if (attempt.Mode == AttemptMode.Exam && attempt.PartFilter is null && test.Skill == Skill.ListeningReading)
        {
            var listeningQuestions = test.Groups.Where(g => g.Part.GetSkill() == Skill.Listening).Sum(g => g.Questions.Count);
            readingMinutes = Math.Max(5, test.DurationMinutes - TestImportService.DefaultDuration(Skill.Listening, listeningQuestions));
        }

        return new SessionDto(attempt.Id, test.Id, test.Title, test.Skill.ToString(), attempt.Mode.ToString(),
            (int?)attempt.PartFilter, duration, attempt.StartedAt, groups, readingMinutes);
    }

    /// <summary>Đề thi Listening &amp; Reading luyện riêng một Part được xếp vào kỹ năng của Part đó.</summary>
    private static Skill TrendSkill(Attempt a) =>
        a.Test!.Skill == Skill.ListeningReading && a.PartFilter is { } part ? part.GetSkill() : a.Test!.Skill;

    /// <summary>Part 1–2: lựa chọn chỉ được nghe, không in ra đề (đúng như thi thật).</summary>
    private static IReadOnlyList<OptionDto> SessionOptions(Question q, ToeicPart part)
    {
        var count = part.OptionCount();
        if (count == 0) return [];
        var hideText = part is ToeicPart.L1_Photographs or ToeicPart.L2_QuestionResponse;
        return FullOptions(q, part).Select(o => hideText ? o with { Text = null } : o).ToList();
    }

    private static IReadOnlyList<OptionDto> FullOptions(Question q, ToeicPart part)
    {
        var count = part.OptionCount();
        var all = new[] { new OptionDto("A", q.OptionA), new OptionDto("B", q.OptionB), new OptionDto("C", q.OptionC), new OptionDto("D", q.OptionD) };
        return all.Take(count).ToList();
    }

    private static IReadOnlyList<string> SplitKeywords(string? raw) =>
        string.IsNullOrWhiteSpace(raw) ? [] : raw.Split('|', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);

    private IQueryable<Attempt> HistoryQuery() =>
        db.Attempts.AsNoTracking().Include(a => a.Test).Include(a => a.User);

    private static AttemptHistoryItemDto ToHistory(Attempt a) => new(
        a.Id, a.TestId, a.Test?.Title ?? "", a.Test?.Skill.ToString() ?? "", a.Mode.ToString(), (int?)a.PartFilter,
        a.User?.FullName ?? "", a.StartedAt, a.SubmittedAt, a.TotalQuestions, a.CorrectCount, a.ScaledScore,
        a.GradingStatus.ToString(), a.ListeningScore, a.ReadingScore);

    private static int CalculateStreak(IEnumerable<DateTime> submittedAt)
    {
        var days = submittedAt.Select(d => d.ToLocalTime().Date).Distinct().OrderByDescending(d => d).ToList();
        if (days.Count == 0) return 0;
        var today = DateTime.Now.Date;
        if (days[0] < today.AddDays(-1)) return 0;
        var streak = 1;
        for (var i = 1; i < days.Count && days[i] == days[i - 1].AddDays(-1); i++) streak++;
        return streak;
    }
}
