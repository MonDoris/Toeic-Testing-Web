using Microsoft.EntityFrameworkCore;
using ToeicPractice.Domain.Entities;

namespace ToeicPractice.Application.Common.Interfaces;

public interface IApplicationDbContext
{
    DbSet<User> Users { get; }
    DbSet<Test> Tests { get; }
    DbSet<QuestionGroup> QuestionGroups { get; }
    DbSet<TestAudioTrack> TestAudioTracks { get; }
    DbSet<Question> Questions { get; }
    DbSet<Attempt> Attempts { get; }
    DbSet<AttemptAnswer> AttemptAnswers { get; }
    DbSet<Vocabulary> Vocabularies { get; }
    DbSet<SavedVocabulary> SavedVocabularies { get; }
    DbSet<GrammarTopic> GrammarTopics { get; }

    Task<int> SaveChangesAsync(CancellationToken cancellationToken = default);
}
