using ToeicPractice.Application.Features.Tests.Authoring;

namespace ToeicPractice.Application.Features.Tests;

public record PartCountDto(int Part, int Questions);

public record TestSummaryDto(
    Guid Id,
    string Title,
    string? Description,
    string Skill,
    int DurationMinutes,
    bool IsPublished,
    int QuestionCount,
    IReadOnlyList<PartCountDto> Parts,
    int AttemptCount,
    DateTime CreatedAt,
    TestReadinessDto? Readiness = null);

public record OptionDto(string Key, string? Text);

// ===== Admin: xem/sửa đầy đủ =====
public record AdminQuestionDto(
    Guid Id, int Number, string? Content,
    string? OptionA, string? OptionB, string? OptionC, string? OptionD,
    string? CorrectAnswer, string? Explanation,
    string? RequiredKeywords, string? SampleAnswer, int? MinWords);

public record AdminGroupDto(
    Guid Id, int Part, int OrderIndex, string? AudioUrl, string? ImageUrl,
    string? Passage, string? Transcript, IReadOnlyList<AdminQuestionDto> Questions);

public record AdminTestDetailDto(
    Guid Id, string Title, string? Description, string Skill, int DurationMinutes,
    bool IsPublished, DateTime CreatedAt, IReadOnlyList<AdminGroupDto> Groups,
    string? SourcePdfUrl, IReadOnlyList<string> AnswerKeyUrls, IReadOnlyList<AudioTrackDto> AudioTracks,
    TestReadinessDto Readiness);

public record UpdateTestRequest(string Title, string? Description, int DurationMinutes, bool IsPublished);

public record UpdateGroupRequest(string? Passage, string? Transcript);

public record UpdateQuestionRequest(
    string? Content,
    string? OptionA, string? OptionB, string? OptionC, string? OptionD,
    string? CorrectAnswer, string? Explanation,
    string? RequiredKeywords, string? SampleAnswer, int? MinWords);

// ===== Học viên: làm bài (không lộ đáp án) =====
public record SessionQuestionDto(
    Guid Id, int Number, string? Content, IReadOnlyList<OptionDto> Options,
    IReadOnlyList<string> RequiredKeywords, int? MinWords);

/// <param name="SharedAudio">true: audio dùng chung cho nhiều nhóm (cả đề / cả Part) – phát liên tục khi chuyển câu.</param>
public record SessionGroupDto(
    Guid Id, int Part, int OrderIndex, string? AudioUrl, string? ImageUrl, string? Passage,
    IReadOnlyList<SessionQuestionDto> Questions, bool SharedAudio = false);

// ===== Import =====
public record ImportResultDto(
    Guid? TestId,
    string Title,
    string Skill,
    int QuestionCount,
    IReadOnlyList<PartCountDto> Parts,
    IReadOnlyList<string> Warnings,
    bool Saved);
