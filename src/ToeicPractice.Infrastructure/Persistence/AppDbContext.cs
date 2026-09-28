using Microsoft.EntityFrameworkCore;
using ToeicPractice.Application.Common.Interfaces;
using ToeicPractice.Domain.Entities;

namespace ToeicPractice.Infrastructure.Persistence;

public class AppDbContext(DbContextOptions<AppDbContext> options) : DbContext(options), IApplicationDbContext
{
    public DbSet<User> Users => Set<User>();
    public DbSet<Test> Tests => Set<Test>();
    public DbSet<QuestionGroup> QuestionGroups => Set<QuestionGroup>();
    public DbSet<TestAudioTrack> TestAudioTracks => Set<TestAudioTrack>();
    public DbSet<Question> Questions => Set<Question>();
    public DbSet<Attempt> Attempts => Set<Attempt>();
    public DbSet<AttemptAnswer> AttemptAnswers => Set<AttemptAnswer>();
    public DbSet<Vocabulary> Vocabularies => Set<Vocabulary>();
    public DbSet<SavedVocabulary> SavedVocabularies => Set<SavedVocabulary>();
    public DbSet<GrammarTopic> GrammarTopics => Set<GrammarTopic>();

    protected override void OnModelCreating(ModelBuilder b)
    {
        b.Entity<User>(e =>
        {
            e.HasIndex(x => x.Email).IsUnique();
            e.Property(x => x.Email).HasMaxLength(256).IsRequired();
            e.Property(x => x.FullName).HasMaxLength(120).IsRequired();
            e.Property(x => x.PasswordHash).HasMaxLength(200).IsRequired();
            e.Property(x => x.Role).HasConversion<string>().HasMaxLength(20);
        });

        b.Entity<Test>(e =>
        {
            e.Property(x => x.Title).HasMaxLength(200).IsRequired();
            e.Property(x => x.Description).HasMaxLength(2000);
            e.Property(x => x.Skill).HasConversion<string>().HasMaxLength(20);
            e.Property(x => x.SourcePdfUrl).HasMaxLength(500);
            e.HasMany(x => x.Groups).WithOne(g => g.Test).HasForeignKey(g => g.TestId).OnDelete(DeleteBehavior.Cascade);
            e.HasMany(x => x.AudioTracks).WithOne(a => a.Test).HasForeignKey(a => a.TestId).OnDelete(DeleteBehavior.Cascade);
        });

        b.Entity<TestAudioTrack>(e =>
        {
            e.Property(x => x.Url).HasMaxLength(500).IsRequired();
            e.Property(x => x.FileName).HasMaxLength(260).IsRequired();
        });

        b.Entity<QuestionGroup>(e =>
        {
            e.Property(x => x.AudioUrl).HasMaxLength(500);
            e.Property(x => x.ImageUrl).HasMaxLength(500);
            e.HasMany(x => x.Questions).WithOne(q => q.Group).HasForeignKey(q => q.GroupId).OnDelete(DeleteBehavior.Cascade);
            e.HasIndex(x => new { x.TestId, x.OrderIndex });
        });

        b.Entity<Question>(e =>
        {
            e.Property(x => x.CorrectAnswer).HasMaxLength(1);
            e.Property(x => x.RequiredKeywords).HasMaxLength(200);
        });

        b.Entity<Attempt>(e =>
        {
            e.Property(x => x.Mode).HasConversion<string>().HasMaxLength(20);
            e.Property(x => x.GradingStatus).HasConversion<string>().HasMaxLength(20);
            e.HasOne(x => x.User).WithMany(u => u.Attempts).HasForeignKey(x => x.UserId).OnDelete(DeleteBehavior.Cascade);
            // Xoá đề được xử lý thủ công trong TestService để tránh nhiều đường cascade trên SQL Server.
            e.HasOne(x => x.Test).WithMany(t => t.Attempts).HasForeignKey(x => x.TestId).OnDelete(DeleteBehavior.Restrict);
            e.HasMany(x => x.Answers).WithOne(a => a.Attempt).HasForeignKey(a => a.AttemptId).OnDelete(DeleteBehavior.Cascade);
            e.HasIndex(x => new { x.UserId, x.SubmittedAt });
        });

        b.Entity<AttemptAnswer>(e =>
        {
            e.Property(x => x.SelectedOption).HasMaxLength(1);
            e.HasOne(x => x.Question).WithMany().HasForeignKey(x => x.QuestionId).OnDelete(DeleteBehavior.Restrict);
            e.HasIndex(x => new { x.AttemptId, x.QuestionId }).IsUnique();
        });

        b.Entity<Vocabulary>(e =>
        {
            e.Property(x => x.Word).HasMaxLength(100).IsRequired();
            e.Property(x => x.Phonetic).HasMaxLength(100);
            e.Property(x => x.PartOfSpeech).HasMaxLength(40);
            e.Property(x => x.MeaningVi).HasMaxLength(500).IsRequired();
            e.Property(x => x.Topic).HasMaxLength(80).IsRequired();
            e.Property(x => x.AudioUrl).HasMaxLength(500);
            e.Property(x => x.Source).HasMaxLength(300);
            e.HasIndex(x => x.Word);
            e.HasIndex(x => x.Topic);
        });

        b.Entity<SavedVocabulary>(e =>
        {
            e.HasIndex(x => new { x.UserId, x.VocabularyId }).IsUnique();
            e.HasOne(x => x.User).WithMany(u => u.SavedVocabularies).HasForeignKey(x => x.UserId).OnDelete(DeleteBehavior.Cascade);
            e.HasOne(x => x.Vocabulary).WithMany().HasForeignKey(x => x.VocabularyId).OnDelete(DeleteBehavior.Cascade);
        });

        b.Entity<GrammarTopic>(e =>
        {
            e.Property(x => x.Title).HasMaxLength(200).IsRequired();
            e.Property(x => x.Slug).HasMaxLength(200).IsRequired();
            e.Property(x => x.Category).HasMaxLength(80).IsRequired();
            e.Property(x => x.Summary).HasMaxLength(1000).IsRequired();
            e.Property(x => x.Formula).HasMaxLength(500);
            e.Property(x => x.Source).HasMaxLength(300);
            e.HasIndex(x => x.Slug).IsUnique();
        });
    }
}
