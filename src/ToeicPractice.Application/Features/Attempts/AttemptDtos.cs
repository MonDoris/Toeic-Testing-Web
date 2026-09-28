using ToeicPractice.Application.Features.Tests;

namespace ToeicPractice.Application.Features.Attempts;

public record StartAttemptRequest(Guid TestId, string Mode, int? Part);

/// <param name="ReadingMinutes">
/// Đề thi Listening &amp; Reading: thời gian phần Reading (75 phút với đề chuẩn). Phần Listening kéo dài theo audio.
/// </param>
public record SessionDto(
    Guid AttemptId, Guid TestId, string Title, string Skill, string Mode, int? Part,
    int? DurationMinutes, DateTime StartedAt, IReadOnlyList<SessionGroupDto> Groups, int? ReadingMinutes = null);

public record AnswerInput(Guid QuestionId, string? SelectedOption, string? WrittenText);

public record SubmitAttemptRequest(IReadOnlyList<AnswerInput> Answers);

/// <summary>Phản hồi tức thì ở chế độ luyện tập.</summary>
public record PracticeFeedbackDto(
    Guid QuestionId,
    bool? IsCorrect,
    string? CorrectAnswer,
    string? Explanation,
    string? Transcript,
    IReadOnlyList<OptionDto> Options,
    double? Score,
    int? MaxScore,
    int? WordCount,
    IReadOnlyList<string> Feedback,
    string? SampleAnswer);

public record ReviewQuestionDto(
    Guid Id, Guid? AnswerId, int Number, string? Content, IReadOnlyList<OptionDto> Options,
    string? CorrectAnswer, string? SelectedOption, bool? IsCorrect, string? Explanation,
    IReadOnlyList<string> RequiredKeywords, string? SampleAnswer,
    string? WrittenText, int? WordCount, double? AutoScore, double? ReviewerScore, int? MaxScore,
    IReadOnlyList<string> AutoFeedback, string? ReviewerFeedback);

public record ReviewGroupDto(
    Guid Id, int Part, string? AudioUrl, string? ImageUrl, string? Passage, string? Transcript,
    IReadOnlyList<ReviewQuestionDto> Questions);

public record PartStatDto(int Part, int Correct, int Total);

public record AttemptResultDto(
    Guid AttemptId, Guid TestId, string TestTitle, string Skill, string Mode, int? Part,
    string StudentName, DateTime StartedAt, DateTime? SubmittedAt, int DurationSeconds,
    int TotalQuestions, int CorrectCount, int? ScaledScore, string GradingStatus,
    double? WritingRaw, int? WritingMax,
    IReadOnlyList<PartStatDto> PartStats, IReadOnlyList<ReviewGroupDto> Groups,
    int? ListeningScore = null, int? ReadingScore = null);

public record AttemptHistoryItemDto(
    Guid AttemptId, Guid TestId, string TestTitle, string Skill, string Mode, int? Part,
    string StudentName, DateTime StartedAt, DateTime? SubmittedAt,
    int TotalQuestions, int CorrectCount, int? ScaledScore, string GradingStatus,
    int? ListeningScore = null, int? ReadingScore = null);

public record StudentStatsDto(
    int CompletedAttempts,
    int QuestionsAnswered,
    int? BestListening,
    int? BestWriting,
    int? BestReading,
    /// <summary>Điểm cao nhất của đề thi Listening &amp; Reading đầy đủ (10–990).</summary>
    int? BestTotal,
    double AverageAccuracy,
    int StreakDays,
    int SavedWords,
    IReadOnlyList<PartStatDto> PartAccuracy,
    IReadOnlyList<ScorePointDto> ScoreTrend,
    IReadOnlyList<AttemptHistoryItemDto> Recent);

public record ScorePointDto(DateTime Date, string Skill, int Score);

public record ReviewAnswerRequest(double Score, string? Feedback);
