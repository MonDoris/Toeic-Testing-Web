using ToeicPractice.Application.Features.Tests;

namespace ToeicPractice.Application.Features.Tests.Authoring;

public record UploadedFile(Stream Content, string FileName);

public record TestReadinessDto(
    int TotalQuestions,
    int AnsweredQuestions,
    bool NeedsAudio,
    int TotalGroups,
    int GroupsWithAudio,
    bool Ready,
    IReadOnlyList<string> Issues);

public record AudioTrackDto(Guid Id, int? Part, string Url, string FileName);

public record PdfImportResultDto(
    Guid TestId, string Title, string Skill, int QuestionCount,
    IReadOnlyList<PartCountDto> Parts, IReadOnlyList<string> Warnings, bool UsedOcr);

public record AnswerKeyItemDto(
    Guid QuestionId, int Number, int Part, int OptionCount,
    string? Answer, string? SampleAnswer, bool Detected);

public record AnswerKeyProposalDto(
    IReadOnlyList<AnswerKeyItemDto> Items, int Detected, int Total,
    IReadOnlyList<string> FileUrls, IReadOnlyList<string> Warnings, string TextPreview);

public record AnswerItemInput(Guid QuestionId, string? Answer, string? SampleAnswer);

public record SaveAnswersRequest(IReadOnlyList<AnswerItemInput> Items);

public record AudioAssignmentDto(string FileName, string Target);

public record AudioUploadResultDto(
    IReadOnlyList<AudioAssignmentDto> Assigned, IReadOnlyList<string> Unmatched, TestReadinessDto Readiness);
