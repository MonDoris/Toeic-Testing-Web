using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using ToeicPractice.Application.Common.Interfaces;
using ToeicPractice.Application.Common.Models;
using ToeicPractice.Application.Features.Attempts;
using ToeicPractice.Application.Features.Grammar;
using ToeicPractice.Application.Features.Tests;
using ToeicPractice.Application.Features.Vocabularies;

namespace ToeicPractice.Api.Controllers;

/// <summary>Danh sách đề để làm bài – chỉ dành cho học viên (Admin quản lý đề qua /api/admin/tests).</summary>
[Authorize(Roles = "Student")]
public class TestsController(ITestService tests) : ApiControllerBase
{
    [HttpGet]
    public Task<IReadOnlyList<TestSummaryDto>> List([FromQuery] string? skill, CancellationToken ct) =>
        tests.GetTestsAsync(includeUnpublished: false, skill, ct);

    [HttpGet("{id:guid}")]
    public Task<TestSummaryDto> Get(Guid id, CancellationToken ct) =>
        tests.GetSummaryAsync(id, includeUnpublished: false, ct);
}

/// <summary>Làm bài, nộp bài, kết quả, thống kê – chỉ dành cho học viên.</summary>
[Authorize(Roles = "Student")]
public class AttemptsController(IAttemptService attempts) : ApiControllerBase
{
    [HttpPost]
    public Task<SessionDto> Start(StartAttemptRequest request, CancellationToken ct) =>
        attempts.StartAsync(CurrentUserId, request, ct);

    [HttpGet("{id:guid}/session")]
    public Task<SessionDto> Session(Guid id, CancellationToken ct) =>
        attempts.GetSessionAsync(CurrentUserId, id, ct);

    [HttpPost("{id:guid}/answer")]
    public Task<PracticeFeedbackDto> Answer(Guid id, AnswerInput input, CancellationToken ct) =>
        attempts.AnswerPracticeAsync(CurrentUserId, id, input, ct);

    [HttpPost("{id:guid}/submit")]
    public Task<AttemptResultDto> Submit(Guid id, SubmitAttemptRequest request, CancellationToken ct) =>
        attempts.SubmitAsync(CurrentUserId, id, request, ct);

    [HttpGet("{id:guid}/result")]
    public Task<AttemptResultDto> Result(Guid id, CancellationToken ct) =>
        attempts.GetResultAsync(CurrentUserId, id, ct);

    [HttpGet("history")]
    public Task<IReadOnlyList<AttemptHistoryItemDto>> History(CancellationToken ct) =>
        attempts.GetHistoryAsync(CurrentUserId, ct);

    [HttpGet("stats")]
    public Task<StudentStatsDto> Stats(CancellationToken ct) =>
        attempts.GetStatsAsync(CurrentUserId, ct);
}

[Authorize]
public class VocabulariesController(IVocabularyService vocab) : ApiControllerBase
{
    [HttpGet]
    public Task<PagedResult<VocabularyDto>> Search(
        [FromQuery] string? q, [FromQuery] string? topic, [FromQuery] int? level,
        [FromQuery] bool saved = false, [FromQuery] int page = 1, [FromQuery] int pageSize = 24,
        CancellationToken ct = default) =>
        vocab.SearchAsync(q, topic, level, saved, CurrentUserIdOrNull, page, pageSize, ct);

    [HttpGet("topics")]
    public Task<IReadOnlyList<TopicCountDto>> Topics(CancellationToken ct) => vocab.GetTopicsAsync(ct);

    [HttpGet("{id:guid}")]
    public Task<VocabularyDto> Get(Guid id, CancellationToken ct) => vocab.GetAsync(id, CurrentUserIdOrNull, ct);

    /// <summary>Tra từ trực tuyến (phiên âm, audio, định nghĩa) khi từ chưa có trong kho.</summary>
    [HttpGet("lookup")]
    public async Task<IActionResult> Lookup([FromQuery] string word, CancellationToken ct)
    {
        var entry = await vocab.LookupOnlineAsync(word, ct);
        return entry is null ? NotFound(new { title = $"Không tìm thấy \"{word}\" trong từ điển trực tuyến.", status = 404 }) : Ok(entry);
    }

    public record SaveRequest(bool? Mastered);

    [Authorize(Roles = "Student")]
    [HttpPut("{id:guid}/saved")]
    public async Task<IActionResult> Save(Guid id, [FromBody] SaveRequest? request, CancellationToken ct)
    {
        await vocab.SetSavedAsync(CurrentUserId, id, true, request?.Mastered, ct);
        return NoContent();
    }

    [Authorize(Roles = "Student")]
    [HttpDelete("{id:guid}/saved")]
    public async Task<IActionResult> Unsave(Guid id, CancellationToken ct)
    {
        await vocab.SetSavedAsync(CurrentUserId, id, false, null, ct);
        return NoContent();
    }
}

[Authorize]
public class GrammarController(IGrammarService grammar) : ApiControllerBase
{
    [HttpGet]
    public Task<IReadOnlyList<GrammarListItemDto>> List([FromQuery] string? q, [FromQuery] string? category, CancellationToken ct) =>
        grammar.ListAsync(q, category, ct);

    [HttpGet("{slug}")]
    public Task<GrammarDetailDto> Get(string slug, CancellationToken ct) => grammar.GetAsync(slug, ct);
}
