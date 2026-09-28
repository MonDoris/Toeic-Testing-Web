using ToeicPractice.Domain.Common;
using ToeicPractice.Domain.Enums;

namespace ToeicPractice.Domain.Entities;

public class User : BaseEntity
{
    public string FullName { get; set; } = string.Empty;
    public string Email { get; set; } = string.Empty;
    public string PasswordHash { get; set; } = string.Empty;
    public UserRole Role { get; set; } = UserRole.Student;
    public int? TargetScore { get; set; }
    public bool IsActive { get; set; } = true;

    public ICollection<Attempt> Attempts { get; set; } = new List<Attempt>();
    public ICollection<SavedVocabulary> SavedVocabularies { get; set; } = new List<SavedVocabulary>();
}
