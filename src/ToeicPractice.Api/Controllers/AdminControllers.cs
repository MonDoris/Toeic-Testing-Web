using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using ToeicPractice.Application.Common.Exceptions;
using ToeicPractice.Application.Common.Interfaces;
using ToeicPractice.Application.Common.Models;
using ToeicPractice.Application.Features.Admin;
using ToeicPractice.Application.Features.Attempts;
using ToeicPractice.Application.Features.Grammar;
using ToeicPractice.Application.Features.Tests;
using ToeicPractice.Application.Features.Tests.Import;
using ToeicPractice.Application.Features.Tests.Authoring;
using ToeicPractice.Application.Features.Vocabularies;

namespace ToeicPractice.Api.Controllers;

[Authorize(Roles = "Admin")]
[Route("api/admin")]
public class AdminController(IAdminService admin, IAttemptService attempts) : ApiControllerBase
{
    [HttpGet("dashboard")]
    public Task<AdminDashboardDto> Dashboard(CancellationToken ct) => admin.GetDashboardAsync(ct);

    [HttpGet("users")]
    public Task<PagedResult<AdminUserDto>> Users([FromQuery] string? q, [FromQuery] int page = 1,
        [FromQuery] int pageSize = 20, CancellationToken ct = default) =>
        admin.GetUsersAsync(q, page, pageSize, ct);

    public record SetActiveRequest(bool IsActive);

    [HttpPut("users/{id:guid}/active")]
    public async Task<IActionResult> SetActive(Guid id, SetActiveRequest request, CancellationToken ct)
    {
        await admin.SetUserActiveAsync(CurrentUserId, id, request.IsActive, ct);
        return NoContent();
    }

    /// <summary>Danh sách bài Writing đã nộp (ưu tiên bài chờ chấm).</summary>
    [HttpGet("submissions")]
    public Task<PagedResult<AttemptHistoryItemDto>> Submissions([FromQuery] string? status,
        [FromQuery] int page = 1, [FromQuery] int pageSize = 20, CancellationToken ct = default) =>
        attempts.GetWritingSubmissionsAsync(status, page, pageSize, ct);

    [HttpGet("attempts/{id:guid}")]
    public Task<AttemptResultDto> Attempt(Guid id, CancellationToken ct) => attempts.GetResultAsync(null, id, ct);

    [HttpPost("answers/{id:guid}/review")]
    public Task<AttemptResultDto> Review(Guid id, ReviewAnswerRequest request, CancellationToken ct) =>
        attempts.ReviewAnswerAsync(id, request, ct);
}

[Authorize(Roles = "Admin")]
[Route("api/admin/tests")]
public class AdminTestsController(ITestService tests, ITestImportService importer, ITestAuthoringService authoring) : ApiControllerBase
{
    private static readonly string SamplesDir = Path.Combine(AppContext.BaseDirectory, "Seed", "samples");

    [HttpGet]
    public Task<IReadOnlyList<TestSummaryDto>> List([FromQuery] string? skill, CancellationToken ct) =>
        tests.GetTestsAsync(includeUnpublished: true, skill, ct);

    [HttpGet("{id:guid}")]
    public Task<AdminTestDetailDto> Get(Guid id, CancellationToken ct) => tests.GetAdminDetailAsync(id, ct);

    /// <summary>Upload gói đề (.zip chứa test.json + audio/ảnh, hoặc .json). dryRun=true để chỉ kiểm tra.</summary>
    [HttpPost("import")]
    [RequestSizeLimit(300L * 1024 * 1024)]
    [RequestFormLimits(MultipartBodyLengthLimit = 300L * 1024 * 1024)]
    public async Task<ImportResultDto> Import(IFormFile file, [FromQuery] bool dryRun = false, CancellationToken ct = default)
    {
        if (file is null || file.Length == 0) throw new ValidationAppException("Chưa chọn file đề.");
        await using var stream = file.OpenReadStream();
        return await importer.ImportAsync(stream, file.FileName, dryRun, ct);
    }

    /// <summary>Tải gói đề mẫu để làm khuôn cho định dạng upload.</summary>
    [HttpGet("templates/{skill}")]
    public IActionResult Template(string skill)
    {
        var name = skill.ToLowerInvariant() switch
        {
            "writing" => "writing-sample.zip",
            "reading" => "reading-sample.zip",
            _ => "listening-sample.zip"
        };
        var path = Path.Combine(SamplesDir, name);
        if (!System.IO.File.Exists(path)) throw new NotFoundException("gói đề mẫu", name);
        return PhysicalFile(path, "application/zip", name);
    }

    // ------------------------------------------------ Soạn đề từ PDF

    /// <summary>Bước 1: upload PDF đề → hệ thống dựng cấu trúc đề (bản nháp, chưa công khai).</summary>
    [HttpPost("pdf")]
    [RequestSizeLimit(100L * 1024 * 1024)]
    [RequestFormLimits(MultipartBodyLengthLimit = 100L * 1024 * 1024)]
    public async Task<PdfImportResultDto> CreateFromPdf(IFormFile file, [FromForm] string skill, [FromForm] string? title, CancellationToken ct)
    {
        if (file is null || file.Length == 0) throw new ValidationAppException("Chưa chọn file PDF đề thi.");
        await using var stream = file.OpenReadStream();
        return await authoring.CreateFromPdfAsync(new UploadedFile(stream, file.FileName), skill, title, ct);
    }

    /// <summary>Bước 2a: upload đáp án (ảnh/PDF) → đề xuất đáp án từng câu để giáo viên soát lại.</summary>
    [HttpPost("{id:guid}/answer-key")]
    [RequestSizeLimit(100L * 1024 * 1024)]
    [RequestFormLimits(MultipartBodyLengthLimit = 100L * 1024 * 1024)]
    public async Task<AnswerKeyProposalDto> ExtractAnswerKey(Guid id, [FromForm] List<IFormFile> files, CancellationToken ct)
    {
        var uploads = files.Where(f => f.Length > 0).Select(f => new UploadedFile(f.OpenReadStream(), f.FileName)).ToList();
        try { return await authoring.ExtractAnswerKeyAsync(id, uploads, ct); }
        finally { foreach (var u in uploads) await u.Content.DisposeAsync(); }
    }

    /// <summary>Bước 2b: lưu đáp án đã soát.</summary>
    [HttpPut("{id:guid}/answers")]
    public Task<TestReadinessDto> SaveAnswers(Guid id, SaveAnswersRequest request, CancellationToken ct) =>
        authoring.SaveAnswersAsync(id, request, ct);

    /// <summary>Bước 3 (Listening): upload audio. target = auto | test | part1..part4 | group:{id}.</summary>
    [HttpPost("{id:guid}/audio")]
    [RequestSizeLimit(500L * 1024 * 1024)]
    [RequestFormLimits(MultipartBodyLengthLimit = 500L * 1024 * 1024)]
    public async Task<AudioUploadResultDto> UploadAudio(Guid id, [FromForm] List<IFormFile> files, [FromQuery] string target = "auto", CancellationToken ct = default)
    {
        var uploads = files.Where(f => f.Length > 0).Select(f => new UploadedFile(f.OpenReadStream(), f.FileName)).ToList();
        try { return await authoring.UploadAudioAsync(id, uploads, target, ct); }
        finally { foreach (var u in uploads) await u.Content.DisposeAsync(); }
    }

    [HttpDelete("{id:guid}/audio/{trackId:guid}")]
    public Task<TestReadinessDto> DeleteAudioTrack(Guid id, Guid trackId, CancellationToken ct) =>
        authoring.DeleteAudioTrackAsync(id, trackId, ct);

    [HttpPut("{id:guid}")]
    public Task<TestSummaryDto> Update(Guid id, UpdateTestRequest request, CancellationToken ct) =>
        tests.UpdateTestAsync(id, request, ct);

    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> Delete(Guid id, CancellationToken ct)
    {
        await tests.DeleteTestAsync(id, ct);
        return NoContent();
    }

    [HttpPut("groups/{id:guid}")]
    public async Task<IActionResult> UpdateGroup(Guid id, UpdateGroupRequest request, CancellationToken ct)
    {
        await tests.UpdateGroupAsync(id, request, ct);
        return NoContent();
    }

    [HttpPost("groups/{id:guid}/media")]
    [RequestSizeLimit(100L * 1024 * 1024)]
    [RequestFormLimits(MultipartBodyLengthLimit = 100L * 1024 * 1024)]
    public async Task<IActionResult> ReplaceMedia(Guid id, IFormFile file, [FromQuery] string kind = "audio", CancellationToken ct = default)
    {
        if (file is null || file.Length == 0) throw new ValidationAppException("Chưa chọn file.");
        if (kind is not ("audio" or "image")) throw new ValidationAppException("kind phải là audio hoặc image.");
        await using var stream = file.OpenReadStream();
        var url = await tests.ReplaceGroupMediaAsync(id, kind, stream, file.FileName, ct);
        return Ok(new { url });
    }

    [HttpPut("questions/{id:guid}")]
    public async Task<IActionResult> UpdateQuestion(Guid id, UpdateQuestionRequest request, CancellationToken ct)
    {
        await tests.UpdateQuestionAsync(id, request, ct);
        return NoContent();
    }
}

[Authorize(Roles = "Admin")]
[Route("api/admin/vocabularies")]
public class AdminVocabulariesController(IVocabularyService vocab) : ApiControllerBase
{
    [HttpPost]
    public Task<VocabularyDto> Create(VocabularyRequest request, CancellationToken ct) => vocab.CreateAsync(request, ct);

    [HttpPut("{id:guid}")]
    public Task<VocabularyDto> Update(Guid id, VocabularyRequest request, CancellationToken ct) =>
        vocab.UpdateAsync(id, request, ct);

    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> Delete(Guid id, CancellationToken ct)
    {
        await vocab.DeleteAsync(id, ct);
        return NoContent();
    }

    /// <summary>Nhập hàng loạt từ file .csv hoặc .json.</summary>
    [HttpPost("import")]
    public async Task<BulkImportResultDto> Import(IFormFile file, [FromQuery] bool overwrite = false, CancellationToken ct = default)
    {
        if (file is null || file.Length == 0) throw new ValidationAppException("Chưa chọn file.");
        await using var stream = file.OpenReadStream();
        List<VocabularyRequest> items;
        var ext = Path.GetExtension(file.FileName).ToLowerInvariant();
        if (ext == ".csv")
            items = await VocabularyCsvParser.ParseAsync(stream, ct);
        else if (ext == ".json")
        {
            try
            {
                items = await System.Text.Json.JsonSerializer.DeserializeAsync<List<VocabularyRequest>>(stream,
                    new System.Text.Json.JsonSerializerOptions { PropertyNameCaseInsensitive = true }, ct) ?? [];
            }
            catch (System.Text.Json.JsonException ex)
            {
                throw new ValidationAppException($"File JSON không hợp lệ: {ex.Message}");
            }
        }
        else throw new ValidationAppException("Chỉ hỗ trợ file .csv hoặc .json.");
        return await vocab.BulkImportAsync(items, overwrite, ct);
    }

    /// <summary>Bổ sung phiên âm, audio, định nghĩa còn thiếu từ nguồn từ điển trực tuyến.</summary>
    [HttpPost("enrich")]
    public Task<EnrichResultDto> Enrich([FromQuery] int limit = 25, CancellationToken ct = default) =>
        vocab.EnrichMissingAsync(limit, ct);
}

[Authorize(Roles = "Admin")]
[Route("api/admin/grammar")]
public class AdminGrammarController(IGrammarService grammar) : ApiControllerBase
{
    [HttpPost]
    public Task<GrammarDetailDto> Create(GrammarRequest request, CancellationToken ct) => grammar.CreateAsync(request, ct);

    [HttpPut("{id:guid}")]
    public Task<GrammarDetailDto> Update(Guid id, GrammarRequest request, CancellationToken ct) =>
        grammar.UpdateAsync(id, request, ct);

    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> Delete(Guid id, CancellationToken ct)
    {
        await grammar.DeleteAsync(id, ct);
        return NoContent();
    }
}
