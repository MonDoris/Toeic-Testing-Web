using Microsoft.EntityFrameworkCore;
using ToeicPractice.Application.Common.Exceptions;
using ToeicPractice.Application.Common.Interfaces;
using ToeicPractice.Application.Common.Models;
using ToeicPractice.Domain.Enums;

namespace ToeicPractice.Application.Features.Admin;

public record DailyCountDto(DateTime Date, int Count);

public record AdminDashboardDto(
    int Students, int Tests, int PublishedTests, int Attempts, int Vocabularies, int GrammarTopics,
    int PendingReviews, IReadOnlyList<DailyCountDto> AttemptsLast14Days);

public record AdminUserDto(
    Guid Id, string FullName, string Email, string Role, bool IsActive, int? TargetScore,
    int Attempts, int? BestListening, int? BestReading, int? BestWriting, DateTime CreatedAt, int? BestTotal);

public interface IAdminService
{
    Task<AdminDashboardDto> GetDashboardAsync(CancellationToken ct);
    Task<PagedResult<AdminUserDto>> GetUsersAsync(string? q, int page, int pageSize, CancellationToken ct);
    Task SetUserActiveAsync(Guid adminId, Guid userId, bool isActive, CancellationToken ct);
}

public class AdminService(IApplicationDbContext db) : IAdminService
{
    public async Task<AdminDashboardDto> GetDashboardAsync(CancellationToken ct)
    {
        var since = DateTime.UtcNow.Date.AddDays(-13);
        var recent = await db.Attempts.AsNoTracking()
            .Where(a => a.SubmittedAt != null && a.SubmittedAt >= since)
            .Select(a => a.SubmittedAt!.Value)
            .ToListAsync(ct);
        var daily = Enumerable.Range(0, 14)
            .Select(i => since.AddDays(i))
            .Select(d => new DailyCountDto(d, recent.Count(r => r.Date == d)))
            .ToList();

        return new AdminDashboardDto(
            await db.Users.CountAsync(u => u.Role == UserRole.Student, ct),
            await db.Tests.CountAsync(ct),
            await db.Tests.CountAsync(t => t.IsPublished, ct),
            await db.Attempts.CountAsync(a => a.SubmittedAt != null, ct),
            await db.Vocabularies.CountAsync(ct),
            await db.GrammarTopics.CountAsync(ct),
            await db.Attempts.CountAsync(a => a.GradingStatus == GradingStatus.PendingReview && a.SubmittedAt != null, ct),
            daily);
    }

    public async Task<PagedResult<AdminUserDto>> GetUsersAsync(string? q, int page, int pageSize, CancellationToken ct)
    {
        page = Math.Max(1, page);
        pageSize = Math.Clamp(pageSize, 1, 100);
        var query = db.Users.AsNoTracking();
        if (!string.IsNullOrWhiteSpace(q))
        {
            var term = q.Trim().ToLower();
            query = query.Where(u => u.FullName.ToLower().Contains(term) || u.Email.Contains(term));
        }
        var total = await query.CountAsync(ct);
        var users = await query
            .OrderBy(u => u.Role == UserRole.Admin ? 0 : 1).ThenByDescending(u => u.CreatedAt)
            .Skip((page - 1) * pageSize).Take(pageSize)
            .Select(u => new AdminUserDto(
                u.Id, u.FullName, u.Email, u.Role.ToString(), u.IsActive, u.TargetScore,
                u.Attempts.Count(a => a.SubmittedAt != null),
                // Đề thi Listening & Reading cũng tính vào điểm cao nhất của từng kỹ năng.
                u.Attempts.Where(a => a.Mode == AttemptMode.Exam && (a.Test!.Skill == Skill.Listening || a.Test!.Skill == Skill.ListeningReading))
                    .Max(a => a.Test!.Skill == Skill.Listening ? a.ScaledScore : a.ListeningScore),
                u.Attempts.Where(a => a.Mode == AttemptMode.Exam && (a.Test!.Skill == Skill.Reading || a.Test!.Skill == Skill.ListeningReading))
                    .Max(a => a.Test!.Skill == Skill.Reading ? a.ScaledScore : a.ReadingScore),
                u.Attempts.Where(a => a.Mode == AttemptMode.Exam && a.Test!.Skill == Skill.Writing).Max(a => a.ScaledScore),
                u.CreatedAt,
                u.Attempts.Where(a => a.Mode == AttemptMode.Exam && a.PartFilter == null && a.Test!.Skill == Skill.ListeningReading)
                    .Max(a => a.ScaledScore)))
            .ToListAsync(ct);
        return new PagedResult<AdminUserDto>(users, total, page, pageSize);
    }

    public async Task SetUserActiveAsync(Guid adminId, Guid userId, bool isActive, CancellationToken ct)
    {
        if (adminId == userId) throw new ValidationAppException("Không thể tự khoá tài khoản của chính mình.");
        var user = await db.Users.FindAsync([userId], ct) ?? throw new NotFoundException("người dùng", userId);
        user.IsActive = isActive;
        user.UpdatedAt = DateTime.UtcNow;
        await db.SaveChangesAsync(ct);
    }
}
